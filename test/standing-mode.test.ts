import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyStandingMode,
  ensureAgentsMdStandingMode,
  ensureClaudeMdReference,
  mergeAgentsMd,
  renderStandingModeSection,
  unwrapAgentsRegion,
  wrapAgentsRegion,
  AGENTS_REGION_END,
  AGENTS_REGION_START,
  STANDING_MODE_END,
  STANDING_MODE_START,
} from "../src/core/standing-mode.js";
import { buildInstallResult } from "../src/commands/install.js";
import { buildDoctorResult } from "../src/commands/doctor.js";
import { buildRepairResult } from "../src/commands/repair.js";
import { buildUpgradeResult } from "../src/commands/upgrade.js";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("standing-mode contract (decisions.md D34)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "inject-nockta-standing-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("renders the contract once, naming all three owner skills + the worker-leaf exception", () => {
    const section = renderStandingModeSection();
    expect(section).toContain(STANDING_MODE_START);
    expect(section).toContain(STANDING_MODE_END);
    expect(section).toMatch(/subagent-delegation/);
    expect(section).toMatch(/paper-trail/);
    expect(section).toMatch(/proof-of-done/);
    // Worker-leaf rule folded into subagent-delegation.
    expect(section).toMatch(/worker follows every skill below EXCEPT this one/);
    expect(section).toMatch(/Deviate only where a skill's own text defines an/);
  });

  describe("ensureAgentsMdStandingMode — AGENTS.md when the agent adapter is NOT selected", () => {
    it("create-if-absent: writes a minimal AGENTS.md with the marker-guarded block", () => {
      const res = ensureAgentsMdStandingMode(dir);
      expect(res.action).toBe("created");
      const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
      expect(content).toMatch(/^# AGENTS\.md/);
      expect(content).toContain(STANDING_MODE_START);
      expect(content).toMatch(/subagent-delegation/);
    });

    it("append-if-present: preserves a consumer-owned AGENTS.md, never clobbers", () => {
      const consumer = "# My project\n\nHand-written agent guidance the consumer owns.\n";
      writeFileSync(join(dir, "AGENTS.md"), consumer, "utf8");

      const res = ensureAgentsMdStandingMode(dir);
      expect(res.action).toBe("appended");
      const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
      expect(content).toContain("Hand-written agent guidance the consumer owns.");
      expect(content).toContain(STANDING_MODE_START);
      // Consumer text untouched, our region appended AFTER it.
      expect(content.indexOf("Hand-written")).toBeLessThan(content.indexOf(STANDING_MODE_START));
    });

    it("idempotent: a second run does not duplicate the region", () => {
      ensureAgentsMdStandingMode(dir);
      const second = ensureAgentsMdStandingMode(dir);
      expect(second.action).toBe("unchanged");
      const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
      expect(count(content, STANDING_MODE_START)).toBe(1);
      expect(count(content, STANDING_MODE_END)).toBe(1);
    });

    it("refreshes the region in place when the marker is present (never a second block)", () => {
      // Simulate a consumer file that already has our markers but with stale inner text.
      const stale = `# AGENTS.md\n\nconsumer top\n\n${STANDING_MODE_START}\nOLD STALE TEXT\n${STANDING_MODE_END}\n\nconsumer bottom\n`;
      writeFileSync(join(dir, "AGENTS.md"), stale, "utf8");

      const res = ensureAgentsMdStandingMode(dir);
      expect(res.action).toBe("refreshed");
      const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
      expect(content).not.toContain("OLD STALE TEXT");
      expect(content).toContain("consumer top");
      expect(content).toContain("consumer bottom");
      expect(count(content, STANDING_MODE_START)).toBe(1);
      expect(content).toMatch(/subagent-delegation/);
    });
  });

  describe("ensureClaudeMdReference — CLAUDE.md @AGENTS.md import", () => {
    it("create-if-absent: writes CLAUDE.md with a marker-guarded @AGENTS.md import line", () => {
      const res = ensureClaudeMdReference(dir);
      expect(res.action).toBe("created");
      const content = readFileSync(join(dir, "CLAUDE.md"), "utf8");
      expect(content).toContain("@AGENTS.md");
      expect(content).toContain(STANDING_MODE_START);
    });

    it("append-if-present: preserves consumer CLAUDE.md, appends the import region", () => {
      writeFileSync(join(dir, "CLAUDE.md"), "# Consumer CLAUDE\n\nProject-specific rules.\n", "utf8");
      const res = ensureClaudeMdReference(dir);
      expect(res.action).toBe("appended");
      const content = readFileSync(join(dir, "CLAUDE.md"), "utf8");
      expect(content).toContain("Project-specific rules.");
      expect(content).toContain("@AGENTS.md");
    });

    it("no-duplicate on re-run: exactly one @AGENTS.md import after two calls", () => {
      ensureClaudeMdReference(dir);
      const second = ensureClaudeMdReference(dir);
      expect(second.action).toBe("unchanged");
      const content = readFileSync(join(dir, "CLAUDE.md"), "utf8");
      expect(count(content, "@AGENTS.md")).toBe(1);
      expect(count(content, STANDING_MODE_START)).toBe(1);
    });
  });

  describe("applyStandingMode — adapter gating", () => {
    it("agent selected: does NOT write a standalone AGENTS.md side-effect (agent renderer owns it)", () => {
      const out = applyStandingMode({ targetDir: dir, adapters: ["agent"] });
      expect(out.agents).toBeUndefined();
      expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
    });

    it("claude not selected: does NOT write CLAUDE.md", () => {
      const out = applyStandingMode({ targetDir: dir, adapters: ["cursor"] });
      expect(out.claude).toBeUndefined();
      expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false);
      // But AGENTS.md still written (contract ships on every install).
      expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
    });
  });
});

describe("standing-mode e2e — reinstall idempotence, existing-repo safety, doctor semantics", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "inject-nockta-standing-e2e-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reinstall (claude only) does not duplicate the CLAUDE.md import or the AGENTS.md region", () => {
    const opts = { type: "next", adapters: "claude", yes: true, targetDir: dir, packageVersion: "9.9.9-test" } as const;
    buildInstallResult(opts);
    buildInstallResult(opts); // reinstall over the same dir

    const claudeMd = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    expect(count(claudeMd, "@AGENTS.md")).toBe(1);
    expect(count(claudeMd, STANDING_MODE_START)).toBe(1);

    const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(count(agentsMd, STANDING_MODE_START)).toBe(1);
  });

  it("existing-repo safety: a consumer's own AGENTS.md + CLAUDE.md survive install", () => {
    writeFileSync(join(dir, "AGENTS.md"), "# Consumer AGENTS\n\nDo not delete me.\n", "utf8");
    writeFileSync(join(dir, "CLAUDE.md"), "# Consumer CLAUDE\n\nDo not delete me either.\n", "utf8");

    // claude+cursor (agent NOT selected -> AGENTS.md is the untracked, append-safe side-effect).
    buildInstallResult({ type: "next", adapters: "claude,cursor", yes: true, targetDir: dir, packageVersion: "9.9.9-test" });

    const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("Do not delete me.");
    expect(agentsMd).toContain(STANDING_MODE_START);

    const claudeMd = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("Do not delete me either.");
    expect(claudeMd).toContain("@AGENTS.md");
  });

  it("doctor semantics: CLAUDE.md + side-effect AGENTS.md are untracked, doctor stays healthy; repair recreates them", () => {
    buildInstallResult({ type: "next", adapters: "claude", yes: true, targetDir: dir, packageVersion: "9.9.9-test" });

    const manifest = JSON.parse(readFileSync(join(dir, ".nockta", "generated-manifest.json"), "utf8"));
    const paths = manifest.files.map((f: { path: string }) => f.path);
    // Consumer-shared files are NEVER hash-tracked as if we owned them (decisions.md D34, model b).
    expect(paths).not.toContain("CLAUDE.md");
    expect(paths).not.toContain("AGENTS.md");

    // Healthy despite the two untracked root files (they are outside the managed scan roots
    // .claude/skills + .claude/agents, so they are not flagged "unknown" either).
    const healthy = buildDoctorResult({ targetDir: dir, packageVersion: "9.9.9-test" });
    expect(healthy.data.healthy).toBe(true);
    expect(healthy.data.counts.unknown).toBe(0);

    // Deleting CLAUDE.md does NOT make doctor unhealthy (untracked) — but repair restores it
    // idempotently (rely-on-idempotence model b).
    rmSync(join(dir, "CLAUDE.md"));
    const afterDelete = buildDoctorResult({ targetDir: dir, packageVersion: "9.9.9-test" });
    expect(afterDelete.data.healthy).toBe(true);

    buildRepairResult({ targetDir: dir, packageVersion: "9.9.9-test" });
    expect(existsSync(join(dir, "CLAUDE.md"))).toBe(true);
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toMatch(/@AGENTS\.md/);
  });
});

describe("mergeAgentsMd — unified agent-adapter AGENTS.md write semantics (D34 addendum)", () => {
  const BODY = "# AGENTS.md\n\nNockta body line.";

  it("no existing file: pure Nockta region, not flagged as consumer content", () => {
    const { content, hadConsumerContent } = mergeAgentsMd(null, BODY);
    expect(hadConsumerContent).toBe(false);
    expect(content).toBe(`${AGENTS_REGION_START}\n${BODY}\n${AGENTS_REGION_END}\n`);
    // Round-trips back to the body.
    expect(unwrapAgentsRegion(content)).toBe(BODY);
  });

  it("pure consumer file (no markers): Nockta region APPENDED, consumer content preserved above", () => {
    const consumer = "# My project\n\nHand-written guidance the consumer owns.\n";
    const { content, hadConsumerContent } = mergeAgentsMd(consumer, BODY);
    expect(hadConsumerContent).toBe(true);
    expect(content).toContain("Hand-written guidance the consumer owns.");
    expect(content.indexOf("Hand-written")).toBeLessThan(content.indexOf(AGENTS_REGION_START));
    expect(content).toContain(wrapAgentsRegion(BODY));
  });

  it("existing region + consumer content around it: region refreshed in place, consumer bytes kept", () => {
    const existing = `top consumer\n\n${wrapAgentsRegion("OLD NOCKTA BODY")}\n\nbottom consumer\n`;
    const { content, hadConsumerContent } = mergeAgentsMd(existing, BODY);
    expect(hadConsumerContent).toBe(true);
    expect(content).not.toContain("OLD NOCKTA BODY");
    expect(content).toContain("Nockta body line.");
    expect(content).toContain("top consumer");
    expect(content).toContain("bottom consumer");
    expect(count(content, AGENTS_REGION_START)).toBe(1);
    expect(count(content, AGENTS_REGION_END)).toBe(1);
  });

  it("wholly-Nockta file (only our region): refresh, still NOT flagged consumer content", () => {
    const existing = `${wrapAgentsRegion("OLD")}\n`;
    const { content, hadConsumerContent } = mergeAgentsMd(existing, BODY);
    expect(hadConsumerContent).toBe(false);
    expect(unwrapAgentsRegion(content)).toBe(BODY);
    expect(count(content, AGENTS_REGION_START)).toBe(1);
  });

  it("idempotent: merging the same body twice yields identical bytes", () => {
    const consumer = "# Consumer\n\nkeep me\n";
    const once = mergeAgentsMd(consumer, BODY).content;
    const twice = mergeAgentsMd(once, BODY).content;
    expect(twice).toBe(once);
  });

  it("flip rule: a bare standing-mode region in the existing file is OURS — excised, never treated as consumer content", () => {
    // What ensureAgentsMdStandingMode() leaves behind when the agent adapter was NOT selected,
    // with consumer content around it.
    const existing = `# Consumer top\n\nkeep-top\n\n${STANDING_MODE_START}\nold bare standing block\n${STANDING_MODE_END}\n\nkeep-bottom\n`;
    const { content, hadConsumerContent } = mergeAgentsMd(existing, BODY);
    expect(hadConsumerContent).toBe(true);
    expect(content).toContain("keep-top");
    expect(content).toContain("keep-bottom");
    expect(content).not.toContain("old bare standing block");
    // Exactly one agents region; no duplicate bare standing region survives (BODY here carries no
    // nested standing markers, so the count is 0 — the real renderer body nests exactly one).
    expect(count(content, AGENTS_REGION_START)).toBe(1);
    expect(count(content, STANDING_MODE_START)).toBe(0);
  });

  it("flip rule: a file that was WHOLLY ours (bare standing region only) collapses to a pure tracked region", () => {
    const existing = `${STANDING_MODE_START}\nold bare standing block\n${STANDING_MODE_END}\n`;
    const { content, hadConsumerContent } = mergeAgentsMd(existing, BODY);
    expect(hadConsumerContent).toBe(false);
    expect(content).toBe(`${wrapAgentsRegion(BODY)}\n`);
  });

  it("stray remnants: duplicate agents regions and stray standing regions are all excised, consumer bytes kept", () => {
    const existing = [
      "consumer-line",
      wrapAgentsRegion("OLD ONE"),
      `${STANDING_MODE_START}\nstray standing\n${STANDING_MODE_END}`,
      wrapAgentsRegion("OLD TWO"),
      "consumer-tail",
    ].join("\n\n");
    const { content, hadConsumerContent } = mergeAgentsMd(existing, BODY);
    expect(hadConsumerContent).toBe(true);
    expect(content).toContain("consumer-line");
    expect(content).toContain("consumer-tail");
    expect(content).not.toContain("OLD ONE");
    expect(content).not.toContain("OLD TWO");
    expect(content).not.toContain("stray standing");
    expect(count(content, AGENTS_REGION_START)).toBe(1);
    expect(count(content, AGENTS_REGION_END)).toBe(1);
  });
});

describe("agent-adapter AGENTS.md — clobber boundary CLOSED (D34 addendum)", () => {
  let dir: string;
  const SENTINEL = "SENTINEL-consumer-owned-agents-content-do-not-lose";
  const V = "9.9.9-test";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "inject-nockta-agent-clobber-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function installAgent() {
    return buildInstallResult({ type: "next", adapters: "agent", yes: true, targetDir: dir, packageVersion: V });
  }

  it("install with the agent adapter over a pre-existing consumer AGENTS.md PRESERVES it + adds the full Nockta region", () => {
    const consumer = `# Consumer AGENTS\n\n${SENTINEL}\n`;
    writeFileSync(join(dir, "AGENTS.md"), consumer, "utf8");

    installAgent();

    const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    // Consumer content survived (the batch verifier's reproduced data-loss case).
    expect(agentsMd).toContain(SENTINEL);
    // Full Nockta region present: guard markers + standing block + skill prose.
    expect(agentsMd).toContain(AGENTS_REGION_START);
    expect(agentsMd).toContain(AGENTS_REGION_END);
    expect(agentsMd).toContain(STANDING_MODE_START);
    expect(agentsMd).toMatch(/subagent-delegation/);
    expect(agentsMd).toMatch(/paper-trail/);
    expect(agentsMd).toMatch(/proof-of-done/);
    // Model b: merged-into-consumer AGENTS.md is UNTRACKED (a consumer editing their own bytes must
    // never trip doctor's "modified").
    const manifest = JSON.parse(readFileSync(join(dir, ".nockta", "generated-manifest.json"), "utf8"));
    expect(manifest.files.map((f: { path: string }) => f.path)).not.toContain("AGENTS.md");
  });

  it("reinstall over merged file is idempotent: one region, sentinel still once", () => {
    writeFileSync(join(dir, "AGENTS.md"), `# Consumer\n\n${SENTINEL}\n`, "utf8");
    installAgent();
    installAgent();
    const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(count(agentsMd, AGENTS_REGION_START)).toBe(1);
    expect(count(agentsMd, AGENTS_REGION_END)).toBe(1);
    expect(count(agentsMd, SENTINEL)).toBe(1);
  });

  it("repair restores OUR region without touching consumer content, even after the region is deleted", () => {
    writeFileSync(join(dir, "AGENTS.md"), `# Consumer\n\n${SENTINEL}\n`, "utf8");
    installAgent();

    // Consumer nukes just Nockta's region, keeping their own content.
    writeFileSync(join(dir, "AGENTS.md"), `# Consumer\n\n${SENTINEL}\n`, "utf8");
    let agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agentsMd).not.toContain(AGENTS_REGION_START);

    buildRepairResult({ targetDir: dir, packageVersion: V });

    agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain(SENTINEL);
    expect(agentsMd).toContain(AGENTS_REGION_START);
    expect(agentsMd).toMatch(/subagent-delegation/);
  });

  it("upgrade re-stamps the region and preserves consumer content", () => {
    writeFileSync(join(dir, "AGENTS.md"), `# Consumer\n\n${SENTINEL}\n`, "utf8");
    installAgent();
    buildUpgradeResult({ targetDir: dir, packageVersion: "9.9.10-test" });
    const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain(SENTINEL);
    expect(count(agentsMd, AGENTS_REGION_START)).toBe(1);
  });

  it("doctor stays healthy with a merged (untracked) AGENTS.md; consumer edits never flag modified", () => {
    writeFileSync(join(dir, "AGENTS.md"), `# Consumer\n\n${SENTINEL}\n`, "utf8");
    installAgent();

    const healthy = buildDoctorResult({ targetDir: dir, packageVersion: V });
    expect(healthy.data.healthy).toBe(true);

    // Consumer edits their own content outside the region -> still healthy (untracked).
    const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    writeFileSync(join(dir, "AGENTS.md"), agentsMd.replace(SENTINEL, `${SENTINEL}\nplus a new consumer line`), "utf8");
    const afterEdit = buildDoctorResult({ targetDir: dir, packageVersion: V });
    expect(afterEdit.data.healthy).toBe(true);
    expect(afterEdit.data.counts.modified).toBe(0);
  });

  it("fresh repo (no consumer AGENTS.md): agent adapter still TRACKS its wholly-owned AGENTS.md", () => {
    installAgent();
    const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    // Wholly ours: opens with the region marker, no stray consumer bytes.
    expect(agentsMd.startsWith(AGENTS_REGION_START)).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, ".nockta", "generated-manifest.json"), "utf8"));
    const rec = manifest.files.find((f: { path: string }) => f.path === "AGENTS.md");
    expect(rec).toBeDefined();
    expect(rec.adapter).toBe("agent");

    // And doctor guards it: delete -> unhealthy/missing -> repair restores.
    rmSync(join(dir, "AGENTS.md"));
    const missing = buildDoctorResult({ targetDir: dir, packageVersion: V });
    expect(missing.data.healthy).toBe(false);
    buildRepairResult({ targetDir: dir, packageVersion: V });
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
  });

  it("adapter-selection FLIP (no-agent -> agent): the bare standing region is reconciled, not duplicated; sentinel survives", () => {
    // Repo with a consumer AGENTS.md, first installed WITHOUT the agent adapter -> bare standing
    // region appended by ensureAgentsMdStandingMode().
    writeFileSync(join(dir, "AGENTS.md"), `# Consumer\n\n${SENTINEL}\n`, "utf8");
    buildInstallResult({ type: "next", adapters: "cursor", yes: true, targetDir: dir, packageVersion: V });
    let agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(count(agentsMd, STANDING_MODE_START)).toBe(1);
    expect(count(agentsMd, AGENTS_REGION_START)).toBe(0);

    // FLIP: reinstall WITH the agent adapter.
    installAgent();
    agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain(SENTINEL);
    // Exactly ONE agents region, and exactly ONE standing region — nested inside it, the old bare
    // one excised (it was ours, marker-identified — never consumer content).
    expect(count(agentsMd, AGENTS_REGION_START)).toBe(1);
    expect(count(agentsMd, STANDING_MODE_START)).toBe(1);
    expect(agentsMd.indexOf(STANDING_MODE_START)).toBeGreaterThan(agentsMd.indexOf(AGENTS_REGION_START));
    expect(agentsMd.indexOf(STANDING_MODE_END)).toBeLessThan(agentsMd.indexOf(AGENTS_REGION_END));

    // Idempotent after the flip.
    installAgent();
    const again = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(count(again, AGENTS_REGION_START)).toBe(1);
    expect(count(again, STANDING_MODE_START)).toBe(1);
    expect(count(again, SENTINEL)).toBe(1);
  });

  it("reverse FLIP (agent -> no-agent): ensureAgentsMdStandingMode refreshes the standing region nested in the agents region — no second bare region", () => {
    writeFileSync(join(dir, "AGENTS.md"), `# Consumer\n\n${SENTINEL}\n`, "utf8");
    installAgent();
    let agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(count(agentsMd, AGENTS_REGION_START)).toBe(1);
    expect(count(agentsMd, STANDING_MODE_START)).toBe(1);

    // FLIP back: reinstall WITHOUT the agent adapter -> applyStandingMode's AGENTS.md side-effect
    // runs. It must refresh the standing region where it lives (inside the agents region), not
    // append a second bare one.
    buildInstallResult({ type: "next", adapters: "cursor", yes: true, targetDir: dir, packageVersion: V });
    agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain(SENTINEL);
    expect(count(agentsMd, STANDING_MODE_START)).toBe(1);
    expect(count(agentsMd, AGENTS_REGION_START)).toBe(1);

    // Idempotent after the reverse flip too.
    buildInstallResult({ type: "next", adapters: "cursor", yes: true, targetDir: dir, packageVersion: V });
    const again = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(count(again, STANDING_MODE_START)).toBe(1);
    expect(count(again, AGENTS_REGION_START)).toBe(1);
    expect(count(again, SENTINEL)).toBe(1);
  });
});
