/**
 * Repo types this package knows how to target.
 *
 * inject-nockta-skills is the canonical semantic owner of this union
 * (see decisions.md D7). `create-nockta-repo` duplicates this string
 * union locally and guards drift with a contract test against
 * `inject-nockta-skills list --json`.
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §5.1
 */
export type RepoType =
  | "next"
  | "vite-react-ts"
  | "nest"
  | "shopify-app"
  | "shopify-theme"
  | "shopify-headless"
  | "react-native"
  | "expo";

export const REPO_TYPES: readonly RepoType[] = [
  "next",
  "vite-react-ts",
  "nest",
  "shopify-app",
  "shopify-theme",
  "shopify-headless",
  "react-native",
  "expo",
];

export function isRepoType(value: string): value is RepoType {
  return (REPO_TYPES as readonly string[]).includes(value);
}

/**
 * Friendly display titles for the wizard's repo-type choices (owner-authored, this pass). The
 * enum value in `RepoType` never changes — it's still what routing/resolve/`--type`/output all
 * key off — this map ONLY changes what a View renders. Single source, consumed by
 * `wizard/core/build-schema.ts`'s `buildRepoTypeStep()` for BOTH the CLI two-pane View and the
 * `--web` page (see D28/D30).
 */
export const REPO_TYPE_TITLES: Record<RepoType, string> = {
  next: "Next.js",
  "vite-react-ts": "Vite + React + TS",
  nest: "NestJS",
  "shopify-app": "Shopify App",
  "shopify-theme": "Shopify Theme",
  "shopify-headless": "Shopify Headless (Hydrogen)",
  "react-native": "React Native",
  expo: "Expo",
};

/**
 * Consumer-facing, one-line descriptions for the wizard's repo-type choices (this pass). Shown in
 * the CLI two-pane detail pane and the `--web` page's choice body — no dev-speak, no spec/decision
 * refs.
 */
export const REPO_TYPE_DESCRIPTIONS: Record<RepoType, string> = {
  next: "React framework with file-based routing, SSR/SSG, and API routes.",
  "vite-react-ts": "Vite-powered React app with TypeScript — fast dev server and builds.",
  nest: "NestJS backend framework — structured, TypeScript-first Node.js APIs.",
  "shopify-app": "Embedded Shopify app built with the Shopify App CLI and Admin APIs.",
  "shopify-theme": "Shopify Liquid theme — sections, blocks, and the Online Store 2.0 editor.",
  "shopify-headless": "Headless Shopify storefront built with Hydrogen and the Storefront API.",
  "react-native": "Cross-platform mobile app built with React Native.",
  expo: "Managed React Native app built with Expo's tooling and native APIs.",
};

export type ParseRepoTypesResult =
  | { ok: true; types: RepoType[] }
  | { ok: false; error: string };

/**
 * Multi-type parsing (decisions.md D22): splits a raw `--type`/target-embedded type string on
 * `separator` (`","` for the `--type` flag's comma form, `"+"` for the `--target
 * <path>:<type>[+<type>...]` colon form's embedded type list — see `core/parse-targets.ts`),
 * validates every named type against `REPO_TYPES`, and dedupes. A single-type input (no
 * separator present) still goes through this same path and comes back as a one-element array —
 * this is the mechanism that keeps existing single-type callers working unchanged (spec §5.1,
 * §7.3). Never throws; empty/unknown names are reported as structured errors.
 */
export function parseRepoTypesList(raw: string, separator: "," | "+"): ParseRepoTypesResult {
  const names = raw
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (names.length === 0) {
    return { ok: false, error: "type list must not be empty" };
  }

  const invalid = names.filter((n) => !isRepoType(n));
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `invalid type "${invalid.join(separator)}". Valid repo types: ${REPO_TYPES.join(", ")}`,
    };
  }

  return { ok: true, types: [...new Set(names as RepoType[])] };
}
