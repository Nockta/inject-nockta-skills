import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getPacksPath } from "../../packs/get-pack-path.js";
import { readSkillManifest } from "../../packs/read-skill-manifest.js";
import { STANDING_MODE_REFERENCE } from "../../core/standing-mode.js";
import type { ResolvedPackEntry } from "../../packs/resolve-packs.js";
import type { AdapterRenderResult, RenderedFile, SkippedSkill } from "../types.js";

export interface RenderCursorOptions {
  /** Repo root to render `.cursor/` into. */
  targetDir: string;
  /** Packs to render — caller passes INSTALLABLE packs only (D6 gate is resolve-packs' job, not this module's). */
  packs: ResolvedPackEntry[];
  /** Override for tests; defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** The D19 effective skill set (see `core/skill-selection.ts`). */
  effectiveSkills: Set<string>;
}

export type RenderCursorResult = AdapterRenderResult;

function writeFileEnsuringDir(outputPath: string, content: Buffer): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Cursor `.mdc` frontmatter (spec §8.3; format researched — current Cursor project-rules shape
 * is `description`/`globs`/`alwaysApply`, see `src/adapters/CONTEXT.md`'s "Cursor .mdc format"
 * note for the citation). Nockta pack guidance is always-relevant background context, not
 * file-pattern-triggered, so every generated rule is an "Always" rule: `alwaysApply: true`, no
 * `globs`. `description` is JSON-quoted — cheap, always valid YAML flow-scalar syntax, avoids
 * hand-rolling YAML escaping for text that may contain colons/commas/parens.
 */
function buildFrontmatter(pack: ResolvedPackEntry, skillNames: string[]): string {
  const description = `Nockta ${pack.manifest.displayName} AI skill guidance (${skillNames.join(", ")}).`;
  return `---\ndescription: ${JSON.stringify(description)}\nglobs:\nalwaysApply: true\n---\n`;
}

function buildMechanicalContent(pack: ResolvedPackEntry, sections: { skill: string; content: string }[]): string {
  const frontmatter = buildFrontmatter(
    pack,
    sections.map((s) => s.skill),
  );
  // Reference the single-source standing-mode contract (decisions.md D34) rather than restating it
  // — the block lives only in root AGENTS.md; Cursor reads that natively, this line is belt-and-
  // suspenders.
  const heading = `# ${pack.manifest.displayName} — Nockta AI Skills\n\n${STANDING_MODE_REFERENCE}\n\n${pack.manifest.description}\n`;
  const body = sections.map((s) => `## ${s.skill}\n\n${s.content.trim()}\n`).join("\n");
  return `${frontmatter}\n${heading}\n${body}`;
}

/**
 * Cursor adapter renderer (spec §8.3, decisions.md D1/D19/D20). One
 * `.cursor/rules/nockta-<pack-name>.mdc` PER selected+installable pack — mechanical transform:
 * concatenate that pack's SELECTED (effective-set, adapter-supported) skills' `SKILL.md` content
 * under one frontmatter'd `.mdc`. `packs/<pack>/adapters/cursor/<pack-name>.mdc` (the SOURCE
 * override file — its own filename is unaffected by the D20 output rename below) — when present —
 * wins WHOLESALE over the mechanical concatenation for that pack (D1 override, same check pattern
 * as `adapters/claude/render.ts`, applied at the pack level here since cursor's output unit is one
 * file per pack, not one file per skill).
 *
 * **Output filename is `nockta-<pack-name>.mdc` (decisions.md D20, M8)** — namespaced against
 * user-owned `.cursor/rules/*.mdc` files already in the repo, matching spec §8.3's own
 * `nockta-common.mdc` sample (which the M7 pass had applied to the `common` pack only, leaving
 * every other pack unprefixed — an inconsistency in the spec's own example, resolved by D20 in
 * favor of the prefix for every pack, not just `common`).
 *
 * A pack with zero rendering skills (every skill excluded by selection, adapter-restricted, or
 * `outputs.cursor` false/undeclared) AND no override produces no `.mdc` file at all — same
 * "skip, don't error" posture as claude's per-skill skip (spec §8.2), just applied per-pack here.
 */
export function renderCursorAdapter(options: RenderCursorOptions): RenderCursorResult {
  const packsRoot = options.packsRoot ?? getPacksPath();
  const written: RenderedFile[] = [];
  const skipped: SkippedSkill[] = [];

  for (const pack of options.packs) {
    const packPath = join(packsRoot, pack.name);
    const overridePath = join(packPath, "adapters", "cursor", `${pack.name}.mdc`);
    const overridden = existsSync(overridePath);

    const sections: { skill: string; content: string }[] = [];
    const sourceBuffers: Buffer[] = [];

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

      if (!manifest.supportedAdapters.includes("cursor")) {
        skipped.push({
          pack: pack.name,
          skill: skillName,
          reason: `adapter-restricted: supportedAdapters=[${manifest.supportedAdapters.join(", ")}] (no "cursor")`,
        });
        continue;
      }

      const cursorOutputs = manifest.outputs.cursor;
      if (cursorOutputs === false || cursorOutputs === undefined || !cursorOutputs.skills) {
        skipped.push({ pack: pack.name, skill: skillName, reason: "outputs.cursor is false (or undeclared, or outputs.cursor.skills is not true)" });
        continue;
      }

      const raw = readFileSync(join(skillDir, "SKILL.md"));
      sections.push({ skill: skillName, content: raw.toString("utf8") });
      sourceBuffers.push(raw);
    }

    if (!overridden && sections.length === 0) continue; // nothing to render for this pack

    // D20 (M8): output filename is `nockta-<pack-name>.mdc`, not bare `<pack-name>.mdc` — see the
    // doc comment above `renderCursorAdapter`. The override SOURCE file's own name (checked above,
    // `packPath/adapters/cursor/<pack.name>.mdc`) is intentionally unchanged.
    const outputFileName = `nockta-${pack.name}.mdc`;
    const relativePath = `.cursor/rules/${outputFileName}`;
    const outputPath = join(options.targetDir, ".cursor", "rules", outputFileName);

    const content = overridden ? readFileSync(overridePath) : Buffer.from(buildMechanicalContent(pack, sections), "utf8");
    const sourceContentHash = overridden ? sha256(content) : sha256(Buffer.concat(sourceBuffers));

    writeFileEnsuringDir(outputPath, content);

    written.push({
      relativePath,
      outputPath,
      sourcePath: overridden ? overridePath : join(packPath, "skills"),
      overridden,
      adapter: "cursor",
      pack: pack.name,
      kind: "rule",
      content,
      sourceContentHash,
    });
  }

  return { written, skipped };
}
