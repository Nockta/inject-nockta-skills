import { describe, expect, it } from "vitest";
import { resolveSkillSelection } from "../src/core/skill-selection.js";
import type { SkillCatalogEntry } from "../src/packs/skill-catalog.js";

const CATALOG: SkillCatalogEntry[] = [
  { pack: "common", skill: "required-a", enablement: "required", supportedAdapters: ["claude"], requires: [] },
  { pack: "common", skill: "default-a", enablement: "default", supportedAdapters: ["claude"], requires: [] },
  { pack: "common", skill: "default-b", enablement: "default", supportedAdapters: ["claude"], requires: [] },
  { pack: "common", skill: "optional-a", enablement: "optional", supportedAdapters: ["claude"], requires: [] },
  { pack: "common", skill: "optional-b", enablement: "optional", supportedAdapters: ["claude"], requires: [] },
];

describe("resolveSkillSelection (decisions.md D19) — unit matrix", () => {
  it("no deltas: effective = required ∪ default (optionals stay off)", () => {
    const result = resolveSkillSelection({ catalog: CATALOG });
    expect(result.ok).toBe(true);
    expect([...result.effective].sort()).toEqual(["default-a", "default-b", "required-a"]);
    expect(result.deltas).toEqual({ excluded: [], included: [] });
  });

  it("--exclude-skills removes a default skill from the effective set", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, excluded: ["default-a"] });
    expect(result.ok).toBe(true);
    expect([...result.effective].sort()).toEqual(["default-b", "required-a"]);
    expect(result.deltas.excluded).toEqual(["default-a"]);
  });

  it("--include-skills adds an optional skill to the effective set", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, included: ["optional-a"] });
    expect(result.ok).toBe(true);
    expect([...result.effective].sort()).toEqual(["default-a", "default-b", "optional-a", "required-a"]);
    expect(result.deltas.included).toEqual(["optional-a"]);
  });

  it("both exclude and include together compose correctly", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, excluded: ["default-a", "default-b"], included: ["optional-a", "optional-b"] });
    expect(result.ok).toBe(true);
    expect([...result.effective].sort()).toEqual(["optional-a", "optional-b", "required-a"]);
  });

  it("required-guard: excluding a required skill is invalid (ok:false, error message)", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, excluded: ["required-a"] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /cannot exclude required skill/.test(e))).toBe(true);
    expect(result.errors.some((e) => /required-a/.test(e))).toBe(true);
  });

  it("unknown name in --exclude-skills is invalid", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, excluded: ["does-not-exist"] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /unknown skill name/.test(e) && /does-not-exist/.test(e))).toBe(true);
  });

  it("unknown name in --include-skills is invalid", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, included: ["does-not-exist"] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /unknown skill name/.test(e) && /does-not-exist/.test(e))).toBe(true);
  });

  it("both an unknown name and a required-exclusion produce BOTH errors, not just the first", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, excluded: ["required-a", "nope"] });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  it("including an already-default/required skill (redundant) is a harmless no-op, not an error", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, included: ["default-a", "required-a"] });
    expect(result.ok).toBe(true);
    // Redundant includes are NOT recorded as deltas (only entries that actually move a tier default).
    expect(result.deltas.included).toEqual([]);
  });

  it("excluding an already-off optional (redundant) is a harmless no-op, not an error", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, excluded: ["optional-a"] });
    expect(result.ok).toBe(true);
    expect(result.deltas.excluded).toEqual([]);
    expect(result.effective.has("optional-a")).toBe(false);
  });

  it("duplicate names are deduped in the recorded deltas", () => {
    const result = resolveSkillSelection({ catalog: CATALOG, excluded: ["default-a", "default-a"] });
    expect(result.deltas.excluded).toEqual(["default-a"]);
  });

  it("empty catalog: no effective skills, no crash", () => {
    const result = resolveSkillSelection({ catalog: [] });
    expect(result.ok).toBe(true);
    expect(result.effective.size).toBe(0);
  });
});

/** Builds a `SkillCatalogEntry` inline — every D21 test below wants control over `requires`/
 * `supportedAdapters` per-entry, unlike the flat D19 `CATALOG` above. */
function entry(
  skill: string,
  enablement: "required" | "default" | "optional",
  opts: { pack?: string; supportedAdapters?: SkillCatalogEntry["supportedAdapters"]; requires?: string[] } = {},
): SkillCatalogEntry {
  return {
    pack: opts.pack ?? "common",
    skill,
    enablement,
    supportedAdapters: opts.supportedAdapters ?? ["claude"],
    requires: opts.requires ?? [],
  };
}

describe("resolveSkillSelection — D21 dependency closure + adapter gating", () => {
  it("linear chain: including the head auto-includes the whole chain, recorded in deltas.included", () => {
    const catalog = [
      entry("a", "optional", { requires: ["b"] }),
      entry("b", "optional", { requires: ["c"] }),
      entry("c", "optional"),
    ];
    const result = resolveSkillSelection({ catalog, included: ["a"] });
    expect(result.ok).toBe(true);
    expect([...result.effective].sort()).toEqual(["a", "b", "c"]);
    expect(result.deltas.included).toEqual(["a", "b", "c"]);
    expect(result.requiredBy.get("b")).toEqual(["a"]);
    expect(result.requiredBy.get("c")).toEqual(["b"]);
  });

  it("diamond: two enabled dependents sharing one dependency both appear in requiredBy", () => {
    const catalog = [
      entry("x", "optional", { requires: ["shared"] }),
      entry("y", "optional", { requires: ["shared"] }),
      entry("shared", "optional"),
    ];
    const result = resolveSkillSelection({ catalog, included: ["x", "y"] });
    expect(result.ok).toBe(true);
    expect([...result.effective].sort()).toEqual(["shared", "x", "y"]);
    expect(result.requiredBy.get("shared")).toEqual(["x", "y"]);
  });

  it("a default-tier dependency already on needs no delta — no-op closure", () => {
    const catalog = [entry("dependent", "optional", { requires: ["dep"] }), entry("dep", "default")];
    const result = resolveSkillSelection({ catalog, included: ["dependent"] });
    expect(result.ok).toBe(true);
    expect([...result.effective].sort()).toEqual(["dep", "dependent"]);
    // "dep" was already effective by tier default — closure adds no delta for it.
    expect(result.deltas.included).toEqual(["dependent"]);
  });

  it("cycle guard: A requires B requires A -> detected and errored, never hangs", () => {
    const catalog = [entry("a", "default", { requires: ["b"] }), entry("b", "default", { requires: ["a"] })];
    const result = resolveSkillSelection({ catalog });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /dependency cycle detected/.test(e))).toBe(true);
  });

  it("dangling requires: a skill.json requires name that doesn't resolve to a real skill is a structured error", () => {
    const catalog = [entry("a", "default", { requires: ["does-not-exist"] })];
    const result = resolveSkillSelection({ catalog });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /requires unknown skill "does-not-exist"/.test(e))).toBe(true);
  });

  it("--exclude-skills of a skill still required by an enabled dependent is blocked, naming the dependent", () => {
    const catalog = [entry("dependent", "default", { requires: ["dep"] }), entry("dep", "default")];
    const result = resolveSkillSelection({ catalog, excluded: ["dep"] });
    expect(result.ok).toBe(false);
    expect(result.blockedExclusions).toEqual(["dep"]);
    expect(result.errors.some((e) => /cannot exclude "dep": still required by dependent/.test(e))).toBe(true);
  });

  it("--exclude-skills of an unshared dependency is allowed once its only dependent is also excluded — no false block", () => {
    // Excluding BOTH the optional dependent (never included in the first place) and attempting to
    // exclude the dependency is fine: the dependency was never forced on, so there's nothing to block.
    const catalog = [entry("dependent", "optional", { requires: ["dep"] }), entry("dep", "default")];
    const result = resolveSkillSelection({ catalog, excluded: ["dep"] });
    expect(result.ok).toBe(true);
    expect(result.effective.has("dep")).toBe(false);
  });

  it("adapter gating: --include-skills of a claude-only skill without claude in --adapters is invalid", () => {
    const catalog = [entry("claude-only", "optional", { supportedAdapters: ["claude"] })];
    const result = resolveSkillSelection({ catalog, included: ["claude-only"], adapters: ["cursor"] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /not supported by the selected adapter/.test(e))).toBe(true);
  });

  it("adapter gating: the same skill is includable once claude IS among the selected adapters", () => {
    const catalog = [entry("claude-only", "optional", { supportedAdapters: ["claude"] })];
    const result = resolveSkillSelection({ catalog, included: ["claude-only"], adapters: ["claude", "cursor"] });
    expect(result.ok).toBe(true);
    expect(result.effective.has("claude-only")).toBe(true);
  });

  it("portable dependencies of a claude-only dependent are eligible under any adapter set", () => {
    const catalog = [
      entry("claude-only-dependent", "optional", { supportedAdapters: ["claude"], requires: ["portable-dep"] }),
      entry("portable-dep", "default", { supportedAdapters: ["claude", "cursor", "copilot"] }),
    ];
    const result = resolveSkillSelection({ catalog, included: ["claude-only-dependent"], adapters: ["claude"] });
    expect(result.ok).toBe(true);
    expect([...result.effective].sort()).toEqual(["claude-only-dependent", "portable-dep"]);
  });

  it("a required-closure dependency that is itself adapter-ineligible is a clear, structured error", () => {
    const catalog = [
      entry("dependent", "default", { supportedAdapters: ["claude", "cursor"], requires: ["dep"] }),
      entry("dep", "default", { supportedAdapters: ["claude"] }),
    ];
    const result = resolveSkillSelection({ catalog, adapters: ["cursor"] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /cannot satisfy dependency: "dependent" requires "dep"/.test(e))).toBe(true);
  });

  it("the mattpocock-style edge, verbatim (decisions.md D21): improve-codebase-architecture -> [codebase-design, grilling, domain-modeling], claude-only", () => {
    const catalog = [
      entry("improve-codebase-architecture", "optional", {
        supportedAdapters: ["claude"],
        requires: ["codebase-design", "grilling", "domain-modeling"],
      }),
      entry("codebase-design", "default"),
      entry("grilling", "default"),
      entry("domain-modeling", "default"),
    ];

    const withoutClaude = resolveSkillSelection({ catalog, included: ["improve-codebase-architecture"], adapters: ["cursor"] });
    expect(withoutClaude.ok).toBe(false);

    const withClaude = resolveSkillSelection({ catalog, included: ["improve-codebase-architecture"], adapters: ["claude"] });
    expect(withClaude.ok).toBe(true);
    expect([...withClaude.effective].sort()).toEqual(
      ["codebase-design", "domain-modeling", "grilling", "improve-codebase-architecture"].sort(),
    );
    expect(withClaude.requiredBy.get("grilling")).toEqual(["improve-codebase-architecture"]);
  });

  it("the grill-me -> grilling edge, verbatim (decisions.md D21): enabling grill-me auto-enables grilling", () => {
    const catalog = [entry("grill-me", "optional", { requires: ["grilling"] }), entry("grilling", "optional")];
    const result = resolveSkillSelection({ catalog, included: ["grill-me"] });
    expect(result.ok).toBe(true);
    expect([...result.effective].sort()).toEqual(["grill-me", "grilling"]);
    expect(result.deltas.included).toEqual(["grill-me", "grilling"]);
  });
});
