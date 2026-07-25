# Acceptance

Reviewed at: 2026-07-25T15:50:15.255Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1:** `adv_change_archive` with `finalizationStatus="shipped"` + store release-gate `pending` + disk release-gate `pending` → archive **succeeds** (durable proof accepts via `shipped`), and the release gate is reconciled to `done`. | pass | archive-gate.test.ts AC1: shipped + store-pending + disk-pending -> rescue accept (source shipped-finalization), gate reconciled done. tr_ms0iwxlk. |
| AC2 | acceptance_criterion | **AC2:** `adv_change_archive` with `finalizationStatus` ≠ `"shipped"` + release-gate `pending` → still **rejected** with the existing error (guard preserved). | pass | archive-gate.test.ts AC2: non-shipped (pending_merge/blocked) + pending -> rejected, strict guard preserved. |
| AC3 | acceptance_criterion | **AC3:** The `shipped`-accepted proof records/links the git reachability evidence (`mergeCommitSha`, `pushStatus`, route) in the proof result / release-gate completion. | pass | accepted ReleaseGateProof carries mergeCommitSha/pushStatus/route; AC3 test. |
| AC4 | acceptance_criterion | **AC4:** Existing paths preserved: `shipped` + disk-gate-`done`; `shipped` + evidence-match; un-shipped strict evidence-match. | pass | regression matrix: shipped+disk-done, shipped+evidence-match, un-shipped strict -> sources/behavior preserved (AC4 tests). |
| AC5 | acceptance_criterion | **AC5:** `rq-releaseProjectionDurability01` semantics strengthened (not weakened); asset/citation test updated. | pass | rq-releaseProjectionDurability01.4/.5 added (spec 1.38); asset test strengthened + passes. |
| C1 | constraint | **C1:** `shipped` derived ONLY from `finalization.status === "shipped"` (structural, inside the verifier). | respected | shipped derived ONLY from finalization.status === 'shipped' inside verifier (archive-gate.ts L1042); no caller-trusted boolean. |
| C2 | constraint | **C2:** No caller-trusted boolean / no new forgeable input. | respected | no caller-trusted boolean; full GitFinalizeOutcome passed, status derived structurally. |
| C3 | constraint | **C3:** Preserve the strict guard for non-`shipped` (evidence-match + recovery-audit unchanged). | respected | non-shipped guard preserved (evidence-match + recovery-audit unchanged); KD3. |
| C4 | constraint | **C4:** No regression of the existing shipped/disk/evidence-match tests. | respected | no regression: 123 unit tests + pnpm run check clean; existing store/disk/evidence-match paths unchanged. |
| DONT1 | avoidance | **DONT1:** MUST NOT accept an un-shipped change under any lag scenario. | respected | un-shipped never accepted under lag (blocked/pending_merge guard tests). |
| DONT2 | avoidance | **DONT2:** MUST NOT remove the recovery-audit requirement for un-shipped disk fallbacks. | respected | recovery-audit requirement for un-shipped disk fallbacks unchanged. |
| DONT3 | avoidance | **DONT3:** MUST NOT introduce a caller-supplied "trust me" flag. | respected | no caller-supplied trust flag introduced. |
| OOS1 | out_of_scope | Broad rework of gate-projection propagation speed (covered by the separate "serialize concurrent disk-projection writes" follow-up #3). | missing |  |
| OOS2 | out_of_scope | Worker-bundle freshness gating (follow-up #2). | missing |  |

