# Archive Briefing Digest

**Change ID:** diagnoseArchivedListingTimeout2
**Title:** Diagnose archived listing timeout
**Status:** archived
**Generated:** 2026-07-07T06:37:36.371Z

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

Epic: optimizeAdvPerformanceStructure · Diagnose archived listing timeout (order 2)

## Durable Facts

Showing 86 of 86 durable facts.

- **[agenda]** follow_ups: Fix pre-existing typecheck error in plugin/src/temporal/change-state.ts (adv-visual-review subagent report type).
- **[agenda]** follow_ups: Fix pre-existing prettier violation in plugin/src/types/subagent-reports.test.ts.
- **[archive_only_evidence]** decisions: Checked durable terminal projection before live workflow query, cache, or re-seed in getTemporalChange — Ensures archive bundle and closed disk dominate stale active/memo/workflow/visibility projections per rq-terminalProjectionTruth01 and avoids live workflow round-trips for archived candidates per rq-terminalAggregateRead01.
- **[archive_only_evidence]** decisions: Reused existing loadArchiveBundleDominantProjection and loadDiskTerminalProjection inside a new loadTerminalProjection helper — Minimizes new code and keeps canonical-id dedupe, archive bundle dominance, and closed-disk dominance in one place.
- **[archive_only_evidence]** decisions: Updated advance-workflow version assertions from 1.25.1 to 1.26.0 in ops-follow-up-assets.test.ts and adv-skill-backed-commands-assets.test.ts — The spec.json was already at 1.26.0 for the newly added rq-terminal* requirements; the asset tests were stale.
- **[archive_only_evidence]** verification: pnpm test -- src/storage/store-temporal/index.test.ts (0) — All tests in index.test.ts pass, including new archive-first terminal projection tests.
- **[archive_only_evidence]** verification: pnpm test -- src/storage/store-temporal/changes.test.ts (0) — listSummary and change ops tests still pass.
- **[archive_only_evidence]** verification: pnpm test -- src/ops-follow-up-assets.test.ts src/adv-skill-backed-commands-assets.test.ts (0) — Version-bumped asset tests pass.
- **[archive_only_evidence]** verification: pnpm test -- src/__tests__/spec-citation-invariant.test.ts (0) — New rq-* requirements are cited in code comments.
- **[archive_only_evidence]** verification: pnpm run lint (0) — ESLint passes.
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/storage/store-temporal/index.test.ts (0) — New tests are formatted.
- **[archive_only_evidence]** verification: pnpm run typecheck (2) — Fails pre-existing in plugin/src/temporal/change-state.ts (unrelated to touched files).
- **[archive_only_evidence]** verification: pnpm run format:check (1) — Fails pre-existing in plugin/src/types/subagent-reports.test.ts (unrelated to touched files).
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/storage/store-temporal/index.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/storage/store-temporal/changes.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/ops-follow-up-assets.test.ts src/adv-skill-backed-commands-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/__tests__/spec-citation-invariant.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run lint
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/storage/store-temporal/index.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- **[archive_only_evidence]** decisions: Added optional source field to LoadResult success branch — Allows getTemporalChange to report whether a loaded change came from workflow, disk, or archive, which is required for terminal hydration stats.
- **[archive_only_evidence]** decisions: Changed listResolvedChanges return type from Change[] to ResolvedChangeList — Carries warnings and hydrationStats alongside the change array without breaking the internal contract for callers that only need changes.
- **[archive_only_evidence]** decisions: Surfaced degraded metadata only when wantsTerminalStatuses is true — Preserves active/default list behavior and caller compatibility per OOS1/AC4.
- **[archive_only_evidence]** decisions: Used a second candidate-resolution pass to classify terminal sources — Kept the existing fallback logic intact and minimized structural risk while still achieving structural per-candidate classification.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts (0) — 143 targeted tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.archive-phase9.test.ts src/tools/change.archive-repair.test.ts src/tools/change.status-repair.test.ts src/tools/change.read-artifact.test.ts src/tools/change.cross-project-create.test.ts (0) — 209 related tests pass
- **[archive_only_evidence]** verification: pnpm run schemas:check (0) — Public JSON schemas unchanged/drift-free
- **[archive_only_evidence]** verification: pnpm exec eslint src/storage/json.ts src/storage/store-types.ts src/types/responses.ts src/types/index.ts src/storage/store-temporal/shared.ts src/storage/store-temporal/index.ts src/storage/store-temporal/changes.ts src/tools/change.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts (0) — No lint errors on changed files
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/storage/json.ts src/storage/store-types.ts src/types/responses.ts src/types/index.ts src/storage/store-temporal/shared.ts src/storage/store-temporal/index.ts src/storage/store-temporal/changes.ts src/tools/change.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts (0) — Prettier formatting passes on changed files
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (2) — Only pre-existing error in src/temporal/change-state.ts (adv-visual-review exhaustiveness), unrelated to this change
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.archive-phase9.test.ts src/tools/change.archive-repair.test.ts src/tools/change.status-repair.test.ts src/tools/change.read-artifact.test.ts src/tools/change.cross-project-create.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/storage/json.ts src/storage/store-types.ts src/types/responses.ts src/types/index.ts src/storage/store-temporal/shared.ts src/storage/store-temporal/index.ts src/storage/store-temporal/changes.ts src/tools/change.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/storage/json.ts src/storage/store-types.ts src/types/responses.ts src/types/index.ts src/storage/store-temporal/shared.ts src/storage/store-temporal/index.ts src/storage/store-temporal/changes.ts src/tools/change.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit
- **[archive_only_evidence]** decisions: No source code patches were needed; the existing callers and envelope already handle the fast path correctly. — Inspection showed listSummary already excludes terminal rows unless wantsTerminal, and terminal callers (status-hygiene, archive-repair, status-repair) use the authoritative list path. Tests provide the missing evidence rather than code changes.
- **[archive_only_evidence]** decisions: Added mock-rejection guards in listSummary and change.test tests to prove the fast path is not silently falling back. — Call-count assertions alone don't catch a fallback that returns a value; rejecting mocks make any unintended fallback fail loudly.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.status-repair.test.ts src/tools/status-hygiene.test.ts src/tools/change.archive-repair.test.ts src/tools/status.test.ts (0) — 192 tests passed across the touched and related test files.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/index.status-repair-readback.test.ts (0) — 31 integration tests passed, including the status-repair public-read-path parity test.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec prettier --check src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.status-repair.test.ts src/tools/status-hygiene.test.ts (0) — Formatting check passed for all changed files.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec eslint src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.status-repair.test.ts src/tools/status-hygiene.test.ts (0) — Lint passed for all changed files.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.status-repair.test.ts src/tools/status-hygiene.test.ts src/tools/change.archive-repair.test.ts src/tools/status.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/index.status-repair-readback.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec prettier --check src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.status-repair.test.ts src/tools/status-hygiene.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec eslint src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.status-repair.test.ts src/tools/status-hygiene.test.ts
- **[agenda]** follow_ups: Design must select the exact degraded-result shape (warnings[] vs partial flag + hydrationStats) and the bounded-budget trigger (candidate-count cap vs wall-clock soft budget); user deferred degraded_behavior to design.
- **[agenda]** follow_ups: Add regression tests: (a) archived-only large-state list stays within bounded cost and returns no hard timeout; (b) partial terminal read surfaces explicit degraded warning; (c) active-only fast path unchanged; (d) archive-bundle-dominance terminal-truth still holds.
- **[agenda]** follow_ups: Confirm exact spec requirement IDs (advance-workflow / advance-delivery) governing terminal reads and degraded-result contract during design.
- **[archive_only_evidence]** sources: index.ts listResolvedChanges terminal fan-out: Terminal listing unions memo+visibility+disk+archive IDs then calls getTemporalChange for EVERY candidate in batches of 20. Archive-only IDs (no live workflow) each pay a doomed live Temporal query + classify + reseed path.
- **[archive_only_evidence]** sources: getTemporalChange archive-only cost: loadDiskTerminalProjection returns only for status 'closed', NOT 'archived'. Archived-only candidates skip the terminal fast path, hit a cache miss, then execute a live changeStateQuery that will fail WorkflowNotFound, then classifyTemporalReadFailure, then reseedChangeFromDisk — 2-3 sequential I/O + Temporal round-trips per archived change.
- **[archive_only_evidence]** sources: runTemporalQuery per-attempt 5s timeout: Each live query is bounded at 5s. WorkflowNotFound classifies as 'fallback' (retry-wrapper.ts:60-67) so retries short-circuit, but a hung/wedged worker makes each failed candidate query cost up to 5s; classifyTemporalReadFailure can add another describe() up to 5s (shared.ts:250-267,287-293).
- **[archive_only_evidence]** sources: listSummary terminal defer: Any terminal or content-filtered listSummary call delegates wholesale to listResolvedChanges, so the summary/memo fast path is entirely bypassed for includeArchived. hydrationStats is returned but there is no partial/degraded contract.
- **[archive_only_evidence]** sources: No degraded-result contract on change listing; reusable warnings primitive exists: adv_change_list has no partial/degraded/warnings envelope. Sibling aggregators (backlog_state/wip_state) already isolate per-source failure into a `warnings[]` array — a proven in-repo pattern to reuse for degraded terminal listing.
- **[archive_only_evidence]** sources: Temporal maintainer: querying completed workflows replays history; not retained long: antonio.perez + maxim confirm queries against completed workflows force worker history pull+replay unless cached, and Temporal does not retain completed workflows/visibility records long — durable external store (disk/archive bundle) is the recommended read source. Validates reading archive bundle BEFORE attempting a live query for terminal IDs.
- **[archive_only_evidence]** sources: Temporal Visibility List/Count is the canonical list-by-state path: Visibility List Filter + Count API are the documented cheap path to enumerate/filter/count workflows by ExecutionStatus without per-workflow query, distinct from workflow query which replays history.
- **[archive_only_evidence]** sources: Existing stale-memo/archive-dominance tests but no bounded-budget/degraded test: Coverage exists for stale memo invalidation and archive-bundle dominance, but there is no test asserting bounded per-candidate cost, no-hard-timeout under large terminal state, or a degraded/partial contract.
- **[archive_only_evidence]** architecture_assessment: Root cause of #106 is a per-candidate live-query fan-out on the terminal listing path. For includeArchived/includeClosed, listResolvedChanges enumerates the FULL union (memo ∪ Visibility ∪ disk ∪ archive) and runs getTemporalChange on each ID sequentially-per-batch (batch=20). Active changes resolve cheaply (cache/query hit), but every archive-only ID follows the expensive miss path: cache miss → live changeStateQuery that WILL fail WorkflowNotFound (Temporal evicts/GCs completed workflows — confirmed by maxim) → classifyTemporalReadFailure (possibly another describe) → reseedChangeFromDisk (disk/archive read). This inverts Temporal's documented guidance: for terminal state the durable external projection (archive bundle / disk) is authoritative and should be read FIRST; the live query is pure waste for archived IDs. loadDiskTerminalProjection already short-circuits 'closed' but NOT 'archived' — a one-line-shaped asymmetry that forces archived changes through the doomed live-query path. Latency scales O(#archived) × (disk + failed-query + classify + reseed); under a wedged worker each failed query burns up to 5s, trivially blowing a 10s tool budget. The active-only path is untouched by any proposed fix because it does not enter the terminal union or the archived miss path.
- **[agenda]** follow_ups: Implementation should confirm archiveBundleCache is shared across the terminal candidate loop so the added archive-bundle existence check is O(1) amortized per id, not per-batch re-checked.
- **[agenda]** follow_ups: Verify adv_change_list output schema (Zod) permits additive warnings[]/hydrationStats without schemas:check drift; run pnpm run schemas:generate if the public schema is extended.
- **[archive_only_evidence]** sources: index.ts loadDiskTerminalProjection: Terminal disk short-circuit returns ONLY when status === 'closed'. Archived records get no terminal short-circuit, so each archived candidate falls through to live workflow query/reseed — the O(N) fan-out root of the #106 archived-list timeout.
- **[archive_only_evidence]** sources: index.ts getTemporalChange archive override placement: loadArchiveBundleDominantProjection is consulted only when cached/queried status is non-terminal; the archived candidate still executes a live workflow query (line 583-605) before any archive fallback. Reseed path (617-636) also runs before archive resolution for evicted workflows.
- **[archive_only_evidence]** sources: index.ts listResolvedChanges batch hydration: Batches of 20 call getTemporalChange per candidate. Archive-bundle override lives only in the CATCH branch (818-844); a slow/hung workflow query on the TRY path is not bypassed and consumes the whole tool call.
- **[archive_only_evidence]** sources: changes.ts terminal listSummary delegation: Terminal/content filters fully delegate to listResolvedChanges with no per-source degraded metadata. One slow source (visibility, workflow query) consumes the whole call and surfaces as unclassified whole-tool timeout.
- **[archive_only_evidence]** sources: Shared primitive call sites: status archived-branch hygiene, change recovery, and archive-repair all call store.changes.list({includeArchived:true}) → same listResolvedChanges primitive. A terminal-projection-first + degraded envelope fix benefits all three for free.
- **[archive_only_evidence]** sources: changes.ts stale-shadow pre-scan pattern (existing, reusable): Both list paths already implement archive-bundle-dominance pre-scan to invalidate stale non-terminal memo/cache. Proven pattern; extend rather than reinvent for AC3 stale-dominance.
- **[archive_only_evidence]** architecture_assessment: The draft design is correctly targeted and boring in the good sense: it extends existing proven patterns (loadArchiveBundleDominantProjection, archive-bundle-dominance pre-scan, source-isolated warnings) rather than introducing new machinery. The single highest-leverage, low-risk win is extending the terminal disk/archive short-circuit to cover 'archived' the same way loadDiskTerminalProjection already covers 'closed' (index.ts:640-653) — this directly removes the O(N) live-workflow-query fan-out that is the observed #106 root cause, and it makes the fast path match the truth rule the catch-branch override already asserts. The degraded envelope (warnings[]/hydrationStats) is compatible-by-construction (additive fields) and matches existing repo aggregate-read warning patterns. Shared-primitive reach is real and cheap: status-hygiene, change recovery, and archive-repair all route through the same list surface. Deterministic fake-slow-source tests are the correct verification choice given the no-wall-clock-budget decision. No design deviation from canonical Temporal read-model practice: Visibility for live enumeration, durable projection for terminal/completed records that lack a useful query path.
- **[agenda]** follow_ups: Planning: mechanize D2 'bounded logic' as structural per-candidate warning collection to keep AC1 deterministic and honor DONT1.
- **[agenda]** follow_ups: Planning: author advance-workflow spec-delta (terminal aggregate read behavior, archive/closed projection dominance, active fast-path preservation) with concrete rq-* IDs and Given/When/Then before implementation tasks.
- **[agenda]** follow_ups: Execution: add regression test asserting terminal candidates resolve WITHOUT calling runTemporalQuery/getGuardedChangeHandle (call-count assertion) to lock in the fan-out-skip and rq-replayFallback01.1 no-recreate guarantee.
- **[archive_only_evidence]** sources: store-temporal/index.ts getTemporalChange + loadDiskTerminalProjection: loadDiskTerminalProjection short-circuits ONLY closed status (645); archived has no terminal short-circuit. getTemporalChange runs live workflow query (584-586) and applies archive override AFTER query (596-604) and in catch reseed (617-635). Confirms design D1 gap and root-cause ordering claim.
- **[archive_only_evidence]** sources: store-temporal/index.ts listResolvedChanges terminal hydration: Per-candidate O(N) fan-out through getTemporalChange (803-858); each may hit runTemporalQuery. Failed candidates silently dropped (result.success filter 853-857) with NO degraded envelope. Confirms timeout chokepoint and missing-classification claim. Dedupe already by canonical change.json.id (864-878).
- **[archive_only_evidence]** sources: store-temporal/changes.ts listSummary terminal delegation + archive pre-scan: Terminal filters delegate whole branch to listResolvedChanges (794-798), confirming shared chokepoint. Archive-bundle dominance pre-scan (897-927) already exists — design reuses this pattern, not new heuristic.
- **[archive_only_evidence]** sources: tools/change.ts adv_change_list envelope: adv_change_list uses listSummary and preserves pagination envelope via formatToolOutput; additive fields (warnings/hydrationStats) do not break existing required fields. Confirms D2 additive-compatibility claim.
- **[archive_only_evidence]** sources: store-types.ts + existing warnings patterns: hydrationStats already typed in store-types and returned by listSummary. Established warnings[] convention ({source,reason}; conditional spread). D2 envelope reuses tested telemetry/warning machinery.
- **[archive_only_evidence]** sources: Spec advance-workflow rq-archiveRetirement01.2: Spec-law: 'Archived change lookups resolve from durable archived state or the archive bundle.' Directly supports D1 archive-first terminal resolution.
- **[archive_only_evidence]** sources: Spec advance-delivery rq-replayFallback01: Spec-law: read tools SHALL attempt durable projection fallback; 'Terminal projections (archived or closed) MUST NOT recreate change workflows during fallback.' Design D1 (archive-first, skip query) strengthens compliance — moving archive resolution before the query removes a reseed trigger.
- **[archive_only_evidence]** sources: Context7 Temporal TypeScript docs — Visibility list + query error semantics: WorkflowService.listWorkflowExecutions supports query filters (matches existing Visibility enumeration). Workflow queries can error/reject: no polling workers -> ServiceError FAILED_PRECONDITION; handler error -> QueryNotRegisteredError; RPC -> TimeoutException/WorkflowNotFoundException. Confirms root cause: per-candidate query fan-out over evicted/completed archived workflows produces the whole-tool timeout.
- **[archive_only_evidence]** architecture_assessment: Design is correct, minimal, and spec-aligned. Root cause verified: listResolvedChanges fans out per-candidate getTemporalChange -> runTemporalQuery; for archived/evicted workflows a worker-less task queue or missing workflow makes each query hang/error (Context7-confirmed FAILED_PRECONDITION/timeout), producing O(N) slow-source fan-out and the unclassified whole-tool ToolExecutionTimeout in #106. Design D1 (resolve terminal candidates from archive bundle/closed disk BEFORE live workflow query) eliminates the query fan-out for exactly the records that trigger it, and simultaneously strengthens rq-replayFallback01.1 (no workflow recreation for archived) and rq-archiveRetirement01.2 (archived lookups resolve from durable state/bundle). D2 (structured degraded envelope) reuses existing hydrationStats type and warnings[] conventions — additive, envelope-preserving, satisfies C3 (no hidden partial success). D3 (fake slow-source + call-count assertions) satisfies C5 and avoids flaky p95. D4 (narrow shared primitive; defer summary-index + status TTL) matches agreement scope and avoids DONT3/DONT4. Existing active fast path (listSummary non-terminal branch, 848+) is untouched, satisfying SC3/C4/AC2. No simpler materially-equivalent approach found: raising timeout (DONT1) only moves the cliff; a summary index is larger than the #106 slice (correctly deferred). Only residual design-latitude item: 'bounded logic' for degraded classification (D2/step 4) is stated but not yet mechanized — planning must define the concrete bound (e.g. per-candidate try/collect-warning, not a wall-clock timer) to keep AC1 structural rather than heuristic and honor DONT1.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- plugin/src/storage/store-temporal/index.test.ts plugin/src/storage/store-temporal/changes.test.ts plugin/src/tools/change.test.ts, bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts results=pass — Initial targeted command used repo-root-prefixed paths and Vitest reported no test files. Corrected command with plugin-relative paths passed: 3 test files, 145 tests. Reviewed diff and touched source/docs/specs against AC1-AC5 plus known full verification evidence tr_mra91jl2_4312967b.
- **[unresolved_action]** required_main_agent_actions: Release note only: because OpenCode loads deployed dist at session startup, run `pnpm run build`, `./scripts/deploy-local.sh --fix`, then restart OpenCode before validating live `adv_change_list` behavior from deployed runtime.
- **[unresolved_action]** required_main_agent_actions: No release-blocking agenda item remains: relevant pending audit items for degraded-result shape, regression tests, rq IDs, archiveBundleCache/schema warnings are satisfied by code/tests or are normal non-release cleanup/deployment notes.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Terminal aggregate reads should surface machine-readable degraded metadata (`warnings[]`, `hydrationStats`) instead of stretching timeouts; bounded per-candidate fallback plus archive-bundle dominance tests gave release confidence without timeout inflation.
- **[archive_only_evidence]** verification: tests_run=Path preflight for all listed touched files: all OK, pnpm run schemas:check (from plugin/), bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/tools/change.test.ts, bin/adv slop-scan plugin/src/storage/store-temporal --json, git status --short results=pass — Path preflight found every listed file. `pnpm run schemas:check` completed successfully. Corrected targeted test command passed 2 files / 126 tests. Slop scan produced no CRITICAL/HIGH findings, 10 MEDIUM MAINT-004 complexity hotspots, and degraded detector coverage because knip JSON parsing failed and ast-grep/jscpd were unavailable; no TODO/FIXME/HACK/@ts-ignore implementation-path findings were found in touched source. `git status --short` returned clean. Prior context also recorded full suite pass runId tr_mra91jl2_4312967b and smoke pass runId tr_mra8z3dr_853e9476.
- **[epic_terminal_note]** epic.membership: optimizeAdvPerformanceStructure · Diagnose archived listing timeout (order 2)

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

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/storage/store-temporal/index.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/storage/store-temporal/changes.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/ops-follow-up-assets.test.ts src/adv-skill-backed-commands-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/__tests__/spec-citation-invariant.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run lint
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/storage/store-temporal/index.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.archive-phase9.test.ts src/tools/change.archive-repair.test.ts src/tools/change.status-repair.test.ts src/tools/change.read-artifact.test.ts src/tools/change.cross-project-create.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/storage/json.ts src/storage/store-types.ts src/types/responses.ts src/types/index.ts src/storage/store-temporal/shared.ts src/storage/store-temporal/index.ts src/storage/store-temporal/changes.ts src/tools/change.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/storage/json.ts src/storage/store-types.ts src/types/responses.ts src/types/index.ts src/storage/store-temporal/shared.ts src/storage/store-temporal/index.ts src/storage/store-temporal/changes.ts src/tools/change.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.status-repair.test.ts src/tools/status-hygiene.test.ts src/tools/change.archive-repair.test.ts src/tools/status.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/index.status-repair-readback.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec prettier --check src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.status-repair.test.ts src/tools/status-hygiene.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec eslint src/storage/store-temporal/changes.test.ts src/tools/change.test.ts src/tools/change.status-repair.test.ts src/tools/status-hygiene.test.ts
- Release note only: because OpenCode loads deployed dist at session startup, run `pnpm run build`, `./scripts/deploy-local.sh --fix`, then restart OpenCode before validating live `adv_change_list` behavior from deployed runtime.
- No release-blocking agenda item remains: relevant pending audit items for degraded-result shape, regression tests, rq IDs, archiveBundleCache/schema warnings are satisfied by code/tests or are normal non-release cleanup/deployment notes.
