import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAdapterType } from "../types/adapter.js";
import type { AdapterType } from "../types/adapter.js";
import type { PackManifest } from "../types/pack.js";

/**
 * Structured error for a `pack.json` that is missing, unreadable, not valid
 * JSON, or fails shape validation. `path` is the `pack.json` file path;
 * `issues` lists every validation problem found (not just the first).
 */
export class PackManifestError extends Error {
  constructor(
    public readonly path: string,
    public readonly issues: string[],
  ) {
    super(`invalid pack.json at ${path}:\n- ${issues.join("\n- ")}`);
    this.name = "PackManifestError";
  }
}

/**
 * Parses and validates `<packDir>/pack.json` against the shape from spec
 * §12. Throws `PackManifestError` (never a raw parse/fs error) so callers
 * get one structured, packDir-scoped failure mode.
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §11
 * (`src/packs/read-pack-manifest.ts`), §12 (Pack Architecture).
 */
export function readPackManifest(packDir: string): PackManifest {
  const manifestPath = join(packDir, "pack.json");

  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new PackManifestError(manifestPath, [
      `could not read pack.json: ${(error as Error).message}`,
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new PackManifestError(manifestPath, [
      `pack.json is not valid JSON: ${(error as Error).message}`,
    ]);
  }

  return validatePackManifest(parsed, manifestPath);
}

function validatePackManifest(value: unknown, manifestPath: string): PackManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PackManifestError(manifestPath, ["pack.json must be a JSON object"]);
  }

  const obj = value as Record<string, unknown>;
  const issues: string[] = [];

  if (typeof obj.name !== "string" || obj.name.length === 0) {
    issues.push('"name" must be a non-empty string');
  }
  if (typeof obj.displayName !== "string" || obj.displayName.length === 0) {
    issues.push('"displayName" must be a non-empty string');
  }
  if (typeof obj.description !== "string" || obj.description.length === 0) {
    issues.push('"description" must be a non-empty string');
  }
  if (!Array.isArray(obj.requires) || !obj.requires.every((r) => typeof r === "string")) {
    issues.push('"requires" must be an array of strings');
  }
  if (
    !Array.isArray(obj.skills) ||
    obj.skills.length === 0 ||
    !obj.skills.every((s) => typeof s === "string" && s.length > 0)
  ) {
    issues.push('"skills" must be a non-empty array of non-empty strings');
  }
  if (
    !Array.isArray(obj.adapters) ||
    obj.adapters.length === 0 ||
    !obj.adapters.every((a) => typeof a === "string" && isAdapterType(a))
  ) {
    issues.push('"adapters" must be a non-empty array of valid AdapterType values ("claude" | "cursor" | "copilot" | "agent" | "antigravity")');
  }

  if (issues.length > 0) {
    throw new PackManifestError(manifestPath, issues);
  }

  return {
    name: obj.name as string,
    displayName: obj.displayName as string,
    description: obj.description as string,
    requires: obj.requires as string[],
    skills: obj.skills as string[],
    adapters: obj.adapters as AdapterType[],
  };
}
