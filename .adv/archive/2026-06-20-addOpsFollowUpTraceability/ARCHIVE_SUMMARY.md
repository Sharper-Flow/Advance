# Archive: Add ops follow-up traceability

**Change ID:** addOpsFollowUpTraceability
**Archived:** 2026-06-20T05:25:21.915Z
**Created:** 2026-06-20T02:39:37.521Z

## Tasks Completed

- ✅ Update ops-follow-up spec law and tool contract anchors
  > Added ops follow-up spec law across advance-workflow, subagent-reports, and backlog-coordination; regenerated advance-workflow docs mirror; added asset tests and required source citations. Bumped spec versions and preserved schema checks. Added missing rq-archiveBranchCleanup01 citation discovered by related invariant scan.
- ✅ Add typed ops-follow-up state, workflow signals, and compatibility normalization
  > Added typed ops follow-up schemas and public exports; added optional ops_followup and ops_followup_links to Change schema; added signal payloads and workflow signal handlers for seeding profile, adding links, and appending evidence; added state/projection compatibility; regenerated change schema; added schema/state/workflow/projection tests; formatted pre-existing adv-triage relevance asset test.
- ✅ Implement typed follow-up promotion from reports, agenda fallback, and manual source
  > Added adv_followup_promote tool in plugin/src/tools/followup.ts with typed required/report/agenda/manual source support; seeds child ops_followup profile and parent ops_followup_links using existing signals; detects duplicates structurally; returns PARTIAL_LINK diagnostic if parent link write fails; registered tool, title, CLI matrix, and placeholder preflight policy; added 10 tests.
- ✅ Implement ops evidence append and status update tool
  > Added adv_ops_evidence_add tool with required env/action/status/summary, optional batch/next_step/completion_signal, generated id and recorded_at, structural mapping from tool status to evidence/profile status, signal-based append/update, registry/title/preflight/CLI updates, and 9 direct tests plus affected-suite coverage.
- ✅ Expose linked ops work in change, WIP, and planning/collision read paths
  > Added shared ops follow-up compact projection helper; extended ChangeSummary and ChangeListResponse with ops_followup/ops_followup_links; carried ops state through store-temporal summary/cache/list paths; exposed full ops profile/links in adv_change_show; exposed compact annotations in adv_change_list and adv_wip_state; added change/backlog/storage tests. No new search attributes or agenda text correctness path introduced.
- ✅ Implement release/archive handoff and blocking-link enforcement
  > Added ops follow-up release blockers and open obligation reporting: gate-readiness blocks incomplete `blocks` links and required-handoff non-blocking links; archive output surfaces openOpsObligations; GateReadinessBlocker includes structural link/change/relationship metadata; schemas regenerated; tests cover blocking vs non-blocking, handoff semantics, archive surfacing, and required-critical preservation.
- ✅ Run integration verification, backward compatibility sweep, and schema/build checks
  > Verified ops follow-up traceability end-to-end through targeted regressions, full test suite, check, and build. Added final compatibility fixes discovered by verification: updated subagent reports asset contract to include rq-opsFollowPromotion01, and made advisory archived-branch hygiene in adv_status tolerate non-git/degraded project roots so status remains available for clean fixtures.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For Temporal-backed ADV state extensions, keep authority split explicit in types and tests: workflow state owns correctness, display snapshots are non-authoritative, signals are idempotent by structural IDs, and legacy optional-field normalization prevents old changes from failing strict parsing.
- **[pattern]** For follow-up promotion features, keep promotion as a thin dedicated tool that wraps existing change creation and fires typed workflow signals; preserve source identity structurally (report/change/scope/attempt/contract/agenda) and make duplicate detection use that identity, not title similarity.
- **[pattern]** For evidence append tools, expose a caller-friendly operational status enum but map structurally to separate internal evidence-entry and aggregate-profile statuses; generate provenance fields (id, recorded_at) inside the tool and reject blank required evidence fields before signaling.
- **[pattern]** For new change metadata that must appear in hot read paths, extend ChangeSummary/list projections first and share a compact projection helper across adv_change_list/adv_wip_state; this keeps readback structural without artifact hydration or duplicated display logic.
- **[pattern]** For release blockers, keep blocker metadata structural in GateReadinessBlocker (linkId/changeId/relationship) and separately expose non-blocking open obligations in archive/release reports; this distinguishes hard gates from surviving handoff context without message parsing.
- **[gotcha]** adv_status summary includes archived branch hygiene; because it is advisory and git-backed, wrap main-checkout resolution so non-git temp fixtures/degraded roots still return status instead of failing on git rev-parse.
