import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";

describe("install --common-only (docs/superpowers/specs/2026-08-19-init-monorepo-design.md §5.3)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(path.join(tmpdir(), "inject-common-only-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("--common-only --type <repoType> is refused with the exact spec §5.3 message", () => {
    const result = buildInstallResult({ commonOnly: true, type: "next", adapters: "claude", yes: true, targetDir });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toBe(
      '--common-only cannot be combined with a repo type ("next"). Remove --type / the ' +
        '":<type>" suffix on --target to install common-only, or drop --common-only to install with a type.',
    );
  });

  it("--common-only --target apps/web:next (colon-form, type present) is refused, \"next\" interpolated", () => {
    const result = buildInstallResult({
      commonOnly: true,
      targets: ["apps/web:next"],
      adapters: "claude",
      yes: true,
      targetDir,
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toContain('a repo type ("next")');
  });

  it("--common-only --target apps/web --type next (split-form, type present) is refused, \"next\" interpolated", () => {
    const result = buildInstallResult({
      commonOnly: true,
      targets: ["apps/web"],
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toContain('a repo type ("next")');
  });

  it("--common-only --target . (bare self-target, no type) succeeds: repoTypes []/types [] for the target, no stack pack", () => {
    const result = buildInstallResult({
      commonOnly: true,
      targets: ["."],
      adapters: "claude",
      yes: true,
      targetDir,
    });
    expect(result.ok).toBe(true);
    expect(result.data.isMonorepo).toBe(true);
    expect(result.data.targets).toHaveLength(1);
    expect(result.data.targets[0]?.repoTypes).toEqual([]);
    expect(result.data.installedPacks).toContain("common");
    expect(result.data.installedPacks).not.toContain("next");
  });
});
