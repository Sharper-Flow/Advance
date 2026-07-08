# Archive Briefing Digest

**Change ID:** fixEpicRepair
**Title:** Fix epic repair
**Status:** archived
**Generated:** 2026-07-08T20:14:04.299Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: roadmap #210

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

Showing 14 of 14 durable facts.

- **[agenda]** follow_ups: Confirm the repair reporting path reads the SA back via store-level workflow describe rather than asserting solely on a List/visibility query, to avoid eventual-consistency false negatives.
- **[agenda]** follow_ups: Confirm registration of the target SA is a precondition (or auto-registered) before the repair signal fires, mirroring the existing AdvEpicStatus registration path.
- **[archive_only_evidence]** sources: Temporal TS SDK source (workflow.ts upsertSearchAttributes): upsertSearchAttributes() calls assertInWorkflowContext then activator.pushCommand({upsertWorkflowSearchAttributes}). It is a buffered workflow COMMAND recorded in history, not a side-effect. Any workflow-context code path (main OR signal handler) may call it; determinism comes from command buffering + replay, identical to timers/activities.
- **[archive_only_evidence]** sources: Temporal TS SDK worker-interface (activation/command model): activate() dispatches signal jobs to handlers which pushCommand(); concludeActivation() returns buffered commands. Signal handlers run inside the same deterministic activation loop, so commands they emit (incl. upsertWorkflowSearchAttributes) are replay-safe as long as the handler logic is deterministic.
- **[archive_only_evidence]** sources: Temporal TS samples (search-attributes/workflows.ts): Canonical sample upserts search attributes mid-execution and reads back via workflowInfo().searchAttributes. Confirms upsert-during-execution is the by-the-book pattern; client reads via handle.describe().
- **[archive_only_evidence]** sources: Temporal Platform docs — Search Attributes: Custom search attributes must be registered in the Visibility store per-Namespace BEFORE use. Server v1.20+ supports custom SAs on MySQL/Postgres/SQLite (no Elasticsearch required). Values become queryable via List Filters and readable via DescribeWorkflowExecution.
- **[archive_only_evidence]** sources: Temporal Community — register-before-use + describe read-back: Unregistered custom SA -> BadSearchAttributes failure. Cluster namespace SA cache refresh has a short (~10s) lag after registration. Confirms the register-first hard constraint that ADV already guards via searchAttributesEnabled.
- **[archive_only_evidence]** sources: Temporal Community — SA values in DescribeWorkflowExecution: Upserted SA values are returned by DescribeWorkflowExecution; List/visibility filtering additionally requires visibility-store indexing (advanced visibility). Verifying via describe reads the point value; verifying via List proves index propagation.
- **[archive_only_evidence]** sources: ADV repo — existing signal-time upsert + refresh pattern: ADV already upserts AdvChangeStatus/AdvEpicStatus from signal handlers (archiveChange/closeChange) guarded by input.searchAttributesEnabled !== false, wrapped in try/catch that logs and swallows SA failures. EpicSearchAttributesRefreshed signal is purpose-built to backfill AdvEpicStatus for legacy workflows started before registration — precisely the #210 pattern.
- **[archive_only_evidence]** architecture_assessment: Calling wf.upsertSearchAttributes from a signal handler is valid, deterministic, and replay-safe in the Temporal TypeScript SDK. It emits a buffered upsertWorkflowSearchAttributes workflow command inside the normal activation loop — identical determinism class to timers/activities/child-workflows. Signal-handler origin is irrelevant to determinism; determinism depends only on the handler logic itself being deterministic (fixed key/value derived from replay-safe state, no wall-clock/random-driven branching). Backfilling on a long-running workflow whose start-time input disabled the initial upsert is sound: the start-time searchAttributesEnabled=false path only skipped emitting the command; there is no history poison to unwind, so a later additive upsert simply appends a new command from that activation forward. ADV already ships this exact pattern (EpicSearchAttributesRefreshed signal + refresh_search_attributes repair mode). Two hard constraints, both non-negotiable and both already respected by the existing code: (1) the custom SA MUST be registered in the namespace Visibility store before any workflow emits the upsert command, else the command fails the workflow task (BadSearchAttributes); ADV gates this with searchAttributesEnabled and defensive try/catch. (2) Visibility/List-filter searchability is eventually consistent — describe() returns the point value promptly, but List queries depend on visibility-store index propagation (and, on the server side, SA namespace cache refresh ~10s after registration).
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- plugin/src/temporal/workflows.search-attrs.test.ts plugin/src/storage/store-temporal/epics.test.ts plugin/src/tools/epic.test.ts, bin/oc-test targeted -- src/temporal/workflows.search-attrs.test.ts src/storage/store-temporal/epics.test.ts src/tools/epic.test.ts, pnpm run check, bin/oc-test targeted -- src/advance-epics-assets.test.ts src/temporal/list-epic-workflows.test.ts results=pass — Initial targeted command used repo-root-prefixed paths and found no files. Corrected scoped targeted run passed: 3 files, 131 tests. pnpm run check passed: schemas:check, typecheck, test-isolation, lockfile policy, lint, format:check. Extra spec/visibility guard passed: 2 files, 62 tests.
- **[unresolved_action]** required_main_agent_actions: No hardening blockers found. Orchestrator may proceed with release/archive steps after its normal release checks.
- **[unresolved_action]** required_main_agent_actions: If validating live adv_epic_repair_membership behavior through OpenCode tools, rebuild/deploy plugin and restart OpenCode per repository source-vs-dist reload gotcha.
- **[archive_only_evidence]** verification: tests_run=Path preflight for scoped files/spec: all OK, bin/oc-test targeted -- src/temporal/workflows.search-attrs.test.ts src/storage/store-temporal/epics.test.ts src/tools/epic.test.ts src/temporal/list-change-workflows.test.ts, git status --short && git diff --stat results=pass — Scoped paths existed. Targeted hardening suite passed: 4 files, 142 tests. git status/diff produced no output, confirming no reviewer edits or dirty worktree. Initial task-scoped report submission failed because TASK release-hardening is not a durable task anchor; submitted as change-scoped harden:release per tool guidance.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |

## Unresolved Actions

- No hardening blockers found. Orchestrator may proceed with release/archive steps after its normal release checks.
- If validating live adv_epic_repair_membership behavior through OpenCode tools, rebuild/deploy plugin and restart OpenCode per repository source-vs-dist reload gotcha.
