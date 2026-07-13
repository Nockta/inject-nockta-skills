import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  EXTRAS_BIN_OVERRIDE_ENV_VAR,
  buildExtrasInstallCommand,
  isClaudeMemAlreadyInstalled,
  runClaudeMemInstall,
  runExtrasNonInteractive,
} from "../src/core/run-extras.js";

/**
 * Unit coverage for `core/run-extras.ts` (spec §7.10, decisions.md D17): pure detection, pure
 * command construction, and spawn/execution against tiny hand-written local fixture scripts —
 * NEVER the real `npx`/live network (brief constraint). Detection is always pointed at a fixture
 * `homeDir`, never the real `os.homedir()` — the other hard constraint ("never touch the real
 * ~/.claude" in tests).
 */

describe("isClaudeMemAlreadyInstalled — pure detection (unit-tested directly, brief item 2)", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extras-detect-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("false: no ~/.claude directory at all", () => {
    expect(isClaudeMemAlreadyInstalled({ homeDir: home })).toBe(false);
  });

  it("true: settings.json enabledPlugins has a key starting claude-mem@ (object/record form)", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify({ enabledPlugins: { "claude-mem@thedotmack": true } }),
      "utf8",
    );
    expect(isClaudeMemAlreadyInstalled({ homeDir: home })).toBe(true);
  });

  it("true: enabledPlugins is an array containing a claude-mem@ entry", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: ["claude-mem@thedotmack"] }), "utf8");
    expect(isClaudeMemAlreadyInstalled({ homeDir: home })).toBe(true);
  });

  it("false: settings.json exists but enabledPlugins has no matching key", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify({ enabledPlugins: { "some-other-plugin@marketplace": true } }),
      "utf8",
    );
    expect(isClaudeMemAlreadyInstalled({ homeDir: home })).toBe(false);
  });

  it("true: the thedotmack marketplace directory exists, even with no settings.json at all", () => {
    mkdirSync(join(home, ".claude", "plugins", "marketplaces", "thedotmack"), { recursive: true });
    expect(isClaudeMemAlreadyInstalled({ homeDir: home })).toBe(true);
  });

  it("false, never throws: malformed settings.json JSON is a detection error, not a crash", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{ not valid json", "utf8");
    expect(() => isClaudeMemAlreadyInstalled({ homeDir: home })).not.toThrow();
    expect(isClaudeMemAlreadyInstalled({ homeDir: home })).toBe(false);
  });

  it("false, never throws: enabledPlugins has an unexpected shape (a bare string)", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: "not-an-object" }), "utf8");
    expect(isClaudeMemAlreadyInstalled({ homeDir: home })).toBe(false);
  });

  it("false, never throws: settings.json is actually a directory (unreadable as a file)", () => {
    mkdirSync(join(home, ".claude", "settings.json"), { recursive: true });
    expect(() => isClaudeMemAlreadyInstalled({ homeDir: home })).not.toThrow();
    expect(isClaudeMemAlreadyInstalled({ homeDir: home })).toBe(false);
  });
});

describe("buildExtrasInstallCommand — pure command construction", () => {
  afterEach(() => {
    delete process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR];
  });

  it("defaults to npx claude-mem install", () => {
    const built = buildExtrasInstallCommand();
    expect(built.command).toBe("npx");
    expect(built.args).toEqual(["claude-mem", "install"]);
    expect(built.usesTestOverride).toBe(false);
  });

  it(`${EXTRAS_BIN_OVERRIDE_ENV_VAR} set -> node <path> install, never mentions npx`, () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = "/some/fake/extras-bin.mjs";
    const built = buildExtrasInstallCommand();
    expect(built.command).toBe(process.execPath);
    expect(built.args).toEqual(["/some/fake/extras-bin.mjs", "install"]);
    expect(built.usesTestOverride).toBe(true);
  });
});

// --- runClaudeMemInstall / runExtrasNonInteractive against tiny hand-written fixture scripts ---
// Mirrors create-nockta-repo/test/run-inject-skills.test.ts's own convention: fixture .mjs files
// written into a throwaway mkdtemp scratch dir, never a real npx/live-network call.

describe("runClaudeMemInstall / runExtrasNonInteractive — spawn via test override only", () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extras-spawn-"));
  const successBin = join(scratchRoot, "fake-extras-success.mjs");
  const failBin = join(scratchRoot, "fake-extras-fail.mjs");

  beforeAll(() => {
    writeFileSync(
      successBin,
      `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
// Proves this fixture (not a real npx claude-mem) was actually invoked.
writeFileSync(process.env.EXTRAS_TEST_SENTINEL, "installed\\n");
process.exit(0);
`,
    );
    writeFileSync(
      failBin,
      `#!/usr/bin/env node
console.error("fake-extras-fail fixture: simulated claude-mem install failure");
process.exit(3);
`,
    );
  });

  afterAll(() => {
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  let sentinel: string;

  beforeEach(() => {
    sentinel = join(scratchRoot, `sentinel-${Math.random().toString(36).slice(2)}.txt`);
    process.env.EXTRAS_TEST_SENTINEL = sentinel;
  });

  afterEach(() => {
    delete process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR];
    delete process.env.EXTRAS_TEST_SENTINEL;
  });

  it("runClaudeMemInstall: success override -> true, sentinel proves the override (not real npx) ran", () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = successBin;
    expect(runClaudeMemInstall()).toBe(true);
    expect(existsSync(sentinel)).toBe(true);
  });

  it("runClaudeMemInstall: failing override (exit 3) -> false, best-effort, never throws", () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = failBin;
    expect(() => runClaudeMemInstall()).not.toThrow();
    expect(runClaudeMemInstall()).toBe(false);
    expect(existsSync(sentinel)).toBe(false);
  });

  it("runExtrasNonInteractive: not already installed + success override -> offered/accepted/succeeded all true", () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = successBin;
    const notInstalledHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extras-notinstalled-"));
    try {
      const report = runExtrasNonInteractive({ homeDir: notInstalledHome });
      expect(report).toEqual({ offered: true, accepted: true, succeeded: true });
      expect(existsSync(sentinel)).toBe(true);
    } finally {
      rmSync(notInstalledHome, { recursive: true, force: true });
    }
  });

  it("runExtrasNonInteractive: not already installed + failing override -> accepted true, succeeded false", () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = failBin;
    const notInstalledHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extras-notinstalled-fail-"));
    try {
      const report = runExtrasNonInteractive({ homeDir: notInstalledHome });
      expect(report).toEqual({ offered: true, accepted: true, succeeded: false });
    } finally {
      rmSync(notInstalledHome, { recursive: true, force: true });
    }
  });

  it("runExtrasNonInteractive: already installed -> skips entirely, NEVER spawns (sentinel absent)", () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = successBin;
    const installedHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extras-installed-"));
    try {
      mkdirSync(join(installedHome, ".claude", "plugins", "marketplaces", "thedotmack"), { recursive: true });
      const report = runExtrasNonInteractive({ homeDir: installedHome });
      expect(report).toEqual({ offered: false, accepted: false, succeeded: false });
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(installedHome, { recursive: true, force: true });
    }
  });
});
