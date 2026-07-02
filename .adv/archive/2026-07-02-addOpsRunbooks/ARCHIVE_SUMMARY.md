# Archive: Add ops runbooks

**Change ID:** addOpsRunbooks
**Archived:** 2026-07-02T19:41:52.997Z
**Created:** 2026-07-02T17:02:13.956Z

## Tasks Completed

- ✅ Add ops-run spec laws
  > Added four advance-workflow spec-law requirements for ops runbooks: rq-opsRunbook01 (durable runbook-shaped ops state and resume), rq-opsRunApproval01 (production approval authority and bounded autonomous classification), rq-opsRunEvidence01 (append-only secret-safe ops evidence and completion proof), and rq-opsRunReleaseReadiness01 (fresh child/source-of-truth release authority). Mirrored the new laws in docs/specs/advance-workflow.md and extended ops-follow-up asset tests to assert presence, priority, scenario coverage, and version bump.
- ✅ Model ops run schemas and legacy projection
  > Added typed ops runbook schemas under OpsFollowupProfile: OpsRunStatus, step kind/status, approval policy discriminated union, secret-safe artifact refs, run plan, steps, run evidence, and OpsRun. OpsFollowupProfile now defaults runs: [] so legacy profiles remain readable. Added schema tests for runbook parsing, bounded autonomous bounds enforcement, artifact pointer/no-artifact rationale enforcement, minimal legacy default projection, and workflow reseed carrying runs[].
- ✅ Persist ops run workflow signals
  > Added Temporal signal payloads, message bindings, workflow handlers, and reducers for ops runbook state: opsRunUpserted and opsRunEvidenceAppended. Reducers require an existing ops_followup profile, upsert runs idempotently by run ID, append typed run evidence, update run status from entry.next_status, update optional child profile status from follow-up status overrides, and record updated_at/lastSignalAt. Extended message-contract tests, reducer tests, workflow signal tests, and existing followup promotion to seed runs: [].
- ✅ Add ops run tools and preflight
  > Added source tool surfaces adv_ops_run_upsert and adv_ops_run_evidence_add. Upsert creates/replaces typed ops runs and defaults unclassified prod execute steps to approval-required. Evidence append validates secret-safe summaries, enforces approval-required prod execute steps before completion authority, appends typed run evidence, maps complete/operational statuses back to profile status when applicable, supports dry run, and registers both tools in tool-registry. Exported ops run schemas/types through the public type barrel.
- ✅ Reconcile linked ops readiness from child state
  > Added OpsFollowupResolution as a verified-at-read proof on outbound ops links and changed release readiness to require child/source-of-truth resolution for completed blocking or required-handoff obligations. Stale parent status complete without resolution now blocks as OPS_FOLLOWUP_STATUS_UNVERIFIED; complete resolution must include completion signal, health verification, and rollback/cleanup disposition. Unreachable child proof blocks blocking/required-handoff links. Open obligation reporting now uses resolution status and treats unproven complete links as open.
- ✅ Surface ops run state in readbacks and reports
  > Expanded compact ops follow-up annotations to include bounded run summaries (run count, run evidence count, up to 3 compact runs) and link authority metadata (status_source, completion_proof, compact resolution). Extended archive/open-obligation report payloads with status_source, completion_proof, verified_at, and unreachable resolution errors so stale parent snapshots and unreachable child state are visible rather than treated as authoritative/N/A. Added/updated tests for WIP readbacks, change-list expectations, and archive report obligations.
- ✅ Update ADV command contracts for ops runbooks
  > Documented ops runbook task shaping in prep, execution-time adv_ops_run_upsert/adv_ops_run_evidence_add requirements in apply, acceptance proof expectations in review, release-readiness checks in harden, and archive sign-off rendering rules for status_source/completion_proof/unreachable child state. Added asset coverage so command contracts retain ops-runbook authority anchors.
- ✅ Verify ops runbook compatibility and full gate readiness
  > Ran final verification, repaired schema/prompt/asset drift exposed by smoke/full suites, and confirmed repo checks. Generated change.schema.json for ops run/resolution schemas; added ops-run tools to ADV_TOOL_NAMES and display titles; updated CLI matrix/frozen snapshot; cited approval-consequence spec requirements; replaced unavailable Epic command references with typed available tools. Final smoke, full test suite, and build pass.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** For spec-law docs in this repo, avoid running Prettier over generated/broad docs/spec artifacts unless intentionally regenerating them; it can churn unrelated existing formatting. Prefer narrow manual spec/doc edits plus targeted asset tests, and limit formatter checks to TS/JSON surfaces that are already Prettier-owned.
- **[pattern]** For nested optional ADV state extensions, add discriminated-union schemas for structurally exclusive cases (e.g., approval policy, artifact pointer vs no-artifact rationale) and default the new array/object field at the owning profile boundary to preserve legacy profile readability.
- **[gotcha]** Ops run status and ops follow-up profile status are related but not identical: run-only states like planned/approval_required/approved must not be assigned directly to OpsFollowupProfile.status. Signal payloads should carry child-profile status overrides using OpsFollowupStatus while run status follows the run evidence next_status.
- **[pattern]** For ops-run tool preflight, keep production approval authority at the tool boundary: default unclassified prod execute steps to approval_required during run upsert, then reject prod execute evidence when the matching step lacks approval evidence or bounded-autonomous classification. This keeps completion authority structural before workflow state mutation.
- **[pattern]** Release readiness cannot query child workflows inside sandbox-safe gate evaluation. Use an optional verified-at-read proof projected onto the parent link; gate-readiness consumes that proof deterministically and treats stale complete parent status without proof as unresolved.
- **[pattern]** Compact ops readbacks should separate display snapshot from authority: keep legacy link.status for compatibility, add status_source/completion_proof/resolution metadata for truth, and bound run summaries to IDs/status/env/action/counts instead of raw evidence payloads.
- **[pattern]** Command-contract changes should be backed by asset tests that anchor the exact operational vocabulary/tool names agents must follow. This keeps prompt/command docs aligned with typed tool authority after source code changes.
- **[gotcha]** Adding new ADV tools requires updating more than tool registration: ADV_TOOL_NAMES, display titles, frozen no-removal snapshot, live prompt references, CLI surface matrix, and public schema artifacts may all drift. Full suite is needed to catch all asset guards.
