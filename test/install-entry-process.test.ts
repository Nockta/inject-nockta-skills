import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Process-level tests against the BUILT CLI (`node dist/cli.js`), mirroring `sync-
 * process.test.ts`/`monorepo-process.test.ts`'s convention (closed stdin -> non-TTY, hard
 * `spawnSync` timeout so a prompt-hang regression fails fast instead of hanging CI).
 *
 * Covers the M6 brief's non-TTY matrix (item 3/6): bare invocation, insufficient flags, --json
 * variants — none of these may ever reach a real `@inquirer/prompts` call, because closed stdin
 * makes `process.stdin.isTTY` falsy, so `commands/install-entry.ts`'s `runInstallEntry()` always
 * takes the "sufficient flags OR !isTTY -> existing non-interactive path" branch. Also covers
 * root-short-form/`install`-subcommand parity (item 4).
 */

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI_PATH = join(PACKAGE_ROOT, "dist", "cli.js");
const SPAWN_TIMEOUT_MS = 10_000;

function runCli(args: string[], cwd: string): { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"], // closed stdin -> genuinely non-TTY/non-interactive
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
    throw new Error("pnpm build failed — cannot run process-level install-entry tests");
  }
}, 150_000);

describe("install-entry — non-TTY matrix (spec §6, brief item 3): never hangs, structured errors", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-entry-proc-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("bare `install` (no flags), non-TTY: structured human error, exit 1, no hang, nothing written", () => {
    const result = runCli(["install"], targetDir);
    expect(result.signal).toBeNull(); // did not hit the spawn timeout / get killed
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/--type/);
    expect(existsSync(join(targetDir, ".nockta"))).toBe(false);
  });

  it("bare `install --json`, non-TTY: exactly one JSON line, ok:false, exit 1, no hang", () => {
    const result = runCli(["install", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    const parsed = oneJsonLine(result.stdout) as { ok: boolean; exitCode: number; command: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.exitCode).toBe(1);
    expect(parsed.command).toBe("install");
  });

  it("bare root invocation (NO subcommand at all), non-TTY --json: exactly one JSON line, exit 1, no hang", () => {
    const result = runCli(["--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    const parsed = oneJsonLine(result.stdout) as { ok: boolean; exitCode: number; command: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.exitCode).toBe(1);
    expect(parsed.command).toBe("install");
  });

  it("bare root invocation, non-TTY, NO --json: structured human error, exit 1, no hang, no wizard text printed", () => {
    const result = runCli([], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    // The old M1 shell used to print "install wizard" text and exit 0 unconditionally — that
    // behavior is gone (spec §6 flag-completeness: non-TTY + insufficient flags is now a real,
    // structured failure, not a no-op skeleton print).
    expect(result.stdout).not.toMatch(/wizard \(skeleton\)/);
  });

  it("--type given but --yes missing, non-TTY --json: still the existing structured error (insufficient), not a hang", () => {
    const result = runCli(["--type", "next", "--adapters", "claude", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    const parsed = oneJsonLine(result.stdout) as { ok: boolean; errors?: string[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.errors?.[0]).toMatch(/--yes/);
  });

  it("--target given but --yes missing, non-TTY --json: structured error, exit 1, no hang", () => {
    mkdirSync(join(targetDir, "apps", "web"), { recursive: true });
    const result = runCli(["--target", "apps/web:next", "--adapters", "claude", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
  });

  it("sufficient flags, non-TTY, no --json: unchanged existing success path, exit 0", () => {
    const result = runCli(["install", "--type", "next", "--adapters", "claude", "--yes"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(existsSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"))).toBe(true);
  });
});

describe("install-entry — D22 multi-type, process-level (real built CLI, real bundled packs)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-entry-multitype-proc-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("--type next,vite-react-ts --json: exit 0, data.repoTypes has both, common+next+vite-react-ts installed (union resolution against real packs, all installable post-D26)", () => {
    const result = runCli(["--type", "next,vite-react-ts", "--adapters", "claude", "--yes", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as {
      ok: boolean;
      exitCode: number;
      data: { repoTypes: string[]; installedPacks: string[] };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.data.repoTypes.sort()).toEqual(["next", "vite-react-ts"].sort());
    // razor is always-resolved alongside common and installable once imported (decisions.md D26).
    expect(parsed.data.installedPacks).toEqual(["common", "next", "razor", "vite-react-ts"]);
  });

  it("--type next,sveltekit --json: unknown type in the comma list is invalid input, exit 1", () => {
    const result = runCli(["--type", "next,sveltekit", "--adapters", "claude", "--yes", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    const parsed = oneJsonLine(result.stdout) as { ok: boolean; exitCode: number; errors?: string[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.exitCode).toBe(1);
    expect(parsed.errors?.[0]).toMatch(/invalid type/);
  });

  it("--target <path>:<a>+<b> --json: colon+plus multi-type target, exit 0, target record carries both types", () => {
    mkdirSync(join(targetDir, "apps", "theme"), { recursive: true });
    const result = runCli(
      ["--target", "apps/theme:shopify-theme+vite-react-ts", "--adapters", "claude", "--yes", "--json"],
      targetDir,
    );
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as {
      ok: boolean;
      exitCode: number;
      data: { targets: { path: string; repoTypes: string[] }[] };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.targets[0]?.repoTypes.sort()).toEqual(["shopify-theme", "vite-react-ts"].sort());
  });
});

describe("root short-form vs `install` subcommand — parity (brief item 4: same flags -> same result)", () => {
  let rootDir: string;
  let subcommandDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-shortform-root-"));
    subcommandDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-shortform-sub-"));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(subcommandDir, { recursive: true, force: true });
  });

  it("single-project install: root short-form and `install` subcommand produce the same installed packs/files", () => {
    const rootResult = runCli(["--type", "next", "--adapters", "claude", "--yes", "--json"], rootDir);
    const subResult = runCli(["install", "--type", "next", "--adapters", "claude", "--yes", "--json"], subcommandDir);

    expect(rootResult.status).toBe(0);
    expect(subResult.status).toBe(0);

    const rootParsed = oneJsonLine(rootResult.stdout) as { data: { installedPacks: string[]; renderedFiles: string[] } };
    const subParsed = oneJsonLine(subResult.stdout) as { data: { installedPacks: string[]; renderedFiles: string[] } };

    expect(rootParsed.data.installedPacks).toEqual(subParsed.data.installedPacks);
    expect(rootParsed.data.renderedFiles).toEqual(subParsed.data.renderedFiles);
  });

  it("monorepo install: root short-form and `install` subcommand produce the same target records", () => {
    for (const dir of [rootDir, subcommandDir]) {
      writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      mkdirSync(join(dir, "apps", "web"), { recursive: true });
      writeFileSync(join(dir, "apps", "web", "package.json"), JSON.stringify({ name: "web" }), "utf8");
    }

    const rootResult = runCli(["--target", "apps/web:next", "--adapters", "claude", "--yes", "--json"], rootDir);
    const subResult = runCli(["install", "--target", "apps/web:next", "--adapters", "claude", "--yes", "--json"], subcommandDir);

    expect(rootResult.status).toBe(0);
    expect(subResult.status).toBe(0);

    const rootParsed = oneJsonLine(rootResult.stdout) as { data: { isMonorepo: boolean; targets: { path: string; repoTypes: string[] }[] } };
    const subParsed = oneJsonLine(subResult.stdout) as { data: { isMonorepo: boolean; targets: { path: string; repoTypes: string[] }[] } };

    expect(rootParsed.data.isMonorepo).toBe(true);
    expect(rootParsed.data.targets).toEqual(subParsed.data.targets);
  });

  it("insufficient-flags error is identical (same message/exit code) whichever form is used", () => {
    const rootResult = runCli(["--adapters", "claude", "--json"], rootDir);
    const subResult = runCli(["install", "--adapters", "claude", "--json"], subcommandDir);

    expect(rootResult.status).toBe(subResult.status);
    const rootParsed = oneJsonLine(rootResult.stdout) as { errors?: string[] };
    const subParsed = oneJsonLine(subResult.stdout) as { errors?: string[] };
    expect(rootParsed.errors).toEqual(subParsed.errors);
  });
});

describe("`sync --yes` still works from a non-TTY process (regression guard for the shared root --yes flag)", () => {
  it("sync --yes auto-applies repair after root gained its own --yes for install", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-entry-sync-regress-"));
    try {
      const install = runCli(["install", "--type", "next", "--adapters", "claude", "--yes", "--json"], targetDir);
      expect(install.status).toBe(0);
      rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));

      const sync = runCli(["sync", "--yes", "--json"], targetDir);
      expect(sync.signal).toBeNull();
      expect(sync.status).toBe(0);
      const parsed = oneJsonLine(sync.stdout) as { data: { mode: string; applied: boolean } };
      expect(parsed.data.mode).toBe("auto-apply");
      expect(parsed.data.applied).toBe(true);

      const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8")) as { files: unknown[] };
      expect(manifest.files.length).toBeGreaterThan(0);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

describe("`sync --dry-run` still works from a non-TTY process (M7 regression guard: root-level --dry-run added for install collides with sync's PRE-EXISTING local --dry-run the exact same way M6's --yes did — fixed the same way: sync reads program.opts().dryRun, no local Option)", () => {
  it("sync --dry-run reports the plan only, writes nothing, exit 4 on an unhealthy repo", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-entry-sync-dryrun-regress-"));
    try {
      const install = runCli(["install", "--type", "next", "--adapters", "claude", "--yes", "--json"], targetDir);
      expect(install.status).toBe(0);
      rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));

      const before = readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8");
      const sync = runCli(["sync", "--dry-run", "--json"], targetDir);
      expect(sync.signal).toBeNull();
      expect(sync.status).toBe(4);
      const parsed = oneJsonLine(sync.stdout) as { data: { mode: string; applied: boolean } };
      expect(parsed.data.mode).toBe("dry-run");
      expect(parsed.data.applied).toBe(false);
      // Dry-run wrote nothing — manifest byte-for-byte unchanged, missing file still missing.
      const after = readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8");
      expect(after).toBe(before);
      expect(existsSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"))).toBe(false);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

describe("`install --dry-run` process-level (spec §7.3, brief item 8, decisions.md D18)", () => {
  it("writes nothing, reports the resolved plan, exit 0, works without --yes", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-entry-dryrun-"));
    try {
      const result = runCli(["install", "--type", "next", "--adapters", "claude", "--dry-run", "--json"], targetDir);
      expect(result.signal).toBeNull();
      expect(result.status).toBe(0);
      const parsed = oneJsonLine(result.stdout) as { ok: boolean; data: { dryRun: boolean; plan: { files: string[] } | null } };
      expect(parsed.ok).toBe(true);
      expect(parsed.data.dryRun).toBe(true);
      expect(parsed.data.plan?.files.length).toBeGreaterThan(0);
      expect(existsSync(join(targetDir, ".claude"))).toBe(false);
      expect(existsSync(join(targetDir, ".nockta"))).toBe(false);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it("root short-form --dry-run behaves identically to the install subcommand (no collision with the new root flag)", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-entry-dryrun-rootform-"));
    try {
      const result = runCli(["--type", "next", "--adapters", "claude", "--dry-run", "--json"], targetDir);
      expect(result.status).toBe(0);
      const parsed = oneJsonLine(result.stdout) as { data: { dryRun: boolean } };
      expect(parsed.data.dryRun).toBe(true);
      expect(existsSync(join(targetDir, ".claude"))).toBe(false);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

describe("`--exclude-skills` / `--include-skills` process-level validation (decisions.md D19)", () => {
  it("excluding a required skill (paper-trail) -> exit 1, structured error, nothing written", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-entry-exclude-required-"));
    try {
      const result = runCli(
        ["install", "--type", "next", "--adapters", "claude", "--yes", "--exclude-skills", "paper-trail", "--json"],
        targetDir,
      );
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      const parsed = oneJsonLine(result.stdout) as { ok: boolean; errors?: string[] };
      expect(parsed.ok).toBe(false);
      expect(parsed.errors?.[0]).toMatch(/cannot exclude required skill/);
      expect(existsSync(join(targetDir, ".claude"))).toBe(false);
      expect(existsSync(join(targetDir, ".nockta"))).toBe(false);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it("an unknown --include-skills name -> exit 1, structured error", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-entry-unknown-include-"));
    try {
      const result = runCli(
        ["install", "--type", "next", "--adapters", "claude", "--yes", "--include-skills", "totally-made-up-skill", "--json"],
        targetDir,
      );
      expect(result.status).toBe(1);
      const parsed = oneJsonLine(result.stdout) as { ok: boolean; errors?: string[] };
      expect(parsed.ok).toBe(false);
      expect(parsed.errors?.[0]).toMatch(/unknown skill name/);
      expect(existsSync(join(targetDir, ".claude"))).toBe(false);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

/**
 * RED-1 disclosure (packs-redistribution-audit.md) — process-level `--json` contract check
 * (spec §7.9/D13): the `notices` field ships as a proper machine array inside the SAME single
 * JSON line, never a raw stray print that would corrupt the one-line contract.
 */
describe("install-entry — RED-1 Shopify telemetry notice, process-level --json single-line contract", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-red1-notice-proc-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("shopify-app --json: exactly one JSON line, data.notices carries the disclosure", () => {
    const result = runCli(["--type", "shopify-app", "--adapters", "claude", "--yes", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as { ok: boolean; data: { notices: string[] } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.notices).toHaveLength(1);
    expect(parsed.data.notices[0]).toMatch(/OPT_OUT_INSTRUMENTATION=true/);
  });

  it("next (non-shopify) --json: exactly one JSON line, data.notices is empty", () => {
    const result = runCli(["--type", "next", "--adapters", "claude", "--yes", "--json"], targetDir);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    const parsed = oneJsonLine(result.stdout) as { ok: boolean; data: { notices: string[] } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.notices).toEqual([]);
  });
});
