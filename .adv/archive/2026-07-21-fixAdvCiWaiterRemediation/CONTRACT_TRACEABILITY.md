# Contract Traceability

**Change ID:** fixAdvCiWaiterRemediation
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T12:24:12.795Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | adv-ci-waiter.md gains explicit section between CI-success-is-not-MERGED and Bounded-output. Test in adv-ci-waiter-assets.test.ts asserts section header, do-not-remediate, classification, and parent-responsibility clauses. 13/13 tests pass (tr_mrum7ibh). |
| AC2 | acceptance_criterion | pass | test | spec.json rq-releaseFinalization04.2 scenario wording updated: 'red CI is reported by the waiter and remediation is the parent orchestrator's responsibility (the waiter has edit: deny and no bounded attempt budget)'. Test in archive-release-finalization-assets.test.ts asserts 'waiter's bounded attempt budget' no longer present. 5/5 tests pass (tr_mrumcccc). |
| AC3 | acceptance_criterion | pass | test | docs/specs/advance-workflow.md line 713 mirrored identically. Same test asserts both spec and docs mirror are aligned. |
| AC4 | acceptance_criterion | pass | test | adv-archive.md spawn language for adv-ci-waiter now contains 'waiter polls and reports only — it has edit: deny and cannot remediate' and 'Do not ask the waiter to remediate'. Test in adv-ci-waiter-assets.test.ts asserts these clauses. |
| AC5 | acceptance_criterion | pass | test | 3 new test assertions added across adv-ci-waiter-assets.test.ts and archive-release-finalization-assets.test.ts. All pass. RED→GREEN evidence: tr_mrum653w → tr_mrum7ibh; tr_mruma21e → tr_mrumcccc. |
| AC6 | acceptance_criterion | pass | test | Host config file ~/.config/opencode/instructions/oc-ci-wait.md line 27 rewritten. Post-edit grep confirms line contains 'waiter returns to you' and 'edit: deny'. File is outside the repo; verified via shell read, not a repo test. |
| C1 | constraint | respected | static_check | adv-ci-waiter.md tool grants unchanged (edit:deny, morph_edit:deny, task:deny, bash:allow). Only policy wording added. |
| C2 | constraint | respected | static_check | Polling cadence (20-30s sampling, oc-ci-wait CLI ownership) unchanged in all touched files. |
| C3 | constraint | respected | static_check | 13/13 adv-ci-waiter-assets tests + 5/5 archive-release-finalization tests pass. No existing assertion weakened. |
| DONT1 | avoidance | respected | review | No spawn-time validator code introduced. Touched files: 4 markdown/spec/docs + 1 baseline JSON + 2 test files. |
| DONT2 | avoidance | respected | review | adv-ci-waiter.md polling cadence (20-30s) unchanged. oc-ci-wait CLI ownership unchanged. |
| DONT3 | avoidance | respected | review | fixAdvCiWaiterRemediation branch contains only adv-ci-waiter policy changes. fixPacketDefectWorkDiscard remains a separate PR (#269). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-7df8b5b1a61d | AC2, AC3 |  | C3 |  |
| tk-6b66ce111deb | AC1 |  | C1, C2 |  |
| tk-8c0714ae2fba |  | AC5 |  |  |
| tk-e623a302cece | AC4 |  |  |  |
| tk-13b54e924947 | AC6 |  |  | Host config file lives outside the repo at ~/.config/opencode/instructions/oc-ci-wait.md; cannot be evidenced via repo tests. Verification is a post-edit read confirmed in task notes. |
