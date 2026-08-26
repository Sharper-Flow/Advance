# Executive Summary

## Outcome

`adv_change_close` destroyed the change it closed. It wrote `status: "closed"` into `changes/<id>/`, verified that write honestly, deleted the directory holding it, and returned `success: true`. The verification passed because the record existed at the moment it was checked. The next line removed it.

Close now writes a durable bundle to `closed/<id>/`, proves it reads back, and only then removes the source. If durability cannot be proven, nothing is removed and the caller gets an error.

## What made this defect survive

The failure was introduced by a correct change to a system that later changed underneath it. `removeChangeDir` entered the close path on 2026-08-05 (`45ab2ef9`, #373) while Temporal held an independent durable projection — deleting the directory was safe then, because a second copy existed. `c231b2eb` (#393, 2026-08-06) completed the Temporal removal and made disk the only store. Close's safety precondition was deleted out from under it, and nothing failed at the time.

The code then argued for its own correctness. A comment above the deletion read: cleanup failure "does NOT flip success to false — the closed status is durable." It named the exact property the following line destroyed. Anyone reading the close path found a durability claim sitting directly above the code that violated it.

The tool output hid the rest. `success: true` is emitted before the `dryRun` and `noOp` discriminators, so a preview reads like a commit and a destructive success reads like an ordinary one. The defect was only found because a close was run and the change afterwards could not be found.

## Delivered

- `plugin/src/storage/closed-bundle.ts` — `retireClosedChange` owns the ordering: write, prove by reading back, then remove. Durability is fail-closed. Cleanup is best-effort *only after* the proof holds, so a failed removal leaves a recoverable duplicate rather than a loss.
- Close rewired. The false durability comment is gone and a failed retirement returns an error instead of `success: true`.
- Closed records resolve through both read surfaces. An independent design validator caught that covering `changes.list` alone would have left the reported symptom fully intact, because `adv_change_show` reads through `changes.get`. Active records still win over bundle copies, structurally: the `if (id)` branch returns before either fallback runs.
- `sweepClosedChangesFromDisk` routed through the same guard.

## Findings recorded, not fixed

**A spec would have reproduced this at bulk scale.** `sweepClosedChangesFromDisk` has zero production callers but cites spec `rq-bulkCloseDiskSweep01`. A RED run showed it deleting a record outright. Wiring that spec as written would have re-created this defect across many changes at once. The spec remains unimplemented; guarding the helper was chosen over deleting it precisely because the spec makes it a governance reference rather than dead code.

**Destroyed changes are permanently unrecoverable.** No `.bak`, snapshot, trash, or journal exists for `changes/`. `operation_ledger` is a field inside `change.json` and dies with the directory. Neither append-only audit log records close events. `enableMergeQueue` was destroyed while proving the defect and cannot be restored. The total count of changes lost since 2026-08-06 is unknowable, which is why enumeration was rejected as work.

**The fix is inert until deployed.** The running Advance is the installed build. Closing a change still destroys it until this is merged, rebuilt, and deployed from the default branch.

## Scope trim

Scope was cut mid-execution by explicit user decision, because Advance is being replaced by Concord. AC1-AC4 shipped. AC5 (outcome discriminant), AC6 (archive noOp retirement), AC7 (legacy record migration) and the `adv-cleanup` skill correction were withdrawn to OOS5-OOS8 with rationale, not deleted.

The workaround considered and rejected was "stop calling `adv_change_close`". It is a rule agents must remember while the tool stays exposed, and it was violated inside the very session that found the bug. A structural guard is cheaper than that discipline.

## Residual

AC4 is half-proven. The helper's refusal to delete is tested, so the data-safety half holds. The handler returning an error rather than `success: true` rests on a five-line branch verified by inspection. Its worst failure mode is a misleading success message, not data loss, because the record is preserved before that branch is reached.

`check-prompt-budget` reports a +3394 byte floor regression locally. It measures `homedir()` files that form a real session prompt; no commit here touches a prompt surface. The baseline was deliberately not bumped, since that would launder external drift into this change.

## Verification

Every task carries genuine red-then-green ordering. Two tasks had implementations written before RED was recorded; RED was reconstructed by removing only the implementation and retaining the tests, rather than banking a GREEN-only claim.

`tr_mtafhgfy_85dc6875` → `tr_mtafifvc_6bd756ac`; `tr_mtafzjyw_abed7862` → `tr_mtag1s8e_cde061f6`; `tr_mtag7371_ba09b612` → `tr_mtag82e3_210572ec`; `tr_mtage2sc_7048863b` → `tr_mtagh1no_54bc78ab`; verify `tr_mtagk51p_34af0071` (554 tests across storage and change tools). Typecheck, schemas, manifests, frontmatter, test-isolation, lockfile, skill-references, eslint and prettier clean.

Commits `1bc015a5`, `8ee398ba`, `e592487d`, `5d878bfc`.
