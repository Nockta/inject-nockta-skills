import { describe, expect, it } from "vitest";
import { DIGEST_WHITELIST_HEADINGS, extractWhitelistedSections } from "../src/adapters/agent/extract-digest.js";

describe("DIGEST_WHITELIST_HEADINGS", () => {
  it("is the fixed 4-entry whitelist from the spec", () => {
    expect(DIGEST_WHITELIST_HEADINGS).toEqual(["The idea", "Doctrine", "In one line", "Overview"]);
  });
});

describe("extractWhitelistedSections", () => {
  it("extracts a single whitelisted section, heading line kept verbatim", () => {
    const raw = "# Title\n\n## The idea\n\nBody text.\n\n## Something else\n\nOther content.\n";
    expect(extractWhitelistedSections(raw)).toEqual(["## The idea\n\nBody text."]);
  });

  it("extracts multiple whitelisted sections in SOURCE order, not whitelist-array order", () => {
    // "In one line" appears before "The idea" here — output must preserve THAT order, proving
    // no reordering to match DIGEST_WHITELIST_HEADINGS's own array order.
    const raw = "# Title\n\n## In one line\n\nShort form.\n\n## The idea\n\nLong form.\n";
    expect(extractWhitelistedSections(raw)).toEqual(["## In one line\n\nShort form.", "## The idea\n\nLong form."]);
  });

  it("exact match only — a near-miss heading is NOT extracted", () => {
    const raw = "# Title\n\n## The idea behind this\n\nShould not match.\n";
    expect(extractWhitelistedSections(raw)).toEqual([]);
  });

  it("no whitelisted heading at all -> empty array (the fallback signal)", () => {
    const raw = "# Title\n\n## Something Else\n\nBody.\n\n## Also Not Whitelisted\n\nMore body.\n";
    expect(extractWhitelistedSections(raw)).toEqual([]);
  });

  it("strips YAML frontmatter before splitting sections — frontmatter text never leaks into a matched section", () => {
    const raw = "---\nname: x\ndescription: >-\n  Some folded\n  description text.\n---\n\n# Title\n\n## Doctrine\n\nDoctrine body.\n";
    expect(extractWhitelistedSections(raw)).toEqual(["## Doctrine\n\nDoctrine body."]);
  });

  it("content before the first ## heading (e.g. a leading # Title line) is discarded, not treated as a section", () => {
    const raw = "# Title\n\nSome intro paragraph with no ## heading above it.\n\n## Overview\n\nOverview body.\n";
    const result = extractWhitelistedSections(raw);
    expect(result).toEqual(["## Overview\n\nOverview body."]);
    expect(result.join("")).not.toContain("Some intro paragraph");
  });

  it("an H3 heading ('### The idea') never matches, even with whitelisted text", () => {
    const raw = "# Title\n\n### The idea\n\nThis is H3, not H2 — must not match.\n";
    expect(extractWhitelistedSections(raw)).toEqual([]);
  });

  it("a skill with no ## headings at all (only an H1, or nothing) returns an empty array", () => {
    expect(extractWhitelistedSections("# Title only, no sections.\n")).toEqual([]);
    expect(extractWhitelistedSections("")).toEqual([]);
  });
});
