import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useKeypress,
  useMemo,
  useState,
  type KeypressEvent,
} from "@inquirer/core";
import type { StepModel } from "../core/types.js";
import { buildRows, itemRowIndices, pageCount, renderPaginatedFrame } from "./paginated-frame.js";

/**
 * The custom finite, paginated multi-select prompt (decisions.md D28) — built on `@inquirer/core`
 * primitives (`createPrompt` + `useState`/`useKeypress`/`useMemo`), NOT the stock `checkbox()`.
 * Reused for BOTH the general skill step and the razor step (they differ only by `StepModel`).
 *
 * Keys (D28): ←/→ = discrete PAGE turns (no scroll/wrap); ↑/↓ = move the cursor within the current
 * page (finite — clamps at page ends); space = toggle the item under the cursor; ↵ = confirm; b =
 * go back a step (resolves with the BACK sentinel the Controller understands). Selection is held
 * in a Set ABOVE the page view, so turning pages NEVER loses prior toggles. Locked rows
 * (required/dependency-locked) render disabled and cannot be toggled. All drawing is delegated to
 * the pure `renderPaginatedFrame()` (snapshot-tested headlessly).
 */

export type PaginatedResult = { kind: "answer"; selected: string[] } | { kind: "back" };

export interface PaginatedConfig {
  step: StepModel;
}

/** Explicit annotation so the exported prompt's type is nameable without a transitive `@inquirer/type` reference (TS2742). */
type PromptFn<Value, Config> = (config: Config, context?: unknown) => Promise<Value> & { cancel: () => void };

function isLeftKey(key: KeypressEvent): boolean {
  return key.name === "left";
}
function isRightKey(key: KeypressEvent): boolean {
  return key.name === "right";
}
function isBackKey(key: KeypressEvent): boolean {
  return key.name === "b";
}

const paginatedMultiSelectImpl = createPrompt<PaginatedResult, PaginatedConfig>((config, done) => {
  const step = config.step;
  const pageSize = step.pageSize ?? 10;

  const rows = useMemo(() => buildRows(step.choices ?? [], step.sections), [step]);
  const itemRows = useMemo(() => itemRowIndices(rows), [rows]);
  const total = pageCount(rows.length, pageSize);

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    for (const choice of step.choices ?? []) if (choice.checked) set.add(choice.value);
    return set;
  });
  const [page, setPage] = useState(0);
  const [cursorRowIndex, setCursorRowIndex] = useState(() => itemRows[0] ?? -1);

  const itemsOnPage = (p: number): number[] => {
    const start = p * pageSize;
    const end = start + pageSize;
    return itemRows.filter((i) => i >= start && i < end);
  };

  useKeypress((key) => {
    if (isEnterKey(key)) {
      done({ kind: "answer", selected: [...selected] });
      return;
    }
    if (isBackKey(key)) {
      done({ kind: "back" });
      return;
    }
    if (isUpKey(key)) {
      const onPage = itemsOnPage(page);
      const pos = onPage.indexOf(cursorRowIndex);
      if (pos > 0) setCursorRowIndex(onPage[pos - 1]!);
      return;
    }
    if (isDownKey(key)) {
      const onPage = itemsOnPage(page);
      const pos = onPage.indexOf(cursorRowIndex);
      if (pos >= 0 && pos < onPage.length - 1) setCursorRowIndex(onPage[pos + 1]!);
      return;
    }
    if (isLeftKey(key)) {
      if (page > 0) {
        const np = page - 1;
        setPage(np);
        setCursorRowIndex(itemsOnPage(np)[0] ?? -1);
      }
      return;
    }
    if (isRightKey(key)) {
      if (page < total - 1) {
        const np = page + 1;
        setPage(np);
        setCursorRowIndex(itemsOnPage(np)[0] ?? -1);
      }
      return;
    }
    if (isSpaceKey(key)) {
      const row = rows[cursorRowIndex];
      if (row && row.type === "item" && !row.choice.disabled) {
        const next = new Set(selected);
        if (next.has(row.choice.value)) next.delete(row.choice.value);
        else next.add(row.choice.value);
        setSelected(next);
      }
      return;
    }
  });

  return renderPaginatedFrame({
    title: step.title,
    rows,
    pageSize,
    page,
    cursorRowIndex,
    selected,
    colors: true,
    // Live terminal width for the two-pane layout; falls back to 80 inside the renderer when absent.
    columns: process.stdout.columns,
  });
});

export const paginatedMultiSelect = paginatedMultiSelectImpl as unknown as PromptFn<PaginatedResult, PaginatedConfig>;
