/**
 * Adapter types this package can render skill packs into.
 *
 * inject-nockta-skills is the canonical semantic owner of this union
 * (see decisions.md D7).
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §8.1
 *
 * `agent` (D24, added post-M8): generic root `AGENTS.md` adapter — the emerging cross-tool
 * agent-instructions surface (OpenAI Codex, Google Antigravity/`agy`, Cursor, Zed, Windsurf, and
 * secondarily Copilot). See `src/adapters/agent/render.ts` and spec §8.5.
 *
 * `antigravity` (D35, owner ruling: Nockta devs' primary tools are Claude Code + Antigravity):
 * FULL per-skill injection adapter — the peer of `claude`, NOT the text-only `agent` surface.
 * Renders each selected skill's ENTIRE bundled dir to `<root>/.agents/skills/<skill>/` (Google
 * Antigravity workspace-skill convention, verified against antigravity.google/docs/skills
 * 2026-07-13: `.agents/skills/<folder>/SKILL.md`, `description` frontmatter required). Read by both
 * the Antigravity IDE and the `agy` CLI. Distinct from `agent`: `agent` writes prose sections into
 * root `AGENTS.md`; `antigravity` gives Antigravity "the .claude/ treatment" (full skill dirs incl.
 * scripts/assets). Antigravity has no agents-dir concept, so skill-local `agents/*.md` (e.g.
 * subagent-delegation's worker.md) are never emitted here — the worker-leaf rule rides the
 * standing-mode contract in root `AGENTS.md`, which Antigravity reads natively. See
 * `src/adapters/antigravity/render.ts`.
 */
export type AdapterType = "claude" | "cursor" | "copilot" | "agent" | "antigravity";

export const ADAPTER_TYPES: readonly AdapterType[] = ["claude", "cursor", "copilot", "agent", "antigravity"];

export function isAdapterType(value: string): value is AdapterType {
  return (ADAPTER_TYPES as readonly string[]).includes(value);
}

/**
 * Friendly display titles for the wizard's adapter choices (owner-authored, this pass). The enum
 * value in `AdapterType` never changes — it's still what routing/resolve/`--adapters`/output all
 * key off — this map ONLY changes what a View renders. Single source, consumed by
 * `wizard/core/build-schema.ts`'s `buildAdapterStep()` for BOTH the CLI two-pane View and the
 * `--web` page (see D28/D30).
 */
export const ADAPTER_TITLES: Record<AdapterType, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
  agent: "AGENTS.md (generic)",
  antigravity: "Antigravity (agy)",
};

/**
 * Consumer-facing, one-line descriptions for the wizard's adapter choices (this pass; supersedes
 * the old `ADAPTER_DESCRIPTIONS` that lived inline in `build-schema.ts`). Shown in the CLI
 * two-pane detail pane and the `--web` page's choice body — no dev-speak, no spec/decision refs.
 */
export const ADAPTER_DESCRIPTIONS: Record<AdapterType, string> = {
  claude: "Claude Code — installs skills under .claude/ (agents, skills).",
  cursor: "Cursor — installs project rules under .cursor/rules.",
  copilot: "GitHub Copilot — installs repo-wide instructions under .github/instructions.",
  agent: "Generic AGENTS.md for tools that read it (Codex, Cursor, Zed, Windsurf, Antigravity).",
  antigravity: "Antigravity — installs skills under .agents/skills (IDE + agy CLI).",
};
