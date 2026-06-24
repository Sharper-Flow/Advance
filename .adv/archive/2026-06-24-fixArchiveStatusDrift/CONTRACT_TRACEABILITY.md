# Contract Traceability

**Change ID:** fixArchiveStatusDrift
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-24T18:52:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer verdict READY after post-remediation; archive pending_merge recovery implemented in plugin/src/tools/change.ts and covered by change.archive-phase9.test.ts including rerun idempotency. Targeted suite passed runId tr_mqsfehzn_c8ba07c5. |
| SC2 | success_criterion | pass | review | verifyStatusRepairReadAfterWrite requires show=archived, default in-flight list omits change, archived list contains exactly once, and fails closed on thrown readback. change.status-repair.test.ts passed runId tr_mqsfehzn_c8ba07c5. |
| SC3 | success_criterion | pass | review | adv_status summary caps recent changes before enrichment and recommendations with omitted counts; status.test.ts 120-change regression passed runId tr_mqsfehzn_c8ba07c5. |
| SC4 | success_criterion | pass | review | adv_change_status_repair target_path routes through withTargetPathStore with temporal-required and emits targetRepairPacket on unserviceable target. change.status-repair.test.ts passed runId tr_mqsfehzn_c8ba07c5. |
| SC5 | success_criterion | pass | review | Failed phase9 without reachability proof returns phase9Failure recoverable:false and does not save archived; status repair readback throws return success:false. Targeted suite passed runId tr_mqsfehzn_c8ba07c5. |
| AC1 | acceptance_criterion | pass | test | change.archive-phase9.test.ts covers PR-merged pending_merge recovery and rerun idempotency; targeted suite passed runId tr_mqsfehzn_c8ba07c5. |
| AC2 | acceptance_criterion | pass | test | change.archive-phase9.test.ts `classifies failed phase9 without marking archived when recovery proof is missing`; targeted suite passed runId tr_mqsfehzn_c8ba07c5. |
| AC3 | acceptance_criterion | pass | test | change.status-repair.test.ts covers successful archived readback and stale/throwing readback failures; targeted suite passed runId tr_mqsfehzn_c8ba07c5. |
| AC4 | acceptance_criterion | pass | test | status.test.ts `summary view caps recent changes before enrichment and reports omitted counts`; targeted suite passed runId tr_mqsfehzn_c8ba07c5. |
| AC5 | acceptance_criterion | pass | test | status.test.ts `changes view keeps full recent-change drilldown uncapped`; targeted suite passed runId tr_mqsfehzn_c8ba07c5. |
| AC6 | acceptance_criterion | pass | test | Regression coverage spans change.archive-phase9.test.ts, change.status-repair.test.ts, and status.test.ts; targeted suite passed 84 tests runId tr_mqsfehzn_c8ba07c5. |
| AC7 | acceptance_criterion | pass | test | Implementation uses ADV store/readback APIs and recovery writer; reviewer verdict READY found no direct external ADV state reads/writes. pnpm run check passed runId tr_mqsfhu08_d64fcb5b. |
| AC8 | acceptance_criterion | pass | test | target_path repair tests assert target_confirmed/confirmationEvidence and temporal-required serviceability; fallback packet emitted on target queue failure. Targeted suite passed runId tr_mqsfehzn_c8ba07c5. |
| AC9 | acceptance_criterion | pass | test | pnpm run check passed runId tr_mqsfhu08_d64fcb5b; targeted modified-tool suite passed runId tr_mqsfehzn_c8ba07c5. |
| C1 | constraint | respected | static_check | Outputs use gates/phase9_status, PR reachability result, archive bundle existence, target serviceability, and canonical readback counts/status. No title/name inference used. |
| C2 | constraint | respected | static_check | Existing-bundle archive retry and post-PR pending_merge rerun tests prove safe rerun; status repair readback fail-closed prevents false success. |
| C3 | constraint | respected | static_check | adv_change_status_repair validates approval evidence before target routing and passes target_confirmed/confirmationEvidence into withTargetPathStore with temporal-required for mutation. |
| C4 | constraint | respected | static_check | Summary is capped before enrichment; explicit changes/health/hygiene view plans remain available. Changes-view uncapped regression passed. |
| C5 | constraint | respected | static_check | PR-mode recovery uses resolveReleaseReachability/readPrMergeState path via verifyReleaseEvidenceFromMain; no git branch --merged-only proof. |
| C6 | constraint | respected | static_check | Files touched are Advance repo files only; PokeEdge remains downstream observation target for later repair verification. |
| DONT1 | avoidance | respected | review | Reviewer READY found no direct external ADV state file edits; code uses store APIs and recovery writer. |
| DONT2 | avoidance | respected | review | Archive recovery test/proof path uses PR merge/reachability helpers; no `git branch --merged` sole authority introduced. |
| DONT3 | avoidance | respected | review | Recovery keyed by changeId, gates, archive bundle, phase9 status, PR proof, and readback; no title/name matching path added. |
| DONT4 | avoidance | respected | review | Default adv_status summary skips detailed providers and caps rows/recommendations; no unbounded default GitHub/API calls introduced. |
| DONT5 | avoidance | respected | review | No PokeEdge issue or change mutation performed during Advance implementation; downstream repair deferred until release. |
| DONT6 | avoidance | respected | review | Worktree registry cleanup not absorbed; changes limited to status summary boundedness, archive recovery, and repair consistency. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-da4695ad6a2f |  | AC3, AC4, AC6 | C4, DONT1 |  |
| tk-cd42c912e80b | AC3, AC4 |  | C1, C2, DONT4 |  |
| tk-176e46b737a3 | AC4, AC6 |  | C1, C2, DONT3 |  |
| tk-81f50b1f3a8c | AC1, AC2, SC1, SC5 | AC1, AC2, AC6 | C1, C2, C5, DONT2, DONT3 |  |
| tk-b44f201306ef | AC4, AC5, SC3 | AC4, AC5, AC6 | C4, DONT4 |  |
| tk-3d5aff890fad | SC1, SC2, SC3, SC4, SC5 | AC6 | C1, C2, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
| tk-0d0ebb995496 | AC3, AC8, SC2, SC4, SC5 | AC3, AC6, AC7, AC8 | C1, C2, C3, DONT1, DONT3 |  |
| tk-bce8a79e709a |  | AC9, AC6 | C4, DONT1 | Verification-only task. |
