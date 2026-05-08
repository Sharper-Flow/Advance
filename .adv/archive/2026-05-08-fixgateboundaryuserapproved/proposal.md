## Intent

Suppress two distinct sources of false-positive gate-boundary warnings emitted by `validateGateBoundary` (`plugin/src/tools/gate.ts:364`):

1. **User-driven completions** — manual CLI invocations and other human-driven `adv_gate_complete` calls trip the warning because no command name maps to the human actor.
2. **Fast-track-exempt commands** — `adv-task` legitimately completes `proposal` + `design` gates per its command contract, but its manifest entry (`plugin/src/manifest.ts:278-292`) only declares `scope.gates: ["discovery", "planning"]`. Two of the four gates it completes fire false-positive warnings.

This is part 8 of umbrella tracker `ag-55f13852-56ba-4829-937b-051b42917788` (Telemetry & Temporal follow-ups from fixTemporalContextMismatch). The independent design validator (adv-researcher) surfaced bug #2 during design review of bug #1.

## LBP Targets

None. Internal validator + manifest fix; no external library, framework, or vendor dependency.

## Scope

In scope:
- `plugin/src/manifest.ts` — extend `adv-task` `scope.gates` to `["proposal", "discovery", "design", "planning"]` to match its command contract (`adv-task.md:11`)
- `plugin/src/tools/gate.ts` — extend `validateGateBoundary` to short-circuit when `completedBy === "user"` or `completedBy?.startsWith("user:")` (placed BEFORE the manifest scan for simplicity per P19)
- `plugin/src/tools/gate.ts` — update the `completedBy` field description to document the `"user"` / `"user:*"` actor convention (locality per P04)
- Co-located unit tests covering: (a) manifest fix, (b) user skip paths, (c) negative control (unauthorized agent command still warns)

Explicitly NOT in scope:
- Overloading `userApproved` as a boundary-skip signal — validator flagged this as semantic conflation of HITL approval vs identity authority. Keep concerns orthogonal.
- Other umbrella items (#3-#7).
- Adjusting other commands' `scope.gates` declarations — only `adv-task` was identified as misdeclared.
- Manifest-driven authorization model changes.

## Success Criteria

- `manifest.ts` declares `adv-task` `scope.gates: ["proposal", "discovery", "design", "planning"]`.
- `validateGateBoundary` returns `undefined` when `completedBy === "user"`.
- `validateGateBoundary` returns `undefined` when `completedBy.startsWith("user:")`.
- The user-prefix check executes BEFORE the `COMMAND_MANIFEST` scan (avoids unnecessary work).
- Existing agent-completion warning is preserved when `completedBy` is an unauthorized agent command (negative-control test passes).
- `adv-task` completing `proposal` and `design` gates no longer fires a boundary warning.
- `completedBy` field schema description documents the user-actor convention.
- `pnpm run check` clean (typecheck + lint + format).
- `pnpm test` clean (full suite, including new tests).

## Out of Scope

- Restructuring boundary check from advisory to blocking.
- Auditing all command manifest entries for similar misdeclarations (separate sweep if patterns recur).
- Changing `completedBy` storage semantics or schema beyond a docstring update.
- Coupling boundary-skip behaviour to `userApproved` (rejected per validator recommendation).
