import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAdapterType } from "../types/adapter.js";
import type { AdapterType } from "../types/adapter.js";
import { isSkillEnablement } from "../types/pack.js";
import type { SkillAdapterOutput, SkillManifest, SkillOutputs } from "../types/pack.js";
import { isRepoType } from "../types/repo-type.js";

/**
 * Structured error for a `skill.json` that exists but is invalid — mirrors
 * `PackManifestError` in `read-pack-manifest.ts`. `path` is the `skill.json`
 * file path; `issues` lists every validation problem found.
 */
export class SkillManifestError extends Error {
  constructor(
    public readonly path: string,
    public readonly issues: string[],
  ) {
    super(`invalid skill.json at ${path}:\n- ${issues.join("\n- ")}`);
    this.name = "SkillManifestError";
  }
}

/** Default manifest used when a skill folder has no `skill.json` at all. */
function defaultSkillManifest(skillName: string, fallbackAdapters: AdapterType[]): SkillManifest {
  const outputs: SkillOutputs = {};
  for (const adapter of fallbackAdapters) {
    outputs[adapter] = adapter === "claude" ? { skills: true } : {};
  }
  // No skill.json at all -> "default" tier (decisions.md D19's absent-field fallback), same
  // permissive spirit as this whole function.
  return { name: skillName, supportedAdapters: fallbackAdapters, outputs, enablement: "default" };
}

/**
 * Reads `<skillDir>/skill.json` (decisions.md D8, spec §8.2/§12). If no
 * `skill.json` exists, falls back to a permissive default derived from the
 * owning pack's declared `adapters` (forward-compatible with skills that
 * predate per-skill manifests) rather than throwing — every skill imported
 * so far (M3) does author a real `skill.json`, so this path is untested
 * against real content today.
 */
export function readSkillManifest(skillDir: string, skillName: string, fallbackAdapters: AdapterType[]): SkillManifest {
  const manifestPath = join(skillDir, "skill.json");
  if (!existsSync(manifestPath)) {
    return defaultSkillManifest(skillName, fallbackAdapters);
  }

  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new SkillManifestError(manifestPath, [`could not read skill.json: ${(error as Error).message}`]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SkillManifestError(manifestPath, [`skill.json is not valid JSON: ${(error as Error).message}`]);
  }

  return validateSkillManifest(parsed, manifestPath);
}

function isSkillAdapterOutput(value: unknown): value is SkillAdapterOutput {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if ("skills" in obj && typeof obj.skills !== "boolean") return false;
  if ("agents" in obj && typeof obj.agents !== "boolean") return false;
  return true;
}

function validateSkillManifest(value: unknown, manifestPath: string): SkillManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SkillManifestError(manifestPath, ["skill.json must be a JSON object"]);
  }

  const obj = value as Record<string, unknown>;
  const issues: string[] = [];

  if (typeof obj.name !== "string" || obj.name.length === 0) {
    issues.push('"name" must be a non-empty string');
  }

  if (
    !Array.isArray(obj.supportedAdapters) ||
    obj.supportedAdapters.length === 0 ||
    !obj.supportedAdapters.every((a) => typeof a === "string" && isAdapterType(a))
  ) {
    issues.push('"supportedAdapters" must be a non-empty array of valid AdapterType values');
  }

  if (typeof obj.outputs !== "object" || obj.outputs === null || Array.isArray(obj.outputs)) {
    issues.push('"outputs" must be an object');
  } else {
    const outputsObj = obj.outputs as Record<string, unknown>;
    for (const [key, val] of Object.entries(outputsObj)) {
      if (!isAdapterType(key)) {
        issues.push(`"outputs" has unknown adapter key "${key}"`);
        continue;
      }
      if (val !== false && !isSkillAdapterOutput(val)) {
        issues.push(`"outputs.${key}" must be false or an object with boolean "skills"/"agents"`);
      }
    }
  }

  if ("enablement" in obj && !isSkillEnablement(obj.enablement)) {
    issues.push('"enablement" must be one of "required" | "default" | "optional" when present');
  }

  // D21: "requires" is structurally validated here (must be an array of non-empty strings) — this
  // is the ONE-FILE shape check. Whether each named skill actually RESOLVES to a real skill in the
  // resolved pack set cannot be known from a single skill.json in isolation; that cross-catalog
  // check happens in `core/skill-selection.ts` (see its own doc comment), which sees every skill
  // at once.
  if ("requires" in obj && obj.requires !== undefined) {
    if (!Array.isArray(obj.requires) || !obj.requires.every((r) => typeof r === "string" && r.length > 0)) {
      issues.push('"requires" must be an array of non-empty strings when present');
    }
  }

  // D26: both optional, tolerate absence — every skill.json authored before this field existed
  // needs zero migration.
  if ("description" in obj && obj.description !== undefined && typeof obj.description !== "string") {
    issues.push('"description" must be a string when present');
  }

  if ("clashesWith" in obj && obj.clashesWith !== undefined) {
    if (!Array.isArray(obj.clashesWith) || !obj.clashesWith.every((c) => typeof c === "string" && c.length > 0)) {
      issues.push('"clashesWith" must be an array of non-empty strings when present');
    }
  }

  // D26 razor layer: optional, tolerate absence (every pre-razor skill.json needs zero migration).
  // When present, every entry must be a real RepoType — a typo here would silently make a skill
  // unofferable for every type once the Stage-4 wizard-time filter reads this field.
  if ("applicability" in obj && obj.applicability !== undefined) {
    if (!Array.isArray(obj.applicability) || !obj.applicability.every((a) => typeof a === "string" && isRepoType(a))) {
      issues.push('"applicability" must be an array of valid RepoType values when present');
    }
  }

  // Razor-layer category: optional, tolerate absence (every non-razor skill.json needs zero
  // migration). Only shape-checked here (non-empty string) — the fixed 12-value category order
  // + label mapping lives in the wizard core (`build-schema.ts`), which treats any unrecognized
  // value the same as "absent" (falls into the trailing "Other" section) rather than erroring, so
  // a typo here degrades gracefully instead of breaking import.
  if ("category" in obj && obj.category !== undefined && (typeof obj.category !== "string" || obj.category.length === 0)) {
    issues.push('"category" must be a non-empty string when present');
  }

  if (issues.length > 0) {
    throw new SkillManifestError(manifestPath, issues);
  }

  return {
    name: obj.name as string,
    supportedAdapters: obj.supportedAdapters as AdapterType[],
    outputs: obj.outputs as SkillOutputs,
    ...(Array.isArray(obj.files) ? { files: obj.files as string[] } : {}),
    // Absent field == "default" (decisions.md D19) — every skill authored before M7 needs zero
    // migration; only the 3 owner common skills are hand-set to "required".
    enablement: isSkillEnablement(obj.enablement) ? obj.enablement : "default",
    ...(Array.isArray(obj.requires) ? { requires: obj.requires as string[] } : {}),
    ...(typeof obj.description === "string" ? { description: obj.description } : {}),
    ...(Array.isArray(obj.clashesWith) ? { clashesWith: obj.clashesWith as string[] } : {}),
    ...(Array.isArray(obj.applicability) ? { applicability: obj.applicability as SkillManifest["applicability"] } : {}),
    ...(typeof obj.category === "string" ? { category: obj.category } : {}),
  };
}
