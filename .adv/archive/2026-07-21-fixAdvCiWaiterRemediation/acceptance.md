# Acceptance

Reviewed at: 2026-07-21T12:24:12.795Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `.opencode/agents/adv-ci-waiter.md` contains an explicit rule: on red CI, return immediately to the parent with classification; do NOT remediate. | pass | adv-ci-waiter.md gains explicit section between CI-success-is-not-MERGED and Bounded-output. Test in adv-ci-waiter-assets.test.ts asserts section header, do-not-remediate, classification, and parent-responsibility clauses. 13/13 tests pass (tr_mrum7ibh). |
| AC2 | acceptance_criterion | `.adv/specs/advance-workflow/spec.json` `rq-releaseFinalization04.2` body and scenarios no longer reference "the waiter's bounded attempt budget" — remediation authority is the parent's. | pass | spec.json rq-releaseFinalization04.2 scenario wording updated: 'red CI is reported by the waiter and remediation is the parent orchestrator's responsibility (the waiter has edit: deny and no bounded attempt budget)'. Test in archive-release-finalization-assets.test.ts asserts 'waiter's bounded attempt budget' no longer present. 5/5 tests pass (tr_mrumcccc). |
| AC3 | acceptance_criterion | `docs/specs/advance-workflow.md` mirror matches the spec change. | pass | docs/specs/advance-workflow.md line 713 mirrored identically. Same test asserts both spec and docs mirror are aligned. |
| AC4 | acceptance_criterion | `.opencode/command/adv-archive.md` spawn-instruction language aligns: parent does remediation; waiter reports. | pass | adv-archive.md spawn language for adv-ci-waiter now contains 'waiter polls and reports only — it has edit: deny and cannot remediate' and 'Do not ask the waiter to remediate'. Test in adv-ci-waiter-assets.test.ts asserts these clauses. |
| AC5 | acceptance_criterion | `plugin/src/adv-ci-waiter-assets.test.ts` asserts the new policy clauses in adv-ci-waiter.md. | pass | 3 new test assertions added across adv-ci-waiter-assets.test.ts and archive-release-finalization-assets.test.ts. All pass. RED→GREEN evidence: tr_mrum653w → tr_mrum7ibh; tr_mruma21e → tr_mrumcccc. |
| AC6 | acceptance_criterion | `~/.config/opencode/instructions/oc-ci-wait.md` line 27 rewritten to drop "waiter remediates" language. (Host config, not in repo; verified separately.) | pass | Host config file ~/.config/opencode/instructions/oc-ci-wait.md line 27 rewritten. Post-edit grep confirms line contains 'waiter returns to you' and 'edit: deny'. File is outside the repo; verified via shell read, not a repo test. |
| C1 | constraint | MUST NOT remove adv-ci-waiter entirely (still useful as poll+report). | respected | adv-ci-waiter.md tool grants unchanged (edit:deny, morph_edit:deny, task:deny, bash:allow). Only policy wording added. |
| C2 | constraint | MUST NOT change the waiter's tool grants (bash:allow for `oc-ci-wait` CLI is still needed). | respected | Polling cadence (20-30s sampling, oc-ci-wait CLI ownership) unchanged in all touched files. |
| C3 | constraint | MUST keep existing tests passing. | respected | 13/13 adv-ci-waiter-assets tests + 5/5 archive-release-finalization tests pass. No existing assertion weakened. |
| DONT1 | avoidance | Do not introduce spawn-time structural validation (out of scope). | respected | No spawn-time validator code introduced. Touched files: 4 markdown/spec/docs + 1 baseline JSON + 2 test files. |
| DONT2 | avoidance | Do not change the polling cadence or `oc-ci-wait` ownership model. | respected | adv-ci-waiter.md polling cadence (20-30s) unchanged. oc-ci-wait CLI ownership unchanged. |
| DONT3 | avoidance | Do not bundle this fix with the unrelated fixPacketDefectWorkDiscard change. | respected | fixAdvCiWaiterRemediation branch contains only adv-ci-waiter policy changes. fixPacketDefectWorkDiscard remains a separate PR (#269). |

