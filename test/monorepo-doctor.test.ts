import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";
import { buildDoctorResult } from "../src/commands/doctor.js";

const PACKAGE_VERSION = "9.9.9-test";

function makeFixtureMonorepo(root: string): void {
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "web" }), "utf8");
  mkdirSync(join(root, "apps", "api"), { recursive: true });
  writeFileSync(join(root, "apps", "api", "package.json"), JSON.stringify({ name: "api" }), "utf8");
}

describe("monorepo doctor (spec §9.5, M5 — replaces the M4 monorepo-unsupported guard)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-doctor-"));
    makeFixtureMonorepo(root);
    buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: PACKAGE_VERSION,
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("happy path: healthy right after install, exit 0", () => {
    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.isMonorepo).toBe(true);
    expect(result.data.healthy).toBe(true);
    expect(result.data.targetsStatus).toBe("ok");
    expect(result.data.targets).toHaveLength(2);
    for (const t of result.data.targets) {
      expect(t.exists).toBe(true);
      expect(t.plausible).toBe(true);
      expect(t.issues).toEqual([]);
    }
  });

  it("failure class: missing target dir — unhealthy, exit 4, target flagged", () => {
    rmSync(join(root, "apps", "api"), { recursive: true, force: true });

    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(4);
    expect(result.data.healthy).toBe(false);

    const api = result.data.targets.find((t) => t.name === "api");
    expect(api).toBeDefined();
    expect(api?.exists).toBe(false);
    expect(api?.plausible).toBe(false);
    expect(api?.issues[0]).toMatch(/does not exist/);

    // The other target is unaffected.
    const web = result.data.targets.find((t) => t.name === "web");
    expect(web?.exists).toBe(true);
  });

  it("failure class: target dir exists but is implausible (no package.json) — unhealthy, exit 4", () => {
    rmSync(join(root, "apps", "web", "package.json"));

    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.exitCode).toBe(4);
    const web = result.data.targets.find((t) => t.name === "web");
    expect(web?.exists).toBe(true);
    expect(web?.plausible).toBe(false);
    expect(web?.issues[0]).toMatch(/no package.json/);
  });

  it("failure class: targets.json missing — exit 1, targetsStatus 'missing'", () => {
    rmSync(join(root, ".nockta", "targets.json"));

    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.data.profileStatus).toBe("ok-monorepo");
    expect(result.data.targetsStatus).toBe("missing");
  });

  it("failure class: targets.json invalid / unparsable — exit 1, targetsStatus 'invalid'", () => {
    writeFileSync(join(root, ".nockta", "targets.json"), "{ not json", "utf8");

    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.data.targetsStatus).toBe("invalid");
  });

  it("failure class: targets.json / profile mismatch — a target record naming an unknown repoType is schema-invalid", () => {
    const targetsPath = join(root, ".nockta", "targets.json");
    const targetsFile = JSON.parse(readFileSync(targetsPath, "utf8"));
    targetsFile.targets[0].repoTypes = ["sveltekit"]; // not a real RepoType
    writeFileSync(targetsPath, JSON.stringify(targetsFile), "utf8");

    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.exitCode).toBe(1);
    expect(result.data.targetsStatus).toBe("invalid");
  });

  it("classifies a missing root-rendered file the same way single-project doctor does (shared engine)", () => {
    rmSync(join(root, ".claude", "skills", "paper-trail", "SKILL.md"));

    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.exitCode).toBe(4);
    expect(result.data.counts.missing).toBe(1);
    expect(result.data.suggestedAction).toBe("repair");
  });

  it("suggests upgrade when the monorepo profile's own source.version differs from the running version", () => {
    const profilePath = join(root, ".nockta", "skills-profile.json");
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    profile.version = "0.0.1-old";
    profile.source.version = "0.0.1-old";
    writeFileSync(profilePath, JSON.stringify(profile), "utf8");

    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.exitCode).toBe(4);
    expect(result.data.suggestedAction).toBe("upgrade");
  });

  it("restoring a deleted target directory brings doctor back to healthy", () => {
    rmSync(join(root, "apps", "api"), { recursive: true, force: true });
    expect(buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION }).exitCode).toBe(4);

    mkdirSync(join(root, "apps", "api"), { recursive: true });
    writeFileSync(join(root, "apps", "api", "package.json"), JSON.stringify({ name: "api" }), "utf8");

    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("D22 read-shim: a legacy targets.json record with a singular repoType (no repoTypes) reads back healthy", () => {
    const targetsPath = join(root, ".nockta", "targets.json");
    const targetsFile = JSON.parse(readFileSync(targetsPath, "utf8"));
    expect(targetsFile.targets[0].repoTypes).toBeDefined(); // sanity: current install already writes the new shape
    for (const t of targetsFile.targets) {
      t.repoType = t.repoTypes[0];
      delete t.repoTypes;
    }
    writeFileSync(targetsPath, JSON.stringify(targetsFile), "utf8");

    const result = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.targetsStatus).toBe("ok");
    expect(result.data.targets.map((t) => t.repoTypes)).toEqual([["next"], ["nest"]]);
  });

  it("D22 multi-type target: doctor validates each named type as known and stays healthy (union's expected files, no deep re-detection)", () => {
    const multi = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-doctor-multitype-"));
    try {
      writeFileSync(join(multi, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      mkdirSync(join(multi, "apps", "theme"), { recursive: true });
      writeFileSync(join(multi, "apps", "theme", "package.json"), JSON.stringify({ name: "theme" }), "utf8");

      const installResult = buildInstallResult({
        targets: ["apps/theme:shopify-theme+vite-react-ts"],
        adapters: "claude",
        yes: true,
        targetDir: multi,
        packageVersion: PACKAGE_VERSION,
      });
      expect(installResult.ok).toBe(true);

      const result = buildDoctorResult({ targetDir: multi, packageVersion: PACKAGE_VERSION });
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data.targetsStatus).toBe("ok");
      expect(result.data.targets).toHaveLength(1);
      expect(result.data.targets[0]?.repoTypes.sort()).toEqual(["shopify-theme", "vite-react-ts"].sort());
      expect(result.data.targets[0]?.exists).toBe(true);
      expect(result.data.targets[0]?.plausible).toBe(true);
    } finally {
      rmSync(multi, { recursive: true, force: true });
    }
  });

  it("regression: --target <abs-path> resolving to the repo root itself is the root install, not a mis-registered self-target (doctor stays healthy)", () => {
    const selfRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-doctor-self-target-"));
    try {
      writeFileSync(join(selfRoot, "package.json"), JSON.stringify({ name: "self-root" }), "utf8");

      // `--target <abs path>` where the absolute path IS `targetDir` (the repo root/cwd) — the
      // regressing case: without the fix, the raw absolute path was stored verbatim in
      // `.nockta/targets.json`, which `monorepo-doctor-checks.ts`'s `checkTarget()` then
      // `join(targetDir, record.path)`s into a nonexistent nested path.
      const installResult = buildInstallResult({
        targets: [`${selfRoot}:next`],
        adapters: "claude",
        yes: true,
        targetDir: selfRoot,
        packageVersion: PACKAGE_VERSION,
      });
      expect(installResult.ok).toBe(true);
      expect(installResult.data.targets).toHaveLength(1);
      expect(installResult.data.targets[0]?.path).toBe(".");

      const result = buildDoctorResult({ targetDir: selfRoot, packageVersion: PACKAGE_VERSION });
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data.healthy).toBe(true);
      expect(result.data.targetsStatus).toBe("ok");
      expect(result.data.targets).toHaveLength(1);
      expect(result.data.targets[0]?.path).toBe(".");
      expect(result.data.targets[0]?.exists).toBe(true);
      expect(result.data.targets[0]?.plausible).toBe(true);
      expect(result.data.targets[0]?.issues).toEqual([]);
    } finally {
      rmSync(selfRoot, { recursive: true, force: true });
    }
  });
});
