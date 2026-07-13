import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { getPacksPath } from "../../packs/get-pack-path.js";
import { readSkillManifest } from "../../packs/read-skill-manifest.js";
import type { ResolvedPackEntry } from "../../packs/resolve-packs.js";

// Re-exported verbatim from the new shared location (M7) so every M1-M6 caller that already does
// `import type { RenderedFile } from "../adapters/claude/render.js"` keeps working unchanged —
// see `src/adapters/types.ts`'s doc comment.
export type { RenderedFile, SkippedSkill, AdapterRenderResult } from "../types.js";
import type { RenderedFile, SkippedSkill } from "../types.js";

export interface RenderClaudeOptions {
  /** Repo root to render `.claude/` into. */
  targetDir: string;
  /** Packs to render — caller passes INSTALLABLE packs only (D6 gate is resolve-packs' job, not this module's). */
  packs: ResolvedPackEntry[];
  /** Override for tests; defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** The D19 effective skill set (see `core/skill-selection.ts`) — a skill NOT in this set is skipped, same as an adapter-restricted skill (reported in `.skipped`, never an error). */
  effectiveSkills: Set<string>;
}

export interface RenderClaudeResult {
  written: RenderedFile[];
  skipped: SkippedSkill[];
}

/** Basenames that never ship into a target repo — Nockta-internal (`skill.json`) or OS clutter. */
const SKILL_DIR_COPY_BLOCKLIST = new Set(["skill.json", ".DS_Store"]);

/**
 * Full bundled skill directory content, minus the blocklist (decisions.md D8/D26, Part-A
 * completeness fix). Formerly a narrow allowlist (SKILL.md/worker.md/references.md/examples/**
 * only); now every companion doc (DEEPENING.md, ADR-FORMAT.md, ...), `scripts/` (e.g.
 * `validate.mjs`), and `assets/` (gz-only type trees) ships too, so a heavy skill is fully
 * self-contained at `<targetDir>/.claude/skills/<skill>/` — its own scripts run from there without
 * reaching back into the installed npm package. `skill.json` is Nockta-internal packaging
 * metadata and never ships; `.DS_Store` is OS clutter.
 */
function collectSkillDirFiles(skillDir: string): string[] {
  const results: string[] = [];
  walkRelative(skillDir, "", results, SKILL_DIR_COPY_BLOCKLIST);
  return results;
}

/** Every file under `<skillDir>/agents/`, relative to that dir (spec §8.2 "Agent source convention"). */
function collectAgentFiles(skillDir: string): string[] {
  const agentsDir = join(skillDir, "agents");
  if (!existsSync(agentsDir)) return [];
  const results: string[] = [];
  walkRelative(agentsDir, "", results);
  return results;
}

function walkRelative(absDir: string, relPrefix: string, out: string[], blocklist?: Set<string>): void {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (blocklist?.has(entry.name)) continue;
    const relPath = relPrefix ? join(relPrefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      walkRelative(join(absDir, entry.name), relPath, out, blocklist);
    } else if (entry.isFile()) {
      out.push(relPath);
    }
  }
}

function writeFileEnsuringDir(outputPath: string, content: Buffer): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

function toRelative(targetDir: string, outputPath: string): string {
  return relative(targetDir, outputPath).split("\\").join("/");
}

/**
 * Claude adapter renderer (spec §8.2, §11 `src/adapters/claude/render.ts`).
 *
 * For each installable pack's declared skills: reads `skill.json`
 * (decisions.md D8) and, honoring `supportedAdapters`/`outputs.claude`,
 * renders `<targetDir>/.claude/skills/<skill>/` with the skill's ENTIRE
 * bundled directory content (blocklist copy, decisions.md D8/D26 Part A:
 * everything except `skill.json` and `.DS_Store` — SKILL.md, worker.md,
 * references.md, examples/**, companion docs, `scripts/`, `assets/`, so
 * heavy self-contained skills ship their own `validate.mjs` + asset trees)
 * and, when `outputs.claude.agents` is true, ALSO renders
 * `<targetDir>/.claude/agents/<agent-name>.md` from the skill's
 * `agents/*.md`.
 *
 * D1 override rule: for every file this renderer would write, it first
 * checks `packs/<pack>/adapters/claude/skills/<skill>/<same-relative-path>`;
 * hand-authored content there wins over the mechanical `packs/<pack>/skills/<skill>/`
 * transform for that path (spec §2.2/§8.5, decisions.md D1).
 *
 * A skill whose `skill.json` does not list `"claude"` in `supportedAdapters`,
 * or sets `outputs.claude` to `false`, is skipped entirely — it must not
 * render (spec §8.2 "Adapter-restricted skills").
 */
export function renderClaudeAdapter(options: RenderClaudeOptions): RenderClaudeResult {
  const packsRoot = options.packsRoot ?? getPacksPath();
  const written: RenderedFile[] = [];
  const skipped: SkippedSkill[] = [];

  for (const pack of options.packs) {
    const packPath = join(packsRoot, pack.name);

    for (const skillName of pack.manifest.skills) {
      if (!options.effectiveSkills.has(skillName)) {
        skipped.push({ pack: pack.name, skill: skillName, reason: "excluded by skill selection (not in the effective set, decisions.md D19)" });
        continue;
      }

      const skillDir = join(packPath, "skills", skillName);
      const manifest = readSkillManifest(skillDir, skillName, pack.manifest.adapters);
      const overrideSkillDir = join(packPath, "adapters", "claude", "skills", skillName);

      if (!manifest.supportedAdapters.includes("claude")) {
        skipped.push({
          pack: pack.name,
          skill: skillName,
          reason: `adapter-restricted: supportedAdapters=[${manifest.supportedAdapters.join(", ")}] (no "claude")`,
        });
        continue;
      }

      const claudeOutputs = manifest.outputs.claude;
      if (claudeOutputs === false || claudeOutputs === undefined) {
        skipped.push({ pack: pack.name, skill: skillName, reason: 'outputs.claude is false (or undeclared)' });
        continue;
      }

      if (claudeOutputs.skills) {
        for (const relPath of collectSkillDirFiles(skillDir)) {
          const overridePath = join(overrideSkillDir, relPath);
          const overridden = existsSync(overridePath);
          const sourcePath = overridden ? overridePath : join(skillDir, relPath);
          const outputPath = join(options.targetDir, ".claude", "skills", skillName, relPath);

          writeFileEnsuringDir(outputPath, readFileSync(sourcePath));
          written.push({
            relativePath: toRelative(options.targetDir, outputPath),
            outputPath,
            sourcePath,
            overridden,
            adapter: "claude",
            pack: pack.name,
            skill: skillName,
            kind: "skill",
          });
        }
      }

      if (claudeOutputs.agents) {
        for (const relPath of collectAgentFiles(skillDir)) {
          const overridePath = join(overrideSkillDir, "agents", relPath);
          const overridden = existsSync(overridePath);
          const sourcePath = overridden ? overridePath : join(skillDir, "agents", relPath);
          const fileName = relPath.split(/[\\/]/).pop() as string;
          const outputPath = join(options.targetDir, ".claude", "agents", fileName);

          writeFileEnsuringDir(outputPath, readFileSync(sourcePath));
          written.push({
            relativePath: toRelative(options.targetDir, outputPath),
            outputPath,
            sourcePath,
            overridden,
            adapter: "claude",
            pack: pack.name,
            skill: skillName,
            kind: "agent",
          });
        }
      }
    }
  }

  return { written, skipped };
}
