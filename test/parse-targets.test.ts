import { describe, expect, it } from "vitest";
import { parseTargetArgs } from "../src/core/parse-targets.js";

describe("parseTargetArgs (decisions.md D9/D22, spec §7.3)", () => {
  it("parses a single canonical colon-form target", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web:next"] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.targets).toEqual([{ path: "apps/web", types: ["next"] }]);
    }
  });

  it("parses multiple canonical colon-form targets", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web:next", "apps/api:nest"] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.targets).toEqual([
        { path: "apps/web", types: ["next"] },
        { path: "apps/api", types: ["nest"] },
      ]);
    }
  });

  it("accepts the split form as a convenience for a single target", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web"], type: "next" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.targets).toEqual([{ path: "apps/web", types: ["next"] }]);
    }
  });

  it("normalizes a trailing slash on the path", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web/:next"] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.targets[0]?.path).toBe("apps/web");
  });

  it("rejects the split form when more than one --target is given", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web", "apps/api"], type: "next" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/single target/);
  });

  it("rejects split form with no --type", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/requires --type/);
  });

  it("rejects split form with an unknown --type", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web"], type: "sveltekit" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/invalid type/);
  });

  it("rejects a malformed colon target with an empty path", () => {
    const result = parseTargetArgs({ targetArgs: [":next"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/path must not be empty/);
  });

  it("rejects a malformed colon target with an empty type", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web:"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/type must not be empty/);
  });

  it("rejects an unknown repo type in colon form", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web:sveltekit"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/invalid type "sveltekit"/);
  });

  it("rejects duplicate target paths", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web:next", "apps/web:nest"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/duplicate --target path/);
  });

  it("rejects mixing colon form and split form across multiple --target flags", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web:next", "apps/api"], type: "nest" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/cannot mix colon form/);
  });

  it("rejects an empty --target list", () => {
    const result = parseTargetArgs({ targetArgs: [] });
    expect(result.ok).toBe(false);
  });

  it("reports every malformed entry across multiple colon-form targets, not just the first", () => {
    const result = parseTargetArgs({ targetArgs: ["apps/web:sveltekit", "apps/api:remix"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBe(2);
  });

  describe("D22 multi-type targets", () => {
    it("colon+plus form: a target may name multiple types", () => {
      const result = parseTargetArgs({ targetArgs: ["apps/theme:shopify-theme+vite-react-ts"] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.targets).toEqual([{ path: "apps/theme", types: ["shopify-theme", "vite-react-ts"] }]);
      }
    });

    it("colon+plus form: three types", () => {
      const result = parseTargetArgs({ targetArgs: ["apps/x:next+nest+vite-react-ts"] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.targets[0]?.types).toEqual(["next", "nest", "vite-react-ts"]);
    });

    it("colon+plus form: dedupes a repeated type", () => {
      const result = parseTargetArgs({ targetArgs: ["apps/theme:shopify-theme+vite-react-ts+shopify-theme"] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.targets[0]?.types.sort()).toEqual(["shopify-theme", "vite-react-ts"].sort());
    });

    it("colon+plus form: an unknown type among the plus-joined list is an invalid-input error", () => {
      const result = parseTargetArgs({ targetArgs: ["apps/theme:shopify-theme+sveltekit"] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toMatch(/invalid type/);
    });

    it("split form (--type): comma-separated multi-type also works as the target-convenience type", () => {
      const result = parseTargetArgs({ targetArgs: ["apps/theme"], type: "shopify-theme,vite-react-ts" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.targets).toEqual([{ path: "apps/theme", types: ["shopify-theme", "vite-react-ts"] }]);
    });

    it("split form (--type): dedupes comma-separated repeats", () => {
      const result = parseTargetArgs({ targetArgs: ["apps/theme"], type: "next,next,nest" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.targets[0]?.types.sort()).toEqual(["nest", "next"].sort());
    });

    it("colon+plus form: multiple multi-type targets in one invocation", () => {
      const result = parseTargetArgs({
        targetArgs: ["apps/theme:shopify-theme+vite-react-ts", "apps/api:nest"],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.targets).toEqual([
          { path: "apps/theme", types: ["shopify-theme", "vite-react-ts"] },
          { path: "apps/api", types: ["nest"] },
        ]);
      }
    });

    it("single-type inputs still come back as a one-element types array (back-compat)", () => {
      const result = parseTargetArgs({ targetArgs: ["apps/web:next"] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.targets[0]?.types).toEqual(["next"]);
    });
  });
});
