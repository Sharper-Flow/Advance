# Executive Summary — fixDirectArchiveMerge

## Outcome

Direct archives no longer silently lose their trunk-merge finalization. A direct `adv_change_archive phase9:"run"` now runs its Phase-9 git finalization inline and reaches a durable terminal state — shipped (after default-branch reachability proof), pending-merge, blocked, or a recorded failed state — before it reports completion.

## Why It Matters

GitHub issue #214 documented three consecutive direct archives that reported success while their trunk merge was discarded, each requiring manual non-fast-forward merge, push, and release-gate recovery. The defect was structural: a fire-and-forget promise, a swallowing `.catch(() => {})`, and a best-effort failure recorder that could not survive a worker restart or a thrown merge. Release operators now receive either confirmed completion or a concrete, actionable failure — never a false success.

## What Changed

- Removed the detached direct Phase-9 execution branch; direct archives reuse the existing awaited finalization pipeline (finalization proof → release gate → durable readback → archive status → cleanup).
- Deleted the single-consumer `phase9-queue.ts` fire-and-forget module.
- Wrapped finalization so a thrown git operation records a durable `phase9_status: "failed"` with recovery evidence and returns an actionable error, instead of propagating silently.
- Codified the behavior in `rq-releaseFinalization01` (new scenario `.12`) as release law.
- Repaired stale full-suite asset assertions surfaced during verification (user-authorized campsite fix).

## Verification

- Focused archive/change suites: 34/34 Phase-9, 135/135 combined.
- Full suite: 4825/4827 — the two failures are transient Temporal 5000ms timeouts that pass on isolated rerun (31/31), unrelated to this change.
- Typecheck, lint, prettier, and plugin build all pass.
- Independent acceptance review verdict: READY (attempt 2). Strict contract review matrix: 16/16 items satisfied, 0 failing.

## Risks / Follow-ups

- Direct archive calls are now longer because git merge/push/fetch runs inside the request; this is release-gate work and terminal correctness outweighs the former fast-but-lossy pending response.
- Out of scope and unchanged: PR-mode finalization (#202/#203), wedged-workflow recovery (#198), async branch-cleanup warning parity.
- Advisory follow-up: raise `testTimeout` for Temporal workflow-env test files if CI flakiness persists.

## Live-Behavior Note

This change modifies ADV tool behavior in `plugin/src/tools/change.ts`. Per repo convention, live tool-invocation validation requires a rebuild (`pnpm run build` + `deploy-local.sh --fix`) and a fresh OpenCode session; source fixes were validated via the vitest suite in-session.