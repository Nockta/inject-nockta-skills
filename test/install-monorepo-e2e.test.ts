import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Fixture monorepo: pnpm-workspace.yaml (a real §9.1 signal) + two fake app dirs. */
function makeFixtureMonorepo(root: string): void {
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "web" }), "utf8");
  mkdirSync(join(root, "apps", "api"), { recursive: true });
  writeFileSync(join(root, "apps", "api", "package.json"), JSON.stringify({ name: "api" }), "utf8");
}

describe("monorepo install e2e (spec §7.3, §9, decisions.md D5/D9)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-install-"));
    makeFixtureMonorepo(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("installs two targets, ok exit 0", () => {
    const result = buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.isMonorepo).toBe(true);
    expect(result.data.targets.length).toBe(2);
  });

  it("renders adapter output ONLY at the monorepo root — no per-target .claude/ (spec §9.4)", () => {
    buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });

    // Root has exactly the expected top-level entries (plus the fixture's own apps/ +
    // pnpm-workspace.yaml). Decisions.md D34: the standing-mode files land at the monorepo ROOT
    // too — AGENTS.md (single-source contract, agent adapter not selected) + CLAUDE.md (@AGENTS.md
    // import, claude selected).
    expect(existsSync(join(root, ".claude"))).toBe(true);
    expect(existsSync(join(root, ".nockta"))).toBe(true);
    expect(readdirSync(root).sort()).toEqual([".claude", ".nockta", "AGENTS.md", "CLAUDE.md", "apps", "pnpm-workspace.yaml"]);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toMatch(/<!-- nockta:standing-mode:start -->/);
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toMatch(/@AGENTS\.md/);

    // No adapter output was written INSIDE any target.
    expect(existsSync(join(root, "apps", "web", ".claude"))).toBe(false);
    expect(existsSync(join(root, "apps", "web", ".nockta"))).toBe(false);
    expect(existsSync(join(root, "apps", "api", ".claude"))).toBe(false);
    expect(existsSync(join(root, "apps", "api", ".nockta"))).toBe(false);

    // The 3 common skills rendered once at root.
    for (const skill of ["paper-trail", "proof-of-done", "subagent-delegation"]) {
      expect(existsSync(join(root, ".claude", "skills", skill, "SKILL.md"))).toBe(true);
    }
  });

  it("writes .nockta/skills-profile.json in the monorepo shape (spec §10.2)", () => {
    buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });

    const profile = JSON.parse(readFileSync(join(root, ".nockta", "skills-profile.json"), "utf8"));
    expect(profile.tool).toBe("inject-nockta-skills");
    expect(profile.isMonorepo).toBe(true);
    expect(profile.repoType).toBeUndefined(); // single-project-only field, must not appear
    expect(profile.targetsFile).toBe(".nockta/targets.json");
    expect(profile.installedPacks).toContain("common");
    expect(profile.installedAdapters).toEqual(["claude"]);
    expect(profile.source).toEqual({ type: "bundled", package: "inject-nockta-skills", version: "9.9.9-test" });
    expect(typeof profile.createdAt).toBe("string");
    expect(typeof profile.updatedAt).toBe("string");
  });

  it("writes .nockta/targets.json in the spec §9.3 shape", () => {
    buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });

    const targetsFile = JSON.parse(readFileSync(join(root, ".nockta", "targets.json"), "utf8"));
    expect(targetsFile.schemaVersion).toBe(1);
    expect(targetsFile.isMonorepo).toBe(true);
    expect(targetsFile.targets).toHaveLength(2);

    const web = targetsFile.targets.find((t: { name: string }) => t.name === "web");
    expect(web).toBeDefined();
    expect(web.path).toBe("apps/web");
    expect(web.repoTypes).toEqual(["next"]);
    expect(web.installedPacks).toContain("common");

    const api = targetsFile.targets.find((t: { name: string }) => t.name === "api");
    expect(api).toBeDefined();
    expect(api.path).toBe("apps/api");
    expect(api.repoTypes).toEqual(["nest"]);
    expect(api.installedPacks).toContain("common");
  });

  it("includes the monorepo pack in resolution for every monorepo install (installable post-D26 curation import)", () => {
    const result = buildInstallResult({
      targets: ["apps/web:next"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });
    expect(result.data.installedPacks).toContain("monorepo");
    expect(result.data.skippedPacks.find((p) => p.name === "monorepo")).toBeUndefined();
  });

  it("writes .nockta/generated-manifest.json with independently-verifiable hashes (D3), root-relative paths", () => {
    const result = buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });

    const manifest = JSON.parse(readFileSync(join(root, ".nockta", "generated-manifest.json"), "utf8"));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.files.length).toBe(result.data.renderedFileCount);
    expect(manifest.files.length).toBeGreaterThan(0);

    const record = manifest.files[0];
    expect(record.path.startsWith(".claude/")).toBe(true);
    const recomputed = sha256(join(root, record.path));
    expect(recomputed).toBe(record.outputHash);
  });

  it("accepts a single split-form target with --monorepo", () => {
    const result = buildInstallResult({
      monorepo: true,
      targets: ["apps/web"],
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.data.targets).toEqual([
      expect.objectContaining({ name: "web", path: "apps/web", repoTypes: ["next"] }),
    ]);
  });

  it("warns (but does not fail) when no monorepo signal is present and --monorepo wasn't passed", () => {
    const bare = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-nosignal-"));
    try {
      mkdirSync(join(bare, "apps", "web"), { recursive: true });
      const result = buildInstallResult({
        targets: ["apps/web:next"],
        adapters: "claude",
        yes: true,
        targetDir: bare,
        packageVersion: "9.9.9-test",
      });
      expect(result.ok).toBe(true);
      expect(result.data.warnings.length).toBeGreaterThan(0);
      expect(result.data.warnings[0]).toMatch(/no monorepo signals detected/);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("does not warn when --monorepo is explicitly passed even without detected signals", () => {
    const bare = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-forced-"));
    try {
      mkdirSync(join(bare, "apps", "web"), { recursive: true });
      const result = buildInstallResult({
        monorepo: true,
        targets: ["apps/web:next"],
        adapters: "claude",
        yes: true,
        targetDir: bare,
        packageVersion: "9.9.9-test",
      });
      expect(result.data.warnings).toEqual([]);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("rejects a target path that does not exist under the repo (invalid-input exit code)", () => {
    const result = buildInstallResult({
      targets: ["apps/does-not-exist:next"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/does not exist/);
  });

  it("rejects a target path that escapes the repo root", () => {
    const result = buildInstallResult({
      targets: ["../outside:next"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("rejects malformed --target strings with the invalid-input exit code", () => {
    const result = buildInstallResult({
      targets: ["apps/web:sveltekit"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/invalid type/);
  });

  it("rejects --monorepo with no --target at all", () => {
    const result = buildInstallResult({
      monorepo: true,
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/--monorepo requires/);
  });

  it("rejects missing --yes for a monorepo install too", () => {
    const result = buildInstallResult({
      targets: ["apps/web:next"],
      adapters: "claude",
      targetDir: root,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/--yes/);
  });

  it("single-project --type install is unaffected (no --target, no --monorepo)", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.data.isMonorepo).toBe(false);
    expect(result.data.repoTypes).toEqual(["next"]);
    // Single-project install still only writes to root .claude/.nockta — apps/ fixture dirs untouched.
    expect(existsSync(join(root, "apps", "web", ".claude"))).toBe(false);
  });
});
