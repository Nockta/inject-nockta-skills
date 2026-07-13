import type { AdapterType } from "./adapter.js";

/**
 * One tracked generated file inside `.nockta/generated-manifest.json`.
 * Spec: startup docs/inject-nockta-skills.updated.md §10.3, decisions.md D3.
 */
export interface GeneratedFileRecord {
  /** Path relative to the target repo root, e.g. ".claude/skills/paper-trail/SKILL.md". */
  path: string;
  adapter: AdapterType;
  pack: string;
  skill?: string;
  /** sha256 hex of the source content actually used (override-aware, see D1). */
  sourceHash: string;
  /** sha256 hex of the rendered output file, recomputed by reading it back. */
  outputHash: string;
  generatedAt: string;
  generatorVersion: string;
}

/**
 * `.nockta/generated-manifest.json` shape. Spec §10.3, decisions.md D3.
 *
 * Not itemized by name in spec §11's `src/types/` list (which stops at
 * `profile.ts`/`target.ts`/`install-options.ts`), but D3 requires this exact
 * shape to exist somewhere typed — a dedicated file keeps it next to
 * `profile.ts` without overloading either.
 */
export interface GeneratedManifest {
  schemaVersion: number;
  files: GeneratedFileRecord[];
}

export const GENERATED_MANIFEST_SCHEMA_VERSION = 1;
