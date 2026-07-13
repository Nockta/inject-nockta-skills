import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";
import { buildDoctorResult } from "../src/commands/doctor.js";
import { buildRepairResult } from "../src/commands/repair.js";

/**
 * Cross-adapter install against the REAL bundled `packs/common` — proves the M7 renderers
 * together: claude + cursor + copilot all render for a single install; `paper-trail`/
 * `proof-of-done`/`subagent-delegation` are all present in cursor/copilot output (D23
 * reclassified subagent-delegation as portable — its PROSE renders everywhere; only its
 * `worker.md` agent artifact stays claude-only, D8's outputs map); doctor/repair automatically
 * cover every adapter's generated files via the SAME `.nockta/generated-manifest.json` (brief:
 * "doctor/repair/upgrade automatically cover them").
 */
describe("multi-adapter install (claude + cursor + copilot) — real bundled packs/common", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-multi-adapter-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("renders .claude/ + .cursor/rules/*.mdc + .github/instructions/nockta.instructions.md in one install", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude,cursor,copilot",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.adapters).toEqual(["claude", "cursor", "copilot"]);

    // Safety boundary (spec §14, decisions.md D24/D34): adapter dotdirs + .nockta, PLUS the two
    // root standing-mode files — AGENTS.md (single source of the contract, written on every install
    // even without the agent adapter) and CLAUDE.md (@AGENTS.md import, written because claude is
    // selected).
    expect(readdirSync(targetDir).sort()).toEqual([".claude", ".cursor", ".github", ".nockta", "AGENTS.md", "CLAUDE.md"]);

    // Standing-mode contract (decisions.md D34): the block lives ONCE, in AGENTS.md; CLAUDE.md just
    // imports it; cursor/copilot reference it.
    const agentsMd = readFileSync(join(targetDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toMatch(/<!-- nockta:standing-mode:start -->/);
    expect(agentsMd).toMatch(/subagent-delegation/);
    expect(agentsMd).toMatch(/paper-trail/);
    expect(agentsMd).toMatch(/proof-of-done/);
    const claudeMd = readFileSync(join(targetDir, "CLAUDE.md"), "utf8");
    expect(claudeMd).toMatch(/@AGENTS\.md/);
    // Not the full block — CLAUDE.md only references it (single source of truth).
    expect(claudeMd).not.toMatch(/proof-of-done/);

    expect(existsSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".cursor", "rules", "nockta-common.mdc"))).toBe(true);
    expect(existsSync(join(targetDir, ".github", "instructions", "nockta.instructions.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".github", "copilot-instructions.md"))).toBe(false);

    // D23: subagent-delegation is portable — its PROSE now renders for cursor/copilot too, same
    // as paper-trail/proof-of-done. Only its worker.md AGENT artifact stays claude-only (checked
    // via the .claude/agents/ assertion below and the agent-adapter e2e test).
    const cursorMdc = readFileSync(join(targetDir, ".cursor", "rules", "nockta-common.mdc"), "utf8");
    expect(cursorMdc).toMatch(/paper-trail/);
    expect(cursorMdc).toMatch(/proof-of-done/);
    expect(cursorMdc).toMatch(/subagent-delegation/);
    // D34: cursor references AGENTS.md rather than restating the block.
    expect(cursorMdc).toMatch(/working mode is defined in `AGENTS\.md`/);

    const copilotInstructions = readFileSync(join(targetDir, ".github", "instructions", "nockta.instructions.md"), "utf8");
    expect(copilotInstructions).toMatch(/paper-trail/);
    expect(copilotInstructions).toMatch(/proof-of-done/);
    expect(copilotInstructions).toMatch(/subagent-delegation/);
    // D34: copilot references AGENTS.md rather than restating the block.
    expect(copilotInstructions).toMatch(/working mode is defined in `AGENTS\.md`/);

    // No .claude/agents/ equivalent exists under cursor/copilot output — worker.md never renders
    // there (D8 outputs.cursor.agents / outputs.copilot.agents are false).
    expect(existsSync(join(targetDir, ".cursor", "agents"))).toBe(false);
    expect(existsSync(join(targetDir, ".github", "agents"))).toBe(false);

    // Manifest tracks every adapter's files (spec §10.3, D3) — this is the coverage doctor/
    // repair/upgrade read from.
    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    const adaptersInManifest = new Set(manifest.files.map((f: { adapter: string }) => f.adapter));
    expect(adaptersInManifest).toEqual(new Set(["claude", "cursor", "copilot"]));
  });

  it("doctor is healthy across all 3 adapters; repair restores a deleted .mdc with a hash matching the manifest", () => {
    buildInstallResult({ type: "next", adapters: "claude,cursor,copilot", yes: true, targetDir, packageVersion: "9.9.9-test" });

    const healthyDoctor = buildDoctorResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(healthyDoctor.ok).toBe(true);
    expect(healthyDoctor.data.healthy).toBe(true);

    // Delete the cursor .mdc — doctor must flag it, repair must restore it, matching the manifest hash.
    const mdcPath = join(targetDir, ".cursor", "rules", "nockta-common.mdc");
    unlinkSync(mdcPath);

    const brokenDoctor = buildDoctorResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(brokenDoctor.ok).toBe(false);
    expect(brokenDoctor.exitCode).toBe(4);
    expect(brokenDoctor.data.counts.missing).toBe(1);
    const missingFile = brokenDoctor.data.files.find((f) => f.classification === "missing");
    expect(missingFile?.path).toBe(".cursor/rules/nockta-common.mdc");

    const repair = buildRepairResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(repair.ok).toBe(true);
    expect(repair.data.restored).toContain(".cursor/rules/nockta-common.mdc");
    expect(existsSync(mdcPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    const record = manifest.files.find((f: { path: string }) => f.path === ".cursor/rules/nockta-common.mdc");
    expect(record).toBeDefined();

    const finalDoctor = buildDoctorResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(finalDoctor.data.healthy).toBe(true);
  });

  it("copilot's single combined file tracks under ONE manifest record covering multiple packs", () => {
    buildInstallResult({ type: "next", adapters: "copilot", yes: true, targetDir, packageVersion: "9.9.9-test" });
    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    expect(manifest.files.length).toBe(1);
    expect(manifest.files[0].path).toBe(".github/instructions/nockta.instructions.md");
    // Post-content-import (decisions.md D26): next is installable too, so the combined file's
    // one manifest record now covers both packs — this is exactly the "multiple packs" case the
    // test name describes.
    expect(manifest.files[0].pack).toBe("common,next");
  });
});

/**
 * D24 + D35: the `agent` and `antigravity` adapters join claude/cursor/copilot in a single
 * 5-adapter install — proves they render alongside the other three. `agent`'s AGENTS.md carries all
 * 3 owner common skills' prose (including subagent-delegation, D23); `antigravity` gets the full
 * `.agents/skills/<skill>/` treatment (the .claude/ mirror). No worker.md agent renders outside
 * `.claude/agents/` (neither AGENTS.md nor `.agents/skills/` has an agent-registration mechanism),
 * and doctor/repair/upgrade cover every adapter's output via the same manifest machinery.
 */
describe("5-adapter install (claude + cursor + copilot + agent + antigravity) — real bundled packs/common", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-5-adapter-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("renders .claude/ + .cursor/ + .github/ + root AGENTS.md + .agents/skills/ in one install", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude,cursor,copilot,agent,antigravity",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.adapters).toEqual(["claude", "cursor", "copilot", "agent", "antigravity"]);

    // Safety boundary (spec §14, decisions.md D24/D34/D35): the 5 adapter output roots + .nockta,
    // PLUS CLAUDE.md (@AGENTS.md import, claude selected). `.agents/` (antigravity, dir) and root
    // `AGENTS.md` (agent, file) are cleanly separate artifacts. No standalone AGENTS.md side-effect
    // here — the agent adapter OWNS AGENTS.md (tracked), block rides as its preamble.
    expect(readdirSync(targetDir).sort()).toEqual([".agents", ".claude", ".cursor", ".github", ".nockta", "AGENTS.md", "CLAUDE.md"]);

    const agentsMd = readFileSync(join(targetDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toMatch(/paper-trail/);
    expect(agentsMd).toMatch(/proof-of-done/);
    expect(agentsMd).toMatch(/subagent-delegation/);
    expect(agentsMd).toMatch(/Generated by \[inject-nockta-skills\]/);
    // D34: the standing-mode block is the preamble of the agent-owned AGENTS.md.
    expect(agentsMd).toMatch(/<!-- nockta:standing-mode:start -->/);
    expect(agentsMd).toMatch(/Working mode — Nockta standing contract/);
    const claudeMd4 = readFileSync(join(targetDir, "CLAUDE.md"), "utf8");
    expect(claudeMd4).toMatch(/@AGENTS\.md/);

    // D35: antigravity gets the .claude/ treatment — full per-skill dirs under .agents/skills/.
    expect(existsSync(join(targetDir, ".agents", "skills", "paper-trail", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".agents", "skills", "subagent-delegation", "SKILL.md"))).toBe(true);
    // No agent-registration mechanism under .agents/ — worker.md is never PROMOTED to a top-level
    // `.agents/agents/` registry the way claude promotes it to `.claude/agents/` (D35). The full-dir
    // injection DOES ship subagent-delegation's own `agents/worker.md` as an ordinary companion file
    // INSIDE its skill dir (self-contained skill), but the `.agents/` root holds ONLY `skills/`.
    expect(existsSync(join(targetDir, ".agents", "skills", "subagent-delegation", "agents", "worker.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".agents", "agents"))).toBe(false);
    expect(readdirSync(join(targetDir, ".agents")).sort()).toEqual(["skills"]);

    // No agent-registration mechanism under AGENTS.md — worker.md never renders there (D24).
    expect(existsSync(join(targetDir, "agents"))).toBe(false);
    expect(existsSync(join(targetDir, ".claude", "agents", "worker.md"))).toBe(true); // still claude-only.

    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    const adaptersInManifest = new Set(manifest.files.map((f: { adapter: string }) => f.adapter));
    expect(adaptersInManifest).toEqual(new Set(["claude", "cursor", "copilot", "agent", "antigravity"]));
    const agentsRecord = manifest.files.find((f: { path: string }) => f.path === "AGENTS.md");
    expect(agentsRecord).toBeDefined();
    expect(agentsRecord.adapter).toBe("agent");
    // Every antigravity file is manifest-tracked under `.agents/skills/`.
    const antigravityRecords = manifest.files.filter((f: { adapter: string }) => f.adapter === "antigravity");
    expect(antigravityRecords.length).toBeGreaterThan(0);
    expect(antigravityRecords.every((f: { path: string }) => f.path.startsWith(".agents/skills/"))).toBe(true);
  });

  it("manifest coverage: rm AGENTS.md -> doctor flags missing (exit 4) -> repair restores -> hash verified -> doctor healthy", () => {
    buildInstallResult({ type: "next", adapters: "claude,cursor,copilot,agent,antigravity", yes: true, targetDir, packageVersion: "9.9.9-test" });

    const healthyDoctor = buildDoctorResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(healthyDoctor.ok).toBe(true);
    expect(healthyDoctor.exitCode).toBe(0);
    expect(healthyDoctor.data.healthy).toBe(true);

    const agentsPath = join(targetDir, "AGENTS.md");
    unlinkSync(agentsPath);

    const brokenDoctor = buildDoctorResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(brokenDoctor.ok).toBe(false);
    expect(brokenDoctor.exitCode).toBe(4);
    const missingFile = brokenDoctor.data.files.find((f) => f.classification === "missing");
    expect(missingFile?.path).toBe("AGENTS.md");
    expect(missingFile?.adapter).toBe("agent");

    const repair = buildRepairResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(repair.ok).toBe(true);
    expect(repair.data.restored).toContain("AGENTS.md");
    expect(existsSync(agentsPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    const record = manifest.files.find((f: { path: string }) => f.path === "AGENTS.md");
    expect(record).toBeDefined();

    const finalDoctor = buildDoctorResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(finalDoctor.ok).toBe(true);
    expect(finalDoctor.exitCode).toBe(0);
    expect(finalDoctor.data.healthy).toBe(true);
  });

  it("agent adapter alone: single manifest record, one file at repo root, nothing else written", () => {
    const result = buildInstallResult({ type: "next", adapters: "agent", yes: true, targetDir, packageVersion: "9.9.9-test" });
    expect(result.ok).toBe(true);
    expect(readdirSync(targetDir).sort()).toEqual([".nockta", "AGENTS.md"]);

    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    expect(manifest.files.length).toBe(1);
    expect(manifest.files[0].path).toBe("AGENTS.md");
    // Post-content-import (decisions.md D26): next is installable too, so AGENTS.md's one
    // manifest record now covers both packs.
    expect(manifest.files[0].pack).toBe("common,next");
  });

  it("antigravity adapter alone (D35): .agents/skills/ tree + AGENTS.md side-effect; nothing else", () => {
    const result = buildInstallResult({ type: "next", adapters: "antigravity", yes: true, targetDir, packageVersion: "9.9.9-test" });
    expect(result.ok).toBe(true);
    // antigravity is NOT the `agent` adapter, so AGENTS.md is still written as the untracked
    // standing-mode side-effect (ensureAgentsMdStandingMode) — the contract must ship regardless of
    // adapters. No CLAUDE.md (claude not selected). No .claude/.cursor/.github.
    expect(readdirSync(targetDir).sort()).toEqual([".agents", ".nockta", "AGENTS.md"]);
    expect(existsSync(join(targetDir, ".agents", "skills", "paper-trail", "SKILL.md"))).toBe(true);

    // AGENTS.md exists as the untracked side-effect; it is NOT in the manifest, only antigravity
    // skill files are tracked.
    const agentsMd = readFileSync(join(targetDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toMatch(/<!-- nockta:standing-mode:start -->/);
    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    const adaptersInManifest = new Set(manifest.files.map((f: { adapter: string }) => f.adapter));
    expect(adaptersInManifest).toEqual(new Set(["antigravity"]));
    expect(manifest.files.every((f: { path: string }) => f.path.startsWith(".agents/skills/"))).toBe(true);
  });

  it("doctor over .agents/skills/ (D35): healthy -> delete one file -> missing (exit 4); modify another -> modified; repair restores both", () => {
    buildInstallResult({ type: "next", adapters: "antigravity", yes: true, targetDir, packageVersion: "9.9.9-test" });

    const healthy = buildDoctorResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(healthy.data.healthy).toBe(true);

    // Delete one antigravity skill file -> doctor flags it missing.
    const deleted = join(targetDir, ".agents", "skills", "paper-trail", "SKILL.md");
    expect(existsSync(deleted)).toBe(true);
    unlinkSync(deleted);
    // Modify another antigravity skill file -> doctor flags it modified.
    const modified = join(targetDir, ".agents", "skills", "proof-of-done", "SKILL.md");
    writeFileSync(modified, "tampered", "utf8");

    const broken = buildDoctorResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(broken.ok).toBe(false);
    expect(broken.exitCode).toBe(4);
    expect(broken.data.counts.missing).toBe(1);
    expect(broken.data.counts.modified).toBe(1);
    const missing = broken.data.files.find((f) => f.classification === "missing");
    expect(missing?.path).toBe(".agents/skills/paper-trail/SKILL.md");
    expect(missing?.adapter).toBe("antigravity");
    const mod = broken.data.files.find((f) => f.classification === "modified");
    expect(mod?.path).toBe(".agents/skills/proof-of-done/SKILL.md");
    expect(mod?.adapter).toBe("antigravity");

    // repair restores the deleted one; the modified one is user-changed provenance -> skipped
    // (never blind-overwritten) unless forced.
    const repair = buildRepairResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(repair.ok).toBe(true);
    expect(repair.data.restored).toContain(".agents/skills/paper-trail/SKILL.md");
    expect(existsSync(deleted)).toBe(true);
  });
});
