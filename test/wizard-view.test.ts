import { describe, expect, it } from "vitest";
import {
  buildRows,
  itemRowIndices,
  pageCount,
  renderPaginatedFrame,
} from "../src/wizard/view/paginated-frame.js";
import { stripAnsi, truncateToWidth, visibleWidth, wordWrap } from "../src/wizard/view/width.js";
import type { ChoiceModel, SectionModel } from "../src/wizard/core/types.js";

/**
 * The VIEW's PURE render layer (decisions.md D28). The live prompt (`paginated-multiselect.ts`)
 * draws every frame through `renderPaginatedFrame()`, so snapshotting the frame string headlessly
 * gives the interactive prompt SOME automated coverage (finite pagination, sections, markers,
 * locked rows, footer, the two-pane master–detail box) despite the real TTY session being
 * un-drivable in CI. Colors are turned OFF here for deterministic strings; the live prompt turns
 * them on. The 2026-07-11 redesign made the body a STABLE two-pane box (list left, hovered detail
 * right, fixed body height) with a single-column narrow fallback — these tests pin that layout.
 */

function choice(over: Partial<ChoiceModel> & { value: string }): ChoiceModel {
  return { label: over.value, checked: false, disabled: false, ...over };
}

const SECTIONS: SectionModel[] = [
  { pack: "common", label: "Common" },
  { pack: "next", label: "next" },
];

const CHOICES: ChoiceModel[] = [
  choice({ value: "paper-trail", pack: "common", tier: "required", checked: true, disabled: true, disabledReason: "always installed", description: "Files finished knowledge into the docs law so nothing gets lost." }),
  choice({ value: "proof-of-done", pack: "common", tier: "required", checked: true, disabled: true, disabledReason: "always installed", description: "Nothing is reported done until demonstrated with real evidence." }),
  choice({ value: "code-review", pack: "common", tier: "default", checked: true, description: "Reviews the working diff for correctness bugs and cleanups." }),
  choice({ value: "grill-me", pack: "common", tier: "optional", description: "Explores your reasoning with adversarial questions.", clashesWith: ["grilling (razor)"] }),
  choice({ value: "grilling", pack: "common", tier: "optional", description: "Short desc." }),
  choice({ value: "brainstorming", pack: "common", tier: "default", checked: true, description: "Generates a wide spread of options before you converge." }),
  choice({ value: "diagnosing-bugs", pack: "common", tier: "default", checked: true, description: "A disciplined root-cause pass for gnarly bugs." }),
  choice({ value: "writing-plans", pack: "common", tier: "default", checked: true, description: "Turns a vague ask into a staged plan." }),
  choice({ value: "react-best-practices", pack: "next", tier: "default", checked: true, description: "React patterns." }),
  choice({ value: "nextjs-app-router-patterns", pack: "next", tier: "default", checked: true, description: "App-router conventions." }),
  choice({ value: "composition-patterns", pack: "next", tier: "optional", description: "Composition." }),
  choice({ value: "server-components-first", pack: "next", tier: "optional", description: "RSC first." }),
];

describe("view: row layout + finite pagination", () => {
  it("buildRows interleaves a header before each pack's items", () => {
    const rows = buildRows(CHOICES, SECTIONS);
    expect(rows[0]).toEqual({ type: "header", label: "Common" });
    // 2 headers + 12 items.
    expect(rows.filter((r) => r.type === "header").length).toBe(2);
    expect(rows.filter((r) => r.type === "item").length).toBe(12);
  });

  it("itemRowIndices skips header rows (the cursor only lands on items)", () => {
    const rows = buildRows(CHOICES, SECTIONS);
    const items = itemRowIndices(rows);
    expect(items).not.toContain(0); // row 0 is the "Common" header
    expect(items.length).toBe(12);
  });

  it("pageCount is finite (ceil), never wraps", () => {
    expect(pageCount(14, 10)).toBe(2);
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
  });
});

describe("view: buildRows groups by the generic `section`/`key` pair, NOT a one-section-per-pack assumption", () => {
  // Every choice here shares the SAME real pack ("razor") — like every razor skill does — but is
  // sectioned by a distinct `section` (category) value. If `buildRows` still matched on `pack`
  // alone this would collapse to one bucket; it must not.
  const RAZOR_SECTIONS: SectionModel[] = [
    { pack: "razor", key: "core", label: "Core" },
    { pack: "razor", key: "nextjs", label: "Domain: Next.js" },
  ];
  const RAZOR_CHOICES: ChoiceModel[] = [
    choice({ value: "boundaries-follow-authority", pack: "razor", section: "core", description: "Core principle." }),
    choice({ value: "abstractions-pay-rent", pack: "razor", section: "core", description: "Core principle." }),
    choice({ value: "caching-is-never-accidental", pack: "razor", section: "nextjs", description: "Next.js domain principle." }),
  ];

  it("interleaves a header per CATEGORY (key), each followed only by that category's items — not one lumped pack section", () => {
    const rows = buildRows(RAZOR_CHOICES, RAZOR_SECTIONS);
    expect(rows.map((r) => (r.type === "header" ? `H:${r.label}` : `I:${r.choice.value}`))).toEqual([
      "H:Core",
      "I:boundaries-follow-authority",
      "I:abstractions-pay-rent",
      "H:Domain: Next.js",
      "I:caching-is-never-accidental",
    ]);
  });

  it("every choice still reports its real `pack` ('razor') even though grouping used `section`", () => {
    const rows = buildRows(RAZOR_CHOICES, RAZOR_SECTIONS);
    for (const row of rows) {
      if (row.type === "item") expect(row.choice.pack).toBe("razor");
    }
  });
});

describe("view: ANSI-aware width primitives", () => {
  it("visibleWidth ignores color escapes and counts wide glyphs as 2", () => {
    expect(visibleWidth("\x1b[32m◉\x1b[39m")).toBe(1); // color codes are zero-width
    expect(visibleWidth("🔒")).toBe(2); // emoji padlock is a double-width cell
    expect(visibleWidth("◉")).toBe(1);
    expect(visibleWidth("○")).toBe(1);
    expect(visibleWidth("❯")).toBe(1);
  });

  it("stripAnsi removes SGR sequences", () => {
    expect(stripAnsi("\x1b[1m\x1b[36mhi\x1b[39m\x1b[22m")).toBe("hi");
  });

  it("truncateToWidth clamps to cells and appends an ellipsis on overflow", () => {
    expect(truncateToWidth("hello", 10)).toBe("hello");
    expect(visibleWidth(truncateToWidth("hello world", 6))).toBeLessThanOrEqual(6);
    expect(truncateToWidth("hello world", 6).endsWith("…")).toBe(true);
  });

  it("wordWrap breaks on word boundaries, never past the width", () => {
    const lines = wordWrap("the quick brown fox jumps", 10);
    for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(10);
    expect(lines.join(" ")).toBe("the quick brown fox jumps"); // no words lost, none split
  });

  it("wordWrap hard-splits a single word longer than the width", () => {
    const lines = wordWrap("supercalifragilistic", 8);
    for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(8);
    expect(lines.join("")).toBe("supercalifragilistic");
  });
});

describe("view: renderPaginatedFrame two-pane (colors off, deterministic)", () => {
  const rows = buildRows(CHOICES, SECTIONS);

  it("page 1 shows title, section header, markers, cursor pointer, a locked NAME-ONLY row, divider, and footer", () => {
    const frame = renderPaginatedFrame({
      title: "Choose the skills to install",
      rows,
      pageSize: 10,
      page: 0,
      cursorRowIndex: 3, // "code-review"
      selected: new Set(["paper-trail", "proof-of-done", "code-review", "brainstorming", "diagnosing-bugs", "writing-plans"]),
      colors: false,
      columns: 100,
    });

    expect(frame).toContain("? Choose the skills to install");
    expect(frame).toContain("── Common ──");
    expect(frame).toContain("◉ "); // a selected marker
    expect(frame).toContain("○ "); // an unselected marker (grill-me)
    expect(frame).toContain("❯"); // the cursor pointer
    expect(frame).toContain("│"); // the two-pane divider
    // Left pane is NAME ONLY now — the lock reason is no longer inline in the row.
    expect(frame).toContain("🔒 paper-trail");
    expect(frame).not.toContain("🔒 paper-trail — always installed");
    expect(frame).toContain("Page 1/2");
    expect(frame).toContain("space toggle · ←/→ page");
    // Finite: the "next" pack's items are on page 2, NOT shown on page 1.
    expect(frame).not.toContain("react-best-practices");
  });

  it("the divider column is straight — every body row's pre-divider width is identical", () => {
    const frame = renderPaginatedFrame({
      title: "Choose the skills to install",
      rows,
      pageSize: 10,
      page: 0,
      cursorRowIndex: 3,
      selected: new Set(["code-review"]),
      colors: false,
      columns: 100,
    });
    const bodyLines = frame.split("\n").filter((l) => l.includes("│"));
    expect(bodyLines.length).toBe(10); // fixed body height = pageSize
    const prefixWidths = bodyLines.map((l) => visibleWidth(l.slice(0, l.indexOf("│"))));
    // All dividers sit in the same column → alignment is not ragged.
    expect(new Set(prefixWidths).size).toBe(1);
  });

  it("the right pane shows the HOVERED item's detail (name + word-wrapped description)", () => {
    const frame = renderPaginatedFrame({
      title: "t",
      rows,
      pageSize: 10,
      page: 0,
      cursorRowIndex: 7, // "diagnosing-bugs" (rows: 0 hdr,1 paper-trail…6 brainstorming,7 diagnosing-bugs)
      selected: new Set(),
      colors: false,
      columns: 100,
    });
    // Detail pane carries the hovered item's own description.
    expect(frame).toContain("A disciplined root-cause pass for gnarly bugs.");
    // No line runs past the terminal edge.
    for (const line of frame.split("\n")) expect(visibleWidth(line)).toBeLessThanOrEqual(100);
  });

  it("a hovered item WITH a clash shows the overlaps line; one WITHOUT does not", () => {
    const withClash = renderPaginatedFrame({
      title: "t", rows, pageSize: 10, page: 0, cursorRowIndex: 4, // grill-me (clashesWith grilling)
      selected: new Set(), colors: false, columns: 100,
    });
    // The clash sentence word-wraps across the detail pane, so assert its (unbroken) head.
    expect(withClash).toContain("overlaps with grilling (razor)");
    expect(withClash).toContain("discretion");

    const noClash = renderPaginatedFrame({
      title: "t", rows, pageSize: 10, page: 0, cursorRowIndex: 3, // code-review (no clash)
      selected: new Set(), colors: false, columns: 100,
    });
    expect(noClash).not.toContain("overlaps with");
  });

  it("a hovered LOCKED row shows its lock reason in the detail pane (moved out of the list row)", () => {
    const frame = renderPaginatedFrame({
      title: "t", rows, pageSize: 10, page: 0, cursorRowIndex: 1, // paper-trail (locked)
      selected: new Set(["paper-trail"]), colors: false, columns: 100,
    });
    expect(frame).toContain("🔒 always installed");
  });

  it("a very long description TRUNCATES with an ellipsis rather than growing the box", () => {
    const long = "A disciplined root-cause pass for gnarly bugs that resist the obvious fix and need a hypothesis-driven hunt across the whole system, forming and killing hypotheses one at a time until the true cause is cornered.";
    // 4 rows at pageSize 4 → body window is 4 lines; the long hovered detail must clip to it.
    const four = buildRows([
      choice({ value: "a", label: "diagnosing-bugs", description: long }),
      choice({ value: "b", label: "b" }),
      choice({ value: "c", label: "c" }),
      choice({ value: "d", label: "d" }),
    ], undefined);
    const frame = renderPaginatedFrame({
      title: "t", rows: four, pageSize: 4, page: 0, cursorRowIndex: 0,
      selected: new Set(), colors: false, columns: 100,
    });
    expect(frame).toContain("…");
    // Body height stays fixed at the page window regardless of description length.
    expect(frame.split("\n").filter((l) => l.includes("│")).length).toBe(4);
  });

  it("page 2 shows the remaining items and the 2/2 indicator (discrete page turn, no wrap)", () => {
    const frame = renderPaginatedFrame({
      title: "Choose the skills to install",
      rows,
      pageSize: 10,
      page: 1,
      cursorRowIndex: 11,
      selected: new Set(["react-best-practices"]),
      colors: false,
      columns: 100,
    });
    expect(frame).toContain("Page 2/2");
    expect(frame).toContain("react-best-practices");
    // Page-1 content is not repeated (no wrap-around scroll).
    expect(frame).not.toContain("paper-trail");
  });
});

describe("view: renderPaginatedFrame narrow fallback + defaults", () => {
  const rows = buildRows(CHOICES, SECTIONS);

  it("below the two-pane threshold, falls back to a single column (no divider) with the list + a truncated detail block", () => {
    const frame = renderPaginatedFrame({
      title: "Choose the skills to install",
      rows, pageSize: 10, page: 0, cursorRowIndex: 4, // grill-me
      selected: new Set(), colors: false, columns: 60,
    });
    expect(frame).not.toContain("│"); // single column — no two-pane divider
    expect(frame).toContain("── Common ──");
    expect(frame).toContain("grill-me");
    // Hovered detail is stacked beneath, truncated to one line — no per-keystroke reflow.
    expect(frame).toContain("Explores your reasoning");
    for (const line of frame.split("\n")) expect(visibleWidth(line)).toBeLessThanOrEqual(60);
  });

  it("undefined columns defaults to 80 (two-pane) and never crashes", () => {
    const frame = renderPaginatedFrame({
      title: "t", rows, pageSize: 10, page: 0, cursorRowIndex: 3,
      selected: new Set(), colors: false, // columns omitted
    });
    expect(frame).toContain("│");
    for (const line of frame.split("\n")) expect(visibleWidth(line)).toBeLessThanOrEqual(80);
  });

  it("a tiny terminal still renders without garbling or overflowing", () => {
    const frame = renderPaginatedFrame({
      title: "t", rows, pageSize: 10, page: 0, cursorRowIndex: 3,
      selected: new Set(), colors: false, columns: 20,
    });
    for (const line of frame.split("\n")) expect(visibleWidth(line)).toBeLessThanOrEqual(20);
    expect(frame).toContain("code-review".slice(0, 3)); // at least the start of a name survives
  });

  it("colors:true renders the same content (ANSI applied only when the terminal supports color)", () => {
    const colored = renderPaginatedFrame({
      title: "t", rows, pageSize: 10, page: 0, cursorRowIndex: 3,
      selected: new Set(["code-review"]), colors: true, columns: 100,
    });
    expect(colored).toContain("Page 1/2");
    expect(stripAnsi(colored)).toContain("code-review");
  });
});
