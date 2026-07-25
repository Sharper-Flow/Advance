# Executive Summary — Fix release-proof shipped false-negative

## Outcome
`adv_change_archive` no longer false-negatives the durable release-gate proof when a change IS released. A `shipped` change (git-verified default-branch reachability/merge) now archives successfully even when **both** the store-backed gate read and the disk projection lag `pending` — the precise propagation-lag false-negative that recurred through backlog entry 7 and was hit firsthand this session.

## Why it matters
The release gate is the last line of defense before a change is declared shipped. A false-negative there ("did not observe release done" despite a confirmed merge+push) forces manual retries and erodes trust in unattended releases — worst exactly when it matters most (busy multi-session releases where propagation lag is most likely). This fix makes `shipped` (git-authoritative, un-forgeable) sufficient durable proof, eliminating the lag-dependent retry without weakening the guard for genuinely un-released changes.

## How it works (rescue semantics)
- **Rescue, not shadow:** the shipped short-circuit fires ONLY when the release-gate projection is NOT `done`. When the store gate IS `done`, the normal `"store"`/evidence-match path is unchanged — existing behavior preserved exactly.
- **Structural authority:** `shipped` is derived INSIDE the verifier from `finalization.status === "shipped"`, which git-finalize sets exclusively on confirmed reachability/merge (PR `pr_merged`/`pr_auto_merge`/`pr_manual`/`merge_queue` + pushed, `direct` + pushed, or `no_remote` local merge). No caller-trusted boolean.
- **Reachability evidence captured:** a new typed `ReleaseGateProof` carries `mergeCommitSha`, `pushStatus`, and `route` (not overloading `GateCompletion`, which has no such fields — validator finding). The rescue requires `mergeCommitSha` + a valid route/push combo, so it cannot accept a shipped outcome lacking immutable reachability proof.
- **Guard preserved:** `pending_merge`/`blocked` never satisfy `shipped`; the strict evidence-match + recovery-audit guard for non-shipped changes is untouched.

## Verification
- `pnpm run check` clean (schemas/typecheck/manifests/isolation/lockfile/lint/format).
- 123 unit tests green across archive-gate, archive-phase9, asset, and delta-idempotency suites.
- Independent `adv-reviewer` acceptance review: **READY** (0 findings; fixed 1 scoped test gap; security confirmed — rescue accepts only shipped+SHA+valid route/push, blocked/pending_merge rejected).
- Design independently validated by `adv-researcher` (NEEDS_WORK → adopted: typed `ReleaseGateProof` + widened `GitFinalizeOutcome` input).

## Risks / Follow-ups
- The fix addresses the false-negative; propagation lag itself (why projections trail the merge) is the subject of follow-up #3 (serialize concurrent disk-projection writes).
- Caller API note: `verifyReleaseGateDurableForArchive` now takes the full `GitFinalizeOutcome`; callers restricted to git-finalization results (documented invariant — the verifier is not itself a security boundary).

## Supporting evidence
Commits on `change/fixReleaseProofShippedFalse`: `2f099bc5` (spec), `58d34b65` (core fix), `347417c6` (verification). Durable TDD evidence via `adv_run_test` for the core task; reviewer-owned static-check report for the spec task.