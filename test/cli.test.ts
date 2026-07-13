import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli.js";
import { ADAPTER_TYPES, REPO_TYPES, isAdapterType, isRepoType } from "../src/index.js";

describe("types", () => {
  it("defines the exact RepoType union from spec §5.1", () => {
    expect(REPO_TYPES).toEqual([
      "next",
      "vite-react-ts",
      "nest",
      "shopify-app",
      "shopify-theme",
      "shopify-headless",
      "react-native",
      "expo",
    ]);
  });

  it("defines the exact AdapterType union from spec §8.1", () => {
    expect(ADAPTER_TYPES).toEqual(["claude", "cursor", "copilot", "agent", "antigravity"]);
  });

  it("narrows with the type guards", () => {
    expect(isRepoType("next")).toBe(true);
    expect(isRepoType("sveltekit")).toBe(false);
    expect(isAdapterType("cursor")).toBe(true);
    expect(isAdapterType("windsurf")).toBe(false);
  });
});

describe("cli", () => {
  it("registers all commands (spec §11 plus the D30 wizard command)", () => {
    const program = buildProgram();
    const names = program.commands.map((cmd) => cmd.name()).sort();
    expect(names).toEqual(["doctor", "install", "list", "repair", "sync", "upgrade", "wizard"]);
  });

  it("exposes a global --json flag and the D30 web flags", () => {
    const program = buildProgram();
    const flags = program.options.map((opt) => opt.long);
    expect(flags).toContain("--json");
    // D30: --web / --cli / --no-open / --emit-schema declared root-only (same reasoning as --type et al).
    expect(flags).toContain("--web");
    expect(flags).toContain("--cli");
    expect(flags).toContain("--no-open");
    expect(flags).toContain("--emit-schema");
  });

  it("prints the package name and every command in --help output", () => {
    const program = buildProgram();
    const help = program.helpInformation();
    expect(help).toContain("inject-nockta-skills");
    for (const name of ["install", "doctor", "repair", "upgrade", "sync", "list"]) {
      expect(help).toContain(name);
    }
  });
});
