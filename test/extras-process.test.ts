import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Process-level tests against the BUILT CLI (`node dist/cli.js`) for `--with-claude-mem` (spec
 * §7.10, decisions.md D17, brief item 6): the non-interactive extras flag, end to end. Mirrors
 * `install-entry-process.test.ts`'s convention (closed stdin -> non-TTY, hard `spawnSync`
 * timeout). `INJECT_NOCKTA_SKILLS_TEST_EXTRAS_HOME` keeps detection off the real `~/.claude`
 * (hard constraint) even though this runs the real built binary; `INJECT_NOCKTA_SKILLS_TEST_EXTRAS_BIN`
 * keeps execution off real `npx`/live network.
 */

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI_PATH = join(PACKAGE_ROOT, "dist", "cli.js");
const SPAWN_TIMEOUT_MS = 10_000;

const EXTRAS_BIN_OVERRIDE_ENV_VAR = "INJECT_NOCKTA_SKILLS_TEST_EXTRAS_BIN";
const EXTRAS_HOME_OVERRIDE_ENV_VAR = "INJECT_NOCKTA_SKILLS_TEST_EXTRAS_HOME";

function runCli(args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"], // closed stdin -> genuinely non-TTY/non-interactive
    timeout: SPAWN_TIMEOUT_MS,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  return { status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr };
}

function oneJsonLine(stdout: string): unknown {
  const lines = stdout.trim().split("\n");
  expect(lines.length).toBe(1);
  return JSON.parse(lines[0] as string);
}

beforeAll(() => {
  const build = spawnSync("pnpm", ["build"], { cwd: PACKAGE_ROOT, stdio: "inherit", timeout: 120_000 });
  if (build.status !== 0 || !existsSync(CLI_PATH)) {
    throw new Error("pnpm build failed — cannot run process-level extras tests");
  }
}, 150_000);

describe("--with-claude-mem — process-level (spec §7.10, decisions.md D17, brief item 6)", () => {
  let targetDir: string;
  let notInstalledHome: string;
  let scratchRoot: string;
  let successBin: string;
  let failBin: string;
  let sentinel: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extras-proc-target-"));
    notInstalledHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extras-proc-home-"));
    scratchRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extras-proc-bin-"));
    successBin = join(scratchRoot, "success.mjs");
    failBin = join(scratchRoot, "fail.mjs");
    sentinel = join(scratchRoot, "sentinel.txt");
    writeFileSync(
      successBin,
      `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(process.env.EXTRAS_TEST_SENTINEL, "ok\\n");
process.exit(0);
`,
    );
    writeFileSync(failBin, `#!/usr/bin/env node\nprocess.exit(3);\n`);
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
    rmSync(notInstalledHome, { recursive: true, force: true });
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it("WITHOUT the flag: extras never runs — no sentinel, even though the override bin WOULD create one", () => {
    const result = runCli(["install", "--type", "next", "--adapters", "claude", "--yes", "--json"], targetDir, {
      [EXTRAS_BIN_OVERRIDE_ENV_VAR]: successBin,
      [EXTRAS_HOME_OVERRIDE_ENV_VAR]: notInstalledHome,
      EXTRAS_TEST_SENTINEL: sentinel,
    });
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as { ok: boolean; data: { extras?: unknown } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.extras).toBeUndefined();
    expect(existsSync(sentinel)).toBe(false);
  });

  it("WITH the flag: extras runs after a successful install — sentinel created, extras.succeeded true, exit 0", () => {
    const result = runCli(["install", "--type", "next", "--adapters", "claude", "--yes", "--with-claude-mem", "--json"], targetDir, {
      [EXTRAS_BIN_OVERRIDE_ENV_VAR]: successBin,
      [EXTRAS_HOME_OVERRIDE_ENV_VAR]: notInstalledHome,
      EXTRAS_TEST_SENTINEL: sentinel,
    });
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as { ok: boolean; exitCode: number; data: { extras?: { offered: boolean; accepted: boolean; succeeded: boolean } } };
    expect(parsed.ok).toBe(true);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.data.extras).toEqual({ offered: true, accepted: true, succeeded: true });
    expect(existsSync(sentinel)).toBe(true);
  });

  it("root short-form (no `install` token) also honors --with-claude-mem, same as the subcommand", () => {
    const result = runCli(["--type", "next", "--adapters", "claude", "--yes", "--with-claude-mem", "--json"], targetDir, {
      [EXTRAS_BIN_OVERRIDE_ENV_VAR]: successBin,
      [EXTRAS_HOME_OVERRIDE_ENV_VAR]: notInstalledHome,
      EXTRAS_TEST_SENTINEL: sentinel,
    });
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as { data: { extras?: { succeeded: boolean } } };
    expect(parsed.data.extras?.succeeded).toBe(true);
    expect(existsSync(sentinel)).toBe(true);
  });

  it("extras failure (override exits 3): install still exit 0 / ok:true — verbatim, plus warning + extras.succeeded:false", () => {
    const result = runCli(["install", "--type", "next", "--adapters", "claude", "--yes", "--with-claude-mem", "--json"], targetDir, {
      [EXTRAS_BIN_OVERRIDE_ENV_VAR]: failBin,
      [EXTRAS_HOME_OVERRIDE_ENV_VAR]: notInstalledHome,
    });
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as {
      ok: boolean;
      exitCode: number;
      data: { extras?: { offered: boolean; accepted: boolean; succeeded: boolean }; warnings: string[] };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.data.extras).toEqual({ offered: true, accepted: true, succeeded: false });
    expect(parsed.data.warnings.some((w) => /claude-mem/.test(w))).toBe(true);
  });

  it("extras failure, human (non-json) mode: warning line is actually printed to stdout", () => {
    const result = runCli(["install", "--type", "next", "--adapters", "claude", "--yes", "--with-claude-mem"], targetDir, {
      [EXTRAS_BIN_OVERRIDE_ENV_VAR]: failBin,
      [EXTRAS_HOME_OVERRIDE_ENV_VAR]: notInstalledHome,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Warnings:/);
    expect(result.stdout).toMatch(/claude-mem/);
  });

  it("already installed (per INJECT_NOCKTA_SKILLS_TEST_EXTRAS_HOME fixture): skipped, no sentinel, exit 0", () => {
    const installedHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extras-proc-installed-"));
    try {
      mkdirSync(join(installedHome, ".claude", "plugins", "marketplaces", "thedotmack"), { recursive: true });
      const result = runCli(["install", "--type", "next", "--adapters", "claude", "--yes", "--with-claude-mem", "--json"], targetDir, {
        [EXTRAS_BIN_OVERRIDE_ENV_VAR]: successBin,
        [EXTRAS_HOME_OVERRIDE_ENV_VAR]: installedHome,
        EXTRAS_TEST_SENTINEL: sentinel,
      });
      expect(result.status).toBe(0);
      const parsed = oneJsonLine(result.stdout) as { data: { extras?: { offered: boolean; accepted: boolean; succeeded: boolean } } };
      expect(parsed.data.extras).toEqual({ offered: false, accepted: false, succeeded: false });
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(installedHome, { recursive: true, force: true });
    }
  });
});
