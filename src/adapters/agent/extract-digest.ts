/**
 * Common-tier digest extraction (AGENTS.md guidemap, decisions.md D<next>). Pure, deterministic:
 * given a skill's raw SKILL.md text, returns the whitelisted `## <Heading>` sections found in the
 * body (YAML frontmatter stripped), in SOURCE order — or an empty array if none match. Never
 * reorders, rewrites, or truncates a matched section; each section's own `## Heading` line is kept
 * verbatim as the first line of its extracted text.
 *
 * See docs/superpowers/specs/2026-08-19-agents-md-guidemap-design.md "Common-tier extraction".
 */

/**
 * Fixed, deterministic whitelist. Match rule (exact, per the spec): a `## ` heading's trimmed
 * text must EXACTLY equal one of these four strings — case-sensitive, no partial/fuzzy match, no
 * matching on a heading that merely contains the phrase.
 */
export const DIGEST_WHITELIST_HEADINGS: readonly string[] = ["The idea", "Doctrine", "In one line", "Overview"];

/**
 * Strips a leading `---\n...\n---\n` YAML frontmatter block, if present. Returns the input
 * unchanged when no frontmatter delimiter is found at the very start of the string.
 */
function stripFrontmatter(rawText: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(rawText);
  return match ? rawText.slice(match[0].length) : rawText;
}

interface RawSection {
  heading: string;
  /** Full section text, heading line included, trimmed. */
  text: string;
}

/**
 * Splits `body` on every top-level `## ` heading line (exactly two `#` characters, one space,
 * then text — an `### ` H3 line does not match this pattern at all, so H3 headings are never
 * treated as section boundaries). Content before the first such heading (e.g. a leading `#
 * Title` H1 line) is discarded — it belongs to no section.
 */
function splitTopLevelSections(body: string): RawSection[] {
  const lines = body.split(/\r?\n/);
  const sections: RawSection[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = /^## (.+)$/.exec(line);
    if (match) {
      if (current) sections.push({ heading: current.heading, text: current.lines.join("\n").trim() });
      current = { heading: (match[1] ?? "").trim(), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, text: current.lines.join("\n").trim() });

  return sections;
}

/**
 * Returns the whitelisted sections found in `rawSkillMdText`, in source order, each as its full
 * `## Heading\n\n...body` text (trimmed, heading line kept verbatim). Empty array — never
 * `null`/`undefined` — when no whitelisted heading is present, so callers branch on
 * `.length === 0` for the fallback rule (see the spec's "Fallback rule, exact").
 */
export function extractWhitelistedSections(rawSkillMdText: string): string[] {
  const body = stripFrontmatter(rawSkillMdText);
  return splitTopLevelSections(body)
    .filter((section) => DIGEST_WHITELIST_HEADINGS.includes(section.heading))
    .map((section) => section.text);
}
