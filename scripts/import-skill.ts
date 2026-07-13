#!/usr/bin/env tsx
/**
 * Dev-time pack importer (spec §12 "Import hygiene", decisions.md D8, D19, D21, D26).
 *
 * Copies gathered skill folders into `packs/<pack>/skills/<skill>/`, stripping only known
 * authoring clutter, and authors a `skill.json` alongside each. Not part of the published CLI
 * (`dist/`) — this runs at author-time only, invoked via a package script (`pnpm import-skill` /
 * `pnpm import-common-skills`).
 *
 * Blocklist, not allowlist (revised this pass — decisions.md D8's real intent is "strip clutter,
 * preserve the skill's actual content", not an artificial file-type allowlist that silently
 * dropped legitimate companion files and scripts). Everything in the gathered source folder is
 * copied EXCEPT these known-clutter names, matched anywhere in the tree —
 *   - `dist/`, `research/`, `notes/`, `.git/`, `node_modules/`   (directories, skipped whole)
 *   - `manifest.json`, `PROVENANCE.md`, `VALIDATION.json`, `README-PORTABLE.md`,
 *     `AGENTS-SNIPPET.md`, `.DS_Store`                            (files)
 *   - `*.zip`                                                     (files, by extension)
 * Everything else survives: `SKILL.md` (required), `worker.md` (root-level; OR mapped to
 * `agents/<name>.md` when `workerAsAgent` is set — see below), every companion `*.md` at any
 * level, `references/` or `references.md`, `examples/**`, `agents/**`, `scripts/**` (skills that
 * ship a validator, e.g. the heavy Shopify/Hydrogen skills' `scripts/validate.mjs`, need this),
 * and `assets/**` (vendored type trees, plaintext and/or `.gz`). Stripped top-level entries are
 * reported in `strippedTopLevel`, never copied.
 *
 * License-bearing files (`LICENSE*`, `NOTICE*`, `COPYING*`, case-insensitive) are NEVER stripped
 * — an upstream third-party skill's license/attribution is a redistribution requirement, not
 * authoring clutter (RED-2 guard, packs-redistribution-audit.md 2026-07-13). This allowlist
 * overrides the blocklist unconditionally (see `LICENSE_BEARING_FILE` / `isBlockedFile`).
 * NOTE: repo-root LICENSE files that lived OUTSIDE the gathered skill subdir were never copied at
 * gather time, so most bundled skills have no in-tree LICENSE; their attribution is instead
 * carried by the root `THIRD-PARTY-LICENSES.md`. This guard ensures any license file that *is*
 * present in a gathered skill (e.g. `webapp-testing/LICENSE.txt`) ships with it, and that future
 * re-imports never regress by stripping one.
 *
 * Special mapping (decisions.md D8): a skill whose gathered folder has a root-level `worker.md`
 * that is actually an *agent definition* (not the skill's own worker-doc) is imported with
 * `workerAsAgent: "<agent-name>"`, which places it at `agents/<agent-name>.md` in the destination
 * instead of top-level `worker.md`, and marks `skill.json`'s `outputs.claude.agents` true.
 * `subagent-delegation` is the current real example: its root `worker.md` is the Claude subagent
 * definition that gets registered into `.claude/agents/`.
 *
 * CURATION-AWARE MODE (decisions.md D26, this pass): `importPackByCuration(pack)` reads
 * `planned skills/curation-decisions.json` `packs[<pack>]` and imports every skill whose tier !=
 * "drop", authoring skill.json with: `enablement` from tier ("required"/"default"/"optional"),
 * `description` scraped verbatim from the skill's own SKILL.md YAML frontmatter, `clashesWith`
 * from `planned skills/clash-map.json` (bare skill id lookup — clash-map keys/values for pack
 * skills are already bare, `razor:`-prefixed values are kept as-is since they name the
 * not-yet-imported Razor layer), and `requires` derived by inverting curation-decisions'
 * `requiredBy` fields. `supportedAdapters` defaults to all adapters except
 * `improve-codebase-architecture`, which stays FULL-injection-only (`["claude", "antigravity"]`,
 * D21/D35 — its subagent/HTML-report machinery has no portable prose form for the text-only
 * cursor/copilot/agent surfaces, but antigravity's full per-skill dir injection carries it). CLI:
 * `import-skill --curate <pack>`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTER_TYPES, type AdapterType } from "../src/types/adapter.js";
import { getPacksPath } from "../src/packs/get-pack-path.js";
import { isRepoType, type RepoType } from "../src/types/repo-type.js";
import type { SkillEnablement, SkillManifest, SkillOutputs } from "../src/types/pack.js";

export interface ImportSkillOptions {
  /** Absolute path to the gathered skill source folder. */
  sourceDir: string;
  /** Absolute path to the destination skill folder: packs/<pack>/skills/<skill>. */
  destDir: string;
  /** Skill name written into skill.json and used in log output. */
  skillName: string;
  /** Adapters this skill supports (skill.json `supportedAdapters`). Default: `["claude"]`. */
  supportedAdapters?: AdapterType[];
  /**
   * If set, a root-level `worker.md` in the source is imported as
   * `agents/<workerAsAgent>.md` instead of top-level `worker.md`, and
   * `skill.json`'s `outputs.claude.agents` is set `true` (D8 special
   * mapping — see module docstring).
   */
  workerAsAgent?: string;
  /** Three-tier selection (decisions.md D19). Default: `"default"`. */
  enablement?: SkillEnablement;
  /** One-line/short description (decisions.md D26). Usually scraped from SKILL.md frontmatter. */
  description?: string;
  /** Advisory same-ground-overlap refs (decisions.md D26). Omitted from skill.json when empty. */
  clashesWith?: string[];
  /** Hard skill-to-skill dependencies (decisions.md D21). Omitted from skill.json when empty. */
  requires?: string[];
  /**
   * Repo types this skill is offered for (decisions.md D26, razor layer). Written into
   * `skill.json`'s `applicability` field (see `types/pack.ts`). Omitted when empty/absent —
   * every pre-razor skill needs zero migration.
   */
  applicability?: RepoType[];
  /**
   * Razor-layer metadata (decisions.md D26 per-category applicability table: core, architecture,
   * security, testing, delivery, tooling, data, realtime, nestjs, nextjs, shopify, react) — the
   * source category directory a razor skill was imported from. Written into `skill.json` as a
   * plain pass-through field: it is NOT part of the core `SkillManifest` type (only `applicability`
   * is, per decisions.md D26's Part A scope — `category` is razor-only presentational metadata for
   * the future wizard grouping, not something the resolver/selection engine reads today) — see
   * `importSkill()`'s JSON-write step for how it merges in alongside the typed manifest fields.
   */
  category?: string;
}

export interface ImportSkillResult {
  skillName: string;
  destDir: string;
  skillJsonPath: string;
  /** Dest-relative paths actually written. */
  copied: string[];
  /** Top-level source entries that were NOT imported (report only — proves stripping). */
  strippedTopLevel: string[];
}

/** Directory names stripped wherever they occur in a gathered skill source tree (blocklist). */
const BLOCKED_DIR_NAMES = new Set(["dist", "research", "notes", ".git", "node_modules"]);

/** File names stripped wherever they occur in a gathered skill source tree (blocklist). */
const BLOCKED_FILE_NAMES = new Set(["manifest.json", "PROVENANCE.md", "VALIDATION.json", "README-PORTABLE.md", "AGENTS-SNIPPET.md", ".DS_Store"]);

/**
 * License-bearing filenames that must ALWAYS ship with a redistributed skill (RED-2 guard,
 * packs-redistribution-audit.md 2026-07-13). A bundled third-party MIT/Apache skill's
 * `LICENSE`/`NOTICE`/`COPYING` is a redistribution *requirement*, not authoring clutter —
 * stripping it breaks the upstream license. Matched case-insensitively by prefix so
 * `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `LICENCE`, `NOTICE`, `NOTICE.txt`, `COPYING`,
 * and `COPYING.LESSER` all survive. This allowlist takes precedence over `BLOCKED_FILE_NAMES`
 * (see `isBlockedFile`), so even a future edit that mistakenly blocklists a license filename
 * cannot strip attribution.
 */
const LICENSE_BEARING_FILE = /^(LICEN[CS]E|NOTICE|COPYING)/i;

function isLicenseBearingFile(name: string): boolean {
  return LICENSE_BEARING_FILE.test(name);
}

function isBlockedFile(name: string): boolean {
  if (isLicenseBearingFile(name)) return false; // never strip license/attribution files (RED-2 guard)
  return BLOCKED_FILE_NAMES.has(name) || name.endsWith(".zip");
}

function relativeTo(root: string, target: string): string {
  return target.slice(root.length + 1).split("\\").join("/");
}

/**
 * Copies everything under `srcDir` into `destDir` EXCEPT the blocklisted clutter above (D8
 * revised intent — blocklist, not allowlist). The blocklist is checked ONLY at the top level of
 * the gathered skill folder — these names denote known *authoring-scratch* artifacts a skill
 * author's working directory accumulates (a stray `dist/` build, a `research/` scratch dir, a
 * `manifest.json`), not something a skill legitimately nests inside its own real content. Once
 * inside a kept top-level directory (`examples/`, `agents/`, `scripts/`, `assets/`, ...) every
 * file copies through unfiltered, so a skill's own example fixture that happens to be named
 * `manifest.json` or a nested `dist/` example folder is never mistaken for clutter. At the root
 * call (`isRoot: true`), `SKILL.md` and `worker.md` are skipped here because the caller
 * (`importSkill`) already handles them specially (required-file copy / `workerAsAgent` mapping);
 * blocked top-level entries are recorded into `strippedTopLevel` for the import report.
 */
function copyPrunedTree(
  srcDir: string,
  destDir: string,
  copied: string[],
  destRoot: string,
  isRoot: boolean,
  strippedTopLevel: string[],
): void {
  if (!existsSync(srcDir)) return;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const name = entry.name;
    if (isRoot && (name === "SKILL.md" || name === "worker.md")) continue; // handled by importSkill

    const srcPath = join(srcDir, name);

    if (entry.isDirectory()) {
      if (isRoot && BLOCKED_DIR_NAMES.has(name)) {
        strippedTopLevel.push(name);
        continue;
      }
      const destPath = join(destDir, name);
      mkdirSync(destPath, { recursive: true });
      copyPrunedTree(srcPath, destPath, copied, destRoot, false, strippedTopLevel);
    } else if (entry.isFile()) {
      if (isRoot && isBlockedFile(name)) {
        strippedTopLevel.push(name);
        continue;
      }
      const destPath = join(destDir, name);
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
      copied.push(relativeTo(destRoot, destPath));
    }
  }
}

/**
 * Builds the `outputs` map matching the established D8/D23/D26 convention (observed in the 3
 * owner common skills' hand-authored skill.json before this pass, now generated identically):
 * unsupported adapters get `false`; `claude` gets `{skills:true}` plus `agents:true` when the
 * skill bundles an agent artifact; the `agent` adapter always states `agents:false` explicitly
 * (no AGENTS.md agent-registration surface exists, D24); `cursor`/`copilot` state `agents:false`
 * explicitly ONLY when the skill has an agent artifact (making the claude-only restriction of
 * that artifact visible), otherwise they carry just `{skills:true}`.
 */
function buildOutputs(supportedAdapters: AdapterType[], hasAgentsOutput: boolean): SkillOutputs {
  const outputs: SkillOutputs = {};
  for (const adapter of ADAPTER_TYPES) {
    if (!supportedAdapters.includes(adapter)) {
      outputs[adapter] = false;
      continue;
    }
    if (adapter === "claude") {
      outputs.claude = { skills: true, ...(hasAgentsOutput ? { agents: true } : {}) };
    } else if (adapter === "agent") {
      outputs.agent = { skills: true, agents: false };
    } else {
      outputs[adapter] = hasAgentsOutput ? { skills: true, agents: false } : { skills: true };
    }
  }
  return outputs;
}

/**
 * Imports one gathered skill folder into `destDir`, applying the D8
 * stripping rules, and authors `destDir/skill.json`. Idempotent: `destDir`
 * is wiped and rebuilt from `sourceDir` each run (bundled `packs/` content
 * is package-owned generated output, not user data — safe to rebuild).
 */
export function importSkill(opts: ImportSkillOptions): ImportSkillResult {
  const { sourceDir, destDir, skillName } = opts;
  const supportedAdapters = opts.supportedAdapters ?? (["claude"] as AdapterType[]);

  const skillMdSource = join(sourceDir, "SKILL.md");
  if (!existsSync(skillMdSource)) {
    throw new Error(`import-skill: ${sourceDir} has no SKILL.md (required, spec §12)`);
  }

  // Idempotent rebuild: wipe any previous import output for this skill.
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });

  const copied: string[] = [];
  const strippedTopLevel: string[] = [];
  let hasAgentsOutput = false;

  // Required.
  copyFileSync(skillMdSource, join(destDir, "SKILL.md"));
  copied.push("SKILL.md");

  // Root-level worker.md gets the D8 special mapping (or a plain top-level copy); every other
  // entry — including a root-level `agents/` dir — is handled by the generic blocklist-pruned
  // recursive copy below.
  const workerMdSource = join(sourceDir, "worker.md");
  if (existsSync(workerMdSource)) {
    if (opts.workerAsAgent) {
      const agentDest = join(destDir, "agents", `${opts.workerAsAgent}.md`);
      mkdirSync(dirname(agentDest), { recursive: true });
      copyFileSync(workerMdSource, agentDest);
      copied.push(relativeTo(destDir, agentDest));
      hasAgentsOutput = true;
    } else {
      copyFileSync(workerMdSource, join(destDir, "worker.md"));
      copied.push("worker.md");
    }
  }

  copyPrunedTree(sourceDir, destDir, copied, destDir, true, strippedTopLevel);
  // Only a *.md file under agents/ counts as a genuine Claude subagent artifact (spec §8.2
  // "agents/*.md", matching this module's D8 special-mapping case above and the claude renderer's
  // own collectAgentFiles doc comment). A non-.md companion file that happens to live in a
  // directory literally named agents/ — e.g. an unrelated per-skill "openai.yaml" platform
  // metadata file some gathered skills ship — is NOT a Claude subagent: flagging it as one would
  // set outputs.claude.agents:true and make the claude renderer promote it into the SHARED,
  // non-namespaced `.claude/agents/<basename>` output, where same-named files from unrelated
  // skills collide and silently clobber each other (surfaced as `doctor` "stale", observed across
  // the 25 non-md agents/ companions in the react-native/expo packs).
  if (!hasAgentsOutput && copied.some((path) => path.startsWith("agents/") && path.endsWith(".md"))) {
    hasAgentsOutput = true;
  }

  const outputs = buildOutputs(supportedAdapters, hasAgentsOutput);

  const skillManifest: SkillManifest = {
    name: skillName,
    supportedAdapters,
    outputs,
    // decisions.md D19 — absent field == "default"; caller overrides for required/optional tiers.
    enablement: opts.enablement ?? "default",
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.clashesWith && opts.clashesWith.length > 0 ? { clashesWith: opts.clashesWith } : {}),
    ...(opts.requires && opts.requires.length > 0 ? { requires: opts.requires } : {}),
    ...(opts.applicability && opts.applicability.length > 0 ? { applicability: opts.applicability } : {}),
  };

  // `category` (razor layer only) is deliberately NOT part of the typed `SkillManifest` shape
  // (see `ImportSkillOptions.category`'s doc comment) — merged in as a plain pass-through field
  // at the JSON-write boundary so the core resolver/type stays untouched by this presentational
  // metadata while it still lands on disk in every razor skill's skill.json.
  const skillJsonOutput: Record<string, unknown> = opts.category
    ? { ...skillManifest, category: opts.category }
    : (skillManifest as unknown as Record<string, unknown>);

  const skillJsonPath = join(destDir, "skill.json");
  writeFileSync(skillJsonPath, `${JSON.stringify(skillJsonOutput, null, 2)}\n`, "utf8");

  return { skillName, destDir, skillJsonPath, copied: copied.sort(), strippedTopLevel: strippedTopLevel.sort() };
}

// ---- Curation-aware batch mode (decisions.md D26) --------------------

/** Shape of one `packs[<pack>][<skill>]` entry in `planned skills/curation-decisions.json`. */
interface CurationSkillEntry {
  tier: "required" | "default" | "optional" | "drop";
  requiredBy?: string[];
}

interface CurationDecisions {
  packs: Record<string, Record<string, CurationSkillEntry>>;
}

/** Shape of one entry in `planned skills/clash-map.json`. */
interface ClashMapEntry {
  clashesWith: string[];
}

type ClashMap = Record<string, ClashMapEntry>;

/**
 * Skills whose curated `supportedAdapters` deviates from the all-four default (decisions.md D21:
 * `improve-codebase-architecture` is pure subagent-spawning + HTML-report machinery, no portable
 * prose form — Claude-only).
 */
const CURATED_ADAPTER_OVERRIDES: Record<string, AdapterType[]> = {
  // D35: antigravity is the full-injection peer of claude — this HTML-report/subagent skill needs
  // full per-skill dir injection, which only claude AND antigravity provide (not the text-only
  // cursor/copilot/agent surfaces). So it stays off those three but IS offered to antigravity.
  "improve-codebase-architecture": ["claude", "antigravity"],
};

/** Skills whose root `worker.md` is an agent definition, not a plain skill worker-doc (D8). */
const CURATED_WORKER_AS_AGENT: Record<string, string> = {
  "subagent-delegation": "worker",
};

/**
 * Scrapes the `description:` value out of a skill's SKILL.md YAML frontmatter. Handles the three
 * styles present in the gathered common-pack sources: a folded block scalar (`description: >-`
 * followed by indented continuation lines, folded to one space-joined line), a quoted inline
 * scalar (`description: "..."`), and a plain inline scalar. Returns `undefined` when the file has
 * no frontmatter or no `description` key — callers decide whether that's fatal.
 */
export function extractDescriptionFromSkillMd(skillMdPath: string): string | undefined {
  const content = readFileSync(skillMdPath, "utf8");
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return undefined;

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return undefined;

  const frontmatter = lines.slice(1, closeIdx);
  const descLineIdx = frontmatter.findIndex((line) => /^description:\s*/.test(line));
  if (descLineIdx === -1) return undefined;

  const inline = frontmatter[descLineIdx]!.replace(/^description:\s*/, "").trim();

  // Block scalar indicator (folded ">-"/">"/literal "|-"/"|" etc.) — collect indented
  // continuation lines and fold them into one space-joined string.
  if (inline === "" || /^[|>][-+]?\d*$/.test(inline)) {
    const continuation: string[] = [];
    for (let i = descLineIdx + 1; i < frontmatter.length; i++) {
      const line = frontmatter[i]!;
      if (line.trim() === "" ) continue;
      if (!/^\s/.test(line)) break; // dedented -> next top-level key
      continuation.push(line.trim());
    }
    return continuation.join(" ").trim();
  }

  // Quoted inline scalar.
  if (
    (inline.startsWith('"') && inline.endsWith('"') && inline.length >= 2) ||
    (inline.startsWith("'") && inline.endsWith("'") && inline.length >= 2)
  ) {
    return inline.slice(1, -1);
  }

  // Plain inline scalar.
  return inline;
}

function invertRequiredBy(packEntries: Record<string, CurationSkillEntry>): Record<string, string[]> {
  const requiresMap: Record<string, string[]> = {};
  for (const [skillName, entry] of Object.entries(packEntries)) {
    for (const dependent of entry.requiredBy ?? []) {
      (requiresMap[dependent] ??= []).push(skillName);
    }
  }
  return requiresMap;
}

export interface ImportPackByCurationOptions {
  /** Absolute path to `planned skills/curation-decisions.json`. */
  curationPath: string;
  /** Absolute path to `planned skills/clash-map.json`. */
  clashMapPath: string;
  /** Absolute path to `planned skills/<pack>/` (source root for this pack's gathered skills). */
  sourceRoot: string;
  /** Absolute path to `packs/<pack>/skills/` (destination root). */
  destRoot: string;
}

/**
 * Imports every non-"drop"-tier skill of one pack per `curation-decisions.json`, authoring a
 * fully curation-aware skill.json for each (enablement from tier, description from SKILL.md
 * frontmatter, clashesWith from clash-map.json, requires from inverted requiredBy). See module
 * docstring "CURATION-AWARE MODE" for the full field-derivation rules.
 */
export function importPackByCuration(pack: string, opts: ImportPackByCurationOptions): ImportSkillResult[] {
  const curation = JSON.parse(readFileSync(opts.curationPath, "utf8")) as CurationDecisions;
  const clashMap = JSON.parse(readFileSync(opts.clashMapPath, "utf8")) as ClashMap;

  const packEntries = curation.packs[pack];
  if (!packEntries) {
    throw new Error(`import-skill --curate: no packs["${pack}"] entry in ${opts.curationPath}`);
  }

  const requiresMap = invertRequiredBy(packEntries);

  const results: ImportSkillResult[] = [];
  for (const [skillName, entry] of Object.entries(packEntries)) {
    if (entry.tier === "drop") continue;

    const sourceDir = join(opts.sourceRoot, skillName);
    const destDir = join(opts.destRoot, skillName);
    const skillMdPath = join(sourceDir, "SKILL.md");
    const description = existsSync(skillMdPath) ? extractDescriptionFromSkillMd(skillMdPath) : undefined;

    const result = importSkill({
      sourceDir,
      destDir,
      skillName,
      supportedAdapters: CURATED_ADAPTER_OVERRIDES[skillName] ?? (["claude", "cursor", "copilot", "agent", "antigravity"] as AdapterType[]),
      workerAsAgent: CURATED_WORKER_AS_AGENT[skillName],
      enablement: entry.tier, // "required" | "default" | "optional" — same vocabulary as SkillEnablement
      description,
      clashesWith: clashMap[skillName]?.clashesWith,
      requires: requiresMap[skillName],
    });
    results.push(result);
  }

  return results;
}

// ---- Razor principles layer import (decisions.md D26 Part B) ---------

/** Shape of one `razor[<name>]` entry in `planned skills/curation-decisions.json` (bare names, no `razor:` prefix). */
interface RazorCurationEntry {
  tier: "optional";
  category: string;
  applicability: string[];
}

interface RazorCurationDecisions {
  razor: Record<string, RazorCurationEntry>;
}

export interface ImportRazorPackOptions {
  /** Absolute path to `planned skills/curation-decisions.json`. */
  curationPath: string;
  /** Absolute path to `planned skills/clash-map.json`. */
  clashMapPath: string;
  /** Absolute path to `planned skills/razor/packs/razor-principles/skills/` (source root, categorized). */
  sourceRoot: string;
  /** Absolute path to `packs/razor/skills/` (destination root — FLAT, no category dir level). */
  destRoot: string;
}

/** Every razor skill supports all adapters — the layer is pure prose, fully portable (decisions.md D26; D35 adds antigravity). */
const RAZOR_SUPPORTED_ADAPTERS: AdapterType[] = ["claude", "cursor", "copilot", "agent", "antigravity"];

/**
 * Imports all 61 skills of the razor principles layer per `curation-decisions.json`'s `razor`
 * object (decisions.md D26 Part B). Distinct from `importPackByCuration()` because the razor
 * layer's shape differs in three ways: (1) source layout is CATEGORIZED
 * (`skills/<category>/<name>/`) while the destination is FLAT (`skills/<name>/`) — category
 * becomes `skill.json` metadata, not a directory level; (2) every entry carries `applicability`
 * (decisions.md D26's per-category repo-type table), which `importPackByCuration()`'s common/
 * next/nest/etc. skills never do; (3) every entry is uniformly `enablement: "optional"` — there
 * is no tier variance to read (no `requiredBy` chains either — razor skills don't depend on each
 * other). `clashesWith` is looked up in `clash-map.json` under the `razor:<name>` id and written
 * out AS-IS (bare external skill ids, e.g. `"react-best-practices"` — decisions.md D26's
 * consistency note: the external skill's OWN `clashesWith` points back with the `razor:<name>`
 * form, both sourced from the same `clash-map.json`).
 */
export function importRazorPack(opts: ImportRazorPackOptions): ImportSkillResult[] {
  const curation = JSON.parse(readFileSync(opts.curationPath, "utf8")) as RazorCurationDecisions;
  const clashMap = JSON.parse(readFileSync(opts.clashMapPath, "utf8")) as ClashMap;

  const razorEntries = curation.razor;
  if (!razorEntries) {
    throw new Error(`import-skill --curate razor: no "razor" object in ${opts.curationPath}`);
  }

  const results: ImportSkillResult[] = [];
  for (const [skillName, entry] of Object.entries(razorEntries)) {
    const sourceDir = join(opts.sourceRoot, entry.category, skillName);
    const destDir = join(opts.destRoot, skillName);
    const skillMdPath = join(sourceDir, "SKILL.md");
    const description = existsSync(skillMdPath) ? extractDescriptionFromSkillMd(skillMdPath) : undefined;

    const applicability = entry.applicability.filter((a): a is RepoType => isRepoType(a));
    if (applicability.length !== entry.applicability.length) {
      throw new Error(
        `import-skill --curate razor: "${skillName}" has an applicability entry that is not a valid RepoType: ` +
          `[${entry.applicability.join(", ")}]`,
      );
    }

    const result = importSkill({
      sourceDir,
      destDir,
      skillName,
      supportedAdapters: RAZOR_SUPPORTED_ADAPTERS,
      enablement: "optional",
      description,
      clashesWith: clashMap[`razor:${skillName}`]?.clashesWith,
      applicability,
      category: entry.category,
    });
    results.push(result);
  }

  return results;
}

// ---- CLI wrapper -----------------------------------------------------

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printResult(result: ImportSkillResult): void {
  console.log(`\n[import-skill] ${result.skillName} -> ${result.destDir}`);
  console.log(`  copied (${result.copied.length}): ${result.copied.join(", ")}`);
  console.log(
    `  stripped at source top level (${result.strippedTopLevel.length}): ` +
      `${result.strippedTopLevel.length > 0 ? result.strippedTopLevel.join(", ") : "(none)"}`,
  );
  console.log(`  skill.json: ${result.skillJsonPath}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const packagePath = dirname(getPacksPath()); // getPacksPath() = <root>/packs

  if (typeof args.curate === "string") {
    const pack = args.curate;
    // Workspace layout assumption: "planned skills/" is a sibling directory of this package
    // inside the Nockta scaffolders workspace (not part of the published npm package). Override
    // with --source-root / --curation-path / --clash-map-path if that ever changes.
    const plannedRoot =
      typeof args["planned-root"] === "string" ? resolve(args["planned-root"]) : resolve(packagePath, "..", "planned skills");
    // The razor layer's gathered source lives one level deeper + categorized differently from
    // every other pack — planned skills/razor/packs/razor-principles/skills/<category>/<name>/
    // (see importRazorPack()'s doc comment) — vs. planned skills/<pack>/<name>/ for everyone else.
    const defaultSourceRoot =
      pack === "razor" ? join(plannedRoot, "razor", "packs", "razor-principles", "skills") : join(plannedRoot, pack);
    const sourceRoot = typeof args["source-root"] === "string" ? resolve(args["source-root"]) : defaultSourceRoot;
    const curationPath =
      typeof args["curation-path"] === "string" ? resolve(args["curation-path"]) : join(plannedRoot, "curation-decisions.json");
    const clashMapPath =
      typeof args["clash-map-path"] === "string" ? resolve(args["clash-map-path"]) : join(plannedRoot, "clash-map.json");
    const destRoot = join(packagePath, "packs", pack, "skills");

    console.log(`[import-skill] curation-aware import for pack "${pack}"`);
    console.log(`  source root: ${sourceRoot}`);
    console.log(`  curation:    ${curationPath}`);
    console.log(`  clash map:   ${clashMapPath}`);

    const results =
      pack === "razor"
        ? importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot })
        : importPackByCuration(pack, { curationPath, clashMapPath, sourceRoot, destRoot });
    for (const result of results) printResult(result);

    console.log(`\n[import-skill] imported ${results.length} skill(s) into packs/${pack}/skills/`);
    return;
  }

  const source = args.source;
  const pack = args.pack;
  if (typeof source !== "string" || typeof pack !== "string") {
    console.error(
      "Usage:\n" +
        "  import-skill --curate <packName>\n" +
        "  import-skill --source <path> --pack <packName> [--name <skillName>] " +
        "[--worker-as-agent <agentName>] [--adapters claude,cursor]",
    );
    process.exitCode = 1;
    return;
  }

  const sourceDir = resolve(source);
  const skillName = typeof args.name === "string" ? args.name : sourceDir.split(/[\\/]/).filter(Boolean).pop()!;
  const destDir = join(packagePath, "packs", pack, "skills", skillName);
  const supportedAdapters =
    typeof args.adapters === "string" ? (args.adapters.split(",") as AdapterType[]) : (["claude"] as AdapterType[]);
  const workerAsAgent = typeof args["worker-as-agent"] === "string" ? args["worker-as-agent"] : undefined;

  const result = importSkill({ sourceDir, destDir, skillName, supportedAdapters, workerAsAgent });
  printResult(result);
}

// tsx invokes this file directly, so a simpler entry check than cli.ts's
// realpath dance is fine here — this is a dev-only script, never run
// through an installed/symlinked bin.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
