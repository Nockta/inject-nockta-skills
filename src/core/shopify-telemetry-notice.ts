/**
 * Owner ruling (RED-1, packs-redistribution-audit.md): the bundled Shopify skills carry
 * Shopify's own official, opt-out usage instrumentation (`track-telemetry.sh`/`.ps1`,
 * `log_skill_use.mjs`, and telemetry embedded in `validate.mjs`/`search_docs.mjs` — POSTs to
 * `https://shopify.dev/mcp/usage`, including up to 2000 chars of the user's verbatim prompt).
 * The scripts are NOT stripped or modified — "just disclose, the user wants to opt-out or not
 * that is theirs" (owner, verbatim). This module is the single source of the disclosure text and
 * the single place that decides whether a given command run actually wrote any shopify-* pack
 * content, so `install`/`repair`/`upgrade` all surface the SAME notice the SAME way.
 *
 * Deliberately does NOT set `OPT_OUT_INSTRUMENTATION` anywhere — that would make the choice for
 * the consumer, which the ruling explicitly reserves to them.
 */

/** One-line disclosure, reused verbatim by every command's human + `--json` (`notices`) output. */
export const SHOPIFY_TELEMETRY_NOTICE =
  "note: Shopify skills include Shopify's usage telemetry (prompts + usage data → shopify.dev). Opt out: OPT_OUT_INSTRUMENTATION=true";

/**
 * `install`: pack names are already known directly (`InstallData.installedPacks`) — every
 * bundled Shopify pack is literally named `shopify-*` (`shopify-app`, `shopify-headless`,
 * `shopify-theme`), so a simple prefix check is exact and needs no per-skill telemetry
 * cross-reference.
 */
export function shopifyTelemetryNoticesForPacks(installedPacks: readonly string[]): string[] {
  return installedPacks.some((pack) => pack.startsWith("shopify-")) ? [SHOPIFY_TELEMETRY_NOTICE] : [];
}

/**
 * `repair`/`upgrade`: no `installedPacks` list exists — only per-file manifest `records` (each
 * carrying its own `pack`) and the sets of paths actually WRITTEN this run (`restored` ∪
 * `refreshed` ∪ `forcedOverwrites` — deliberately excluding `unchangedIntact`/`skippedModified`,
 * since the notice is about content this run *wrote*, not merely tracks).
 */
export function shopifyTelemetryNoticesForWrittenRecords(
  records: readonly { path: string; pack: string }[],
  writtenPaths: readonly string[],
): string[] {
  const written = new Set(writtenPaths);
  const writtenPacks = records.filter((r) => written.has(r.path)).map((r) => r.pack);
  return shopifyTelemetryNoticesForPacks(writtenPacks);
}
