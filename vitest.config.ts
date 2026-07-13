import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    passWithNoTests: false,
    // Several process-level test files spawn real `node dist/cli.js` child processes
    // (install/sync round-trips). On a local dev machine those run under full file
    // parallelism without issue, but on CI's more constrained/contended runner the extra
    // concurrent child-process spawns intermittently starve each other, producing
    // non-deterministic exit codes (observed in Nockta/inject-nockta-skills CI runs
    // 29241308154 and 29241335259 — same assertions, different failure counts on
    // unrelated commits). Serializing test FILES only in CI removes that contention
    // without slowing local dev.
    fileParallelism: !process.env.CI,
  },
});
