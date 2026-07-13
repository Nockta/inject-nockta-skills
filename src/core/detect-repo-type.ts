import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listWorkspacePackagePaths } from "./workspace-globs.js";
import type { RepoType } from "../types/repo-type.js";

/**
 * One ranked repo-type guess, with the evidence that produced it.
 *
 * `confidence` is a rough 0..1 heuristic score, not a calibrated
 * probability — it exists to RANK guesses relative to each other (best
 * guess first), not to be displayed as a precise statistic.
 */
export interface RepoTypeGuess {
  type: RepoType;
  confidence: number;
  evidence: string[];
}

export interface DetectRepoTypeResult {
  /** Ranked descending by confidence (ties broken alphabetically by type for determinism). Empty when nothing matched ("unknown"). */
  guesses: RepoTypeGuess[];
}

function readPackageJson(dir: string): Record<string, unknown> | null {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mergedDeps(pkg: Record<string, unknown> | null): Record<string, string> {
  if (!pkg) return {};
  const deps = (pkg.dependencies && typeof pkg.dependencies === "object" ? pkg.dependencies : {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies && typeof pkg.devDependencies === "object" ? pkg.devDependencies : {}) as Record<
    string,
    string
  >;
  return { ...deps, ...devDeps };
}

/**
 * Heuristic single-project repo-type detection (spec §11 `src/core/detect-repo-type.ts`) — used
 * ONLY to PREFILL the interactive wizard's repo-type step (spec §7.1 steps 2–3) with a ranked
 * best guess the user can confirm or override. It never overrides an explicit `--type` — callers
 * (the wizard) must skip calling this entirely, or ignore its result, whenever an explicit
 * `--type` was already given; this function itself has no notion of `--type` and does not gate
 * anything (no install/exit-code decision reads this file).
 *
 * Heuristics (brief-specified):
 * - `next`: `package.json` deps include `next`.
 * - `vite-react-ts`: `package.json` deps include `vite` AND `react` (a TypeScript signal —
 *   `typescript` dep or a `tsconfig.json` — nudges confidence up further, since `vite` alone is a
 *   weak, generic signal shared by many non-React setups).
 * - `nest`: `package.json` deps include `@nestjs/core`.
 * - `shopify-headless`: `package.json` deps include `@shopify/hydrogen`, OR a
 *   `hydrogen.config.{js,ts}` file is present, OR (weaker) a Remix dependency co-occurs with any
 *   `@shopify/*` dependency (a remix+shopify storefront-style headless setup).
 * - `shopify-app`: `shopify.app.toml` present at the target dir root.
 * - `shopify-theme`: the classic Shopify theme directory shape — `sections/` + `templates/` +
 *   `config/` all present — or, weaker, a `.shopify/` directory alone.
 * - `react-native` / `expo` (decisions.md D25): `package.json` deps include `react-native` — the
 *   RN-vs-web discriminator (absent from every web React setup; do NOT gate on bare `react`, and do
 *   NOT require `metro.config.js`/`eas.json` — the current SDK 57 Expo default template ships
 *   without either, see scratchpad/react-native-tooling-research.md §3). Once `react-native` is
 *   confirmed, sub-classify `expo` (Expo-managed) when `expo` is also a dep, OR `app.json` has a
 *   top-level `"expo"` key, OR `app.config.js`/`app.config.ts` exists at the repo root; otherwise
 *   `react-native` (bare).
 *
 * Multiple types may match at once (ambiguous repos, or deliberately-crafted fixtures) — all
 * matching guesses are returned, ranked; the caller decides how many to show.
 */
export function detectRepoType(targetDir: string): DetectRepoTypeResult {
  const pkg = readPackageJson(targetDir);
  const deps = mergedDeps(pkg);
  const hasDep = (name: string): boolean => Object.prototype.hasOwnProperty.call(deps, name);
  const guesses: RepoTypeGuess[] = [];

  // next
  if (hasDep("next")) {
    guesses.push({ type: "next", confidence: 0.95, evidence: ['package.json dependencies include "next"'] });
  }

  // nest
  if (hasDep("@nestjs/core")) {
    guesses.push({ type: "nest", confidence: 0.95, evidence: ['package.json dependencies include "@nestjs/core"'] });
  }

  // vite-react-ts
  {
    const evidence: string[] = [];
    let confidence = 0;
    const hasVite = hasDep("vite");
    const hasReact = hasDep("react");
    if (hasVite && hasReact) {
      evidence.push('package.json dependencies include both "vite" and "react"');
      confidence = 0.85;
    } else if (hasVite) {
      evidence.push('package.json dependencies include "vite" (no "react" dependency found)');
      confidence = 0.4;
    } else if (hasReact) {
      evidence.push('package.json dependencies include "react" (no "vite" dependency found)');
      confidence = 0.2;
    }
    if (confidence > 0 && (hasDep("typescript") || existsSync(join(targetDir, "tsconfig.json")))) {
      evidence.push("TypeScript present (typescript dependency or tsconfig.json)");
      confidence = Math.min(0.92, confidence + 0.07);
    }
    if (confidence > 0) guesses.push({ type: "vite-react-ts", confidence, evidence });
  }

  // shopify-headless
  {
    const evidence: string[] = [];
    let confidence = 0;
    if (hasDep("@shopify/hydrogen")) {
      evidence.push('package.json dependencies include "@shopify/hydrogen"');
      confidence = 0.9;
    }
    const hasHydrogenConfig =
      existsSync(join(targetDir, "hydrogen.config.js")) || existsSync(join(targetDir, "hydrogen.config.ts"));
    if (hasHydrogenConfig) {
      evidence.push("hydrogen.config.{js,ts} present at repo root");
      confidence = Math.max(confidence, 0.9);
    }
    if (confidence === 0) {
      const hasRemix = hasDep("@remix-run/react") || hasDep("@remix-run/dev") || hasDep("@remix-run/node");
      const shopifyDep = Object.keys(deps).find((name) => name.startsWith("@shopify/"));
      if (hasRemix && shopifyDep) {
        evidence.push(`Remix dependency + a "@shopify/*" dependency ("${shopifyDep}") — remix+shopify storefront-style setup`);
        confidence = 0.7;
      }
    }
    if (confidence > 0) guesses.push({ type: "shopify-headless", confidence, evidence });
  }

  // shopify-app
  if (existsSync(join(targetDir, "shopify.app.toml"))) {
    guesses.push({ type: "shopify-app", confidence: 0.95, evidence: ["shopify.app.toml present at repo root"] });
  }

  // shopify-theme
  {
    const hasSections = existsSync(join(targetDir, "sections"));
    const hasTemplates = existsSync(join(targetDir, "templates"));
    const hasConfig = existsSync(join(targetDir, "config"));
    const hasDotShopify = existsSync(join(targetDir, ".shopify"));
    if (hasSections && hasTemplates && hasConfig) {
      guesses.push({
        type: "shopify-theme",
        confidence: 0.85,
        evidence: ["sections/, templates/, and config/ directories all present at repo root (classic theme shape)"],
      });
    } else if (hasDotShopify) {
      guesses.push({
        type: "shopify-theme",
        confidence: 0.6,
        evidence: [".shopify/ directory present at repo root"],
      });
    }
  }

  // react-native / expo (decisions.md D25)
  if (hasDep("react-native")) {
    const appJsonPath = join(targetDir, "app.json");
    let appJsonHasExpoKey = false;
    if (existsSync(appJsonPath)) {
      try {
        const appJson = JSON.parse(readFileSync(appJsonPath, "utf8")) as unknown;
        appJsonHasExpoKey =
          !!appJson && typeof appJson === "object" && Object.prototype.hasOwnProperty.call(appJson, "expo");
      } catch {
        appJsonHasExpoKey = false;
      }
    }
    const hasAppConfig = existsSync(join(targetDir, "app.config.js")) || existsSync(join(targetDir, "app.config.ts"));
    const hasExpoDep = hasDep("expo");
    const isExpo = hasExpoDep || appJsonHasExpoKey || hasAppConfig;

    if (isExpo) {
      const evidence: string[] = ['package.json dependencies include "react-native"'];
      if (hasExpoDep) evidence.push('package.json dependencies include "expo"');
      if (appJsonHasExpoKey) evidence.push('app.json has a top-level "expo" key');
      if (hasAppConfig) evidence.push("app.config.js/app.config.ts present at repo root");
      guesses.push({ type: "expo", confidence: 0.95, evidence });
    } else {
      guesses.push({
        type: "react-native",
        confidence: 0.9,
        evidence: [
          'package.json dependencies include "react-native"',
          'no "expo" dependency, "expo" key in app.json, or app.config.js/ts found (bare React Native)',
        ],
      });
    }
  }

  guesses.sort((a, b) => b.confidence - a.confidence || a.type.localeCompare(b.type));
  return { guesses };
}

/** One `detectRepoType()` guess, tagged with WHERE it came from — `"."` for the repo root itself, or a workspace-relative sub-package path (e.g. `"packages/tcc-react"`). */
export interface WorkspaceRepoTypeGuess extends RepoTypeGuess {
  source: string;
}

export interface DetectRepoTypeWorkspaceResult {
  /**
   * Ranked, DEDUPED-BY-TYPE aggregate across the root directory AND every declared npm workspace
   * sub-package's manifest (decisions.md D22 refinement — "Detection walks workspace
   * sub-packages"). When the same type is guessed from more than one source (e.g. a weak
   * vite-react-ts signal from a non-react sub-package AND a strong one from a real react
   * sub-package), the HIGHEST-confidence guess wins and its evidence is annotated with its
   * source — a weaker same-type guess from elsewhere is folded in as additional evidence, never
   * surfaced as a separate lower-ranked entry. This is the concrete mechanism behind the
   * refinement's "a sub-signal that matches no stack pack ... contributes nothing": a weak
   * signal never outranks or stands apart from a real one for the same type.
   */
  guesses: RepoTypeGuess[];
  /** Every per-source guess, unaggregated — for detail/debug output (e.g. the demo CLI, doctor). */
  bySource: WorkspaceRepoTypeGuess[];
}

/**
 * Workspace-walking repo-type detection (decisions.md D22 refinement, "Detection walks workspace
 * sub-packages"): scans the repo-ROOT signals (via plain `detectRepoType()`) AND every declared
 * npm `workspaces` sub-package's manifest (`core/workspace-globs.ts`'s
 * `listWorkspacePackagePaths()` — same glob-reading/expansion the wizard's monorepo target
 * discovery already uses), so a repo that is itself a project AND a workspace root (the real
 * "Grace" case this refinement records: a Shopify Liquid theme at the repo root with a
 * `packages/*` workspace carrying the Vite/React asset frontend) surfaces BOTH types, not just
 * whichever one the root-only heuristic happened to see first.
 *
 * When `targetDir` has no `workspaces` field/`pnpm-workspace.yaml` at all, this degrades to
 * exactly `detectRepoType(targetDir)`'s own result (one source: `"."`) — safe to call
 * unconditionally, never a behavior change for a non-workspace repo.
 */
export function detectRepoTypeAcrossWorkspace(targetDir: string): DetectRepoTypeWorkspaceResult {
  const bySource: WorkspaceRepoTypeGuess[] = detectRepoType(targetDir).guesses.map((g) => ({ ...g, source: "." }));

  for (const subPath of listWorkspacePackagePaths(targetDir)) {
    const subGuesses = detectRepoType(join(targetDir, subPath)).guesses;
    for (const g of subGuesses) bySource.push({ ...g, source: subPath });
  }

  const byType = new Map<RepoType, RepoTypeGuess>();
  for (const g of bySource) {
    const sourceLabel = g.source === "." ? "root" : g.source;
    const tagged = `(${sourceLabel}) ${g.evidence.join("; ")}`;
    const existing = byType.get(g.type);
    if (!existing || g.confidence > existing.confidence) {
      byType.set(g.type, { type: g.type, confidence: g.confidence, evidence: [tagged] });
    } else {
      existing.evidence.push(tagged);
    }
  }

  const guesses = [...byType.values()].sort((a, b) => b.confidence - a.confidence || a.type.localeCompare(b.type));
  return { guesses, bySource };
}
