import { describe, expect, it } from "vitest";
import {
  buildAdapterStep,
  buildRazorStep,
  buildRepoTypeStep,
  buildSkillChoiceModels,
  buildSkillSections,
  buildSkillsStep,
  buildWizardSchema,
  packSectionLabel,
} from "../src/wizard/core/build-schema.js";
import { mergeSkillDeltas, resolve, resolveSkillLayerRound } from "../src/wizard/core/resolve.js";
import { offerableEntries, isRazorEntry } from "../src/wizard/core/skill-offering.js";
import { buildRows } from "../src/wizard/view/paginated-frame.js";
import { resolvePacks } from "../src/packs/resolve-packs.js";
import { buildSkillCatalog } from "../src/packs/skill-catalog.js";
import { getPacksPath } from "../src/packs/get-pack-path.js";
import type { SkillCatalogEntry } from "../src/packs/skill-catalog.js";
import type { AdapterType } from "../src/types/adapter.js";
import type { RepoType } from "../src/types/repo-type.js";
import type { WizardAnswers } from "../src/wizard/core/types.js";

/**
 * The wizard-core MODEL (decisions.md D28) — the presenter-agnostic brain. These are the strongest
 * proofs in the rebuild: pure logic, no prompts, no TTY. They cover the three tiers, dependency
 * locks, clash display, razor applicability, the fully serializable schema, and `resolve()` from a
 * plain (JSON-shaped) answers object.
 */

const CLAUDE: AdapterType[] = ["claude"];
const NEXT: RepoType[] = ["next"];

function realCatalog(repoTypes: RepoType[]): SkillCatalogEntry[] {
  const resolved = resolvePacks({ requestedPacks: repoTypes, monorepo: false });
  return buildSkillCatalog(resolved.installable, getPacksPath());
}

describe("wizard-core: buildSkillChoiceModels — tiers, locks, clash, clean labels (no dev-speak)", () => {
  const catalog: SkillCatalogEntry[] = [
    { pack: "common", skill: "req", enablement: "required", supportedAdapters: ["claude"], requires: [] },
    { pack: "common", skill: "def", enablement: "default", supportedAdapters: ["claude"], requires: [] },
    {
      pack: "common",
      skill: "opt",
      enablement: "optional",
      supportedAdapters: ["claude"],
      requires: [],
      description: "An optional thing.",
      clashesWith: ["razor:boundaries-follow-authority", "constraints-are-code"],
    },
  ];

  it("required -> checked + disabled + plain reason; default -> checked, togglable; optional -> unchecked, togglable", () => {
    const rows = buildSkillChoiceModels(catalog, undefined, undefined);
    const req = rows.find((r) => r.value === "req")!;
    const def = rows.find((r) => r.value === "def")!;
    const opt = rows.find((r) => r.value === "opt")!;

    expect(req.checked).toBe(true);
    expect(req.disabled).toBe(true);
    expect(req.disabledReason).toBe("always installed");
    expect(req.tier).toBe("required");

    expect(def.checked).toBe(true);
    expect(def.disabled).toBe(false);

    expect(opt.checked).toBe(false);
    expect(opt.disabled).toBe(false);
  });

  it("labels carry NO dev-speak — just the clean skill name, tier lives in a structured field", () => {
    const rows = buildSkillChoiceModels(catalog, undefined, undefined);
    for (const r of rows) {
      expect(r.label).not.toMatch(/\[(required|default|optional)\]/);
      expect(r.label).not.toMatch(/\(pack:/);
    }
    expect(rows.find((r) => r.value === "req")!.label).toBe("req");
  });

  it("a lock map renders a disabled row with a plain 'needed by' reason", () => {
    const rows = buildSkillChoiceModels(catalog, new Set(["req", "def", "opt"]), new Map([["opt", ["def"]]]));
    const opt = rows.find((r) => r.value === "opt")!;
    expect(opt.disabled).toBe(true);
    expect(opt.disabledReason).toBe("needed by def");
    expect(opt.checked).toBe(true);
  });

  it("clashesWith is exposed as resolved display names (razor: -> '<name> (razor)', bare as-is)", () => {
    const rows = buildSkillChoiceModels(catalog, undefined, undefined);
    const opt = rows.find((r) => r.value === "opt")!;
    expect(opt.clashesWith).toEqual(["boundaries-follow-authority (razor)", "constraints-are-code"]);
    expect(opt.description).toBe("An optional thing.");
  });

  it("packSectionLabel humanizes 'common' and passes stack packs through", () => {
    expect(packSectionLabel("common")).toBe("Common");
    expect(packSectionLabel("shopify-theme")).toBe("shopify-theme");
  });
});

describe("wizard-core: general vs razor split + sections", () => {
  it("buildSkillsStep excludes every razor skill; buildRazorStep is razor-only", () => {
    const catalog = realCatalog(NEXT);
    const skills = buildSkillsStep(catalog, CLAUDE, NEXT);
    const razor = buildRazorStep(catalog, CLAUDE, NEXT);

    expect(skills.choices!.every((c) => c.pack !== "razor")).toBe(true);
    expect(skills.sections!.map((s) => s.pack)).toContain("common");
    expect(razor).not.toBeNull();
    expect(razor!.choices!.length).toBeGreaterThan(0);
    expect(razor!.choices!.every((c) => c.pack === "razor")).toBe(true);
  });

  it("general sections are ordered common-first", () => {
    const catalog = realCatalog(NEXT);
    const sections = buildSkillSections(offerableEntries(catalog, CLAUDE, NEXT).filter((e) => !isRazorEntry(e)));
    expect(sections[0]!.pack).toBe("common");
  });

  it("buildRazorStep returns null when no razor skill applies to the repo type(s)", () => {
    // Restrict a real catalog to non-razor entries -> razor step must be null.
    const catalog = realCatalog(NEXT).filter((e) => !isRazorEntry(e));
    expect(buildRazorStep(catalog, CLAUDE, NEXT)).toBeNull();
  });
});

describe("wizard-core: razor step is sectioned by CATEGORY, not pack (real bundled packs/razor)", () => {
  it("--type next: category sections in the fixed principles-then-domain order, applicability-filtered", () => {
    const catalog = realCatalog(NEXT);
    const razor = buildRazorStep(catalog, CLAUDE, NEXT)!;

    // Every razor choice still carries its REAL pack ("razor") — `pack` is never repurposed as
    // the grouping key; `section` carries the category instead.
    expect(razor.choices!.every((c) => c.pack === "razor")).toBe(true);

    // Fixed spine order: principles first, then the applicable Domain:* sections. `next` doesn't
    // satisfy the razor pack's "data"/"realtime" categories' applicability (nest/shopify-only), or
    // the nestjs/shopify domain categories — so those five are simply omitted, not shown empty.
    expect(razor.sections!.map((s) => s.label)).toEqual([
      "Core",
      "Architecture",
      "Security",
      "Testing",
      "Delivery",
      "Tooling",
      "Domain: React",
      "Domain: Next.js",
    ]);
    expect(razor.sections!.some((s) => s.label === "Domain: Next.js")).toBe(true);
    expect(razor.sections!.some((s) => s.label === "Domain: NestJS")).toBe(false);
    expect(razor.sections!.some((s) => s.label === "Domain: Shopify")).toBe(false);
    expect(razor.sections!.some((s) => s.label === "Data")).toBe(false);
    expect(razor.sections!.some((s) => s.label === "Realtime")).toBe(false);

    // Every section's `key` is the category id; `pack` stays the entries' real pack ("razor").
    for (const section of razor.sections!) {
      expect(section.pack).toBe("razor");
      expect(section.key).toBeTruthy();
    }

    // Every choice's `section` matches ONE of the offered sections' `key` — nothing orphaned.
    const sectionKeys = new Set(razor.sections!.map((s) => s.key));
    for (const choice of razor.choices!) {
      expect(sectionKeys.has(choice.section)).toBe(true);
    }

    // A concrete choice lands in its expected category section.
    const nextOnly = razor.choices!.find((c) => c.value === "caching-is-never-accidental")!;
    expect(nextOnly.section).toBe("nextjs");
  });

  it("--type nest: Domain: NestJS present, Domain: Next.js/React and Domain: Shopify absent; Data/Realtime present", () => {
    const catalog = realCatalog(["nest"]);
    const razor = buildRazorStep(catalog, CLAUDE, ["nest"])!;
    const labels = razor.sections!.map((s) => s.label);
    expect(labels).toContain("Domain: NestJS");
    expect(labels).toContain("Data");
    expect(labels).toContain("Realtime");
    expect(labels).not.toContain("Domain: Next.js");
    expect(labels).not.toContain("Domain: React");
    expect(labels).not.toContain("Domain: Shopify");
  });

  it("the CLI view's row builder groups razor choices under their category headers (not lumped under one pack section)", () => {
    const catalog = realCatalog(NEXT);
    const razor = buildRazorStep(catalog, CLAUDE, NEXT)!;
    const rows = buildRows(razor.choices!, razor.sections!);

    // More than one header row -> genuinely sectioned, not a single flat "razor" bucket.
    expect(rows.filter((r) => r.type === "header").length).toBeGreaterThan(1);
    // Every item row is still present exactly once (no drops, no duplicates from the regrouping).
    expect(rows.filter((r) => r.type === "item").length).toBe(razor.choices!.length);

    // The "Domain: Next.js" header is immediately followed by only next-category items until the
    // next header — proves the header/item interleave is genuinely category-scoped.
    const headerIdx = rows.findIndex((r) => r.type === "header" && r.label === "Domain: Next.js");
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    for (let i = headerIdx + 1; i < rows.length && rows[i]!.type === "item"; i++) {
      const row = rows[i] as { type: "item"; choice: NonNullable<typeof razor.choices>[number] };
      expect(row.choice.section).toBe("nextjs");
    }
  });
});

describe("wizard-core: razor applicability (real bundled packs/razor)", () => {
  it("nest offers a nest-only + a universal razor skill, omits a next-only one", () => {
    const catalog = realCatalog(["nest"]);
    const razor = buildRazorStep(catalog, CLAUDE, ["nest"])!;
    const values = new Set(razor.choices!.map((c) => c.value));
    expect(values.has("authenticate-once-authorize-again")).toBe(true);
    expect(values.has("bounded-diff")).toBe(true);
    expect(values.has("caching-is-never-accidental")).toBe(false);
  });

  it("next offers the next-only razor skill and omits the nest-only one", () => {
    const catalog = realCatalog(NEXT);
    const razor = buildRazorStep(catalog, CLAUDE, NEXT)!;
    const values = new Set(razor.choices!.map((c) => c.value));
    expect(values.has("caching-is-never-accidental")).toBe(true);
    expect(values.has("authenticate-once-authorize-again")).toBe(false);
  });
});

describe("wizard-core: buildWizardSchema — ordered, serializable Model (D28 seam #3)", () => {
  it("single-project: ordered steps [repo-type, adapters, skills, razor, confirm]", () => {
    const catalog = realCatalog(NEXT);
    const schema = buildWizardSchema({ monorepo: false, repoTypes: NEXT, adapters: CLAUDE, catalog });
    expect(schema.steps.map((s) => s.id)).toEqual(["repo-type", "adapters", "skills", "razor", "confirm"]);
  });

  it("monorepo: head step is targets", () => {
    const catalog = realCatalog(NEXT);
    const schema = buildWizardSchema({ monorepo: true, repoTypes: NEXT, adapters: CLAUDE, catalog });
    expect(schema.steps[0]!.id).toBe("targets");
  });

  it("omits the razor step when no razor skill applies", () => {
    const catalog = realCatalog(NEXT).filter((e) => !isRazorEntry(e));
    const schema = buildWizardSchema({ monorepo: false, repoTypes: NEXT, adapters: CLAUDE, catalog });
    expect(schema.steps.some((s) => s.id === "razor")).toBe(false);
  });

  it("round-trips through JSON deep-equal (no Maps/Sets/closures) — the wire payload create fetches", () => {
    const catalog = realCatalog(NEXT);
    const schema = buildWizardSchema({ monorepo: false, repoTypes: NEXT, adapters: CLAUDE, catalog });
    const roundTripped = JSON.parse(JSON.stringify(schema));
    expect(roundTripped).toEqual(schema);
  });

  it("same brain: the schema's skills step deep-equals buildSkillsStep with the resolved dependency locks (the CLI renders from this same object)", () => {
    const catalog = realCatalog(NEXT);
    const schema = buildWizardSchema({ monorepo: false, repoTypes: NEXT, adapters: CLAUDE, catalog });
    const schemaSkills = schema.steps.find((s) => s.id === "skills");
    // buildWizardSchema resolves the general layer's dependency closure up front (so a default skill
    // forcing an optional one via `requires` renders it locked-on) — mirror that here.
    const general = offerableEntries(catalog, CLAUDE, NEXT).filter((e) => !isRazorEntry(e));
    const defaults = new Set(general.filter((e) => e.enablement !== "optional").map((e) => e.skill));
    const round = resolveSkillLayerRound(catalog, CLAUDE, NEXT, general, defaults);
    expect(schemaSkills).toEqual(buildSkillsStep(catalog, CLAUDE, NEXT, round.nextChecked, round.nextLocked));
  });

  it("repo-type + adapter steps carry clean multiselect choices", () => {
    const repoStep = buildRepoTypeStep([{ type: "next", confidence: 0.95, evidence: ["package.json includes next"] }]);
    expect(repoStep.kind).toBe("multiselect");
    expect(repoStep.choices!.find((c) => c.value === "next")?.checked).toBe(true);
    const adapterStep = buildAdapterStep();
    expect(adapterStep.choices!.find((c) => c.value === "claude")?.checked).toBe(true);
  });
});

describe("wizard-core: resolve(answers) -> InstallPlan (D28 seam #4) — from a PLAIN answers object", () => {
  it("single-project: merges general + razor skills into one exclude/include pair", () => {
    // Constructed as literal JSON, exactly as a web page would POST it — not from any prompt.
    const answers: WizardAnswers = {
      monorepo: false,
      repoTypes: ["next"],
      adapters: ["claude", "cursor"],
      skills: { excluded: ["tdd"], included: ["codebase-design"] },
      razor: { excluded: [], included: ["bounded-diff", "caching-is-never-accidental"] },
      confirmed: true,
    };
    const plan = resolve(answers);
    expect(plan.type).toBe("next");
    expect(plan.monorepo).toBeUndefined();
    expect(plan.targets).toBeUndefined();
    expect(plan.adapters).toBe("claude,cursor");
    expect(plan.excludeSkills).toEqual(["tdd"]);
    expect(plan.includeSkills).toEqual(["bounded-diff", "caching-is-never-accidental", "codebase-design"]);
  });

  it("monorepo: yields path:type targets, no `type`", () => {
    const answers: WizardAnswers = {
      monorepo: true,
      targets: [
        { path: "apps/web", types: ["next"] },
        { path: "apps/api", types: ["nest", "vite-react-ts"] },
      ],
      adapters: ["claude"],
      confirmed: true,
    };
    const plan = resolve(answers);
    expect(plan.monorepo).toBe(true);
    expect(plan.targets).toEqual(["apps/web:next", "apps/api:nest+vite-react-ts"]);
    expect(plan.type).toBeUndefined();
  });

  it("resolve output round-trips through JSON (serializable plan)", () => {
    const answers: WizardAnswers = { monorepo: false, repoTypes: ["next"], adapters: ["claude"], confirmed: true };
    const plan = resolve(answers);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("mergeSkillDeltas dedupes + sorts across general and razor", () => {
    expect(
      mergeSkillDeltas({ excluded: ["b", "a"], included: ["y"] }, { excluded: ["a"], included: ["x", "y"] }),
    ).toEqual({ excluded: ["a", "b"], included: ["x", "y"] });
  });
});

describe("wizard-core: resolveSkillLayerRound — the lock/release brain (D21)", () => {
  const catalog: SkillCatalogEntry[] = [
    { pack: "common", skill: "req", enablement: "required", supportedAdapters: ["claude"], requires: [] },
    { pack: "common", skill: "grill-me", enablement: "optional", supportedAdapters: ["claude"], requires: ["grilling"] },
    { pack: "common", skill: "grilling", enablement: "optional", supportedAdapters: ["claude"], requires: [] },
  ];
  const layer = catalog; // whole catalog is the general layer here

  it("checking grill-me pulls grilling into nextChecked + locks it (a second round is needed)", () => {
    const round = resolveSkillLayerRound(catalog, CLAUDE, NEXT, layer, new Set(["req", "grill-me"]));
    expect(round.nextChecked.has("grilling")).toBe(true);
    expect(round.nextLocked.get("grilling")).toEqual(["grill-me"]);
    expect(round.deltas.included).toContain("grilling");
  });

  it("a settled answer (grill-me + grilling both checked) converges — nextChecked equals the answer", () => {
    const answer = new Set(["req", "grill-me", "grilling"]);
    const round = resolveSkillLayerRound(catalog, CLAUDE, NEXT, layer, answer);
    expect(round.nextChecked).toEqual(new Set(["req", "grill-me", "grilling"]));
    expect(round.deltas.included.sort()).toEqual(["grill-me", "grilling"]);
  });

  it("required skills never appear in the deltas", () => {
    const round = resolveSkillLayerRound(catalog, CLAUDE, NEXT, layer, new Set(["req"]));
    expect(round.deltas.included).not.toContain("req");
    expect(round.deltas.excluded).not.toContain("req");
  });
});
