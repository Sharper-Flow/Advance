# Archive Briefing Digest

**Change ID:** addEpicTimestamps
**Title:** Add Epic Timestamps
**Status:** archived
**Generated:** 2026-07-25T19:28:57.872Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: roadmap #211

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

Showing 18 of 18 durable facts.

- **[report_follow_up]** follow_ups: Consider adding an explicit spec scenario under rq-epicCliList01 asserting each Epic entry includes an ISO UTC startTime, to make the acceptance criterion machine-checkable rather than relying on 'at least id'.
- **[report_follow_up]** follow_ups: Confirm desired field semantics in acceptance: startTime = Temporal workflow start (Epic workflow creation), documented as such, not a mutable last-activity timestamp.
- **[research_citation]** sources: Temporal TS SDK type — WorkflowExecutionInfo: WorkflowExecutionInfo has non-optional `startTime: Date` (line 33) and optional `executionTime?: Date` (line 34), `closeTime?: Date` (line 35). These are part of each list row already; no describe/query needed. (plugin/node_modules/.pnpm/@temporalio+client@1.17.2/node_modules/@temporalio/client/lib/types.d.ts:17-44)
- **[research_citation]** sources: Temporal TS SDK — WorkflowClient.list() yields full info rows: `AsyncWorkflowListIterable extends AsyncIterable<WorkflowExecutionInfo>` and `_list(): AsyncIterable<WorkflowExecutionInfo>`. Iterating list() gives each row's startTime with zero extra RPCs — Visibility returns it in the ListWorkflowExecutions response. (plugin/node_modules/.pnpm/@temporalio+client@1.17.2/node_modules/@temporalio/client/lib/workflow-client.d.ts:235,525)
- **[research_citation]** sources: Current CLI payload builder — only emits { id }: EpicListEntry = { id } and buildLiveEpicListPayload maps ids to `{ id }`. listEpicIdsFromVisibility returns string[] — startTime is discarded upstream. (bin/lib/epic-list.ts:15-17,54-61)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Adding `{ id, startTime }` fully preserves the read-only/worker-free/no-hydration boundary. `startTime` is a native field on every Visibility list row (WorkflowExecutionInfo.startTime: Date), populated by the ListWorkflowExecutions RPC that already backs the iterator — NOT by describe/query/hydration. The spec's forbidden operation is per-Epic workflow query/hydration (a separate DescribeWorkflowExecution or query RPC per Epic); reading a field off the list row you already iterate is not that. The change is a lossy-narrowing fix: today listEpicWorkflowIds() collapses each row to string, and buildLiveEpicListPayload maps string->{id}. To expose startTime, three surfaces must stop discarding it: (1) list-epic-workflows.ts iterator type + return type widen from string[] to {id, startTime}[]; (2) ListEpicClient.workflow.list iterator shape adds startTime: Date; (3) epic-list.ts EpicListEntry/payload builder carries startTime. ISO UTC via Date.prototype.toISOString(). Spec scenario .1 'at least id' is additive-safe — no spec text change strictly required, though a scenario clarifying startTime presence is advisable. Precedent exists: bin/lib/live-status.ts already surfaces created_at from change rows, so timestamp-in-CLI is an established pattern.
- **[report_follow_up]** follow_ups: Add an explicit spec scenario under rq-epicCliList01 asserting each Epic entry includes an ISO-8601 UTC startTime (or null), to make AC1/AC2 machine-checkable rather than relying on scenario .1 'at least id'.
- **[report_follow_up]** follow_ups: Document startTime semantics in the payload/spec as Temporal workflow start time (Epic list timestamp source), not child-change last activity, to prevent consumer misread (agreement DONT1).
- **[research_citation]** sources: Temporal TS SDK type — WorkflowExecutionInfo.startTime non-optional: startTime: Date (non-optional, line 33); executionTime?: Date and closeTime?: Date optional (lines 34-35). Confirms design Key Decision #1 and Avoidance DONT2 (do not depend on optional executionTime). (plugin/node_modules/.pnpm/@temporalio+client@1.17.2/node_modules/@temporalio/client/lib/types.d.ts:33-35)
- **[research_citation]** sources: Temporal TS SDK runtime deserializer treats startTime as required: startTime is parsed via requiredTsToDate('startTime') (throws if missing), while executionTime/closeTime use optionalTsToDate. startTime is structurally guaranteed on every parsed Visibility list row — no describe/query RPC needed. (plugin/node_modules/.pnpm/@temporalio+client@1.17.2/node_modules/@temporalio/client/lib/helpers.js:57-59)
- **[research_citation]** sources: Spec rq-epicCliList01 — read-only/worker-free/no-hydration boundary: MUST use Visibility enumeration + project-prefix filter; MUST NOT read ADV state files; MUST NOT query or hydrate each Epic workflow; MUST NOT require a worker; MUST fail closed. Scenario .1: each entry is 'an object containing at least id' (additive-safe). Scenario .4: 'list path does not query per-Epic workflow state'. (.adv/specs/advance-epics/spec.json:916-972)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The design is a boring, structurally-additive lossy-narrowing fix, independently verified against SDK types, SDK runtime, spec law, and current source. CORRECTNESS: solves all objectives — startTime is a native field on every Visibility list row populated by the ListWorkflowExecutions RPC that already backs the CLI iterator, so exposing it needs zero extra RPC and no hydration. The 3-surface thread (list-epic-workflows.ts iterator+return type, rich helper, epic-list.ts payload) matches the actual source. SIMPLICITY: no materially simpler path exists that still emits a per-Epic timestamp; the rich-helper-plus-ID-wrapper split is minimal and preserves store/repair callers (epics.ts) unchanged. SPEC-LAW COMPLIANCE: rq-epicCliList01.1 'at least id' is additive-safe; rq-epicCliList01.4 'no per-Epic workflow state query' is honored because reading a field off an already-iterated list row is not a DescribeWorkflowExecution/query RPC; rq-epicRetiredListing01 active-only filter is preserved verbatim. KEY ALTERNATIVES: hydrate-per-Epic (rejected — violates .4 + needs worker), executionTime (rejected — optional per SDK), disk-projected timestamp (rejected — violates no-state-file-read + fail-closed). One nuance: SDK runtime helpers.js:57 parses startTime via requiredTsToDate, so for successfully-parsed rows startTime is effectively always present — making AC2/DDC2 startTime:null a defensive-only branch. This is harmless, matches user preference (DONT3: do not drop rows for invalid timestamp), and DDC3's structural Date guard (not heuristic parsing) is the correct implementation. Design correctly avoids DONT1 (labels startTime as workflow-start/list-timestamp, not child last-activity) and DONT4 (no new last-activity index).
- **[wisdom_candidate]** wisdom_candidates: [pattern] For root CLI JSON backed by Temporal Visibility, keep row enrichment in the narrow temporal-boundary export and normalize untrusted Visibility fields before root CLI serialization; source-boundary tests should assert no per-workflow hydration or external state reads.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- plugin/src/temporal/list-epic-workflows.test.ts plugin/src/cli-bridge-contract.test.ts (invocation path mismatch; no tests found), bun test bin/lib/epic-list.test.ts, bin/oc-test targeted -- src/temporal/list-epic-workflows.test.ts src/cli-bridge-contract.test.ts, pnpm run schemas:check, pnpm run typecheck, git diff --check trunk...HEAD results=pass — Reviewed diff from trunk...HEAD at 13302e3c7895d733aa85ad971eb64970e1a2a57a. Corrected targeted Vitest invocation passed 2 files / 28 tests; Bun CLI helper tests passed 6 tests / 13 assertions; schemas:check and typecheck exited 0; git diff --check produced no output. Initial oc-test invocation used plugin-prefixed paths while wrapper runs in plugin/ and failed with no tests found; rerun with src/ paths passed.
- **[unresolved_action]** required_main_agent_actions: Proceed with release/archive if orchestrator-held release gate evidence remains current and CI/release policy is satisfied.
- **[archive_only_evidence]** verification: tests_run=git status --short && git branch --show-current && git rev-parse --show-toplevel && git merge-base HEAD origin/main && git diff --stat origin/main...HEAD && git diff --name-only origin/main...HEAD, git branch -r && git status --short && git diff --stat trunk...HEAD && git diff --name-only trunk...HEAD, git diff --check trunk...HEAD && git diff --find-renames --find-copies trunk...HEAD -- . ':!plugin/pnpm-lock.yaml', bin/oc-test targeted -- plugin/src/temporal/list-epic-workflows.test.ts plugin/src/cli-bridge-contract.test.ts, bin/oc-test targeted -- src/temporal/list-epic-workflows.test.ts src/cli-bridge-contract.test.ts, bun test bin/lib/epic-list.test.ts, git status --short && git diff --check trunk...HEAD results=pass — Initial origin/main probe failed because repository default is trunk. Initial oc-test targeted command used root-prefixed plugin paths and found no tests; rerun with plugin-relative paths passed: 2 files, 28 Vitest tests. Bun CLI helper tests passed: 6 tests, 13 assertions. git diff --check passed and final git status was clean.

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
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |

## Unresolved Actions

- Proceed with release/archive if orchestrator-held release gate evidence remains current and CI/release policy is satisfied.
