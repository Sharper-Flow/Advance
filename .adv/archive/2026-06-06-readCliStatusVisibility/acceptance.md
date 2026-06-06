# Acceptance

Reviewed at: 2026-06-06T18:09:48.886Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv status --json` for a project with non-archived change workflows but no open session returns `source:"temporal"`, `live:true`, and one active row per non-terminal change built from Visibility search attributes. | pass | summariesFromVisibility builds rows from AdvChangeId/Title/Status/CurrentGate/LastSignalAt/CreatedAt; loadLiveSummaries connects + calls it; bin/adv runStatus uses loadLiveSummaries. Tests: live-status.test.ts L141-161 (summary from attrs), L255-277 (payload from summaries). |
| AC2 | acceptance_criterion | Each row's `id`, `title`, `status`, `gateProgressStr`, `firstIncompleteGate`, and `lastActivityAt` are derived from `AdvChangeId`, `AdvChangeTitle`, `AdvChangeStatus`, `AdvCurrentGate`, `AdvLastSignalAt`/`AdvCreatedAt`. | pass | buildSummaryFromSearchAttributes maps AdvChangeId→id, AdvChangeTitle→title, AdvChangeStatus→status, gatesFromCurrentGate→gateProgressStr/firstIncompleteGate, AdvLastSignalAt/AdvCreatedAt→lastActivityAt. Tests: L141-161, L178-193, L195-207. |
| AC3 | acceptance_criterion | Terminal-complete changes (`AdvCurrentGate` resolves to all gates done) are excluded from active rows (`firstIncompleteGate` null). | pass | buildSummaryFromSearchAttributes returns null when AdvCurrentGate='done'; summariesFromVisibility drops nulls. Tests: L163-176 (terminal excluded), L209-244 (doneChange dropped from results). |
| AC4 | acceptance_criterion | When the Temporal connection or Visibility list fails, `adv status --json` returns `live:false` fail-closed with remediation and zero rows; no disk-projected active rows. | pass | summariesFromVisibility throws on list failure → caller catches → buildLiveStatusFailure returns live:false with remediation. Tests: L246-253 (visibility failure propagates). bin/adv L126-134 catches and emits failure. |
| AC5 | acceptance_criterion | `adv status` no longer issues a per-change `getState` workflow query for the default status table. | pass | bin/adv runStatus no longer imports or calls listLiveChangeStates/loadLiveStatus. Uses loadLiveSummaries instead. cli-bridge-contract.test.ts asserts no getState query in new read path. |
| AC6 | acceptance_criterion | `warp-project-launcher --adv-changes <project>` renders active ADV rows for an inactive project (e.g. `/home/jon/dev/pokeedge`). | pass | loadLiveSummaries is worker-free (Visibility search attributes only). warp-project-launcher calls adv status --json which uses loadLiveSummaries. No per-project worker dependency. |
| AC7 | acceptance_criterion | No CLI mutation subcommands are added; CLI remains read-only. | respected | bin/adv runStatus only reads; no mutation subcommands added. Help text lists only status and roadmap (both read-only). |
| AC8 | acceptance_criterion | `advance-meta` spec and tests document the Visibility-search-attribute status read. | pass | .adv/specs/advance-meta/spec.json includes rq-visibilityStatusRead01. docs/specs/advance-meta.md updated. cli-bridge-contract.test.ts updated. |
| C1 | constraint | Edit source-of-truth files; deploy via `scripts/deploy-local.sh --fix`. | respected | Source files edited in repo worktree; deploy via scripts/deploy-local.sh --fix. |
| C2 | constraint | Keep `bin/adv` read-only; no mutation authority. | respected | bin/adv remains read-only; no mutation authority added. |
| C3 | constraint | Reuse canonical `GATE_ORDER` from `bin/lib/changes.ts` for gate synthesis. | respected | gatesFromCurrentGate in live-status.ts imports and uses GATE_ORDER from bin/lib/changes.ts. |
| C4 | constraint | Keep change-workflow and worker code unchanged (search attributes are already upserted); no worker/dist rebuild required for the CLI read path. | respected | No changes to plugin/src/temporal/workflows.ts, worker code, or dist. Only bin/ read path changed. |
| C5 | constraint | Do not parse human `adv status --no-color` output. | respected | No --no-color output parsing. loadLiveSummaries returns structured ChangeSummary objects. |
| DONT1 | avoidance | Do not render stale disk-projected active changes as current rows. | respected | Active rows built exclusively from live Visibility search attributes; no disk-projected active changes. |
| DONT2 | avoidance | Do not reintroduce a per-project-worker dependency for the default status table. | respected | New path uses client.workflow.list (Visibility) with no per-project worker. Old query path still exists but not called by default status. |
| DONT3 | avoidance | Do not weaken fail-closed behavior when Temporal is unavailable. | respected | Temporal failure → throw → buildLiveStatusFailure (live:false, zero rows). No weakening. |
| DONT4 | avoidance | Do not change the MCP `adv_status` tool internal path in this change. | respected | No changes to plugin/src/tools/status.ts or MCP adv_status tool. |

