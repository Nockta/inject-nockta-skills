import { describe, expect, it } from "vitest";
import { hasSufficientInstallFlags } from "../src/commands/install-entry.js";

/**
 * Unit-level test for `hasSufficientInstallFlags()` (spec §6) — the pure gate M6 introduced and
 * M7 extends with the `--dry-run` bypass (a dry-run never writes, so it never needs `--yes` to be
 * routed to the non-interactive path instead of the wizard). No process spawn needed — see
 * `test/install-entry-process.test.ts` for the process-level non-TTY matrix this gate feeds.
 */
describe("hasSufficientInstallFlags (spec §6, M7: --dry-run bypasses --yes)", () => {
  it("type + yes: sufficient", () => {
    expect(hasSufficientInstallFlags({ type: "next", yes: true })).toBe(true);
  });

  it("type alone, no yes, no dry-run: insufficient (unchanged M6 behavior)", () => {
    expect(hasSufficientInstallFlags({ type: "next" })).toBe(false);
  });

  it("type + dryRun, NO yes: sufficient (M7 — dry-run never needs confirmation)", () => {
    expect(hasSufficientInstallFlags({ type: "next", dryRun: true })).toBe(true);
  });

  it("target + dryRun, NO yes: sufficient", () => {
    expect(hasSufficientInstallFlags({ targets: ["apps/web:next"], dryRun: true })).toBe(true);
  });

  it("dryRun alone, no type/target: still insufficient (dry-run bypasses --yes, not the type/target requirement)", () => {
    expect(hasSufficientInstallFlags({ dryRun: true })).toBe(false);
  });

  it("monorepo flag + yes, no type/target: sufficient (targetIntent via --monorepo)", () => {
    expect(hasSufficientInstallFlags({ monorepo: true, yes: true })).toBe(true);
  });

  it("nothing at all: insufficient", () => {
    expect(hasSufficientInstallFlags({})).toBe(false);
  });
});
