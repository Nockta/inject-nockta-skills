import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Process-level tests against the BUILT CLI (`node dist/cli.js`), per the
 * M4 brief: "the non-interactive paths must have process-level tests
 * against built dist with timeouts so a prompt-hang fails fast." Every
 * `spawnSync` call below passes a hard `timeout` and `stdio: ["ignore", ...]`
 * (closed stdin, i.e. genuinely non-interactive/non-TTY) — if `sync` ever
 * regressed into waiting on a prompt here, the run would hit the timeout
 * (`status === null`, `signal === "SIGTERM"`) and the assertion on a real
 * exit code would fail fast instead of hanging CI.
 */

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI_PATH = join(PACKAGE_ROOT, "dist", "cli.js");
const SPAWN_TIMEOUT_MS = 10_000;

function runCli(args: string[], cwd: string): { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"], // closed stdin -> non-TTY, genuinely non-interactive
    timeout: SPAWN_TIMEOUT_MS,
    encoding: "utf8",
  });
  return { status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr };
}

// Always rebuild before this suite — process-level tests must exercise the
// CURRENT source, not a possibly-stale `dist/` left over from a previous
// build. `pnpm build` (tsup) is fast (~1-1.5s); paying that cost once per
// test run is worth guaranteeing these tests can't pass against stale code.
beforeAll(() => {
  const build = spawnSync("pnpm", ["build"], { cwd: PACKAGE_ROOT, stdio: "inherit", timeout: 120_000 });
  if (build.status !== 0 || !existsSync(CLI_PATH)) {
    throw new Error("pnpm build failed — cannot run process-level sync tests");
  }
}, 150_000);

describe("sync — process-level, built dist, non-interactive paths (spec §7.7, D10)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-sync-proc-"));
    const install = runCli(["install", "--type", "next", "--adapters", "claude", "--yes", "--json"], targetDir);
    expect(install.signal).toBeNull(); // did not hang/get killed
    expect(install.status).toBe(0);
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("healthy repo: sync --json no-ops with exit 0 (no hang, no prompt)", () => {
    const result = runCli(["sync", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines.length).toBe(1); // exactly one JSON line, per spec §7.9
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.command).toBe("sync");
    expect(parsed.data.mode).toBe("no-op");
  });

  it("broken repo, non-interactive, no --yes: plan-only, exit 4, writes nothing (does not hang waiting for confirmation)", () => {
    rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));
    const manifestBefore = readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8");

    const result = runCli(["sync", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(4);

    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.exitCode).toBe(4);
    expect(parsed.data.mode).toBe("plan-only");
    expect(parsed.data.plan.needsRepair).toBe(true);

    expect(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8")).toBe(manifestBefore);
  });

  it("--dry-run: plan only, exit 4, writes nothing, even with --yes present", () => {
    rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));
    const manifestBefore = readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8");

    const result = runCli(["sync", "--dry-run", "--yes", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(4);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.data.mode).toBe("dry-run");

    expect(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8")).toBe(manifestBefore);
  });

  it("--yes: auto-applies repair, exit 0, and a following doctor is healthy", () => {
    rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));

    const syncResult = runCli(["sync", "--yes", "--json"], targetDir);
    expect(syncResult.signal).toBeNull();
    expect(syncResult.status).toBe(0);
    const parsedSync = JSON.parse(syncResult.stdout.trim());
    expect(parsedSync.data.mode).toBe("auto-apply");
    expect(parsedSync.data.applied).toBe(true);

    const doctorResult = runCli(["doctor", "--json"], targetDir);
    expect(doctorResult.signal).toBeNull();
    expect(doctorResult.status).toBe(0);
    const parsedDoctor = JSON.parse(doctorResult.stdout.trim());
    expect(parsedDoctor.data.healthy).toBe(true);
  });

  it("doctor --json emits exactly one parseable JSON line on a broken repo too", () => {
    rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));
    const result = runCli(["doctor", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(4);
    const lines = result.stdout.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.command).toBe("doctor");
    expect(parsed.data.counts.missing).toBe(1);
  });
});
