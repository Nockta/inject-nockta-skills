import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { getPacksPath } from "../../packs/get-pack-path.js";
import { readSkillManifest } from "../../packs/read-skill-manifest.js";
import type { ResolvedPackEntry } from "../../packs/resolve-packs.js";
import type { AdapterRenderResult, RenderedFile, SkippedSkill } from "../types.js";

export interface RenderAntigravityOptions {
  /** Repo root to render `.agents/` into. */
  targetDir: string;
  /** Packs to render — caller passes INSTALLABLE packs only (D6 gate is resolve-packs' job, not this module's). */
  packs: ResolvedPackEntry[];
  /** Override for tests; defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** The D19 effective skill set (see `core/skill-selection.ts`) — a skill NOT in this set is skipped, same as an adapter-restricted skill (reported in `.skipped`, never an error). */
  effectiveSkills: Set<string>;
}

export type RenderAntigravityResult = AdapterRenderResult;

/** Basenames that never ship into a target repo — Nockta-internal (`skill.json`) or OS clutter. */
const SKILL_DIR_COPY_BLOCKLIST = new Set(["skill.json", ".DS_Store"]);

/**
 * Full bundled skill directory content, minus the blocklist — IDENTICAL policy to the claude
 * adapter's `collectSkillDirFiles` (decisions.md D8/D26 Part A, D35): every companion doc,
 * `scripts/`, `assets/`, etc. ships so a heavy skill is self-contained at
 * `<targetDir>/.agents/skills/<skill>/`. `skill.json` (Nockta packaging metadata) and `.DS_Store`
 * (OS clutter) never ship.
 */
function collectSkillDirFiles(skillDir: string): string[] {
  const results: string[] = [];
  walkRelative(skillDir, "", results, SKILL_DIR_COPY_BLOCKLIST);
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
 * Antigravity adapter renderer (decisions.md D35, owner ruling). The FULL-injection peer of the
 * claude adapter — Google Antigravity gets "the .claude/ treatment": each selected+installable
 * pack's declared skills render with their ENTIRE bundled directory content (blocklist copy — same
 * `skill.json`/`.DS_Store` exclusion as claude) to `<targetDir>/.agents/skills/<skill>/`, the
 * Antigravity workspace-skill convention (verified 2026-07-13 against antigravity.google/docs/skills:
 * `<workspace-root>/.agents/skills/<folder>/SKILL.md`, `description` frontmatter required; extra
 * dirs like `scripts/`/`assets/` are read on demand — so copying our full skill dirs is in-spec).
 * We emit the plural `.agents/` (current default) only; the legacy singular `.agent/` is not
 * emitted. Read by both the Antigravity IDE and the `agy` CLI.
 *
 * D1 override rule: for every file this renderer would write, it first checks
 * `packs/<pack>/adapters/antigravity/skills/<skill>/<same-relative-path>`; hand-authored content
 * there wins over the mechanical `packs/<pack>/skills/<skill>/` transform for that path — the exact
 * pattern the claude renderer uses under `adapters/claude/skills/`.
 *
 * **Agent-artifact handling (D35):** Antigravity has NO documented agents-dir concept, so a skill's
 * `outputs.antigravity.agents` is never honored — only `outputs.antigravity.skills` (the skill dir)
 * is ever emitted, even if a skill.json sets `agents: true`. Skill-local agent artifacts (e.g.
 * subagent-delegation's `worker.md`) have no home here; the worker-leaf rule rides the standing-mode
 * contract in root `AGENTS.md`, which Antigravity reads natively (so no per-adapter reference line or
 * CLAUDE.md-analog is needed).
 *
 * A skill whose `skill.json` does not list `"antigravity"` in `supportedAdapters`, or sets
 * `outputs.antigravity` to `false`/undeclared (or `outputs.antigravity.skills` not true), is skipped
 * entirely (reported in `.skipped`, never an error) — same "skip, don't error" posture as claude's
 * per-skill skip (spec §8.2).
 */
export function renderAntigravityAdapter(options: RenderAntigravityOptions): RenderAntigravityResult {
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
      const overrideSkillDir = join(packPath, "adapters", "antigravity", "skills", skillName);

      if (!manifest.supportedAdapters.includes("antigravity")) {
        skipped.push({
          pack: pack.name,
          skill: skillName,
          reason: `adapter-restricted: supportedAdapters=[${manifest.supportedAdapters.join(", ")}] (no "antigravity")`,
        });
        continue;
      }

      const antigravityOutputs = manifest.outputs.antigravity;
      if (antigravityOutputs === false || antigravityOutputs === undefined || !antigravityOutputs.skills) {
        skipped.push({ pack: pack.name, skill: skillName, reason: "outputs.antigravity is false (or undeclared, or outputs.antigravity.skills is not true)" });
        continue;
      }

      // Antigravity has no agents-dir concept — outputs.antigravity.agents is never honored (D35).
      for (const relPath of collectSkillDirFiles(skillDir)) {
        const overridePath = join(overrideSkillDir, relPath);
        const overridden = existsSync(overridePath);
        const sourcePath = overridden ? overridePath : join(skillDir, relPath);
        const outputPath = join(options.targetDir, ".agents", "skills", skillName, relPath);

        writeFileEnsuringDir(outputPath, readFileSync(sourcePath));
        written.push({
          relativePath: toRelative(options.targetDir, outputPath),
          outputPath,
          sourcePath,
          overridden,
          adapter: "antigravity",
          pack: pack.name,
          skill: skillName,
          kind: "skill",
        });
      }
    }
  }

  return { written, skipped };
}
