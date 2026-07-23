# Contract Traceability

**Change ID:** fixDurableProofFallback
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T15:25:26.561Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | AC5 live proof: addDependencyAwareResume (terminated workflow, shipped) retired via disk-fallback, git 98a40572. loadAuditedDiskReleaseGate shipped-reconciliation accepts on finalizationStatus=shipped + release-gate recovery provenance. |
| SC2 | success_criterion | pass | review | AC2a test pins non-shipped + non-matching evidence -> blocked; releaseGateEvidenceMatches still required when shipped=false. Reviewer READY. |
| SC3 | success_criterion | pass | review | AC4 related-scan: adv-reviewer found no remaining store-backed/disk-fallback acceptance asymmetry in touched scope. Single-site fix. |
| AC1 | acceptance_criterion | pass | test | Test AC1 (change.archive-phase9.test.ts): disk gate done + release-recovery provenance + non-matching evidence + finalizationStatus=shipped -> accepted. Typed runId tr_mrxngwje_c27e60d1 (60/60). |
| AC2 | acceptance_criterion | pass | test | Tests AC2a (non-shipped block) + AC2b forge guard (non-allowlisted recovery reason rejected even when shipped). Typed runId tr_mrxngwje_c27e60d1. |
| AC3 | acceptance_criterion | pass | test | Test AC3: store-backed done path unchanged; 109 tests pass (archive-phase9 + gate.test.ts), no regression. Typed runId tr_mrxngwje_c27e60d1. |
| AC4 | acceptance_criterion | pass | test | adv-reviewer READY: audited archive-gate.ts + gate-readiness release surface, no remaining acceptance asymmetry in touched scope; broader documented. No scope drift. 109 tests pass. |
| AC5 | acceptance_criterion | pass | test | PROVEN live: real stuck change addDependencyAwareResume archived cleanly, no manual state mutation. git 98a40572 (archive bundle) + f48a1451 + 0fc90384 (merge). |
| C1 | constraint | respected | static_check | Fix path is projection-reconciliation only (acceptance logic in verifyReleaseGateDurableForArchive/loadAuditedDiskReleaseGate). No git/workflow mutation APIs in touched code. Reviewer confirmed. |
| C2 | constraint | respected | static_check | No state-rewrite writes; only acceptance-rule relaxation. shipped derived read-only from finalizationStatus === 'shipped'. |
| C3 | constraint | respected | static_check | Grep confirms shipped = input.finalizationStatus === 'shipped'; no other source. finalizationStatus flows from git-finalize (shipped only on confirmed default-branch reachability/merge). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-acc591286f15 | AC1, AC2, AC3, AC4, SC1, SC2, SC3, C1, C2, C3 | AC1, AC2, AC3, AC4 |  |  |
| tk-7a793f729a0d | AC5 | AC5 |  |  |
