# Contract Traceability

**Change ID:** fixReleaseProofShippedFalse
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-25T15:50:15.255Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | archive-gate.test.ts AC1: shipped + store-pending + disk-pending -> rescue accept (source shipped-finalization), gate reconciled done. tr_ms0iwxlk. |
| AC2 | acceptance_criterion | pass | test | archive-gate.test.ts AC2: non-shipped (pending_merge/blocked) + pending -> rejected, strict guard preserved. |
| AC3 | acceptance_criterion | pass | test | accepted ReleaseGateProof carries mergeCommitSha/pushStatus/route; AC3 test. |
| AC4 | acceptance_criterion | pass | test | regression matrix: shipped+disk-done, shipped+evidence-match, un-shipped strict -> sources/behavior preserved (AC4 tests). |
| AC5 | acceptance_criterion | pass | test | rq-releaseProjectionDurability01.4/.5 added (spec 1.38); asset test strengthened + passes. |
| C1 | constraint | respected | static_check | shipped derived ONLY from finalization.status === 'shipped' inside verifier (archive-gate.ts L1042); no caller-trusted boolean. |
| C2 | constraint | respected | static_check | no caller-trusted boolean; full GitFinalizeOutcome passed, status derived structurally. |
| C3 | constraint | respected | static_check | non-shipped guard preserved (evidence-match + recovery-audit unchanged); KD3. |
| C4 | constraint | respected | static_check | no regression: 123 unit tests + pnpm run check clean; existing store/disk/evidence-match paths unchanged. |
| DONT1 | avoidance | respected | review | un-shipped never accepted under lag (blocked/pending_merge guard tests). |
| DONT2 | avoidance | respected | review | recovery-audit requirement for un-shipped disk fallbacks unchanged. |
| DONT3 | avoidance | respected | review | no caller-supplied trust flag introduced. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8adfb8f14fc8 |  |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
| tk-44703ae141e1 |  | AC1, AC2, AC3 | C1, C2, C3, DONT1, DONT2, DONT3 |  |
| tk-a99c130dd6b9 |  | AC1, AC2, AC4, AC5 | C1, C2, C4, DONT1 |  |
