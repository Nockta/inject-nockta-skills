import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GENERATED_MANIFEST_SCHEMA_VERSION } from "../types/generated-manifest.js";
import type { GeneratedFileRecord, GeneratedManifest } from "../types/generated-manifest.js";

/**
 * Writes `<targetDir>/.nockta/generated-manifest.json` (spec §10.3,
 * decisions.md D3). Safety rule (spec §14): only ever writes under
 * `.nockta/`.
 *
 * M3 scope: each install run writes the full, freshly computed set of
 * records for everything rendered this run. Merging with a prior manifest
 * (to preserve records for packs not touched by this run) is repair/upgrade
 * scope — not built yet, see src/CONTEXT.md.
 */
export function writeGeneratedManifest(targetDir: string, files: GeneratedFileRecord[]): GeneratedManifest {
  const manifest: GeneratedManifest = {
    schemaVersion: GENERATED_MANIFEST_SCHEMA_VERSION,
    files,
  };

  const nocktaDir = join(targetDir, ".nockta");
  mkdirSync(nocktaDir, { recursive: true });
  writeFileSync(join(nocktaDir, "generated-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return manifest;
}
