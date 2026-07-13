import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";

/**
 * D22 multi-type union install e2e — uses a FIXTURE `packsRoot` (not the real bundled `packs/`)
 * because the real `next`/`vite-react-ts` packs are still D6-"planned" (no authored SKILL.md
 * content, decisions.md D6/D22's own "Why" — MVP content scope). A fixture with real content for
 * `common` + two stack packs is what actually demonstrates the union of both types' skills
 * flowing through install, matching the pattern `test/resolve-packs.test.ts` already uses.
 */
function writeSkill(packsRoot: string, pack: string, skill: string, body = `# ${skill}\n`): void {
  const dir = join(packsRoot, pack, "skills", skill);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), body, "utf8");
}

function writePackManifest(packsRoot: string, name: string, overrides: Record<string, unknown> = {}): void {
  const dir = join(packsRoot, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "pack.json"),
    JSON.stringify({
      name,
      displayName: name,
      description: `${name} pack`,
      requires: [],
      skills: [],
      adapters: ["claude"],
      ...overrides,
    }),
    "utf8",
  );
}

function makeFixturePacksRoot(): string {
  const packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-multitype-packs-"));
  writePackManifest(packsRoot, "common", { skills: ["paper-trail"] });
  writeSkill(packsRoot, "common", "paper-trail");

  // `razor` is now always-resolved alongside `common` (decisions.md D26) — declared here (no
  // SKILL.md content) purely so `resolvePacks()` doesn't report it `missing` and trip
  // `install.ts`'s hard "requested pack(s) not found on disk" error. Left content-less on
  // purpose: it stays D6-"planned", never "installable", so it never appears in this file's
  // exact `installedPacks` assertions below.
  writePackManifest(packsRoot, "razor", { skills: ["placeholder-razor-skill"] });

  writePackManifest(packsRoot, "next", { requires: ["common"], skills: ["app-router-architect"] });
  writeSkill(packsRoot, "next", "app-router-architect");

  writePackManifest(packsRoot, "vite-react-ts", { requires: ["common"], skills: ["react-component-author"] });
  writeSkill(packsRoot, "vite-react-ts", "react-component-author");

  writePackManifest(packsRoot, "monorepo", { requires: ["common"], skills: ["monorepo-boundary"] });
  writeSkill(packsRoot, "monorepo", "monorepo-boundary");

  writePackManifest(packsRoot, "shopify-theme", { requires: ["common"], skills: ["theme-architect"] });
  writeSkill(packsRoot, "shopify-theme", "theme-architect");

  return packsRoot;
}

describe("install e2e — D22 multi-type union (--type a,b / --target <path>:<a>+<b>)", () => {
  let targetDir: string;
  let packsRoot: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-multitype-install-"));
    packsRoot = makeFixturePacksRoot();
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
    rmSync(packsRoot, { recursive: true, force: true });
  });

  it("single-project comma form: --type next,vite-react-ts installs the UNION of both packs' skills, common once", () => {
    const result = buildInstallResult({
      type: "next,vite-react-ts",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "9.9.9-test",
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.repoTypes).toEqual(["next", "vite-react-ts"]);
    expect(result.data.installedPacks.sort()).toEqual(["common", "next", "vite-react-ts"].sort());

    // Both stack packs' skills rendered, common's own skill rendered exactly once.
    expect(existsSync(join(targetDir, ".claude", "skills", "app-router-architect", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".claude", "skills", "react-component-author", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"))).toBe(true);
    const paperTrailFiles = result.data.renderedFiles.filter((f) => f.includes("paper-trail"));
    expect(paperTrailFiles).toHaveLength(1);

    const profile = JSON.parse(readFileSync(join(targetDir, ".nockta", "skills-profile.json"), "utf8"));
    expect(profile.repoTypes).toEqual(["next", "vite-react-ts"]);
  });

  it("dedupes a repeated comma-form type", () => {
    const result = buildInstallResult({
      type: "next,next,vite-react-ts",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.data.repoTypes?.sort()).toEqual(["next", "vite-react-ts"].sort());
  });

  it("comma form: an unknown type anywhere in the list is an invalid-input error (exit 1)", () => {
    const result = buildInstallResult({
      type: "next,sveltekit",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/invalid type/);
  });

  it("--dry-run reflects the union in the plan without writing anything", () => {
    const result = buildInstallResult({
      type: "next,vite-react-ts",
      adapters: "claude",
      dryRun: true,
      targetDir,
      packsRoot,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.data.plan?.installedPacks.sort()).toEqual(["common", "next", "vite-react-ts"].sort());
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);
  });

  it("monorepo colon+plus form: --target <path>:<a>+<b> installs the union at root, target record carries both types", () => {
    writeFileSync(join(targetDir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
    mkdirSync(join(targetDir, "apps", "theme"), { recursive: true });
    writeFileSync(join(targetDir, "apps", "theme", "package.json"), JSON.stringify({ name: "theme" }), "utf8");

    const result = buildInstallResult({
      targets: ["apps/theme:shopify-theme+vite-react-ts"],
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "9.9.9-test",
    });

    expect(result.ok).toBe(true);
    expect(result.data.isMonorepo).toBe(true);
    expect(result.data.installedPacks.sort()).toEqual(["common", "monorepo", "shopify-theme", "vite-react-ts"].sort());
    expect(result.data.targets).toEqual([
      expect.objectContaining({
        name: "theme",
        path: "apps/theme",
        repoTypes: expect.arrayContaining(["shopify-theme", "vite-react-ts"]),
      }),
    ]);
    expect(existsSync(join(targetDir, ".claude", "skills", "theme-architect", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".claude", "skills", "react-component-author", "SKILL.md"))).toBe(true);

    const targetsFile = JSON.parse(readFileSync(join(targetDir, ".nockta", "targets.json"), "utf8"));
    expect(targetsFile.targets[0].repoTypes.sort()).toEqual(["shopify-theme", "vite-react-ts"].sort());
  });
});
