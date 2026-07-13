import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * sha256 hex digest of a file's contents, used for
 * `GeneratedFileRecord.sourceHash`/`.outputHash` (spec §10.3, decisions.md D3).
 *
 * Not part of the spec §11 `src/utils/` list verbatim (which enumerates
 * `fs-utils.ts`/`json-utils.ts`/`path-utils.ts`/`logger.ts`) — added this
 * milestone because D3's manifest hashing needs a real, independently
 * verifiable digest, and a single-purpose file keeps that concern isolated.
 */
export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
