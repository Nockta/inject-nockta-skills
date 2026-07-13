import { describe, expect, it } from "vitest";
import { runWizardController } from "../src/wizard/controller.js";
import type { ControllerContext } from "../src/wizard/controller.js";
import { resolve } from "../src/wizard/core/resolve.js";
import type { Presenter, PresenterResult } from "../src/wizard/view/presenter.js";
import type { StepId, StepModel, WizardAnswers } from "../src/wizard/core/types.js";
import type { SkillCatalogEntry } from "../src/packs/skill-catalog.js";

/**
 * The CONTROLLER (decisions.md D28) — driven through a FAKE Presenter (the View seam), so back-nav,
 * preset-skips (D29), the skill lock/release loop, and the serializable-answers contract are all
 * proven without a real TTY. This is the brief's "test the controller via a fake view" requirement.
 */

const CATALOG: SkillCatalogEntry[] = [
  { pack: "common", skill: "req", enablement: "required", supportedAdapters: ["claude"], requires: [] },
  { pack: "common", skill: "def", enablement: "default", supportedAdapters: ["claude"], requires: [] },
  { pack: "common", skill: "grill-me", enablement: "optional", supportedAdapters: ["claude"], requires: ["grilling"] },
  { pack: "common", skill: "grilling", enablement: "optional", supportedAdapters: ["claude"], requires: [] },
  { pack: "razor", skill: "razor-next", enablement: "optional", supportedAdapters: ["claude"], requires: [], applicability: ["next"] },
];

function baseCtx(overrides: Partial<ControllerContext> = {}): ControllerContext {
  return {
    monorepo: false,
    guesses: [],
    candidates: [],
    buildCatalog: () => CATALOG,
    ...overrides,
  };
}

type StepScript = { kind: "answer"; value: unknown } | { kind: "back" };
const A = (value: unknown): StepScript => ({ kind: "answer", value });
const BACK: StepScript = { kind: "back" };

interface FakePresenter extends Presenter {
  rendered: StepModel[];
  remaining: () => number;
}

function fakePresenter(script: StepScript[]): FakePresenter {
  const queue = [...script];
  const rendered: StepModel[] = [];
  return {
    rendered,
    remaining: () => queue.length,
    clear() {},
    close() {},
    async renderStep(step: StepModel): Promise<PresenterResult> {
      rendered.push(step);
      const next = queue.shift();
      if (!next) throw new Error(`fakePresenter: no more results (rendered "${step.id}")`);
      return next.kind === "back" ? { kind: "back" } : { kind: "answer", value: next.value };
    },
  };
}

async function run(script: StepScript[], ctxOverrides: Partial<ControllerContext> = {}, seed?: Partial<WizardAnswers>, presetSteps: StepId[] = []) {
  const presenter = fakePresenter(script);
  const ctx = baseCtx(ctxOverrides);
  const result = await runWizardController({
    presenter,
    ctx,
    answers: { monorepo: ctx.monorepo, ...seed },
    presetSteps: new Set(presetSteps),
  });
  return { presenter, result };
}

describe("controller: linear single-project completes", () => {
  it("collects repo-type/adapters/skills/razor/confirm into serializable answers", async () => {
    const { result } = await run([
      A(["next"]),
      A(["claude"]),
      A(["req", "def"]), // skills defaults
      A([]), // razor (razor-next applies to next)
      A(true),
    ]);
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.answers.repoTypes).toEqual(["next"]);
    expect(result.answers.adapters).toEqual(["claude"]);
    expect(result.answers.skills).toEqual({ excluded: [], included: [] });
    expect(result.answers.razor).toEqual({ excluded: [], included: [] });
    expect(result.answers.confirmed).toBe(true);
  });
});

describe("controller: presets skip their steps entirely (D29)", () => {
  it("preset repo-type + adapters are neither rendered nor visited", async () => {
    const { presenter, result } = await run(
      [A(["req", "def"]), A([]), A(true)], // only skills, razor, confirm are rendered
      {},
      { repoTypes: ["next"], adapters: ["claude"] },
      ["repo-type", "adapters"],
    );
    expect(result.kind).toBe("completed");
    expect(presenter.rendered.some((s) => s.id === "repo-type")).toBe(false);
    expect(presenter.rendered.some((s) => s.id === "adapters")).toBe(false);
    expect(presenter.rendered.map((s) => s.id)).toEqual(["skills", "razor", "confirm"]);
  });

  it("preset skills + razor skip both skill steps", async () => {
    const { presenter, result } = await run(
      [A(true)], // only confirm
      {},
      { repoTypes: ["next"], adapters: ["claude"], skills: { excluded: [], included: [] }, razor: { excluded: [], included: [] } },
      ["repo-type", "adapters", "skills", "razor"],
    );
    expect(result.kind).toBe("completed");
    expect(presenter.rendered.map((s) => s.id)).toEqual(["confirm"]);
  });
});

describe("controller: back-navigation preserves already-entered answers", () => {
  it("back from adapters re-enters repo-type showing the prior choice, then advances again", async () => {
    const { presenter, result } = await run([
      A(["next"]), // repo-type round 1
      BACK, // adapters -> back
      A(["nest"]), // repo-type round 2 (change)
      A(["claude"]),
      A(["req", "def"]),
      // razor-next applies only to next; repoTypes is now nest -> razor step SKIPPED
      A(true), // confirm
    ]);
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.answers.repoTypes).toEqual(["nest"]);

    const repoRenders = presenter.rendered.filter((s) => s.id === "repo-type");
    expect(repoRenders.length).toBe(2);
    // On re-entry, the prior "next" answer is reflected as checked (state preserved).
    expect(repoRenders[1]!.choices!.find((c) => c.value === "next")?.checked).toBe(true);
    // razor was correctly skipped for nest (razor-next is next-only).
    expect(presenter.rendered.some((s) => s.id === "razor")).toBe(false);
  });
});

describe("controller: skill lock/release loop (D21) drives re-renders View-side", () => {
  it("checking grill-me alone triggers a second skills render with grilling locked+checked", async () => {
    const { presenter, result } = await run([
      A(["next"]),
      A(["claude"]),
      A(["req", "def", "grill-me"]), // round 1: grilling not yet checked
      A(["req", "def", "grill-me", "grilling"]), // round 2: grilling now locked+checked
      A([]), // razor
      A(true),
    ]);
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.answers.skills!.included.sort()).toEqual(["grill-me", "grilling"]);

    const skillRenders = presenter.rendered.filter((s) => s.id === "skills");
    expect(skillRenders.length).toBe(2);
    const grillingRow = skillRenders[1]!.choices!.find((c) => c.value === "grilling")!;
    expect(grillingRow.disabled).toBe(true);
    expect(grillingRow.checked).toBe(true);
    expect(grillingRow.disabledReason).toMatch(/needed by grill-me/);
  });
});

describe("controller: cancellation", () => {
  it("an empty repo-type answer cancels", async () => {
    const { result } = await run([A([])]);
    expect(result.kind).toBe("cancelled");
    if (result.kind !== "cancelled") return;
    expect(result.reason).toMatch(/no project type/);
  });
});

describe("controller: answers object is JSON round-trippable (D28 seam #2)", () => {
  it("JSON.parse(JSON.stringify(answers)) deep-equals answers for a representative run", async () => {
    const { result } = await run([
      A(["next"]),
      A(["claude", "cursor"]),
      A(["req", "def", "grill-me", "grilling"]),
      A(["razor-next"]),
      A(true),
    ]);
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    const answers = result.answers;
    expect(JSON.parse(JSON.stringify(answers))).toEqual(answers);
    // And that plain object drives resolve() straight to a plan (the web flow: POST -> resolve).
    const plan = resolve(JSON.parse(JSON.stringify(answers)));
    expect(plan.type).toBe("next");
    expect(plan.adapters).toBe("claude,cursor");
    expect(plan.includeSkills).toContain("razor-next");
  });
});
