# Archive Briefing Digest

**Change ID:** addEpicRetirement
**Title:** Add Epic retirement
**Status:** archived
**Generated:** 2026-07-08T17:38:37.330Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 84 of 84 durable facts.

- **[archive_only_evidence]** decisions: Added retired projection schema and temporal store fallback tests — RED tests for storage read/write and workflow-not-found fallback.
- **[archive_only_evidence]** verification: pending (0) — Tests added; implementation in progress.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pending
- **[archive_only_evidence]** decisions: Extended existing epicArchived signal with expectedVersion and idempotencyKey instead of adding a new signal. — Keeps the internal workflow terminal status/signal surface unchanged while making the guard structural and version-safe.
- **[archive_only_evidence]** decisions: Store retire preflights completed progress, version, and active/future entries before persisting the retired projection and signaling archive. — Prevents mutation of incomplete Epics and satisfies the requirement to name blockers before any durable write.
- **[archive_only_evidence]** decisions: applyEpicArchivedToState returns EpicMutationResult and rejects incomplete Epics. — Ensures the guard is in the workflow/state layer, not just the tool layer.
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, and format:check all passed
- **[archive_only_evidence]** verification: cd plugin && ../bin/oc-test targeted -- src/temporal/epic-state.test.ts src/temporal/workflows.epic.test.ts src/storage/store-temporal/epics.test.ts (0) — 83 tests passed across the three targeted files
- **[archive_only_evidence]** verification: cd plugin && ../bin/oc-test targeted -- src/tools/epic.test.ts (0) — 79 epic tool tests passed with no regressions
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/temporal/epic-state.test.ts src/temporal/workflows.epic.test.ts src/storage/store-temporal/epics.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/tools/epic.test.ts
- **[agenda]** follow_ups: Verify whether AC3's merged-exclusion requirement for CLI requires a custom AdvEpicStatus search attribute; if so, scope it separately
- **[archive_only_evidence]** decisions: Used store.epics.retire dryRun for completed-candidate report — Reuses existing guarded retirement preflight to produce blocker details without mutating state
- **[archive_only_evidence]** decisions: Added status filter to adv_epic_list (active/completed/all) — Smallest typed surface that satisfies AC3/AC5/AC6 without adding a public adv_epic_retire tool
- **[archive_only_evidence]** decisions: Updated list-epic-workflows default query to ExecutionStatus=Running — Structural exclusion of retired Epic workflows per rq-epicRetiredListing01
- **[archive_only_evidence]** decisions: Active list in store-temporal filters progress.status === active — MCP active list should exclude completed/merged Epics even though they are still running; CLI cannot without search attributes
- **[archive_only_evidence]** decisions: Left CLI list as running-only/no-hydration — Preserves worker-free CLI constraint; completed/merged running workflows will still appear in CLI until custom search attribute is added or they are retired
- **[unresolved_action]** blockers: New adv_epic_list tests failing in src/tools/epic.test.ts
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Completed-but-unretired and merged Epics remain running and will appear in the CLI no-hydration active list. The MCP active list excludes them via progress.status filter. This is a known ambiguity between AC3 (excludes merged) and AC5/CLI worker-free constraint.
- **[archive_only_evidence]** verification: cd plugin && pnpm run typecheck (0) — TypeScript typecheck passes
- **[archive_only_evidence]** verification: cd plugin && ../bin/oc-test targeted -- src/temporal/list-epic-workflows.test.ts src/storage/store-temporal/epics.test.ts bin/lib/epic-list.test.ts (0) — list-epic-workflows, store-temporal/epics, and bin/lib/epic-list tests pass
- **[archive_only_evidence]** verification: cd plugin && ../bin/oc-test targeted -- src/tools/epic.test.ts (1) — 15 failures in epic.test.ts, mostly new tests and queued-mock off-by-one affecting subsequent tests
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/temporal/list-epic-workflows.test.ts src/storage/store-temporal/epics.test.ts bin/lib/epic-list.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/tools/epic.test.ts
- **[archive_only_evidence]** decisions: Reused existing store.epics.retire for both dry-run and real retirement — Keeps structural correctness and projection logic in one place; tool is a thin typed adapter.
- **[archive_only_evidence]** decisions: Enhanced epicError to include blockers when present — Required to surface active/incomplete Epic blocking entries from store errors as typed output.
- **[archive_only_evidence]** decisions: Included formatted epic snapshot in retirement success output — Makes the response immediately usable like adv_epic_show without requiring a follow-up call.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/epic.test.ts src/tool-registry.surface.test.ts src/advance-epics-assets.test.ts (0) — 163 tests passed including new adv_epic_retire cases and existing Epic owner-routing tests
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, and format:check all green
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke tests pass (57 tests) with no regressions
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/epic.test.ts src/tool-registry.surface.test.ts src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[agenda]** follow_ups: Confirm with orchestrator/user whether completed Epics auto-terminate their Temporal workflow (enables Visibility ExecutionStatus filter) or require explicit retirement.
- **[agenda]** follow_ups: Design must add a precondition guard on the archived transition (completed/no-active-entries) or an explicit force+evidence escape hatch, matching the merge path's terminal-source rejection.
- **[agenda]** follow_ups: Verify rq-epicOptionalMembership01 (orphaned-child-on-archive) stays green: retirement must not hard-block or invalidate in-flight child changes.
- **[archive_only_evidence]** sources: epic-state.ts applyEpicArchivedToState (no guard): applyEpicArchivedToState unconditionally sets state.status='archived' and progress.status='archived' with NO precondition — does not require completed status or check for active/in-flight entries. Contrast with applyEpicMergedToState (line 700-728) which rejects with code 'epic_not_active' when progress.status==='completed'. Retirement path can archive an in-flight Epic, violating proposal Must-Not 'Must not silently delete/hide active initiative state without typed transition'.
- **[archive_only_evidence]** sources: epicArchivedSignal has no tool caller: epicArchivedSignal is wired only in workflows.ts:1925-1930 handler and referenced in tests. Store epics.ts imports epicMergedSignal but NOT epicArchivedSignal; no store archive()/retire() method exists. No adv_epic_archive or adv_epic_retire tool in epicTools. The archived transition is dead code from a public-surface view — reachable only via internal signal, never fired by any user path.
- **[archive_only_evidence]** sources: recomputeEpicProgress completed vs workflow status divergence: recomputeEpicProgress derives progress.status='completed' when completed===total>0, but state.status (workflow lifecycle) stays 'active' until epicArchivedSignal. workflows.ts:1934-1948 only completes the workflow execution when state.status==='archived'. Completed Epics keep their workflow running indefinitely — root cause of the leak described in the proposal.
- **[archive_only_evidence]** sources: list-epic-workflows.ts enumerates all by type, no status filter: buildEpicVisibilityQuery returns only WorkflowType='epicWorkflow'; listEpicWorkflowIds filters by project prefix in-process. No ExecutionStatus or status attribute filter. Because completed Epics never complete their workflow (finding above), a Visibility ExecutionStatus filter alone would NOT hide completed-but-running Epics — the fix must make completion terminate the workflow AND/OR filter progress.status.
- **[archive_only_evidence]** sources: adv_epic_list returns unfiltered epics.list(): adv_epic_list description claims 'List all active Epics' but execute calls owner.store.epics.list() then paginates with no progress.status filter. store list() queries every enumerated Epic workflow and sorts by created_at. Description/behavior mismatch: it lists ALL Epics regardless of terminal status.
- **[archive_only_evidence]** sources: rq-epicMerge01 reference model for typed audited terminal transition: Merge is the by-the-book precedent: typed, audited, plan-first mutation with evidence + expected_version optimistic concurrency, terminal-source rejection, dryRun preview, and 'source Epic left readable with pointer and no active next-work'. adv_epic_merge args (evidence, expected_*_version, dryRun, target routing) are a directly reusable contract shape for a retirement tool.
- **[archive_only_evidence]** sources: rq-epicCliList01 constrains CLI to read-only, no hydration: rq-epicCliList01.4 requires the Epic CLI namespace remain read-only and MUST NOT dispatch archive/mutation verbs, and the list path MUST NOT query/hydrate per-Epic workflow. Any active-only CLI filtering must come from Visibility ExecutionStatus (structural), not per-Epic progress hydration. This bounds the design: retirement must terminate the workflow so ExecutionStatus becomes a valid CLI-safe filter.
- **[archive_only_evidence]** sources: rq-epicArchiveSync01 + rq-epicOptionalMembership01 already handle child-archive & orphaning: rq-epicOptionalMembership01.body explicitly states 'changes whose Epic is later archived MUST remain valid and continue through the normal gate/task flow'. So orphaned-child handling on Epic retirement is already a spec law and does not need new invention — but the retirement tool must not break it (no child hard-block).
- **[archive_only_evidence]** architecture_assessment: The state model already distinguishes completed (progress projection) from archived (workflow lifecycle), and an archived transition + signal + pure state helper already exist. The real gaps are (1) NO public tool fires epicArchivedSignal, so retirement is unreachable; (2) completed Epics never terminate their Temporal workflow, so they leak into Visibility enumeration and adv_epic_list; (3) applyEpicArchivedToState has no precondition guard, unlike the merge path, risking archival of in-flight Epics; (4) adv_epic_list claims 'active' but does not filter. The merge feature (rq-epicMerge01 / adv_epic_merge) is a strong, in-repo, by-the-book reference for a typed, audited, plan-first, version-checked, dryRun-capable terminal transition — retirement should mirror it rather than invent a new pattern. CLI active-only filtering is constrained by rq-epicCliList01 to Visibility ExecutionStatus (no per-Epic hydration), which structurally requires completion to actually terminate the workflow.
- **[agenda]** follow_ups: Design should state explicitly that the retire store method reads the retired projection (not the completed workflow) for idempotency/already-retired responses, since applyEpicArchivedToState completion makes live re-query impossible.
- **[agenda]** follow_ups: Confirm merge-guard adaptation direction: merge forbids completed sources; retire REQUIRES completed — same guard scaffolding, inverted status precondition.
- **[archive_only_evidence]** sources: list-epic-workflows.ts (in-repo): Explicit comment: 'Epic workflows do not use custom search attributes; the workflow ID carries project scope'. Query is WorkflowType = epicWorkflow only. Confirms epics currently have NO status search attribute — design pillar 4 AdvEpicStatus is net-new registration cost.
- **[archive_only_evidence]** sources: workflows.ts epic terminal-status completion (in-repo): Epic workflow returns/completes when state.status === 'archived' (wf.condition then return, no continueAsNew). A retired/archived Epic therefore leaves ExecutionStatus = Completed, not Running.
- **[archive_only_evidence]** sources: lifecycle-visibility.ts + Temporal docs (built-in ExecutionStatus): openLifecycleVisibilityClauses() already uses `ExecutionStatus = "Running"` (built-in default attr). Temporal docs confirm `WorkflowType = X AND ExecutionStatus = "Running"` is valid with no custom attribute registration. Active-only Epic listing can reuse this.
- **[archive_only_evidence]** sources: epic-state.ts merge-guard vs unguarded archive (in-repo): isClosedForMutation() + closedForMutationFailure() + epic_not_active check exist and are used by all 12 mutation helpers AND applyEpicMergedToState. But applyEpicArchivedToState (731-741) is UNGUARDED (no completed/merged/archived rejection). Design Decision 3 guard can reuse the exact merge-guard pattern instead of a new helper.
- **[archive_only_evidence]** sources: store epics.ts list hydration + no retire method + no retired projection (in-repo): Store.epics.list() hydrates every Epic via queryEpic (DDC1 no-hydration gap is real). No retire/archive store method exists. No retired-history disk projection exists anywhere in storage/. Confirms Decision 5 (retired projection) and DDC2 are genuinely net-new, not redundant. Epic store passes searchAttributesEnabled:false.
- **[archive_only_evidence]** architecture_assessment: Draft design is architecturally sound and correctly reuses the signal-driven epic workflow, isClosedForMutation guard family, and expected-version/dry-run merge pattern. Two candidates are strong auto-adopt simplifications: (1) the guarded-archive transition should reuse the existing applyEpicMergedToState guard pattern rather than a 'new pure helper', and (2) active-only listing (pillar 4 / Decision 4 / DDC5) can be built on the BUILT-IN Temporal `ExecutionStatus = "Running"` filter — which the codebase already uses in lifecycle-visibility.ts and Temporal docs confirm — because the epic workflow terminates on archive. This removes the proposed custom `AdvEpicStatus` search-attribute registration, its reconnect/repair tests, and an entire risk category, while satisfying C2/AC3/AC5/DDC1/DDC5. Decision 5 (retired disk projection) and DDC2 remain genuinely necessary: no retired-epic projection exists today and a completed workflow cannot be queried, so this is the real net-new work and the correct place to spend design effort. One overlooked ordering risk: DDC3/DDC4 require projection-before-signal AND rejection-before-projection; because archive completes the workflow, the retire store method cannot re-query live state after signaling (workflow gone), so idempotency/reconcile must read the retired projection, not the live workflow.
- **[agenda]** follow_ups: Add an rq-epicRetire01-style spec requirement covering the completed-only guard, projection-before-completion history invariant, default active-only exclusion, and retired-history read.
- **[agenda]** follow_ups: Specify durable retired-projection store/path + adv_epic_show fallback read order as Design-Derived Criteria before design gate completion.
- **[agenda]** follow_ups: Plan explicit tests: projection-before-signal ordering (DDC3) and projection-written/signal-failed retry reconciliation (DDC5).
- **[archive_only_evidence]** sources: Spec rq-epicCliList01 (advance-epics v1.9.0): CLI epic list MUST be read-only, worker-free, use Temporal Visibility enumeration of epicWorkflow + project prefix, MUST NOT hydrate each Epic. Validates design DDC1 (ExecutionStatus=Running, no-hydration).
- **[archive_only_evidence]** sources: Spec rq-epicMerge01.4 + rq-epicArchiveSync01: Terminal source Epics are historical-references-only; archive projects terminal child state and preserves compact history. Precedent that terminal Epics stay readable, so retirement must preserve history (AC4/C1).
- **[archive_only_evidence]** sources: epicWorkflow completion path: epicWorkflow returns (COMPLETES, no continueAsNew) when state.status===archived. After completion the Epic is no longer queryable, confirming the history-loss window design DDC2/DDC3 target is real.
- **[archive_only_evidence]** sources: applyEpicArchivedToState + merge asymmetry: archived is a completing status; merged keeps the workflow running (recomputeEpicProgress special-cases merged separately). Retirement=archived terminates the workflow unlike merge, which is why a durable retired projection is mandatory.
- **[archive_only_evidence]** sources: Epic state query throws-on-completed; tryQuery returns null: queryEpicState uses handle.query(getEpicStateQuery); WorkflowNotFound is caught and mapped to null. After retirement the live query path yields null, requiring the projection fallback the design proposes.
- **[archive_only_evidence]** sources: Live-then-disk projection fallback precedent (rq-replayFallback01): Changes already implement query-live-then-fall-back-to-durable-disk/archive projection (temporal_query_fallback). Design's adv_epic_show live-first-then-projection read reuses an established, tested pattern.
- **[archive_only_evidence]** sources: ExecutionStatus=Running Visibility filtering (no hydration): Existing Visibility queries filter ExecutionStatus=Running + project prefix and extract IDs from workflow IDs without hydrating workflows. DDC1 default-listing is feasible with existing infrastructure.
- **[archive_only_evidence]** sources: Store epics ops surface has no archive method today: createEpicOps exposes create/update/updateScope/markMerged/addShell/promoteShell/linkChange/retargetChange/unlinkChange/setEntryMembershipStatus/setEntryTerminalSummary/reorder but NO markArchived/retire and NO retired-projection persistence. DDC3 requires genuinely new store + durable-projection work.
- **[archive_only_evidence]** architecture_assessment: The design is correct, spec-compliant, and reuses proven ADV patterns. The central risk it targets is real: firing epicArchivedSignal drives epicWorkflow to a completing state (workflows.ts:1934-1947), after which live state queries throw WorkflowNotFound and return null (epics.ts:90-106). A durable retired projection written BEFORE workflow completion (DDC3) is genuinely required to satisfy AC4/C1 history access; this is not over-engineering. DDC1 (default listing via ExecutionStatus=Running + workflow-ID prefix, no per-Epic hydration) is directly mandated by rq-epicCliList01 and already implemented for changes/members, so it is feasible with existing Visibility infrastructure. The live-first-then-projection read for adv_epic_show mirrors the existing rq-replayFallback01 temporal_query_fallback pattern used for changes: a reuse, not a novel mechanism. Key Decisions 2 (keep internal status archived, expose retirement wording) and 4 (no custom AdvEpicStatus) are the boring, minimal choices and are preferred correctly in LBP. Notable asymmetry the design leverages: merge keeps the workflow running while archive completes it, which is exactly why retirement (=archived terminal) mandates the projection that merge did not. Gap: design.md does not name the concrete durable projection mechanism (disk projection vs memo vs Visibility memo) or the precise adv_epic_show fallback resolution, and the store has no existing markArchived/retire method or retired-projection writer to extend. This is a design-completeness caution to resolve in planning, not a correctness blocker. Spec-law: no advance-epics requirement is contradicted; a new rq-epicRetire01-style requirement should make the completed-only guard, projection-before-completion invariant, active-only default listing, and retired-history read executable law (agreement objective 6, constraint C2). AC5 warrant spec:rq-epicCliList01 is satisfied by DDC1.
- **[unresolved_action]** required_main_agent_actions: Block acceptance until merged Epic active-list semantics are resolved or agreement is explicitly revised.
- **[unresolved_action]** required_main_agent_actions: Add a regression for merged source Epic exclusion from default `adv_epic_list` and `adv epic list --json` active-only behavior, preserving the CLI worker-free/no-hydration boundary.
- **[unresolved_action]** required_main_agent_actions: After remediation, rerun focused Epic/CLI tests and the repo gate (`bin/oc-test full` or equivalent release validation).
- **[archive_only_evidence]** verification: tests_run= results=n/a — Pure source/contract review. No fixes applied and no rerun performed. Existing orchestrator evidence: `bin/oc-test full` passed as tr_mrc9h5b2_a14c0ea5; review found an uncovered structural logic gap in merged Epic active-list semantics. First submit attempt used packet scope_key `acceptance-review`, but report schema accepts `review:acceptance`; resubmitted with schema-valid acceptance scope.
- **[unresolved_action]** required_main_agent_actions: Remediate legacy Epic workflow indexing: ensure workflows originally started with searchAttributesEnabled:false can upsert AdvEpicStatus or are backfilled by an explicit safe migration/repair surface before default active lists rely on AdvEpicStatus.
- **[unresolved_action]** required_main_agent_actions: Add regression coverage for an Epic workflow started with searchAttributesEnabled:false/legacy store input and verify active/default visibility is not lost after AdvEpicStatus filtering.
- **[unresolved_action]** required_main_agent_actions: Rerun focused temporal visibility/search-attribute tests plus pnpm run check after remediation.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When adding new Temporal search attributes to workflow visibility filters, account for existing workflows whose original input disabled search attributes. Future-start fixes do not backfill historical inputs, and continue-as-new can preserve the disabled flag indefinitely.
- **[archive_only_evidence]** verification: tests_run=../bin/oc-test targeted -- src/temporal/list-epic-workflows.test.ts src/temporal/workflows.search-attrs.test.ts results=pass — Focused reviewer run from plugin workdir passed: list-epic-workflows.test.ts 5 tests, workflows.search-attrs.test.ts 2 tests. Source review found missing legacy active Epic indexing path despite passing new-workflow tests. Prior verification considered: targeted temporal/bin suite pass run tr_mrca0dh7_967cb52b; bun test bin/lib/epic-list.test.ts pass run tr_mrca0kik_927ee699; pnpm run check pass run tr_mrca1lu8_aab01751.
- **[unresolved_action]** required_main_agent_actions: Include reviewer-applied CLI visibility-only fix in acceptance/release diff review.
- **[unresolved_action]** required_main_agent_actions: Before live deployed validation, rebuild/deploy/restart OpenCode per source-vs-dist gotcha so new `AdvEpicStatus` enum and repair mode are exposed by the runtime copy.
- **[unresolved_action]** required_main_agent_actions: Optional: rerun full `pnpm run check` or CI after this reviewer fix if acceptance policy requires whole-repo gate freshness beyond targeted CLI verification.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A visibility-only CLI can accidentally regress by adding convenient disk-projection enrichment. Keep `adv epic list --json` payload derived from Temporal Visibility IDs only; member/current-child enrichment belongs in typed MCP reads, not the worker-free CLI path.
- **[archive_only_evidence]** changes_made: bin/adv: Removed `adv epic list --json` disk-backed child-change enrichment so CLI Epic listing now obtains IDs only from live Temporal Visibility and emits the visibility payload directly.
- **[archive_only_evidence]** changes_made: bin/lib/epic-list.ts: Deleted `loadCurrentChildByEpicId`, ADV external state imports, and `currentChildChangeId` payload enrichment to satisfy `rq-epicCliList01` visibility-only/no external state-file read semantics.
- **[archive_only_evidence]** changes_made: bin/lib/epic-list.test.ts: Removed disk-projection membership test and updated live payload expectation to Epic IDs only, matching read-only visibility CLI contract.
- **[archive_only_evidence]** verification: tests_run=bun test bin/lib/epic-list.test.ts bin/adv.test.ts, grep for loadCurrentChildByEpicId|currentChildByEpicId|currentChildChangeId|listChanges\( under bin/ results=pass — Reviewed strict active-list query (`WorkflowType = "epicWorkflow" AND AdvEpicStatus = "active" AND ExecutionStatus = "Running"`), running-all repair query (`WorkflowType = "epicWorkflow" AND ExecutionStatus = "Running"`), repair signal/idempotency/dry-run path, search attribute registration/upsert tests, and workflow signal handler. Applied scoped CLI visibility-only fix. Bun targeted tests: 21 pass, 0 fail. Remaining grep only finds the standalone `listChanges` helper definition in `bin/lib/changes.ts`, not Epic list usage. Prior supplied verification also passed: targeted tests tr_mrcbrhfk_6ec055f0, `pnpm run check` tr_mrcbt9wq_7ed588ff, `bun test bin/lib/epic-list.test.ts` tr_mrcbtglj_846b4a3a.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |
| OOS5 | out_of_scope | not_applicable |
| OOS6 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pending
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/temporal/epic-state.test.ts src/temporal/workflows.epic.test.ts src/storage/store-temporal/epics.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/tools/epic.test.ts
- New adv_epic_list tests failing in src/tools/epic.test.ts
- finish_owned_scope_then_report: Completed-but-unretired and merged Epics remain running and will appear in the CLI no-hydration active list. The MCP active list excludes them via progress.status filter. This is a known ambiguity between AC3 (excludes merged) and AC5/CLI worker-free constraint.
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/temporal/list-epic-workflows.test.ts src/storage/store-temporal/epics.test.ts bin/lib/epic-list.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && ../bin/oc-test targeted -- src/tools/epic.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/epic.test.ts src/tool-registry.surface.test.ts src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- Block acceptance until merged Epic active-list semantics are resolved or agreement is explicitly revised.
- Add a regression for merged source Epic exclusion from default `adv_epic_list` and `adv epic list --json` active-only behavior, preserving the CLI worker-free/no-hydration boundary.
- After remediation, rerun focused Epic/CLI tests and the repo gate (`bin/oc-test full` or equivalent release validation).
- Remediate legacy Epic workflow indexing: ensure workflows originally started with searchAttributesEnabled:false can upsert AdvEpicStatus or are backfilled by an explicit safe migration/repair surface before default active lists rely on AdvEpicStatus.
- Add regression coverage for an Epic workflow started with searchAttributesEnabled:false/legacy store input and verify active/default visibility is not lost after AdvEpicStatus filtering.
- Rerun focused temporal visibility/search-attribute tests plus pnpm run check after remediation.
- Include reviewer-applied CLI visibility-only fix in acceptance/release diff review.
- Before live deployed validation, rebuild/deploy/restart OpenCode per source-vs-dist gotcha so new `AdvEpicStatus` enum and repair mode are exposed by the runtime copy.
- Optional: rerun full `pnpm run check` or CI after this reviewer fix if acceptance policy requires whole-repo gate freshness beyond targeted CLI verification.
