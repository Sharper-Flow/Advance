# Contract Traceability

**Change ID:** readCliStatusVisibility
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-06T18:09:48.886Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | summariesFromVisibility builds rows from AdvChangeId/Title/Status/CurrentGate/LastSignalAt/CreatedAt; loadLiveSummaries connects + calls it; bin/adv runStatus uses loadLiveSummaries. Tests: live-status.test.ts L141-161 (summary from attrs), L255-277 (payload from summaries). |
| AC2 | acceptance_criterion | pass | test | buildSummaryFromSearchAttributes maps AdvChangeId→id, AdvChangeTitle→title, AdvChangeStatus→status, gatesFromCurrentGate→gateProgressStr/firstIncompleteGate, AdvLastSignalAt/AdvCreatedAt→lastActivityAt. Tests: L141-161, L178-193, L195-207. |
| AC3 | acceptance_criterion | pass | test | buildSummaryFromSearchAttributes returns null when AdvCurrentGate='done'; summariesFromVisibility drops nulls. Tests: L163-176 (terminal excluded), L209-244 (doneChange dropped from results). |
| AC4 | acceptance_criterion | pass | test | summariesFromVisibility throws on list failure → caller catches → buildLiveStatusFailure returns live:false with remediation. Tests: L246-253 (visibility failure propagates). bin/adv L126-134 catches and emits failure. |
| AC5 | acceptance_criterion | pass | test | bin/adv runStatus no longer imports or calls listLiveChangeStates/loadLiveStatus. Uses loadLiveSummaries instead. cli-bridge-contract.test.ts asserts no getState query in new read path. |
| AC6 | acceptance_criterion | pass | test | loadLiveSummaries is worker-free (Visibility search attributes only). warp-project-launcher calls adv status --json which uses loadLiveSummaries. No per-project worker dependency. |
| AC7 | acceptance_criterion | respected | test | bin/adv runStatus only reads; no mutation subcommands added. Help text lists only status and roadmap (both read-only). |
| AC8 | acceptance_criterion | pass | test | .adv/specs/advance-meta/spec.json includes rq-visibilityStatusRead01. docs/specs/advance-meta.md updated. cli-bridge-contract.test.ts updated. |
| C1 | constraint | respected | static_check | Source files edited in repo worktree; deploy via scripts/deploy-local.sh --fix. |
| C2 | constraint | respected | static_check | bin/adv remains read-only; no mutation authority added. |
| C3 | constraint | respected | static_check | gatesFromCurrentGate in live-status.ts imports and uses GATE_ORDER from bin/lib/changes.ts. |
| C4 | constraint | respected | static_check | No changes to plugin/src/temporal/workflows.ts, worker code, or dist. Only bin/ read path changed. |
| C5 | constraint | respected | static_check | No --no-color output parsing. loadLiveSummaries returns structured ChangeSummary objects. |
| DONT1 | avoidance | respected | review | Active rows built exclusively from live Visibility search attributes; no disk-projected active changes. |
| DONT2 | avoidance | respected | review | New path uses client.workflow.list (Visibility) with no per-project worker. Old query path still exists but not called by default status. |
| DONT3 | avoidance | respected | review | Temporal failure → throw → buildLiveStatusFailure (live:false, zero rows). No weakening. |
| DONT4 | avoidance | respected | review | No changes to plugin/src/tools/status.ts or MCP adv_status tool. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-393f978fbc1b | AC1, AC2, AC3, AC4, AC5, AC7 | AC1, AC2, AC3, AC4, AC5, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
| tk-ac5e4250f5e3 | AC6, AC8 | AC5, AC6, AC8 | C1, DONT1, DONT2, DONT3, DONT4 |  |
