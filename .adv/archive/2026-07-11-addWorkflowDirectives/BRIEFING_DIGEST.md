# Archive Briefing Digest

**Change ID:** addWorkflowDirectives
**Title:** Add workflow directives
**Status:** archived
**Generated:** 2026-07-11T03:20:04.138Z

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

Showing 71 of 71 durable facts.

- **[agenda]** follow_ups: Wire getWorkflowDirectiveQuery in workflows.ts (state, workflowEpoch) and consolidate nextGate/canArchive (tools/gate.ts ~1023-1040) and getRecommendationForGate (tools/status-enrich.ts ~65-190) onto the directive.
- **[agenda]** follow_ups: If callers need an explicit recovery reason (e.g. tool-layer missing_workflow from an unreachable handle), thread an optional recovery hint into a future wrapper without breaking the pure (state, epoch) core.
- **[unresolved_action]** required_main_agent_actions: Create/link the follow-up task to wire the query handler and consolidate the two legacy next-gate derivations onto deriveWorkflowDirective (out of this task's scope).
- **[archive_only_evidence]** decisions: Mirrored GATE_COMMAND mapping inline instead of importing getCommandsByGate from manifest.ts — The directive module must stay workflow-safe (imports from ../types and ../temporal/* only); manifest.ts is not workflow-safe to import. Mapping mirrors getCommandsByGate(gate)[0].name and is documented with the per-gate source.
- **[archive_only_evidence]** decisions: Mapped release gate to adv-archive (not adv-harden) — Verified: adv-harden has no `gate` field (scope.gates: []), so getCommandsByGate('release') returns [adv-archive]. adv-archive is the release-gate owner.
- **[archive_only_evidence]** decisions: Derived recovery reasons from existing state fields rather than the spec's recoveryMode/recoveryEvidence — ChangeWorkflowState carries no recoveryMode/recoveryEvidence. Used principled pure signals: poisoned-history regex over signal_rejections, gate stuck_reason, and recovery_audit; terminated+non-terminal status for missing_workflow; unclassifiable recovery_audit for 'unknown'. Keeps the function a pure function of (state, epoch) with no external I/O.
- **[archive_only_evidence]** decisions: never_started fires when no gate has started (all pending) OR bucket === never_started — Reconciles both stated conditions ('no gates completed yet' and 'only proposal done and idle'). An in_progress proposal counts as started, so the per-gate table routes it to continue, while all-pending and stale-proposal-only both route to never_started.
- **[archive_only_evidence]** decisions: Synthesized a GATE_STUCK blocker for non-poisoned stuck gates — A stuck gate is a structural blocker; surfacing it makes action.kind 'blocked' for ordinary stalls while letting poisoned stuck_reason route to 'recovery'. Avoids double-counting by excluding stuck gates whose reason matches poisoned evidence.
- **[archive_only_evidence]** verification: pnpm vitest run src/utils/workflow-directive.test.ts (1) — RED: module absent — 'Cannot find module ./workflow-directive' (expected fail before implementation)
- **[archive_only_evidence]** verification: pnpm vitest run src/utils/workflow-directive.test.ts (0) — GREEN: 18 tests passed (all 7 gates, approval, poisoned_history, missing_workflow, 2+ blockers, GATE_STUCK synthesis, canArchive, never_started idle, archived, unknown recovery, referential transparency)
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean across project
- **[archive_only_evidence]** verification: pnpm vitest run src/temporal/workflow-bundle-boundary.test.ts src/utils/context-snapshot.purity.test.ts src/utils/buckets.test.ts (0) — Workflow bundle boundary + purity + buckets: 15 passed; new util stays workflow-safe
- **[archive_only_evidence]** verification: pnpm exec eslint src/utils/workflow-directive.ts src/utils/workflow-directive.test.ts (0) — ESLint clean on both new files
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/utils/workflow-directive.ts src/utils/workflow-directive.test.ts (0) — Prettier clean after --write; final vitest re-run still 18 passed
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/utils/workflow-directive.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/utils/workflow-directive.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/temporal/workflow-bundle-boundary.test.ts src/utils/context-snapshot.purity.test.ts src/utils/buckets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/utils/workflow-directive.ts src/utils/workflow-directive.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/utils/workflow-directive.ts src/utils/workflow-directive.test.ts
- **[archive_only_evidence]** decisions: Derived the directive locally in gate.ts from reconciled gates + disk change via changeToDirectiveState, rather than adding a 3rd querySignal round-trip for getDirectiveQuery. — Keeps gate_status a single read path, avoids mock call-order churn in gate.test.ts, and still sources next-action from the single deriveWorkflowDirective projection. The workflow getDirectiveQuery remains authoritative for direct consumers; gate/status derive the same value from the reconciled projection.
- **[archive_only_evidence]** decisions: Replaced getRecommendationForGate with buildNextGateRecommendationFromDirective and removed the old helper. — Consolidates next-action derivation onto directive.action (gate + command); manifest is now only a fallback for actions carrying a gate but no command (blocked/approval). No external importers of the old helper existed (grep-confirmed).
- **[archive_only_evidence]** decisions: Context snapshot accepts an optional precomputed directive and renders a compact Next: line, instead of deriving internally. — Preserves context-snapshot purity (no storage/tools/temporal value imports; purity test still green) and keeps it a formatter over already-loaded data; status-enrich computes the directive once and shares it with both the snapshot and the recency _directive field.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/status-enrich.test.ts src/utils/context-snapshot.test.ts src/tools/gate.test.ts (0) — RED then GREEN: 3 files, 90 passed. Pre-impl these failed (buildNextGateRecommendationFromDirective missing, Next: line missing, _directive missing).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.queries.test.ts src/temporal/messages.test.ts src/temporal/workflow-bundle-boundary.test.ts src/temporal/workflows.test.ts (0) — RED then GREEN: getDirectiveQuery handler resolves with changeId/canArchive/action/gateStatus; query-name contract + workflow-bundle boundary (3.60MB bundle) green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/status.test.ts src/utils/workflow-directive.test.ts src/utils/compaction-context.test.ts src/storage/context-snapshot-fetch.test.ts src/temporal/change-state.test.ts (0) — Regression sweep: 121 passed including status.test.ts (50) exercising directive-based enrichment end-to-end.
- **[archive_only_evidence]** verification: cd plugin && pnpm run typecheck (0) — tsc --noEmit clean.
- **[archive_only_evidence]** verification: cd plugin && npx eslint src/tools/gate.ts src/tools/status-enrich.ts src/utils/context-snapshot.ts src/temporal/workflows.ts src/temporal/messages.ts src/temporal/change-state.ts src/temporal/contracts.ts (0) — eslint clean (no unused imports after removing allGatesSatisfied/getRecommendationForGate).
- **[archive_only_evidence]** verification: cd plugin && npx prettier --check <touched files> (0) — prettier --check clean after --write on gate.ts.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/status-enrich.test.ts src/utils/context-snapshot.test.ts src/tools/gate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.queries.test.ts src/temporal/messages.test.ts src/temporal/workflow-bundle-boundary.test.ts src/temporal/workflows.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/status.test.ts src/utils/workflow-directive.test.ts src/utils/compaction-context.test.ts src/storage/context-snapshot-fetch.test.ts src/temporal/change-state.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && npx eslint src/tools/gate.ts src/tools/status-enrich.ts src/utils/context-snapshot.ts src/temporal/workflows.ts src/temporal/messages.ts src/temporal/change-state.ts src/temporal/contracts.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && npx prettier --check <touched files>
- **[agenda]** follow_ups: Design should decide tool-layer-only projection vs additive getDirectiveQuery + directive search attribute (recommend tool-layer first, query optional).
- **[agenda]** follow_ups: Design should specify the consolidation plan for gate.ts nextGate/canArchive and status-enrich.ts getRecommendationForGate to avoid a third divergent derivation.
- **[agenda]** follow_ups: Confirm whether a directive search attribute (AdvDirective-like) is wanted for cross-change WIP visibility, mirroring AdvCurrentBucket.
- **[archive_only_evidence]** sources: deriveBucket state machine (existing directive-like kernel): Pure Bucket derivation (awaiting_approval|in_flight|stuck|drifting|ready_to_archive|never_started) over ChangeWorkflowState via bucketCtxFromState. Precedent for query-time projection: no persisted field.
- **[archive_only_evidence]** sources: Workflow computes bucket at query time: getCurrentBucketQuery handler returns deriveBucket(bucketCtxFromState(state, workflowEpoch)); also projected to AdvCurrentBucket search attribute. Proves derived-not-stored pattern with a workflow-deterministic epoch.
- **[archive_only_evidence]** sources: Signal/query-only workflow surface: ~70 defineSignal + ~20 defineQuery. No defineUpdate on change-workflow surface. Gate state driven by gateInProgress/gateAwaitingApproval/gateStuck/gateCompleted/gateReentered signals; read via getGateStatusQuery/getStateQuery.
- **[archive_only_evidence]** sources: ChangeWorkflowState shape + additive-field replay-safety contract: Durable fields: gates, pendingCheckpoint, terminated, contract, archiveRequest, phase9_status, closure, conformance.lastVerdict, gateCriteria, signal_rejections. Existing extensions annotated 'additive optional — Temporal replay-safe'.
- **[archive_only_evidence]** sources: Gate types + criteria + readiness blockers: 7-gate single-source-of-truth. Gate status enum pending|in_progress|awaiting_approval|stuck|done. Per-gate criteria + typed blockers with code/remediation. Metadata vs worktree_mutation impact classification.
- **[archive_only_evidence]** sources: Gate readiness evaluator (blocker authority): Deterministic ready/blockers/evidence/warnings over state. priorGateBlockers enforces sequence. ARTIFACT_BACKED_GATES maps gate->artifact evidence. This is the authoritative 'may I transition' function.
- **[archive_only_evidence]** sources: nextGate/canArchive producer: gate_status tool derives incomplete=getIncompleteGates, canArchive=allGatesSatisfied, nextGate=incomplete[0]. Independent of status-enrich next-gate logic — the duplication the proposal flags.
- **[archive_only_evidence]** sources: Independent next-gate recommendation derivation: Second nextGate derivation: GATE_ORDER.find(!isGateSatisfied) + getCommandsByGate -> slash-command recommendation. Confirms two separate next-action derivations exist (gate.ts and status-enrich.ts).
- **[archive_only_evidence]** sources: Manifest gate ownership (command->gate authority): COMMAND_MANIFEST assigns each /adv-* command a single gate. getCommandsByGate is the deterministic gate->owning-command map; the allowed-next-command source of truth.
- **[archive_only_evidence]** sources: Recovery classification (poisoned/completed workflow): Workflow-safe error-text classifier: isPoisonedHistoryError, isWorkflowCompletedError, recoveryReasonFromError -> 'poisoned_history'|'missing_workflow'. The typed recovery-state vocabulary a directive can surface.
- **[archive_only_evidence]** sources: OpenCode presentation boundary (the only rendering hook): experimental.chat.system.transform writes a single ordered output.system[0] append (multi-block push breaks OpenAI-compat prefilling). experimental.chat.messages.transform mutates prompt messages. NO outgoing assistant-message interception hook exists.
- **[archive_only_evidence]** sources: Pure presentation formatter (projection render target): buildChangeContextSnapshot is a pure formatter, forbidden from importing storage/tools. Correct home for directive rendering; lifecycle truth stays separate from presentation.
- **[archive_only_evidence]** sources: Temporal safe-deployment + determinism (external): Additive state fields / value changes are replay-safe; changing the sequence of workflow API calls that produce Commands requires patched() versioning; non-deterministic derivation (external calls, DB, LLM) must live in Activities, not the replay path.
- **[archive_only_evidence]** sources: Existing 'directive-like' bucket test matrix: Priority-ordered pure-function tests (pendingCheckpoint over stuck; ready_to_archive; drifting via staleness; never_started). Template for directive determinism/priority tests.
- **[archive_only_evidence]** architecture_assessment: ADV already has every durable input a typed workflow directive needs, plus a proven query-time derivation pattern. deriveBucket (buckets.ts) is a pure state machine over ChangeWorkflowState that the workflow itself computes at query time (workflows.ts:693-694, using a deterministic workflowEpoch) and projects to the AdvCurrentBucket search attribute (search-attributes.ts:193). This is the exact shape a directive should take: derive-not-store. The missing piece is not durable state — it is a single typed WorkflowDirective type that unifies (a) current phase/gate + gate status, (b) allowed next action (today split across gate.ts nextGate/canArchive and status-enrich.ts getRecommendationForGate+getCommandsByGate), (c) approval/recovery/block state (gate status awaiting_approval|stuck, pendingCheckpoint, GateReadinessBlocker[], recovery-classification reason), and (d) required evidence (GATE_CRITERIA_DEFINITIONS + ARTIFACT_BACKED_GATES + GateReadinessResult). Persistence/projection boundary: the directive must be a deterministic PROJECTION over already-persisted signal-driven state — NOT a new persisted field and NOT a defineUpdate mutation. Compute it in a pure workflow-safe module (sibling to buckets.ts, importing only temporal/ + types.ts to satisfy the workflow-bundle boundary), expose via a new additive getDirectiveQuery (replay-safe; additive query handlers don't poison replay), and render through the pure context-snapshot formatter and the single output.system[0] hook. OpenCode exposes NO outgoing-message interception boundary — the strongest enforceable surface is the system-prompt append (system-block.ts) plus tool-output directive fields (gate_status, adv_change_show); host-side enforcement of agent behavior cannot be claimed, matching the proposal constraint. Two real risks: (1) directive derivation must stay pure/deterministic if placed inside the workflow (no Date.now drift — reuse the workflowEpoch pattern buckets.ts already uses); (2) do NOT reintroduce defineUpdate or change the ordered sequence of Command-producing workflow API calls, which would require patched() versioning per Temporal docs.
- **[agenda]** follow_ups: Packet warning: TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors were absent. Continued under the user-provided research objective; identity anchors were present.
- **[agenda]** follow_ups: Planning should name an explicit directive action algebra and legacy fallback: unknown/legacy state yields recovery/block action, never an executable command.
- **[agenda]** follow_ups: Run the existing workflow bundle-boundary and query-handler suites after implementation; use an old-history/replay fixture for compatibility coverage.
- **[archive_only_evidence]** sources: Temporal TypeScript workflow basics: Workflow sandbox requires deterministic code; external state and side effects belong in Activities; Node/DOM-referencing packages are unsuitable in workflow code.
- **[archive_only_evidence]** sources: Temporal message passing: Signals mutate workflow state; queries return values; static definitions are recommended when names are known.
- **[archive_only_evidence]** sources: Temporal versioning: Replay-incompatible changes to running workflows require a compatible versioning strategy such as patching or Worker Versioning.
- **[archive_only_evidence]** sources: Zod v4 documentation: Zod provides parse/safeParse and first-party JSON Schema conversion via z.toJSONSchema.
- **[archive_only_evidence]** sources: Advance query/signal contract: Client-side signal/query bindings mirror workflow-local handler tokens and use shared wire-name constants.
- **[archive_only_evidence]** sources: Advance workflow query handlers: Existing read-only query handlers derive bucket, readiness, investment, review, and task-summary projections from current workflow state.
- **[archive_only_evidence]** sources: Advance workflow boundary test: Structural test forbids defineUpdate in workflow-reachable production code and rejects workflow reachability into storage/tools/Node APIs.
- **[archive_only_evidence]** sources: Advance bucket precedent: deriveBucket is a pure projection accepting state-derived context plus explicit time, with a workflow query consumer.
- **[archive_only_evidence]** sources: Advance status duplication: Status currently re-derives nextGate and selects command recommendations independently.
- **[archive_only_evidence]** sources: Advance public schema registry: Only curated schemas are emitted as public JSON Schema artifacts, through deterministic z.toJSONSchema conversion.
- **[archive_only_evidence]** architecture_assessment: PASS WITH DESIGN REFINEMENTS. Pure derive-on-read is the correct boring design: it matches ADV's existing deriveBucket and other query-time projections, while Temporal states that queries are read-only and signals mutate state (https://docs.temporal.io/develop/typescript/workflows/message-passing; https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/temporal/workflows.ts). Add the directive as a static, additive query using a shared wire-name constant in temporal/contracts.ts plus mirrored definitions in messages.ts/workflows.ts; this preserves the repository's signal/query-only surface (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/temporal/messages.ts; https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/temporal/workflow-bundle-boundary.test.ts). Keep the core directive as TypeScript types and a pure function in workflow-safe code; validate/render it at tool/packet boundaries. I do not know whether importing runtime Zod into this workflow bundle is safe, and current temporal code has no Zod import, so do not add that dependency to the workflow-reachable graph without an explicit bundle-safety proof (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/temporal/workflow-bundle-boundary.test.ts; https://docs.temporal.io/develop/typescript/workflows/basics). Directive action identity must be a stable domain token (gateId/actionKind), not a command string or manifest object: the workflow boundary forbids tools and the existing status layer owns getCommandsByGate rendering (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/temporal/workflow-bundle-boundary.test.ts; https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/status-enrich.ts). Bounded leverage: one shared deriver can replace status nextGate recomputation, feed the briefing packet, and reuse the existing table-driven Temporal query test harness; do not index directives as Temporal Search Attributes because they are detailed and mutable presentation/read guidance rather than a demonstrated Visibility filter need (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/temporal/workflows.queries.test.ts; https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/temporal/search-attributes.ts).
- **[unresolved_action]** required_main_agent_actions: Remediate review-directive-1 and review-packet-2 within existing contract scope, then rerun the targeted suite and the full validation already specified by the change.
- **[unresolved_action]** required_main_agent_actions: Leave unrelated archive-file baseline divergence untouched; the reviewed implementation itself is the two checkpoint commits (13 source/test files).
- **[wisdom_candidate]** wisdom_candidates: [pattern] Workflow-safe next-action derivation can remain pure and query-backed, but every agent-facing read projection must consume the same derived object; helper-only tests do not prove packet inclusion.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/utils/workflow-directive.test.ts src/temporal/workflows.queries.test.ts src/tools/gate.test.ts src/tools/status-enrich.test.ts src/utils/context-snapshot.test.ts results=pass — 109/109 targeted tests passed. Temporal worker bundle compiled successfully during workflow query integration test. Reviewed 13-file change commits; no defineUpdate, directive persistence, or host-enforcement claims found. Workflow-safe imports are limited to types, temporal recovery classification, and bucket derivation.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- Create/link the follow-up task to wire the query handler and consolidate the two legacy next-gate derivations onto deriveWorkflowDirective (out of this task's scope).
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/utils/workflow-directive.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/utils/workflow-directive.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/temporal/workflow-bundle-boundary.test.ts src/utils/context-snapshot.purity.test.ts src/utils/buckets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/utils/workflow-directive.ts src/utils/workflow-directive.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/utils/workflow-directive.ts src/utils/workflow-directive.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/status-enrich.test.ts src/utils/context-snapshot.test.ts src/tools/gate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.queries.test.ts src/temporal/messages.test.ts src/temporal/workflow-bundle-boundary.test.ts src/temporal/workflows.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/status.test.ts src/utils/workflow-directive.test.ts src/utils/compaction-context.test.ts src/storage/context-snapshot-fetch.test.ts src/temporal/change-state.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && npx eslint src/tools/gate.ts src/tools/status-enrich.ts src/utils/context-snapshot.ts src/temporal/workflows.ts src/temporal/messages.ts src/temporal/change-state.ts src/temporal/contracts.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && npx prettier --check <touched files>
- Remediate review-directive-1 and review-packet-2 within existing contract scope, then rerun the targeted suite and the full validation already specified by the change.
- Leave unrelated archive-file baseline divergence untouched; the reviewed implementation itself is the two checkpoint commits (13 source/test files).
