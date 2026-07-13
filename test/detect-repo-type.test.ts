import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectRepoType, detectRepoTypeAcrossWorkspace } from "../src/core/detect-repo-type.js";

function pkg(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}): string {
  return JSON.stringify({ name: "fixture", dependencies: deps, devDependencies: devDeps });
}

describe("detectRepoType (spec §11 src/core/detect-repo-type.ts) — heuristic wizard prefill, never gates install", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-detect-repo-type-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns no guesses (unknown) for an empty directory", () => {
    const result = detectRepoType(root);
    expect(result.guesses).toEqual([]);
  });

  it("returns no guesses (unknown) for a plain package.json with no recognized deps", () => {
    writeFileSync(join(root, "package.json"), pkg({ lodash: "^4.0.0" }), "utf8");
    expect(detectRepoType(root).guesses).toEqual([]);
  });

  it("never throws on an unparsable package.json", () => {
    writeFileSync(join(root, "package.json"), "{ not json", "utf8");
    expect(() => detectRepoType(root)).not.toThrow();
    expect(detectRepoType(root).guesses).toEqual([]);
  });

  it("detects next from a `next` dependency", () => {
    writeFileSync(join(root, "package.json"), pkg({ next: "^15.0.0", react: "^19.0.0" }), "utf8");
    const result = detectRepoType(root);
    expect(result.guesses[0]?.type).toBe("next");
    expect(result.guesses[0]?.confidence).toBeGreaterThan(0.9);
    expect(result.guesses[0]?.evidence.join(" ")).toMatch(/next/);
  });

  it("detects nest from a `@nestjs/core` dependency", () => {
    writeFileSync(join(root, "package.json"), pkg({ "@nestjs/core": "^10.0.0" }), "utf8");
    const result = detectRepoType(root);
    expect(result.guesses[0]?.type).toBe("nest");
    expect(result.guesses[0]?.confidence).toBeGreaterThan(0.9);
  });

  it("detects vite-react-ts from vite+react deps, with higher confidence than vite alone", () => {
    writeFileSync(join(root, "package.json"), pkg({ react: "^18.0.0" }, { vite: "^5.0.0" }), "utf8");
    const withBoth = detectRepoType(root).guesses.find((g) => g.type === "vite-react-ts");
    expect(withBoth).toBeDefined();
    expect(withBoth?.confidence).toBeGreaterThan(0.7);

    const viteOnlyRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-detect-repo-type-vite-only-"));
    try {
      writeFileSync(join(viteOnlyRoot, "package.json"), pkg({}, { vite: "^5.0.0" }), "utf8");
      const viteOnly = detectRepoType(viteOnlyRoot).guesses.find((g) => g.type === "vite-react-ts");
      expect(viteOnly).toBeDefined();
      expect(viteOnly!.confidence).toBeLessThan(withBoth!.confidence);
    } finally {
      rmSync(viteOnlyRoot, { recursive: true, force: true });
    }
  });

  it("nudges vite-react-ts confidence up when typescript is also present", () => {
    writeFileSync(join(root, "package.json"), pkg({ react: "^18.0.0" }, { vite: "^5.0.0" }), "utf8");
    const withoutTs = detectRepoType(root).guesses.find((g) => g.type === "vite-react-ts")!;

    const tsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-detect-repo-type-vite-ts-"));
    try {
      writeFileSync(join(tsRoot, "package.json"), pkg({ react: "^18.0.0" }, { vite: "^5.0.0", typescript: "^5.0.0" }), "utf8");
      const withTs = detectRepoType(tsRoot).guesses.find((g) => g.type === "vite-react-ts")!;
      expect(withTs.confidence).toBeGreaterThan(withoutTs.confidence);
    } finally {
      rmSync(tsRoot, { recursive: true, force: true });
    }
  });

  it("detects shopify-headless from a `@shopify/hydrogen` dependency", () => {
    writeFileSync(join(root, "package.json"), pkg({ "@shopify/hydrogen": "^2024.1.0" }), "utf8");
    const result = detectRepoType(root);
    expect(result.guesses[0]?.type).toBe("shopify-headless");
    expect(result.guesses[0]?.confidence).toBeGreaterThan(0.85);
  });

  it("detects shopify-headless from a hydrogen.config.ts file even without the hydrogen dependency", () => {
    writeFileSync(join(root, "package.json"), pkg({}), "utf8");
    writeFileSync(join(root, "hydrogen.config.ts"), "export default {};\n", "utf8");
    const result = detectRepoType(root);
    expect(result.guesses[0]?.type).toBe("shopify-headless");
  });

  it("detects shopify-headless (weaker confidence) from remix + a @shopify/* dependency", () => {
    writeFileSync(join(root, "package.json"), pkg({ "@remix-run/react": "^2.0.0", "@shopify/storefront-api-client": "^1.0.0" }), "utf8");
    const result = detectRepoType(root);
    const guess = result.guesses.find((g) => g.type === "shopify-headless");
    expect(guess).toBeDefined();
    expect(guess!.confidence).toBeLessThan(0.85); // weaker than the direct-hydrogen-dependency case
  });

  it("does NOT guess shopify-headless from remix alone (no shopify dependency)", () => {
    writeFileSync(join(root, "package.json"), pkg({ "@remix-run/react": "^2.0.0" }), "utf8");
    expect(detectRepoType(root).guesses.find((g) => g.type === "shopify-headless")).toBeUndefined();
  });

  it("detects shopify-app from shopify.app.toml at the repo root", () => {
    writeFileSync(join(root, "shopify.app.toml"), "name = \"my-app\"\n", "utf8");
    const result = detectRepoType(root);
    expect(result.guesses[0]?.type).toBe("shopify-app");
    expect(result.guesses[0]?.confidence).toBeGreaterThan(0.9);
  });

  it("detects shopify-theme from the classic sections/+templates/+config/ directory shape", () => {
    mkdirSync(join(root, "sections"), { recursive: true });
    mkdirSync(join(root, "templates"), { recursive: true });
    mkdirSync(join(root, "config"), { recursive: true });
    const result = detectRepoType(root);
    expect(result.guesses[0]?.type).toBe("shopify-theme");
    expect(result.guesses[0]?.confidence).toBeGreaterThan(0.8);
  });

  it("detects shopify-theme (weaker confidence) from a .shopify/ directory alone", () => {
    mkdirSync(join(root, ".shopify"), { recursive: true });
    const result = detectRepoType(root);
    expect(result.guesses[0]?.type).toBe("shopify-theme");
    expect(result.guesses[0]?.confidence).toBeLessThan(0.8);
  });

  it("does not treat a partial theme shape (missing config/) as the strong theme signal", () => {
    mkdirSync(join(root, "sections"), { recursive: true });
    mkdirSync(join(root, "templates"), { recursive: true });
    const result = detectRepoType(root);
    expect(result.guesses.find((g) => g.type === "shopify-theme")).toBeUndefined();
  });

  it("an explicit --type is never consulted here — this function has no notion of it at all", () => {
    // Documents the contract (brief item 1): detectRepoType() takes only a targetDir, never a
    // preset type — "never overrides an explicit --type" is enforced by the WIZARD skipping this
    // call entirely (see steps/select-repo-type.ts's selectRepoType()), not by anything in here.
    writeFileSync(join(root, "package.json"), pkg({ next: "^15.0.0" }), "utf8");
    const result = detectRepoType(root);
    expect(result.guesses[0]?.type).toBe("next"); // detection still runs and still finds "next"
    // (the wizard is what would ignore this result if --type were, say, "nest")
  });

  describe("react-native / expo (decisions.md D25)", () => {
    it("does NOT detect react-native/expo from react alone (RN-vs-web discriminator)", () => {
      writeFileSync(join(root, "package.json"), pkg({ react: "^18.0.0" }, { vite: "^5.0.0" }), "utf8");
      const result = detectRepoType(root);
      expect(result.guesses.find((g) => g.type === "react-native")).toBeUndefined();
      expect(result.guesses.find((g) => g.type === "expo")).toBeUndefined();
    });

    it("detects expo from an expo-managed package.json (expo + react-native + expo-router deps)", () => {
      writeFileSync(
        join(root, "package.json"),
        pkg({ expo: "^57.0.0", "react-native": "^0.86.0", "expo-router": "^7.0.0", react: "^19.0.0" }),
        "utf8",
      );
      const result = detectRepoType(root);
      expect(result.guesses[0]?.type).toBe("expo");
      expect(result.guesses[0]?.confidence).toBeGreaterThan(0.9);
      expect(result.guesses.find((g) => g.type === "react-native")).toBeUndefined();
    });

    it("detects expo from app.json's top-level \"expo\" key even without an `expo` dependency", () => {
      writeFileSync(join(root, "package.json"), pkg({ "react-native": "^0.86.0" }), "utf8");
      writeFileSync(join(root, "app.json"), JSON.stringify({ expo: { name: "app" } }), "utf8");
      const result = detectRepoType(root);
      expect(result.guesses[0]?.type).toBe("expo");
      expect(result.guesses[0]?.evidence.join(" ")).toMatch(/app\.json/);
    });

    it("detects expo from app.config.ts even without an `expo` dependency or app.json expo key", () => {
      writeFileSync(join(root, "package.json"), pkg({ "react-native": "^0.86.0" }), "utf8");
      writeFileSync(join(root, "app.config.ts"), "export default {};\n", "utf8");
      const result = detectRepoType(root);
      expect(result.guesses[0]?.type).toBe("expo");
    });

    it("detects bare react-native from a react-native dep with no expo dep, no expo app.json key, no app.config", () => {
      writeFileSync(
        join(root, "package.json"),
        pkg({ "react-native": "^0.86.0", react: "^19.0.0" }),
        "utf8",
      );
      writeFileSync(join(root, "app.json"), JSON.stringify({ name: "app", displayName: "App" }), "utf8");
      const result = detectRepoType(root);
      expect(result.guesses[0]?.type).toBe("react-native");
      expect(result.guesses.find((g) => g.type === "expo")).toBeUndefined();
    });

    it("bare react-native works with no app.json at all", () => {
      writeFileSync(join(root, "package.json"), pkg({ "react-native": "^0.86.0" }), "utf8");
      const result = detectRepoType(root);
      expect(result.guesses[0]?.type).toBe("react-native");
    });

    it("a plain react web app is never classified as react-native or expo", () => {
      writeFileSync(join(root, "package.json"), pkg({ react: "^18.0.0" }, { vite: "^5.0.0", typescript: "^5.0.0" }), "utf8");
      const result = detectRepoType(root);
      const types = result.guesses.map((g) => g.type);
      expect(types).not.toContain("react-native");
      expect(types).not.toContain("expo");
      expect(types).toContain("vite-react-ts");
    });
  });

  describe("ambiguous ranking (multiple types match at once)", () => {
    it("ranks by confidence descending, ties broken alphabetically by type", () => {
      // Deliberately unrealistic combo, purely to exercise the ranking/tie-break rule: both
      // "next" and "@nestjs/core" heuristics fire at the SAME confidence (0.95 each).
      writeFileSync(join(root, "package.json"), pkg({ next: "^15.0.0", "@nestjs/core": "^10.0.0" }), "utf8");
      const result = detectRepoType(root);
      const types = result.guesses.map((g) => g.type);
      expect(types).toContain("next");
      expect(types).toContain("nest");
      // "nest" < "next" alphabetically ('s' < 'x' at the 3rd character) — tie-break is deterministic.
      const nestIdx = types.indexOf("nest");
      const nextIdx = types.indexOf("next");
      expect(nestIdx).toBeLessThan(nextIdx);
      expect(result.guesses[0]?.confidence).toBe(result.guesses[1]?.confidence);
    });

    it("ranks a strong signal above a weak one when both are present", () => {
      // shopify.app.toml (0.95) vs a bare .shopify/ dir (0.6) would both fire for shopify-* types
      // in principle, but here we combine next (0.95) with weak vite-only (0.4) to show ordering.
      writeFileSync(join(root, "package.json"), pkg({ next: "^15.0.0" }, { vite: "^5.0.0" }), "utf8");
      const result = detectRepoType(root);
      expect(result.guesses[0]?.type).toBe("next");
      expect(result.guesses.find((g) => g.type === "vite-react-ts")).toBeDefined();
      expect(result.guesses[0]!.confidence).toBeGreaterThan(
        result.guesses.find((g) => g.type === "vite-react-ts")!.confidence,
      );
    });
  });
});

/**
 * D22 refinement ("Detection walks workspace sub-packages") — `detectRepoTypeAcrossWorkspace()`
 * scans the repo root AND every declared npm `workspaces` sub-package's manifest, aggregating a
 * ranked multi-candidate list. Fixture mirrors the real-world "Grace" repo shape the refinement
 * itself records: a Shopify Liquid theme at the repo root (classic sections/templates/config
 * shape) with a root `package.json` declaring `workspaces: ["packages/*"]`, one sub-package
 * (`packages/x`) carrying a real Vite+React+TypeScript asset frontend, and a second sub-package
 * (`packages/y`) that is Vite+TypeScript with NO react — a signal that matches no MVP stack type
 * strongly and must not out-rank the real vite-react-ts signal from `packages/x`.
 */
describe("detectRepoTypeAcrossWorkspace (decisions.md D22 refinement — workspace-walking detection)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-detect-workspace-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function makeGraceShapedFixture(): void {
    // Root: classic Shopify theme directory shape.
    mkdirSync(join(root, "sections"), { recursive: true });
    mkdirSync(join(root, "templates"), { recursive: true });
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }), "utf8");

    // packages/x: real Vite + React + TypeScript workspace package.
    mkdirSync(join(root, "packages", "x"), { recursive: true });
    writeFileSync(
      join(root, "packages", "x", "package.json"),
      pkg({ react: "^18.0.0" }, { vite: "^5.0.0", typescript: "^5.0.0" }),
      "utf8",
    );

    // packages/y: Vite + TypeScript, NO react — matches no MVP stack type strongly.
    mkdirSync(join(root, "packages", "y"), { recursive: true });
    writeFileSync(join(root, "packages", "y", "package.json"), pkg({}, { vite: "^5.0.0", typescript: "^5.0.0" }), "utf8");
  }

  it("root-only detectRepoType() sees ONLY the theme — the pre-D22 blind spot this refinement closes", () => {
    makeGraceShapedFixture();
    const rootOnly = detectRepoType(root);
    expect(rootOnly.guesses[0]?.type).toBe("shopify-theme");
    expect(rootOnly.guesses.find((g) => g.type === "vite-react-ts")).toBeUndefined();
  });

  it("aggregated ranked candidates include BOTH shopify-theme (root) and vite-react-ts (packages/x)", () => {
    makeGraceShapedFixture();
    const result = detectRepoTypeAcrossWorkspace(root);

    const types = result.guesses.map((g) => g.type);
    expect(types).toContain("shopify-theme");
    expect(types).toContain("vite-react-ts");

    const theme = result.guesses.find((g) => g.type === "shopify-theme");
    const vite = result.guesses.find((g) => g.type === "vite-react-ts");
    expect(theme?.evidence.join(" ")).toMatch(/\(root\)/);
    // The vite-react-ts guess is the STRONG one from packages/x (with react+ts), not a weak
    // root-only false positive — evidence is tagged with its source.
    expect(vite?.evidence.join(" ")).toMatch(/\(packages\/x\)/);
    expect(vite!.confidence).toBeGreaterThan(0.7);
  });

  it("packages/y (vite+ts, no react) never out-ranks or stands apart from packages/x's real signal", () => {
    makeGraceShapedFixture();
    const result = detectRepoTypeAcrossWorkspace(root);

    // Deduped by type: exactly ONE vite-react-ts entry in the ranked list, not two (one strong
    // from x, one weak from y) — the weaker same-type signal is folded in, never surfaced
    // separately (this is the concrete "contributes nothing" behavior the refinement describes).
    const viteEntries = result.guesses.filter((g) => g.type === "vite-react-ts");
    expect(viteEntries).toHaveLength(1);
    // The surviving guess is the STRONG one (packages/x), confirming y's weak signal lost the
    // max-confidence merge rather than silently winning.
    expect(viteEntries[0]?.evidence.join(" ")).toMatch(/\(packages\/x\)/);

    // bySource still carries every per-source guess, including y's (for detail/debug output) —
    // aggregation happens only in the ranked `guesses` list, nothing is silently dropped upstream.
    const ySource = result.bySource.filter((g) => g.source === "packages/y");
    expect(ySource.every((g) => g.type !== "vite-react-ts" || g.confidence < viteEntries[0]!.confidence)).toBe(true);
  });

  it("a repo with no workspaces at all degrades to exactly detectRepoType()'s own type/confidence ranking", () => {
    writeFileSync(join(root, "package.json"), pkg({ next: "^15.0.0" }), "utf8");
    const plain = detectRepoType(root);
    const aggregated = detectRepoTypeAcrossWorkspace(root);
    // Same types, same confidences, same ranking — evidence is re-tagged with its source
    // ("(root) ...") by the aggregator even in this trivial single-source case, so evidence
    // strings themselves are deliberately NOT compared verbatim here.
    expect(aggregated.guesses.map((g) => ({ type: g.type, confidence: g.confidence }))).toEqual(
      plain.guesses.map((g) => ({ type: g.type, confidence: g.confidence })),
    );
    expect(aggregated.bySource.every((g) => g.source === ".")).toBe(true);
  });

  it("never throws on a workspace sub-package with an unparsable package.json", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }), "utf8");
    mkdirSync(join(root, "packages", "bad"), { recursive: true });
    writeFileSync(join(root, "packages", "bad", "package.json"), "{ not json", "utf8");
    expect(() => detectRepoTypeAcrossWorkspace(root)).not.toThrow();
  });
});
