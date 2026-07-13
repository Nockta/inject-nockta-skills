---
name: trace-dont-guess
description: Diagnose defects through reproduction, evidence, boundary tracing, and discriminating tests before applying a fix. Use for runtime bugs, build failures, deployment issues, incorrect data, integration failures, platform-specific behavior, and symptoms whose originating layer is uncertain.
---

# Trace Dont Guess

## Doctrine

The symptom is where the failure became visible, not necessarily where it began.

Do not patch the first suspicious line. Reproduce the failure, trace the actual path, eliminate competing hypotheses, and fix the earliest proven cause.

## Use This Skill When

Use this skill for:

- bugs with multiple plausible causes;
- issues that occur in only one product, environment, platform, or record;
- frontend symptoms produced by backend or data defects;
- build and deployment failures;
- third-party integration problems;
- cache, search, export, or indexing inconsistencies;
- intermittent failures;
- regressions after refactors or dependency changes;
- errors where retrying or restarting appears to help.

## Required Workflow

### 1. Characterize the Symptom Precisely

Record:

- expected behavior;
- actual behavior;
- affected scope;
- unaffected comparison case;
- environment and version;
- reproducibility;
- first known occurrence;
- exact error, output, or observable difference.

Prefer a narrow statement such as:

> One product's search result title is truncated while other products using the same template are correct.

Avoid broad statements such as:

> SEO is broken.

### 2. Establish a Reproduction or Observation Point

Reproduce using the smallest reliable path.

If reproduction is unavailable:

- capture logs;
- add temporary instrumentation;
- compare affected and unaffected inputs;
- inspect persisted state;
- inspect generated output;
- obtain the exact request and response boundary.

Do not substitute speculation for a missing reproduction.

### 3. Trace the Failure Path Backward

Start at the observation point and move toward the source.

At each boundary ask:

- What value entered?
- What value left?
- What transformation occurred?
- Which component owned the decision?
- Was the value persisted, cached, generated, or inferred?
- Could another layer have rewritten it?

Continue until the earliest incorrect state is found.

### 4. Build Competing Hypotheses

List plausible causes and the evidence for each.

Rank by:

- fit with the symptom;
- consistency with unaffected cases;
- likelihood given the architecture;
- cost of the discriminating check.

Do not lock onto the first plausible explanation.

### 5. Run Discriminating Checks

Choose checks that separate hypotheses.

Good checks:

- compare one affected record with one unaffected record;
- inspect source input and final output;
- bypass one cache layer;
- run the production build;
- call the backend directly;
- inspect the generated artifact;
- confirm environment-variable resolution;
- verify the installed dependency version;
- test one state transition at a time.

A check that would pass under every hypothesis is not useful.

### 6. Change One Causal Variable

Apply the smallest fix at the earliest proven cause.

Avoid simultaneously:

- refactoring nearby code;
- changing dependencies;
- clearing unrelated caches;
- modifying multiple layers;
- adding broad fallback behavior.

A fix should explain the symptom and the comparison case.

### 7. Verify at the Original Observation Point

Validation must return to where the bug was visible.

Examples:

- confirm the search result source;
- open the exported workbook;
- exercise the deployed route;
- trigger the webhook;
- inspect the final DOM;
- run the exact failing conversion;
- verify the generated build artifact.

Internal unit tests alone may not prove the original failure is resolved.

### 8. Check Adjacent Regressions

Verify:

- unaffected comparison cases remain correct;
- the fix does not weaken validation or authorization;
- caches and generated outputs refresh correctly;
- retries and error handling remain intentional;
- the fix is not environment-specific unless the defect is.

## Required Output

```md
## Symptom

Expected:
Actual:
Affected:
Unaffected comparison:
Environment:
Reproduction:

## Evidence Trail

| Boundary | Input | Output | Finding |
|---|---|---|---|
| ... | ... | ... | ... |

## Hypotheses

| Hypothesis | Supporting evidence | Contradicting evidence | Check | Result |
|---|---|---|---|---|

## Proven Cause
...

## Fix
...

## Verification
- Original observation point:
- Adjacent cases:
- Regression checks:

## Remaining Uncertainty
...
```

## Rules

- Distinguish symptom, contributing condition, and root cause.
- Compare affected and unaffected cases.
- Prefer evidence from the real runtime path.
- Verify versions and environment rather than relying on memory.
- Inspect source and generated output when both exist.
- Keep temporary instrumentation clearly temporary.
- State uncertainty instead of manufacturing confidence.
- Fix the owner of the incorrect state.
- Validate the same layer where the user observed the defect.

## Anti-Patterns

Reject these behaviors:

- clearing caches as the first and only diagnosis;
- changing multiple variables and calling the issue fixed;
- patching the UI when the stored data is wrong;
- blaming a dependency without verifying its version and execution path;
- relying on a generic explanation that does not explain why only one case fails;
- treating successful compilation as reproduction;
- adding a fallback that masks corrupted state;
- stopping after the internal function returns the expected value while the final output remains wrong.

## Completion Criteria

This skill is complete when:

- the symptom is precisely characterized;
- evidence identifies the earliest incorrect state;
- competing hypotheses were meaningfully separated;
- the fix targets the proven cause;
- the original observation point is verified;
- adjacent cases remain correct;
- remaining uncertainty is explicit.
