## Objectives

1. Eliminate false-positive boundary warnings on user-driven gate completions by treating `completedBy === "user"` and `completedBy.startsWith("user:")` as authority-bearing actors that skip the manifest scan.
2. Eliminate false-positive boundary warnings on `adv-task`-driven proposal and design gate completions by aligning `adv-task` manifest `scope.gates` with its command contract.
3. Preserve the existing warning for genuinely unauthorized agent-driven completions (negative control).

## Acceptance Criteria

| AC | Statement | Verification |
|----|-----------|--------------|
| AC1 | `adv-task` manifest declares `scope.gates: ["proposal", "discovery", "design", "planning"]` | Unit test inspects `COMMAND_MANIFEST["adv-task"].scope.gates` |
| AC2 | `validateGateBoundary("proposal", "user")` returns `undefined` | New unit test |
| AC3 | `validateGateBoundary("proposal", "user:cli")` returns `undefined` | New unit test |
| AC4 | `validateGateBoundary("proposal", "adv-proposal")` returns `undefined` (existing positive control) | Existing test |
| AC5 | `validateGateBoundary("proposal", "some-unauthorized-cmd")` returns a warning string mentioning `"adv-proposal"` (negative control) | New unit test |
| AC6 | `validateGateBoundary("proposal", "adv-task")` returns `undefined` after manifest fix | New unit test |
| AC7 | `completedBy` field schema description in `adv_gate_complete` documents the `"user"` / `"user:*"` convention | Read-and-verify |
| AC8 | `pnpm run check` exits 0 | Run `adv_run_test command: "pnpm run check"` |
| AC9 | `pnpm test` exits 0 (full suite) | Run `adv_run_test command: "pnpm test"` |

## Out of Scope (per Validator)

- Overloading `userApproved` for boundary-skip purposes — rejected.
- Other manifest entries beyond `adv-task` — out of scope this cycle.

## Dependencies

None. Self-contained.
