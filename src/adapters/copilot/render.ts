import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getPacksPath } from "../../packs/get-pack-path.js";
import { readSkillManifest } from "../../packs/read-skill-manifest.js";
import { STANDING_MODE_REFERENCE } from "../../core/standing-mode.js";
import type { ResolvedPackEntry } from "../../packs/resolve-packs.js";
import type { AdapterRenderResult, RenderedFile, SkippedSkill } from "../types.js";

export interface RenderCopilotOptions {
  /** Repo root to render `.github/` into. */
  targetDir: string;
  /** Packs to render — caller passes INSTALLABLE packs only (D6 gate is resolve-packs' job, not this module's). */
  packs: ResolvedPackEntry[];
  /** Override for tests; defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** The D19 effective skill set (see `core/skill-selection.ts`). */
  effectiveSkills: Set<string>;
}

export type RenderCopilotResult = AdapterRenderResult;

export const COPILOT_INSTRUCTIONS_RELATIVE_PATH = ".github/instructions/nockta.instructions.md";

function frontmatter(): string {
  // Spec §8.4: required frontmatter, `applyTo: "**"` (repo-wide).
  return `---\napplyTo: "**"\n---\n`;
}

/**
 * GitHub Copilot adapter renderer (spec §8.4, decisions.md D1/D19). Renders exactly ONE file,
 * `.github/instructions/nockta.instructions.md` — one section per installed pack, drawn from
 * that pack's SELECTED (effective-set, adapter-supported) skills. NEVER writes or touches
 * `.github/copilot-instructions.md` (spec §8.4's explicit "do not overwrite" rule — this module
 * has no code path that even names that file).
 *
 * `packs/<pack>/adapters/copilot/<pack-name>.md` — when present — wins WHOLESALE over that
 * pack's mechanical section content (D1 override, same per-pack override unit as
 * `adapters/cursor/render.ts`, since copilot's output unit is one section per pack inside a
 * single shared file, not one file per pack).
 *
 * Because the output is a MERGE across every installed pack (not a 1:1 copy of any single source
 * file), this renderer produces exactly ONE `RenderedFile` record for the whole combined file —
 * `pack` is the sorted, comma-joined list of contributing pack names (informational — see
 * `src/adapters/types.ts`'s `RenderedFile.pack` for why a single-pack field can't literally apply
 * here), `skill` is absent, and `content`/`sourceContentHash` carry the actual rendered bytes and
 * a hash of every contributing source file's raw bytes (concatenated in render order) — see
 * `src/adapters/types.ts` for why a merge needs those two fields instead of a single `sourcePath`.
 */
export function renderCopilotAdapter(options: RenderCopilotOptions): RenderCopilotResult {
  const packsRoot = options.packsRoot ?? getPacksPath();
  const skipped: SkippedSkill[] = [];
  const sections: string[] = [];
  const sourceBuffers: Buffer[] = [];
  const contributingPacks: string[] = [];
  let anyOverridden = false;

  for (const pack of options.packs) {
    const packPath = join(packsRoot, pack.name);
    const overridePath = join(packPath, "adapters", "copilot", `${pack.name}.md`);
    const overridden = existsSync(overridePath);

    const packSections: string[] = [];
    const packSourceBuffers: Buffer[] = [];

    for (const skillName of pack.manifest.skills) {
      if (!options.effectiveSkills.has(skillName)) {
        skipped.push({
          pack: pack.name,
          skill: skillName,
          reason: "excluded by skill selection (not in the effective set, decisions.md D19)",
        });
        continue;
      }

      const skillDir = join(packPath, "skills", skillName);
      const manifest = readSkillManifest(skillDir, skillName, pack.manifest.adapters);

      if (!manifest.supportedAdapters.includes("copilot")) {
        skipped.push({
          pack: pack.name,
          skill: skillName,
          reason: `adapter-restricted: supportedAdapters=[${manifest.supportedAdapters.join(", ")}] (no "copilot")`,
        });
        continue;
      }

      const copilotOutputs = manifest.outputs.copilot;
      if (copilotOutputs === false || copilotOutputs === undefined || !copilotOutputs.skills) {
        skipped.push({ pack: pack.name, skill: skillName, reason: "outputs.copilot is false (or undeclared, or outputs.copilot.skills is not true)" });
        continue;
      }

      const raw = readFileSync(join(skillDir, "SKILL.md"));
      packSections.push(`### ${skillName}\n\n${raw.toString("utf8").trim()}\n`);
      packSourceBuffers.push(raw);
    }

    let packBlock: string | null = null;
    if (overridden) {
      const overrideBuf = readFileSync(overridePath);
      packBlock = `${overrideBuf.toString("utf8").trim()}\n`;
      sourceBuffers.push(overrideBuf);
      anyOverridden = true;
    } else if (packSections.length > 0) {
      packBlock = `## ${pack.manifest.displayName}\n\n${pack.manifest.description}\n\n${packSections.join("\n")}`;
      sourceBuffers.push(...packSourceBuffers);
    }

    if (packBlock) {
      sections.push(packBlock);
      contributingPacks.push(pack.name);
    }
  }

  if (sections.length === 0) {
    return { written: [], skipped };
  }

  // Reference the single-source standing-mode contract (decisions.md D34) rather than restating it
  // — the block lives only in root AGENTS.md; Copilot's coding agent reads that natively, this line
  // is belt-and-suspenders.
  const body = `${frontmatter()}\n# Nockta AI Guidance\n\n${STANDING_MODE_REFERENCE}\n\n${sections.join("\n")}`;
  const content = Buffer.from(body, "utf8");
  const sourceContentHash = createHash("sha256").update(Buffer.concat(sourceBuffers)).digest("hex");

  const outputPath = join(options.targetDir, ".github", "instructions", "nockta.instructions.md");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);

  const written: RenderedFile[] = [
    {
      relativePath: COPILOT_INSTRUCTIONS_RELATIVE_PATH,
      outputPath,
      sourcePath: packsRoot,
      overridden: anyOverridden,
      adapter: "copilot",
      pack: [...contributingPacks].sort().join(","),
      kind: "instructions",
      content,
      sourceContentHash,
    },
  ];

  return { written, skipped };
}
