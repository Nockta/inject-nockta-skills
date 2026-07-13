import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Process-level tests against the BUILT CLI (`node dist/cli.js`) for the monorepo `--target`
 * install path, mirroring `sync-process.test.ts`'s convention (M4) — real CLI arg parsing
 * (`cli.ts`'s `--target`/`--monorepo` flags, commander's repeat-accumulation), and the M5 brief's
 * "process-level --json single-line checks" requirement.
 */

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI_PATH = join(PACKAGE_ROOT, "dist", "cli.js");
const SPAWN_TIMEOUT_MS = 10_000;

function runCli(args: string[], cwd: string): { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: SPAWN_TIMEOUT_MS,
    encoding: "utf8",
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
    throw new Error("pnpm build failed — cannot run process-level monorepo tests");
  }
}, 150_000);

describe("monorepo install — process-level, built dist, --json (spec §7.3, §7.9)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-proc-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "web" }), "utf8");
    mkdirSync(join(root, "apps", "api"), { recursive: true });
    writeFileSync(join(root, "apps", "api", "package.json"), JSON.stringify({ name: "api" }), "utf8");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("install --target x2 --json: exactly one JSON line, exit 0, monorepo shape", () => {
    const result = runCli(
      ["install", "--target", "apps/web:next", "--target", "apps/api:nest", "--adapters", "claude", "--yes", "--json"],
      root,
    );
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as { command: string; ok: boolean; data: { isMonorepo: boolean; targets: unknown[] } };
    expect(parsed.command).toBe("install");
    expect(parsed.ok).toBe(true);
    expect(parsed.data.isMonorepo).toBe(true);
    expect(parsed.data.targets).toHaveLength(2);
  });

  it("doctor --json after a monorepo install: exactly one JSON line, healthy, exit 0", () => {
    const install = runCli(
      ["install", "--target", "apps/web:next", "--target", "apps/api:nest", "--adapters", "claude", "--yes", "--json"],
      root,
    );
    expect(install.status).toBe(0);

    const result = runCli(["doctor", "--json"], root);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as { command: string; data: { isMonorepo: boolean; healthy: boolean } };
    expect(parsed.command).toBe("doctor");
    expect(parsed.data.isMonorepo).toBe(true);
    expect(parsed.data.healthy).toBe(true);
  });

  it("malformed --target exits 1 with a single JSON line, no files written", () => {
    const result = runCli(["install", "--target", "apps/web:sveltekit", "--adapters", "claude", "--yes", "--json"], root);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    const parsed = oneJsonLine(result.stdout) as { ok: boolean; exitCode: number };
    expect(parsed.ok).toBe(false);
    expect(parsed.exitCode).toBe(1);
    expect(existsSync(join(root, ".nockta"))).toBe(false);
  });

  it("sync --json in a monorepo: exactly one JSON line", () => {
    const install = runCli(
      ["install", "--target", "apps/web:next", "--adapters", "claude", "--yes", "--json"],
      root,
    );
    expect(install.status).toBe(0);

    const result = runCli(["sync", "--json"], root);
    expect(result.signal).toBeNull();
    const parsed = oneJsonLine(result.stdout) as { command: string; data: { mode: string } };
    expect(parsed.command).toBe("sync");
    expect(parsed.data.mode).toBe("no-op");
    expect(result.status).toBe(0);
  });
});
