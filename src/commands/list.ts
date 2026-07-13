import pc from "picocolors";
import { listPacks } from "../packs/list-packs.js";
import { evaluatePackContent } from "../packs/resolve-packs.js";
import type { AdapterType } from "../types/adapter.js";
import { ADAPTER_TYPES } from "../types/adapter.js";
import type { JsonResult } from "../types/json-result.js";
import { EXIT_CODES } from "../types/json-result.js";
import type { RepoType } from "../types/repo-type.js";
import { REPO_TYPES } from "../types/repo-type.js";

export interface ListOptions {
  json?: boolean;
  details?: boolean;
}

export interface ListPackEntry {
  name: string;
  displayName: string;
  description: string;
  requires: string[];
  adapters: AdapterType[];
  skills: string[];
  /** D6 gate result (decisions.md D6, spec §5.10): "installable" only when every declared skill has SKILL.md content. */
  status: "installable" | "planned";
  /** Declared skill names still missing SKILL.md content — empty once a pack is installable. */
  missingSkills: string[];
}

export interface ListData {
  /** RepoType union, verbatim — the `create-nockta-repo` D7 contract test compares this. */
  repoTypes: readonly RepoType[];
  /** AdapterType union, verbatim — same contract-test purpose as `repoTypes`. */
  adapterTypes: readonly AdapterType[];
  packs: ListPackEntry[];
}

export type ListResult = JsonResult & { command: "list"; data: ListData };

/**
 * Pure computation of the `list` command result — no process/IO side
 * effects, so it is directly unit-testable independent of stdout/exit.
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §7.8 (List),
 * §7.9 (machine interface), §11 (`src/commands/list.ts`).
 */
export function buildListResult(): ListResult {
  const entries = listPacks();

  const packs: ListPackEntry[] = entries.map((entry) => {
    const { installable, skills } = evaluatePackContent(entry);
    const missingSkills = skills.filter((skill) => !skill.hasContent).map((skill) => skill.name);
    return {
      name: entry.manifest.name,
      displayName: entry.manifest.displayName,
      description: entry.manifest.description,
      requires: entry.manifest.requires,
      adapters: entry.manifest.adapters,
      skills: entry.manifest.skills,
      status: installable ? "installable" : "planned",
      missingSkills,
    };
  });

  const installableCount = packs.filter((pack) => pack.status === "installable").length;
  const plannedCount = packs.length - installableCount;
  const summary =
    `${packs.length} bundled pack${packs.length === 1 ? "" : "s"} ` +
    `(${installableCount} installable, ${plannedCount} planned); ` +
    `${ADAPTER_TYPES.length} adapters, ${REPO_TYPES.length} repo types`;

  return {
    ok: true,
    command: "list",
    exitCode: EXIT_CODES.SUCCESS,
    summary,
    data: { repoTypes: REPO_TYPES, adapterTypes: ADAPTER_TYPES, packs },
  };
}

/** Pure text formatter for human (non-`--json`) `list` output. */
export function formatListHuman(result: ListResult, details: boolean): string {
  const { packs } = result.data;
  const lines: string[] = [];

  lines.push(pc.bold(`Bundled packs (${packs.length})`) + ` — ${result.summary}`);
  lines.push("");

  for (const pack of packs) {
    const badge =
      pack.status === "installable" ? pc.green("✓ installable") : pc.yellow("○ planned");
    lines.push(`  ${badge}  ${pc.bold(pack.name)} — ${pack.displayName}`);
    lines.push(`      ${pack.description}`);
    lines.push(
      `      requires: ${pack.requires.length > 0 ? pack.requires.join(", ") : "(none)"}` +
        `  adapters: ${pack.adapters.join(", ")}`,
    );
    if (details) {
      lines.push(`      skills:`);
      for (const skillName of pack.skills) {
        const has = !pack.missingSkills.includes(skillName);
        const mark = has ? pc.green("✓") : pc.dim("✗ no SKILL.md yet");
        lines.push(`        ${mark} ${skillName}`);
      }
    } else if (pack.status === "planned") {
      lines.push(`      missing content: ${pack.missingSkills.join(", ")}`);
    }
    lines.push("");
  }

  lines.push(pc.bold("Adapters:") + ` ${result.data.adapterTypes.join(", ")}`);
  lines.push(pc.bold("Repo types:") + ` ${result.data.repoTypes.join(", ")}`);
  lines.push("");
  lines.push(
    pc.dim(
      "A pack is only offered once every declared skill has real authored content " +
        "(SKILL.md) on disk. Run with --details for a per-skill breakdown.",
    ),
  );

  return `${lines.join("\n")}\n`;
}

/**
 * `inject-nockta-skills list` — lists bundled packs (installable vs planned
 * per the D6 content gate) and supported adapters/repo types.
 * `list --json` is the contract-test surface `create-nockta-repo` uses to
 * assert RepoType/AdapterType enum parity (decisions.md D7).
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §7.8.
 */
export function runListCommand(options: ListOptions): never {
  const result = buildListResult();

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatListHuman(result, Boolean(options.details)));
  }

  process.exit(result.exitCode);
}
