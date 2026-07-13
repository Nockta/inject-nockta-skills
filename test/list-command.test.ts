import { describe, expect, it } from "vitest";
import { buildListResult } from "../src/commands/list.js";
import { ADAPTER_TYPES } from "../src/types/adapter.js";
import { REPO_TYPES } from "../src/types/repo-type.js";

const EXPECTED_PACK_NAMES = [
  "common",
  "expo",
  "monorepo",
  "nest",
  "next",
  "razor",
  "react-native",
  "shopify-app",
  "shopify-headless",
  "shopify-theme",
  "vite-react-ts",
].sort();

describe("buildListResult (list --json contract, spec §7.8/§7.9)", () => {
  it("returns ok:true, command:'list', exitCode:0", () => {
    const result = buildListResult();
    expect(result.ok).toBe(true);
    expect(result.command).toBe("list");
    expect(result.exitCode).toBe(0);
  });

  it("data.repoTypes and data.adapterTypes match the canonical unions exactly (D7 contract-test surface)", () => {
    const result = buildListResult();
    expect(result.data.repoTypes).toEqual(REPO_TYPES);
    expect(result.data.adapterTypes).toEqual(ADAPTER_TYPES);
  });

  it("lists all 11 bundled packs by name", () => {
    const result = buildListResult();
    const names = result.data.packs.map((p) => p.name).sort();
    expect(names).toEqual(EXPECTED_PACK_NAMES);
  });

  it("common pack declares the full curated D26 skill list (18 skills: 3 required + 9 default + 6 optional)", () => {
    const result = buildListResult();
    const common = result.data.packs.find((p) => p.name === "common");
    expect(common?.skills).toEqual([
      "paper-trail",
      "proof-of-done",
      "subagent-delegation",
      "grill-me",
      "brainstorming",
      "diagnosing-bugs",
      "webapp-testing",
      "tdd",
      "code-review",
      "receiving-code-review",
      "requesting-code-review",
      "writing-plans",
      "using-git-worktrees",
      "finishing-a-development-branch",
      "codebase-design",
      "grilling",
      "domain-modeling",
      "improve-codebase-architecture",
    ]);
    // The 2 curation-dropped skills (decisions.md D26) must never appear.
    expect(common?.skills).not.toContain("systematic-debugging");
    expect(common?.skills).not.toContain("test-driven-development");
  });

  it("all 11 packs are installable (decisions.md D26 curation-aware content import; razor added this pass)", () => {
    const result = buildListResult();
    expect(result.data.packs).toHaveLength(11);
    for (const pack of result.data.packs) {
      expect(pack.status).toBe("installable");
      expect(pack.missingSkills).toEqual([]);
    }
  });

  it("round-trips through JSON.stringify -> JSON.parse (the actual --json stdout contract)", () => {
    const result = buildListResult();
    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual(result);
  });
});
