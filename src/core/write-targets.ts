import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TARGETS_SCHEMA_VERSION } from "../types/target.js";
import type { TargetRecord, TargetsFile } from "../types/target.js";

/**
 * Writes `<targetDir>/.nockta/targets.json` (spec §9.3, decisions.md D5 — root `.nockta/` owns
 * this file). Safety rule (spec §14): only ever writes under `.nockta/`. Always writes the FULL
 * replacement set for `targets` — same "fresh full set per run" convention as
 * `write-manifest.ts` (M3).
 */
export function writeTargetsFile(targetDir: string, targets: TargetRecord[]): TargetsFile {
  const file: TargetsFile = { schemaVersion: TARGETS_SCHEMA_VERSION, isMonorepo: true, targets };

  const nocktaDir = join(targetDir, ".nockta");
  mkdirSync(nocktaDir, { recursive: true });
  writeFileSync(join(nocktaDir, "targets.json"), `${JSON.stringify(file, null, 2)}\n`, "utf8");

  return file;
}
