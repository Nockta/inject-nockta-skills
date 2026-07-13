import { detectMonorepo } from "../../core/detect-monorepo.js";
import type { DetectMonorepoResult } from "../../core/detect-monorepo.js";

/**
 * Wizard step 1 (spec §7.1): "Detect whether the current directory is a single repo or
 * monorepo." Pure — just wraps `core/detect-monorepo.ts`'s signal scan (spec §9.1). No prompt
 * here; this step is auto-detection only, same signals `install --target`'s warning logic
 * already uses (see src/core/CONTEXT.md).
 */
export function runDetectRepoStep(targetDir: string): DetectMonorepoResult {
  return detectMonorepo(targetDir);
}
