---
name: proof-of-done
description: >-
  Done means demonstrated. Invoke before declaring any change complete, before committing or
  shipping, and whenever a subagent reports success — a fix or feature counts as done only when
  observed working in the running system, with evidence. Covers: no self-certification (the maker
  is never the sole verifier), independent verification of delegated work, human eyes required for
  visual/audio/feel surfaces, evidence attached to every 'fixed' claim, skipped verification
  flagged loudly rather than assumed, and routing tiny subjective tweaks to a human instead of
  agent iteration loops.
---

# Proof of Done

## The idea

"It compiles," "tests pass," and "the code looks right" are progress signals, not completion. Every
one of them can be green while the actual behavior is wrong — the fix touched the wrong code path,
the test asserted the wrong thing, the visual regression is invisible to a type-checker. A change
is **done** when someone observed it doing the right thing in the running system, and can show the
evidence. Everything before that moment is "probably done" — and this skill exists because
"probably done" reported as "done" is how broken changes ship.

## Done means demonstrated

A change is complete only when observed working in the running system: **drive the affected flow**
— launch the thing, trigger the changed behavior, watch it do what the change promised. Not the
unit tests around it, not a type-check, not a careful re-read of the diff. Those are worth doing;
none of them is the demonstration. If the change has a runtime surface, exercise that surface
end-to-end before the word "done" appears in any report.

## No self-certification

Whoever made a change is never its **only** verifier — the maker's blind spots are baked into both
the change and their check of it. Delegated work gets verified independently: a separate verifier
agent that didn't write the change, or the coordinator inspecting the evidence itself. The
verification question is never "does the maker say it works?" but "has someone else watched it
work, or examined the proof?"

## Human eyes for subjective surfaces

Visual, audio, and UX-feel changes are verified by a **human**. An agent can confirm a texture
loaded; it cannot certify that the material *looks right*, the mix *sounds right*, or the motion
*feels right*. For these surfaces the agent's job ends at a clean handover: exact reproduction
steps, and precisely what to look (or listen) for. Certifying a subjective surface sight-unseen is
self-certification's worst form.

## Evidence or it didn't happen

Every "fixed" / "works" report carries the **shortest decisive artifact**: the log line that proves
the code path ran, the screenshot of the corrected state, the before/after output diff. One
decisive artifact beats ten paragraphs of assurance — and a report that can't produce one is
describing a hope, not a fix.

## Skipped is said out loud

If verification wasn't done — no environment to run in, no time, blocked on access — the report
**states that plainly**: what was skipped, why, and what remains unproven. An unverified change is
never presented as done; "implemented, NOT verified — needs X" is an honest and acceptable status.
Silently promoting it to "done" is the one move this skill forbids outright.

## Subjective tweaks route to the human

When a change needs taste-based iteration — nudge this two pixels, tune that volume, try a warmer
tone — hand the human the knob and the repro steps instead of iterating by agent guesswork. A
guess-and-check loop on subjective qualities burns rounds converging on a taste the agent cannot
perceive; the human lands it in one or two touches. Recognizing "this is a taste call" and routing
it early is part of finishing the job, not giving up on it.

## In one line

Done means demonstrated in the running system, by someone other than the maker, with the shortest
decisive evidence attached — and anything unverified, subjective, or skipped is said out loud and
routed to the right eyes.
