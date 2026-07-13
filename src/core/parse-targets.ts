import { parseRepoTypesList } from "../types/repo-type.js";
import type { RepoType } from "../types/repo-type.js";

/** One parsed (but not yet filesystem-validated) `--target` entry. */
export interface ParsedTarget {
  /** Normalized (trimmed, no trailing slash) path as given on the CLI, e.g. "apps/web". */
  path: string;
  /**
   * One or more repo types for this target (decisions.md D22 multi-type targets). A single-type
   * target is still a one-element array — see `parseRepoTypesList()`'s doc comment for why this
   * keeps every pre-D22 single-type caller working unchanged.
   */
  types: RepoType[];
}

export interface ParseTargetsOptions {
  /** Raw `--target` flag values, in the order given (commander accumulates repeats into an array). */
  targetArgs: string[];
  /**
   * Raw `--type` flag value, if given — split-form convenience, single target only (D9). May be
   * comma-separated for multiple types (D22), e.g. "shopify-theme,vite-react-ts".
   */
  type?: string;
}

export type ParseTargetsResult = { ok: true; targets: ParsedTarget[] } | { ok: false; errors: string[] };

function normalizePath(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/**
 * Parses `--target` CLI arguments per decisions.md D9/D22 / spec §7.3:
 * - canonical colon form `--target <path>:<type>[+<type>...]`, repeatable, single or multiple
 *   targets, multiple types per target joined by `+` (D22);
 * - split form `--target <path> --type <type>[,<type>...]` accepted ONLY as a convenience for a
 *   single target (spec §7.3: "The split form ... remains allowed as a convenience for a single
 *   target only."), `--type` itself may be comma-separated for multiple types (D22).
 *
 * Never touches the filesystem — path-exists-in-repo validation is the caller's job
 * (`commands/install.ts`), which has `targetDir` in scope. Returns structured errors (never
 * throws) so the caller can map every failure to the shared invalid-input exit code (spec §7.9,
 * exit `1`).
 */
export function parseTargetArgs(options: ParseTargetsOptions): ParseTargetsResult {
  const { targetArgs, type } = options;
  const errors: string[] = [];

  if (targetArgs.length === 0) {
    return { ok: false, errors: ["no --target given"] };
  }

  const colonFlags = targetArgs.map((raw) => raw.includes(":"));
  const anyColon = colonFlags.some(Boolean);
  const allColon = colonFlags.every(Boolean);

  if (anyColon && !allColon) {
    return {
      ok: false,
      errors: [
        "cannot mix colon form (--target <path>:<type>) with split form (--target <path> --type <type>) " +
          "across multiple --target flags — use colon form for every target instead",
      ],
    };
  }

  if (!anyColon) {
    // Split-form convenience — valid only for a single target (D9).
    if (targetArgs.length > 1) {
      return {
        ok: false,
        errors: [
          "split form (--target <path> --type <type>) is only valid for a single target; " +
            "use colon form --target <path>:<type> for multiple targets",
        ],
      };
    }
    const rawPath = normalizePath(targetArgs[0] as string);
    if (!rawPath) errors.push("--target path must not be empty");

    let types: RepoType[] = [];
    if (!type) {
      errors.push("split form --target <path> requires --type <type>");
    } else {
      const parsed = parseRepoTypesList(type, ",");
      if (!parsed.ok) errors.push(parsed.error);
      else types = parsed.types;
    }

    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, targets: [{ path: rawPath, types }] };
  }

  // Canonical colon form — one or more targets, each with one or more `+`-joined types.
  const targets: ParsedTarget[] = [];
  for (const raw of targetArgs) {
    const idx = raw.indexOf(":");
    const rawPath = normalizePath(raw.slice(0, idx));
    const rawType = raw.slice(idx + 1).trim();

    if (!rawPath) {
      errors.push(`malformed --target "${raw}": path must not be empty (expected <path>:<type>)`);
      continue;
    }
    if (!rawType) {
      errors.push(`malformed --target "${raw}": type must not be empty (expected <path>:<type>)`);
      continue;
    }
    const parsed = parseRepoTypesList(rawType, "+");
    if (!parsed.ok) {
      errors.push(`--target "${raw}": ${parsed.error}`);
      continue;
    }
    targets.push({ path: rawPath, types: parsed.types });
  }

  if (errors.length > 0) return { ok: false, errors };

  const seen = new Set<string>();
  for (const t of targets) {
    if (seen.has(t.path)) errors.push(`duplicate --target path "${t.path}"`);
    seen.add(t.path);
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, targets };
}
