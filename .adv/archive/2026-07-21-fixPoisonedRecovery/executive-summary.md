# Executive Summary

## Outcome
ADV's poisoned-workflow recovery is now deterministic and disk-authoritative across 6 catch-gated tools plus the archive path. Operators can heal a wedged change via precise evidence without depending on a Temporal signal throw, and the 3 most material describe()-only authority bypasses have been closed. Approval decision: accept the delivered recovery machinery with a bounded set of forensic/observability gaps deferred to harden.

## Why It Matters
The previous catch-gated pattern relied on the signal RPC itself failing — but Temporal signals are fire-and-forget (server-acceptance returns, not workflow-processing). On a poisoned workflow the signal silently resolves and the recovery branch was unreachable, leaving operators stuck. This change ships a probe-first authority model (`shouldTakeRecoveryBranch`) that trusts operator-supplied precise evidence UPFRONT, before the signal fires, and writes the disk projection directly. The C2 remediation (PR #275) additionally closes 3 describe()-only authority paths that violated the agreement. The wedge class — workflow poisoned mid-flight, signal silently drops, recovery unreachable — is structurally resolved.

## Verdict
APPROVED

## What Was Built
1. `shouldTakeRecoveryBranch` + `logRecoveryProbeDiagnostics` helpers (recovery-probe.ts) — operator-evidence-based probe-first gate; describe() demoted to advisory logging.
2. Probe-first pattern applied to 6 catch-gated tools: gate, task (3 signal sites), contract (mint + review matrix), design-concern, verification-evidence, archive path (#253).
3. C2 remediation (PR #275): describe() removed as sole poison authority from change.ts archive recovery catch, gate.ts status query fallback, and worktree/state.ts workflow-failure classifier. Operator evidence OR error class is the sole authority.
4. AC5 regression sweep: 414 tests across 11 recovery-touching files (run `tr_mruqwco7_8968572d`), including 3 new C2 regression tests.
5. AC6 live proof: deployed bundle SHA `574009ed...` from trunk HEAD `0882abb4`; pokeedge-web `fixWorktreeViteCache` archive confirmed via deployed plugin.

## What Was Verified
- Verdict: APPROVED with 9 findings (0 blockers, 3 issues, 4 suggestions, 2 nits).
- Tests: 414/414 pass (tr_mruqwco7_8968572d); pnpm run check green (schemas/typecheck/manifests/isolation/lockfile/lint/format).
- Preview URL: not_applicable — no front-end / browser-visible output; build-tool recovery path only.
- Contract matrix: 22/22 rows pass/respected (0 failing).

## Remaining Concerns
- **Pre-existing C3 gap (deferred to harden)**: `saveRecoveredChangeStatus` does not persist `recovery_audit` to change.json. Pre-existing writer; C2 fix increased materiality. Harden should evaluate.
- **Evidence regex tightening (deferred to harden)**: `COMPLETED_WORKFLOW_EVIDENCE_RE` has loose substrings (`already completed`, `workflow is not running`) that could match benign errors. Pre-existing; increased reliance warrants tightening + regression test.
- **Unbounded recoveryEvidence length (deferred to harden)**: 5 schema sites have `z.string().optional()` with no `.max()` cap — secret leak risk if operator includes credentials. Pre-existing.
- **5+1 additional describe-only C2 sites (follow-up change)**: task.ts L1090/L1485/L1765, contract.ts L441/L678, change.ts:4741 (workflow_terminate). Out of scope per user-approved 3-site fix; documented for follow-up decision.
- **Unreachable code in gate.ts:1782 (suggestion)**: second probe-first check is dead code; document or delete in harden.

## Supporting Evidence
- Tasks tk-47ced5313eeb through tk-0527666d76fa (12/12 done).
- AC5 sweep: `tr_mruqwco7_8968572d` (414 tests, 11 files).
- Reviewer READY: report `fixPoisonedRecovery|tk-0527666d76fa|adv-reviewer|3`.
- PR #266 (probe-first + archive path) merged as `d12fef24`; PR #275 (C2 remediation) merged as `0882abb4`.
- Deployed bundle: `~/.local/share/Advance/plugin/dist/index.js` SHA-256 `574009ed85e7aca68039085b429b6ad8b0aff918cfbb10b15e839826b454088e`.

## Consequence Context
| Category | Status | Evidence |
|---|---|---|
| Delivered value | ready | Poisoned-workflow recovery now deterministic across 6 tools + archive path; C2 closes 3 authority bypasses. Wedge class structurally resolved. |
| Enabling-only/follow-up dependency | n/a | No required enabling change. 5+1 C2 follow-up sites are non-blocking (same authority model applies; just not yet retrofitted). |
| Ops readiness | pending | Harden owns release/deploy/production readiness; no migration/runbook impact (recovery is opt-in via recoveryMode). |
| Migration/data impact | n/a | No schema migration; disk-projection writes are backward-compatible (additive recovery_audit fields where present). |
| Frontend/preview impact | not_applicable | No browser-visible output; build-tool recovery path only. |
| Collision/release risk | ready | PR #266 + PR #275 already merged to trunk; no branch collision; no release gate weakening. |
| Open follow-ups | non_blocking | 5+1 C2 sites; saveRecoveredChangeStatus audit persistence; regex tightening; length cap. All deferred to harden or follow-up change. |
| Next action | acceptance | Acceptance approval proceeds inline to /adv-harden fixPoisonedRecovery for release/deploy/production readiness evaluation. |