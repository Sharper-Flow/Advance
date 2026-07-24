# Archive Briefing Digest

**Change ID:** autoAdoptOrphanSessionQueues
**Title:** Auto-adopt orphan session queues
**Status:** archived
**Generated:** 2026-07-23T23:44:43.586Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

Epic: hardenTemporalReliability · Auto-adopt orphan session queues (bootstrap) (order 11)

## Durable Facts

Showing 22 of 22 durable facts.

- **[unresolved_action]** required_main_agent_actions: Make `dl-aDOptOrph01` / `rq-isolSessionTaskQueue05` readable in authoritative ADV state, or record it if absent.
- **[unresolved_action]** required_main_agent_actions: Supply the authoritative rq-isolSessionTaskQueue01-04 requirements (via an unpaginated/paginated ADV spec read) and rerun the bounded review.
- **[unresolved_action]** required_main_agent_actions: Do not use this report as clean completion evidence for tk-511d8456372f until both blockers are resolved.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A successful-looking task state is not evidence that a declarative spec delta is readable through adv_change_show; reviewers must verify the delta payload and target capability requirements before issuing a clean verdict.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Read-only ADV-state review. adv_change_show(autoAdoptOrphanSessionQueues) returned deltas: {}; adv_spec(search rq-isolSessionTaskQueue0) returned no results. No repository files changed.
- **[archive_only_evidence]** decisions: Added a shared OrphanQueueAdoptionDiagnostics type beside the adopter. — Preserves structural typing from the producer through plugin-init and both renderers.
- **[archive_only_evidence]** decisions: Limited doctor trackedQueues to 50 and report omitted count. — Bounds detailed diagnostic output while retaining operator awareness of additional entries.
- **[archive_only_evidence]** decisions: Kept health output as counts only. — Health view exposes enabled/tracked/inCooldown without queue identifiers; doctor remains detail surface.
- **[archive_only_evidence]** verification: bunx vitest run src/tools/doctor.test.ts src/tools/status-health.session-queue.test.ts (1) — RED: five new adoption-rendering assertions failed before implementation.
- **[archive_only_evidence]** verification: bunx vitest run src/tools/doctor.test.ts src/tools/status-health.session-queue.test.ts (0) — GREEN/verify: 2 files and 22 tests passed after implementation and formatting.
- **[archive_only_evidence]** verification: bunx tsc --noEmit -p tsconfig.json (0) — TypeScript typecheck passed.
- **[report_follow_up]** follow_ups: Packet omission: no affected_files or durable_facts were available; not needed for this architecture verdict.
- **[report_follow_up]** follow_ups: Temporal Visibility and async-iterator cancellation semantics remain partially inconclusive from retrieved docs; validate exact installed SDK API behavior in the proposed .itest.ts rather than assuming Promise.race cancels pagination.
- **[report_follow_up]** follow_ups: Spec-law implication: no contradiction found with per-session routing or legacy coexistence from supplied contract evidence because adoption adds pollers and does not mutate task queues. Proposed rq-isolSessionTaskQueue05 was not independently available through adv_spec; final wording unverified. worker.queues idempotency is process-local, not cross-process.
- **[research_citation]** sources: Temporal TypeScript WorkflowClient API: WorkflowClient.list returns an AsyncWorkflowListIterable; Temporal documents Visibility list results as approximate and eventually consistent. (https://typescript.temporal.io/api/classes/client.WorkflowClient)
- **[research_citation]** sources: Temporal Visibility list filters: Visibility filters use SQL-like expressions and pagination uses continuation tokens until no token remains. (https://docs.temporal.io/list-filter)
- **[research_citation]** sources: Temporal TypeScript Worker API: Official Worker API documents Worker lifecycle and shows a TaskQueue visibility query example. (https://typescript.temporal.io/api/classes/worker.Worker)
- **[research_citation]** sources.omitted: 4 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Caution. Existing IPC is the correct minimal extension point, and client-side task-queue grouping preserves additive routing. However, the design currently has no hard bound or recovery path for a pending registration, and permanent suppression after three 10-second retries can strand a queue after a transient Worker.run failure; both conflict with bounded eventual reachability.
- **[unresolved_action]** validation.blockers: D2/DDC1 bounds Visibility only, not await worker.registerQueue(). The existing dynamic path awaits Worker.create and resolves the parent promise only after register-ack; the child then runs Worker.run asynchronously. A stalled create/IPC acknowledgement can hold the single-flight coordinator indefinitely, so later scans and retries never start. The 90-second constant is a grace period for lock renewal after isServiceable becomes false, not a per-registration deadline or nine independent adoption slots.
- **[unresolved_action]** validation.blockers: D4 permanently excludes a queue until process restart after three fixed-spaced attempts. Temporal documents worker/client operations over a service connection, but supplied evidence does not establish that 30 seconds distinguishes persistent from transient run failures. Permanent suppression can leave a still-RUNNING orphan unreachable for the lifetime of an otherwise healthy process, contrary to the future-orphan reachability objective.
- **[epic_terminal_note]** epic.membership: hardenTemporalReliability · Auto-adopt orphan session queues (bootstrap) (order 11)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| C9 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |

## Unresolved Actions

- Make `dl-aDOptOrph01` / `rq-isolSessionTaskQueue05` readable in authoritative ADV state, or record it if absent.
- Supply the authoritative rq-isolSessionTaskQueue01-04 requirements (via an unpaginated/paginated ADV spec read) and rerun the bounded review.
- Do not use this report as clean completion evidence for tk-511d8456372f until both blockers are resolved.
- D2/DDC1 bounds Visibility only, not await worker.registerQueue(). The existing dynamic path awaits Worker.create and resolves the parent promise only after register-ack; the child then runs Worker.run asynchronously. A stalled create/IPC acknowledgement can hold the single-flight coordinator indefinitely, so later scans and retries never start. The 90-second constant is a grace period for lock renewal after isServiceable becomes false, not a per-registration deadline or nine independent adoption slots.
- D4 permanently excludes a queue until process restart after three fixed-spaced attempts. Temporal documents worker/client operations over a service connection, but supplied evidence does not establish that 30 seconds distinguishes persistent from transient run failures. Permanent suppression can leave a still-RUNNING orphan unreachable for the lifetime of an otherwise healthy process, contrary to the future-orphan reachability objective.
