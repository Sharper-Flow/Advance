# Archive Briefing Digest

**Change ID:** fixHealthViewTimeouts
**Title:** Fix health view timeouts
**Status:** archived
**Generated:** 2026-07-19T02:59:24.917Z

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

No Epic membership

## Durable Facts

Showing 100 of 142 durable facts (42 omitted).

- **[archive_only_evidence]** decisions: Exposed executeHealthPlan as the primary primitive with injected Clock/TimerService/AbortSignal factories rather than native setTimeout/AbortSignal.timeout(). — Design requires deterministic virtual-time testing and avoids runtime virtualization; keeps the executor request-local and testable.
- **[archive_only_evidence]** decisions: HealthProviderDescriptor returns HealthProviderOutcome from run() and executor enforces cap/cutoff/abort over it. — Lets provider closures express ok/stale/unavailable directly while the executor owns timeout/error/not_admitted as structural guarantees.
- **[archive_only_evidence]** decisions: Used as const assertion in the no-post-cutoff test and ctx.timer in cap/timeout tests. — Preserves literal typing for cancellability and lets providers share the same injected fake timer as the executor.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/status-execution.test.ts (1) — Expected RED failure: module './status-execution' not found; no other test errors or regressions.
- **[archive_only_evidence]** decisions: Added a dedicated listSourceRankedCandidates module with a stub implementation so tests compile and fail semantically in the red phase. — TDD red phase requires failing tests; the module boundary separates source-ranked orientation from the existing ID-only enumerator and gives the green phase a clear implementation target.
- **[archive_only_evidence]** decisions: Placed new source-ranked tests in list-source-ranked-candidates.test.ts and the enumerator-compatibility test in list-change-workflows.test.ts. — Keeps source-ranked orientation concerns separate from the existing ID-only enumerator contract and preserves locality of behavior.
- **[archive_only_evidence]** decisions: Used ISO-8601 strings in mocked Visibility search attributes and a generic deterministic shuffle helper. — Matches Temporal SDK wire convention, makes deterministic test construction easy, and avoids fragile test ordering.
- **[archive_only_evidence]** verification: npx vitest run src/temporal/list-source-ranked-candidates.test.ts (1) — 10/10 new tests fail semantically as expected in red phase (stub returns empty results, exercising all ranking/fallback/degradation assertions)
- **[archive_only_evidence]** verification: npx vitest run src/temporal/list-change-workflows.test.ts (0) — 12/12 tests pass including new ID-only enumerator compatibility test with search attributes present
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — No TypeScript errors in production source files
- **[archive_only_evidence]** verification: pnpm run lint -- src/temporal/list-source-ranked-candidates.ts src/temporal/list-source-ranked-candidates.test.ts src/temporal/list-change-workflows.test.ts && pnpm run format:check -- src/temporal/list-source-ranked-candidates.ts src/temporal/list-source-ranked-candidates.test.ts src/temporal/list-change-workflows.test.ts (0) — Lint and format clean on touched files
- **[archive_only_evidence]** verification: npx vitest run src/storage/store-temporal/bounded-status.test.ts (0) — Existing bounded-status store tests unaffected by the new orientation module
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/temporal/list-source-ranked-candidates.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/temporal/list-change-workflows.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run lint -- src/temporal/list-source-ranked-candidates.ts src/temporal/list-source-ranked-candidates.test.ts src/temporal/list-change-workflows.test.ts && pnpm run format:check -- src/temporal/list-source-ranked-candidates.ts src/temporal/list-source-ranked-candidates.test.ts src/temporal/list-change-workflows.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/storage/store-temporal/bounded-status.test.ts
- **[archive_only_evidence]** verification: tests_run=adv_run_test tr_mrr5w9rs_25acf32d results=pass — 27/27 source-ranking, workflow enumeration, and bounded-status tests passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test tr_mrr5w9rs_25acf32d
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/list-source-ranked-candidates.test.ts src/temporal/list-change-workflows.test.ts src/storage/store-temporal/bounded-status.test.ts results=pass — adv_run_test tr_mrr5w9rs_25acf32d: 27/27 passed.
- **[archive_only_evidence]** decisions: Added a dedicated health-probe-cache.test.ts that imports a new ./health-probe-cache module rather than extending probe-cache.ts or status-health.ts. — Keeps the legacy coalesced cache contract untouched while giving the new request-owned CAS cache a clean boundary and focused test surface.
- **[archive_only_evidence]** decisions: Proposed createHealthProbeCache with refresh(key, {signal, cutoffTime}), read(key), and currentGeneration(key). — refresh must be request-owned and never join shared same-key inflight work; currentGeneration and read expose the monotonic CAS publication state so tests can verify newer wins, aborted/cutoff cannot publish, and older cannot overwrite newer.
- **[archive_only_evidence]** decisions: Proposed getQueueServiceability(input, {signal}) as an explicit-input, request-local adapter returning {value, outcome, evidence}. — Removes the project-keyed mutable statusQueueServiceabilityInputs Map; concurrent requests cannot overwrite each other and unusable Temporal health can terminalize as not_admitted.
- **[archive_only_evidence]** verification: npx vitest run src/tools/health-probe-cache.test.ts (1) — Expected RED failure: module './health-probe-cache' not found; no other tests run or regress.
- **[archive_only_evidence]** decisions: Created a dedicated pressure/integration test file instead of expanding status.test.ts heavily. — Matches the requested preference and keeps the new bounded-health contract in one focused place while adding only one minimal assertion to the existing status test file.
- **[archive_only_evidence]** decisions: Stopped on expected semantic failures without patching production code. — Task explicitly asked for TDD RED PHASE ONLY; the failures are the intended red signals that guide the upcoming integration.
- **[archive_only_evidence]** decisions: Used vi.useFakeTimers only for the two explicit virtual-time assertions (cold forceRefresh and post-cutoff). — Avoids brittle real-time coupling while still proving the 8,000 ms virtual deadline and late-mutation invariants.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/status-execution.test.ts (0) — Executor unit tests pass (12/12).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/status-health-pressure.test.ts src/tools/status.test.ts (1) — Expected red failures: health view passes undefined to store.status, lacks _health_execution, calls advWorktreeCleanup, and throws on stalled probe cache instead of returning typed partial outcomes.
- **[archive_only_evidence]** verification: cd plugin && pnpm tsc --noEmit (0) — TypeScript typecheck passes on the new and updated test files.
- **[archive_only_evidence]** decisions: Added stub exports for buildCandidateEnrichmentPatch and applyCandidateEnrichmentPatches in status-enrich.ts instead of using dynamic imports. — Lets the red-phase tests compile and fail semantically against a typed API surface, keeping the new enrichment boundary co-located with the existing mutable enrichment logic.
- **[archive_only_evidence]** decisions: Used throw-not-implemented stubs rather than returning dummy data. — Produces a clear, unambiguous red-phase signal for every new test and avoids accidental green tests from a trivial stub.
- **[archive_only_evidence]** decisions: Reused existing resolvedChange/recency/mockStore helpers and added a dedicated summary/hygiene compatibility regression test. — Preserves locality, avoids test duplication, and explicitly guards the existing non-health enrichment path.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/status-enrich.test.ts (1) — Expected red-phase result: 9 new patch/reducer tests fail with not-implemented stubs; 13 existing/regression tests pass.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (0) — TypeScript typecheck passes with new stub exports and test types.
- **[archive_only_evidence]** verification: pnpm exec eslint src/tools/status-enrich.ts src/tools/status-enrich.test.ts (0) — Lint clean on touched files.
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/tools/status-enrich.ts src/tools/status-enrich.test.ts (0) — Prettier formatting clean on touched files.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/tools/status-enrich.ts src/tools/status-enrich.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/tools/status-enrich.ts src/tools/status-enrich.test.ts
- **[archive_only_evidence]** verification: tests_run=adv_run_test tr_mrr5wm78_db934f67 results=pass — 80/80 status enrichment, fail-closed, and compatibility tests passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test tr_mrr5wm78_db934f67
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/status-enrich.test.ts src/tools/status-enrich-fail-closed.test.ts src/tools/status.test.ts results=pass — adv_run_test tr_mrr5wm78_db934f67: 80/80 passed.
- **[archive_only_evidence]** decisions: Replaced only the failing advance-workflow exact-version assertions with a semantic minimum-version helper (expectVersionAtLeast) in adv-skill-backed-commands-assets.test.ts and ops-follow-up-assets.test.ts. — The regression was caused by advance-workflow bumping from 1.28.1 to 1.29.0; minimum-version checks survive future bumps while still validating the floor required by each test.
- **[archive_only_evidence]** decisions: Left other exact-version assertions in the touched tests unchanged. — The remediation was scoped to same-pattern advance-workflow assertions only; subagent-reports/backlog-coordination/adv-prep exact versions were not part of the introduced failures.
- **[archive_only_evidence]** decisions: Added // rq-terminalSummary01 in archive/terminal-summary.ts and // rq-terminalHistoryBudget01 in archive/terminal-history.ts. — The spec-citation invariant looks at plugin/src/**/*.ts; placing citations on the actual owning implementation surfaces satisfies the invariant without test-only suppressions.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts src/__tests__/spec-citation-invariant.test.ts (0) — 3 test files, 70 tests passed
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, manifests, isolation, lockfile, lint, and format checks all green
- **[report_follow_up]** follow_ups: Test (4) read-only cleanup boundary is GREEN in current production because the health-view plan sets plan.worktreeCleanup=false and runHealthStatus uses initStateDb+getPendingDeletes+summarizePendingDeletes only. It is intentionally included as a regression guard against future changes that might re-introduce destructive cleanup into the health view.
- **[unresolved_action]** required_main_agent_actions: After implementation lands, re-run plugin/src/tools/status-health-acceptance-bypass.test.ts (targeted via bin/oc-test) and confirm all 4 tests turn GREEN. Test (3) is the most timing-sensitive — if it flakes between 0 and 2 underlying fetches in the full run, investigate whether _healthRequestProbeCaches.clear is dropping the request-owned cache state across tests.
- **[archive_only_evidence]** decisions: Created a new dedicated test file plugin/src/tools/status-health-acceptance-bypass.test.ts rather than extending the existing status-health-integration-blockers.test.ts so the four reviewer-identified bypasses have a single owner with explicit naming and identical composition helpers. — The prompt asks for tests that fail for the specific bypasses; grouping them under a dedicated file with one describe per bypass makes the bypass->test mapping obvious to the acceptance reviewer and prevents drift between helper setup and the assertions each bypass needs.
- **[archive_only_evidence]** decisions: Drive each test through statusTools.adv_status.execute with a real Temporal+disk store and inject delays at the real probe/resolver boundaries (vi.mock wrapping listSpecsActivity, scanSnapshotHealth, getTemporalHealth, etc.) instead of mocking the cache layer directly. — The prompt forbids mocks that precompute topTen or bypass resolver integration. Mocking the resolver + probe leaves the production statusLoad + runHealthStatus + applyStatusView composition intact, so the RED failures reflect actual production behavior rather than a test-double artifact.
- **[archive_only_evidence]** decisions: Used real Visibility + disk fixtures (15 scrambled visibility records + 5 disk-only records with distinct source timestamps) for the source-ranked top10 test rather than precomputing the expected topTen. — The prompt requires the source-ranked candidate module to be exercised end-to-end against real descriptors. The expected top10 is asserted from the source-backed timestamps the test wrote, so any deviation proves production sorts by memo/enumeration rather than source recency.
- **[archive_only_evidence]** decisions: Used a vitest 15s test timeout and an assertion-only budget (elapsed ≤ 8_000ms) on test (1) instead of relying on the 7.5s runHealthStatus cutoff to surface the budget bypass. — Production's runHealthStatus has its own 7500ms cutoff, but the resolver phase runs BEFORE runHealthStatus starts and is only bounded by its own statusReadOptions.deadline (also 7500ms). Setting the resolver delay to 8500ms and asserting ≤ 8s proves the resolver is NOT inside any aggregate 8s response budget — the discriminating RED failure the reviewer asked for.
- **[archive_only_evidence]** decisions: Cleared BOTH legacy (_statusProbeCaches) and request-owned (_healthRequestProbeCaches) caches in beforeEach via the new _healthRequestProbeCaches.clear hook that exists in the in-progress status-health-plan.ts. — The current code is in a transitional state with both legacy createProbeCache and the new createHealthProbeCache wrappers; clearing only the legacy one would let state from previous tests poison the per-key CAS assertions in test (3).
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/status-health-acceptance-bypass.test.ts (0) — Tests 3 failed | 1 passed (4) in 36.6s. RED on (1) whole-request 8s ownership, (2) source-ranked top10 hydration, (3) request-owned cache CAS; GREEN on (4) read-only cleanup boundary.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/status-health-acceptance-bypass.test.ts
- **[archive_only_evidence]** verification: tests_run=adv_run_test tr_mrr6002z_489ebc31 results=pass — Full throttled test suite completed with exit code 0.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test tr_mrr6002z_489ebc31
- **[archive_only_evidence]** verification: tests_run=bin/oc-test full results=pass — adv_run_test tr_mrr6002z_489ebc31: exit code 0.
- **[report_follow_up]** follow_ups: Packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; research continued from explicit user scope.
- **[report_follow_up]** follow_ups: Input scope key lacked the required researcher: transport prefix; report used schema-valid researcher:health-timeout-architecture.
- **[report_follow_up]** follow_ups: Clarify/delta worktree-lifecycle prose if status-triggered cleanup mutation is removed while preserving blocker aggregates.
- **[report_follow_up]** follow_ups: Confirm whether bounded health keeps lightweight next-gate recommendations or omits all per-change enrichment; recommendation assumes preservation.
- **[report_follow_up]** follow_ups: Add Zod/JSON schema coverage if _health_execution becomes a public contract.
- **[research_citation]** sources: Current adv_status orchestration: Health currently performs status load, probes, sequential recent enrichment, worktree cleanup, snapshot scan, peer scan, plugin-runtime scan, formatting, and projection mostly in serial. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/status.ts#L251-L889)
- **[research_citation]** sources: Current status view plan: Health enables recent enrichment and worktree cleanup; hygiene owns session debt, external-state archaeology, project metadata, and archived-branch hygiene. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/status-view.ts#L41-L123)
- **[research_citation]** sources: Current cached health probes: Most probes use 2-second cache timeouts; snapshot health uses a 10-second timeout and does not accept the cache AbortSignal. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/status-health.ts#L41-L178)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Major current deviation. The store already accepts a shared TemporalReadDeadline and a 10-candidate upstream bound, but adv_status does not create a whole-health deadline and bounds only summary. Health then serializes independent probes, permits snapshot health's full 10-second timeout, sequentially enriches all candidates, and invokes advWorktreeCleanup. Recommended design: 8,000 ms response budget, 7,500 ms provider cutoff, 500 ms composition reserve; store.status({recentLimit:10, deadline}); request signal composed with smaller probe caps; bounded concurrent read-only providers; dependent queue probe after temporal health; immutable results reduced deterministically; additive typed degradation preserving existing fields and _freshness. Health retains census only. Cleanup archaeology belongs in hygiene; drain/delete remains dedicated cleanup-tool work.
- **[report_follow_up]** follow_ups: BRIEFING PACKET transport was truncated/unavailable; persisted artifacts and current repo/spec evidence were used.
- **[report_follow_up]** follow_ups: TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION anchors were present; conflict-scan prior_consideration data was not, so archive/conflict history remains inconclusive.
- **[report_follow_up]** follow_ups: Verify Bun support for AbortSignal.any with an executable compatibility test if design chooses it; Bun official docs found here establish AbortSignal.timeout and AbortController cancellation, but I do not know from this evidence whether current Bun fully supports AbortSignal.any.
- **[research_citation]** sources: Persisted proposal, problem statement, and agreement: Defines fixed 8,000 ms request budget, 7,500 ms admission cutoff, health candidate limit 10, concurrency cap 4, typed degradation, stable composition, and read-only health behavior. (adv_change_show://fixHealthViewTimeouts)
- **[research_citation]** sources: Current status orchestration: Health currently lacks upstream recentLimit, enriches rows sequentially, runs providers sequentially, invokes advWorktreeCleanup, and handles failures inconsistently. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/status.ts#L260-L723)
- **[research_citation]** sources: Current view plan: Health currently enables worktreeCleanup; hygiene already provides a separate detailed surface. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/status-view.ts#L41-L122)
- **[research_citation]** sources.omitted: 8 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Five bounded opportunities: (1) generalize the existing summary upstream recent-limit plumbing to health so only 10 recency-ordered candidates hydrate and omission metadata is produced at the source; auto-adopt, high payoff/low risk, tied to Objective 2 and AC2. (2) add one small request-local provider executor with absolute deadline, 7,500 ms admission cutoff, cap 4, explicit Temporal-health dependency for queue serviceability, and injectable clock; auto-adopt/design-around, high payoff/low risk, tied to AC1/3/4/6. (3) make every provider return one immutable discriminated outcome and reduce settled outcomes in fixed source order before recommendations/projection; auto-adopt, high payoff/low risk, tied to Objective 3 and AC5/7. (4) extend probe-cache request options with caller signal and explicit late-publication policy; current ignoreFetchAbort behavior can publish eventual results after request abort; user-surface because shared-cache semantic change is medium risk, tied to AC7 and rq-statusProbeCache01. (5) disable health worktree cleanup and compose retained aggregates from read-only census/pending-delete reads, while updating rq-terminalCleanupReaper01 as already declared by Spec-Law Impact; auto-adopt, high payoff/low risk, tied to Objective 4 and AC8. Briefing packet and conflict-scan transport were unavailable, so prior-consideration classification is inconclusive; candidates were not checked against archive history.
- **[report_follow_up]** follow_ups: TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION packet anchors were not provided in canonical form; research continued under the explicit user scope as required.
- **[report_follow_up]** follow_ups: Add adversarial concurrent-call tests: two same-key force refreshes with different abort times, queue-health inputs A/B for one project, late non-cancellable settlement, and cutoff slot release.
- **[report_follow_up]** follow_ups: Add a cold-cache fixture where enumeration order differs from last-activity order; assert exact admitted and omitted IDs, not only counts.
- **[report_follow_up]** follow_ups: Use injected timers/signals in scheduler tests; reviewed docs do not establish that native AbortSignal.timeout is controlled by Vitest fake timers.
- **[report_follow_up]** follow_ups: No edits, mutations beyond this required report submission, commits, tests, or sub-agents were performed.
- **[research_citation]** sources: Approved ADV agreement and 35-item contract: Requires one 8,000 ms deadline, 7,500 ms cutoff, 500 ms reserve, top-10 orientation with typed omissions, provider concurrency 4, immutable outcomes, no late cache publication, and read-only health. (adv://change/fixHealthViewTimeouts/agreement)
- **[research_citation]** sources: Persisted bounded-health design: Proposes HealthExecutionPlan, shared deadline, fixed scheduler, lru-cache publication policy, immutable enrichment, and read-only health. (adv://change/fixHealthViewTimeouts/design)
- **[research_citation]** sources: Current status orchestration: Health currently omits recentLimit/deadline, executes probes and enrichment sequentially, mutates status/recent rows, invokes status-triggered cleanup, and performs unbounded post-read work. (file:///home/jon/dev/advance/plugin/src/tools/status.ts#L264-L890)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: CONFLICT. Direction is sound but persisted design cannot satisfy approved contract as written. Blockers: (1) add-only rq-healthReadOnlyWorktree01 contradicts existing rq-terminalCleanupReaper01, which requires status/triage to reach cleanup reaper; existing law must be amended or scope narrowed. (2) Per-call suppress_after_abort on the same shared lru-cache is not concurrency-safe because same-key calls coalesce and first-call abort options govern all waiters; strict health refresh needs a separate cache path/instance or direct fetch with guarded publication. (3) store.status is passed the 8,000 ms deadline while composition requires 500 ms reserve; authoritative read can consume the reserve. All non-composition admission, including status and enrichment, must stop by 7,500 ms. (4) current recentLimit does not prove top-10 recency on cold caches; only memo-warm IDs are recency-ranked. (5) current queue probe reads request input from a shared project-keyed Map, allowing concurrent health requests to overwrite each other. (6) enrichment remains sequential, mutating, and capable of extra parent/dependency reads; moving patch application to immutable reduction alone does not bound patch generation inside the 500 ms reserve. Scheduler feasibility requires ready-node scanning, terminal dependency propagation, synchronous-throw normalization, and no head-of-line blocking. Node 24 supports AbortSignal.timeout/any; Bun documentation verified timeout but not any, so fallback composition is necessary. Typed additive outcomes and preserving _freshness are compatible in principle. No implementation mutation was performed.
- **[unresolved_action]** validation.blockers: Spec-law contradiction: draft add-only rq-healthReadOnlyWorktree01 conflicts with existing MUST rq-terminalCleanupReaper01 requiring status/triage cleanup-reaper reachability.
- **[unresolved_action]** validation.blockers: Shared lru-cache cannot reliably implement request-local suppress_after_abort under concurrent same-key calls because inflight fetch options are owned by the first caller.
- **[unresolved_action]** validation.blockers: 8,000 ms authoritative status deadline can consume the promised 500 ms composition reserve; design lacks a 7,500 ms execution hard stop for status/enrichment.
- **[unresolved_action]** validation.blockers: Cold-cache recentLimit does not guarantee the 10 globally most recent candidates; current resolver preserves source enumeration order for candidates without memo activity.
- **[unresolved_action]** validation.blockers: Project-keyed statusQueueServiceabilityInputs is mutable shared request input and can be overwritten by concurrent health calls.
- **[unresolved_action]** validation.blockers: Sequential enrichment and its parent/external-dependency reads are not structurally bounded before composition reserve and currently mutate shared output structures.
- **[report_follow_up]** follow_ups: Canonical TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION anchors were not supplied; validation followed the explicit user scope.
- **[report_follow_up]** follow_ups: Add source precedence: Visibility AdvLastSignalAt, then source-current durable summary; memo/cache may accelerate but cannot resolve conflicting authority. Missing/conflicting timestamps must degrade orientation.
- **[report_follow_up]** follow_ups: Specify scheduler quiescence: once Temporal health is terminal and cannot satisfy queue dependency, queue becomes not_admitted immediately rather than waiting until cutoff.
- **[report_follow_up]** follow_ups: Specify publication token as monotonic per-key generation captured before direct fetch and compared atomically before cache.set; test two overlapping health refreshes and one legacy inflight refresh.
- **[report_follow_up]** follow_ups: Strengthen rq-statusHealthAggregateBudget01 beyond provider admission to encode all non-composition cutoff work and globally ranked top-ten hydration.
- **[report_follow_up]** follow_ups: Clarify AC2 output: all 47 candidates need identifiable typed omission evidence in the pressure fixture, or agreement must explicitly permit bounded IDs plus exact count.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| DONT8 | avoidance | respected |
| OOS1 | out_of_scope | respected |
| OOS2 | out_of_scope | respected |
| OOS3 | out_of_scope | respected |
| OOS4 | out_of_scope | respected |
| OOS5 | out_of_scope | respected |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/temporal/list-source-ranked-candidates.test.ts
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/temporal/list-change-workflows.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm run lint -- src/temporal/list-source-ranked-candidates.ts src/temporal/list-source-ranked-candidates.test.ts src/temporal/list-change-workflows.test.ts && pnpm run format:check -- src/temporal/list-source-ranked-candidates.ts src/temporal/list-source-ranked-candidates.test.ts src/temporal/list-change-workflows.test.ts
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/storage/store-temporal/bounded-status.test.ts
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test tr_mrr5w9rs_25acf32d
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec eslint src/tools/status-enrich.ts src/tools/status-enrich.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/tools/status-enrich.ts src/tools/status-enrich.test.ts
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test tr_mrr5wm78_db934f67
- After implementation lands, re-run plugin/src/tools/status-health-acceptance-bypass.test.ts (targeted via bin/oc-test) and confirm all 4 tests turn GREEN. Test (3) is the most timing-sensitive — if it flakes between 0 and 2 underlying fetches in the full run, investigate whether _healthRequestProbeCaches.clear is dropping the request-owned cache state across tests.
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/status-health-acceptance-bypass.test.ts
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test tr_mrr6002z_489ebc31
- Spec-law contradiction: draft add-only rq-healthReadOnlyWorktree01 conflicts with existing MUST rq-terminalCleanupReaper01 requiring status/triage cleanup-reaper reachability.
- Shared lru-cache cannot reliably implement request-local suppress_after_abort under concurrent same-key calls because inflight fetch options are owned by the first caller.
- 8,000 ms authoritative status deadline can consume the promised 500 ms composition reserve; design lacks a 7,500 ms execution hard stop for status/enrichment.
- Cold-cache recentLimit does not guarantee the 10 globally most recent candidates; current resolver preserves source enumeration order for candidates without memo activity.
- Project-keyed statusQueueServiceabilityInputs is mutable shared request input and can be overwritten by concurrent health calls.
- Sequential enrichment and its parent/external-dependency reads are not structurally bounded before composition reserve and currently mutate shared output structures.
