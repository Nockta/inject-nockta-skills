import { describe, expect, it } from "vitest";
import { buildWebSchema } from "../src/web/build-web-schema.js";
import { getPacksPath } from "../src/packs/get-pack-path.js";

/**
 * `buildWebSchema` / `--emit-schema` coverage (decisions.md D30) against the REAL bundled packs.
 * Proves the emitted payload is valid, JSON round-trippable, has the expected shape, and that
 * flag pre-seeds are applied.
 */
const packsRoot = getPacksPath();

describe("buildWebSchema (decisions.md D30, --emit-schema contract)", () => {
  it("emits a JSON-round-trippable schema with the expected steps for --type next", () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    // Round-trips through JSON with no loss (the wire-safety guarantee create depends on).
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);

    expect(schema.monorepo).toBe(false);
    expect(schema.repoTypes).toEqual(["next"]);
    const ids = schema.steps.map((s) => s.id);
    expect(ids).toEqual(["repo-type", "adapters", "skills", "razor", "confirm"]);
  });

  it("sections the skills step by pack (Common first) and gives razor its own step", () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const skills = schema.steps.find((s) => s.id === "skills");
    expect(skills?.sections?.map((s) => s.label)).toEqual(["Common", "next"]);
    expect((skills?.choices?.length ?? 0)).toBeGreaterThan(0);

    const razor = schema.steps.find((s) => s.id === "razor");
    expect(razor).toBeDefined();
    expect(razor?.choices?.every((c) => c.pack === "razor")).toBe(true);
  });

  it("required skills render checked + disabled with a reason", () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const skills = schema.steps.find((s) => s.id === "skills");
    const required = skills?.choices?.filter((c) => c.tier === "required") ?? [];
    expect(required.length).toBeGreaterThan(0);
    for (const c of required) {
      expect(c.checked).toBe(true);
      expect(c.disabled).toBe(true);
      expect(c.disabledReason).toBeTruthy();
    }
  });

  it("pre-seeds repo-type + adapter defaults from flags (--web + --yes combo)", () => {
    const { schema } = buildWebSchema({ type: "next", adapters: "claude", packsRoot });
    const repoStep = schema.steps.find((s) => s.id === "repo-type");
    const next = repoStep?.choices?.find((c) => c.value === "next");
    expect(next?.checked).toBe(true);

    const adapters = schema.steps.find((s) => s.id === "adapters");
    const claude = adapters?.choices?.find((c) => c.value === "claude");
    const cursor = adapters?.choices?.find((c) => c.value === "cursor");
    expect(claude?.checked).toBe(true);
    expect(cursor?.checked).toBe(false); // only claude was pre-seeded
  });

  it("the adapters step offers antigravity as an available choice (D35), pre-seedable via --adapters", () => {
    const { schema } = buildWebSchema({ type: "next", adapters: "claude,antigravity", packsRoot });
    const adapters = schema.steps.find((s) => s.id === "adapters");
    const values = adapters?.choices?.map((c) => c.value);
    expect(values).toEqual(["claude", "cursor", "copilot", "agent", "antigravity"]);
    const antigravity = adapters?.choices?.find((c) => c.value === "antigravity");
    expect(antigravity?.disabled).toBe(false);
    expect(antigravity?.checked).toBe(true); // pre-seeded
    expect(antigravity?.title).toMatch(/Antigravity/);
  });

  // Regression (web wizard "phantom grilling" bug): `grill-me` is enablement `default` and
  // `requires: ["grilling"]` (an optional skill). The web schema MUST resolve that dependency lock
  // up front — exactly as the CLI wizard does — so the forced dependency renders LOCKED-ON, not as
  // a bare "Off" toggle the install would silently pull in (the page showed grilling Off while it
  // was installed on every run). See src/wizard/core/build-schema.ts's buildWizardSchema.
  it("a default skill that forces an optional dependency renders it locked-on (grill-me -> grilling)", () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const skills = schema.steps.find((s) => s.id === "skills");
    const grillMe = skills?.choices?.find((c) => c.value === "grill-me");
    const grilling = skills?.choices?.find((c) => c.value === "grilling");
    // grill-me: default, on, still user-toggleable
    expect(grillMe?.tier).toBe("default");
    expect(grillMe?.checked).toBe(true);
    expect(grillMe?.disabled).toBe(false);
    // grilling: optional, but FORCED on and locked because grill-me requires it (mirrors the CLI wizard)
    expect(grilling?.tier).toBe("optional");
    expect(grilling?.checked).toBe(true);
    expect(grilling?.disabled).toBe(true);
    expect(grilling?.disabledReason).toMatch(/needed by grill-me/);
  });

  it("excluding the forcing skill RELEASES the dependency — no stale lock (grill-me off -> grilling free)", () => {
    const { schema } = buildWebSchema({ type: "next", excludeSkills: ["grill-me"], packsRoot });
    const skills = schema.steps.find((s) => s.id === "skills");
    const grillMe = skills?.choices?.find((c) => c.value === "grill-me");
    const grilling = skills?.choices?.find((c) => c.value === "grilling");
    expect(grillMe?.checked).toBe(false);
    // grilling reverts to its optional default (off, toggleable) once nothing forces it
    expect(grilling?.checked).toBe(false);
    expect(grilling?.disabled).toBe(false);
    expect(grilling?.disabledReason).toBeUndefined();
  });

  it("--include-skills pre-checks an optional razor skill", () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const razor = schema.steps.find((s) => s.id === "razor");
    const anOptional = razor?.choices?.find((c) => c.tier === "optional" && !c.disabled);
    expect(anOptional).toBeDefined();
    const name = anOptional!.value;

    const seeded = buildWebSchema({ type: "next", includeSkills: [name], packsRoot }).schema;
    const seededRazor = seeded.steps.find((s) => s.id === "razor");
    expect(seededRazor?.choices?.find((c) => c.value === name)?.checked).toBe(true);
  });
});
