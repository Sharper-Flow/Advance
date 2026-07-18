# Archive Briefing Digest

**Change ID:** refineTestEvidencePolicy
**Title:** Refine test evidence policy
**Status:** archived
**Generated:** 2026-07-18T22:18:55.764Z

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

Showing 100 of 110 durable facts (10 omitted).

- **[archive_only_evidence]** decisions: Stored evidence plan on the Task itself and recomputed it on reclassification rather than nesting it inside the TDD reclassification audit record — The audit record must remain an immutable intent-change trail; the plan is the normalized current state and should live on the task for direct consumer access
- **[archive_only_evidence]** decisions: Defaulted missing evidence_policy by task type (code/verification -> test; docs/research -> source_citation; ops -> artifact_reference; approval -> stakeholder_acceptance) — Ensures every newly planned task has exactly one policy and proof target without requiring callers to supply it
- **[archive_only_evidence]** decisions: Used type-only behavior-critical classification (code/verification) instead of title heuristic for the not_applicable prohibition — Keeps structural fields authoritative per the design; trivial data/config work should be typed as ops/docs, not rely on title heuristic
- **[archive_only_evidence]** decisions: Updated report-followup pre-planning task creation to also normalize evidence plans — All planned tasks, including pre-planning owner tasks, must carry a normalized evidence plan
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run src/validator/task-classifier.test.ts src/tools/task.test.ts src/tools/report-followup.test.ts (0) — 113 focused tests pass
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke check passes (schemas, typecheck, manifests, lint, format, isolation, 68 tests)
- **[archive_only_evidence]** verification: cd plugin && pnpm run schemas:check (0) — Generated JSON schemas are up to date
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm exec vitest run src/validator/task-classifier.test.ts src/tools/task.test.ts src/tools/report-followup.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:check
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run src/validator/task-classifier.test.ts src/tools/task.test.ts src/tools/report-followup.test.ts (0) — 113 focused tests passed; durable run tr_mrpf65i0_5f187734.
- **[archive_only_evidence]** verification: cd plugin && pnpm run schemas:check (0) — Schema check passed; durable run tr_mrpf6ciw_d7a9de32.
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke passed; durable run tr_mrpf7oxd_91fddbb3.
- **[archive_only_evidence]** decisions: Used resolveTaskEvidence as the sole compatibility authority across prep, completion, and readiness — Aligns with the design excerpt that the resolver must be the sole authority and avoids duplicating policy logic in consumers.
- **[archive_only_evidence]** decisions: Centralized proof-bearing vs warn-first policy partition in types/evidence-policy.ts — Makes the partition explicit and reusable, replacing the ad-hoc VERIFICATION_BLOCKING_POLICIES array in gate-readiness.
- **[archive_only_evidence]** decisions: Preserved the resolved evidence plan on completed tasks as typed completion proof — Satisfies the typed proof requirement while keeping it additive to existing verification prose and run IDs.
- **[archive_only_evidence]** decisions: Kept the existing non-code evidence-policy check independent from the new resolver-based check — Preserves the existing ordering and enforcement for non-code deliverables while adding behavior-critical validation.
- **[archive_only_evidence]** decisions: Updated the existing gate-readiness test for no-explicit-policy code tasks to expect blocking — Legacy code tasks without evidence_policy now resolve to the proof-bearing test policy, so unresolved verification warnings correctly block.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/validator/prep-readiness.test.ts src/validator/task-classifier.test.ts src/temporal/change-state.test.ts src/temporal/gate-readiness.test.ts (0) — Green phase: 224 tests pass (4 files), including new evidence-plan integration tests
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifests, test isolation, lockfile, lint, and format:check all pass
- **[archive_only_evidence]** verification: pnpm run build (0) — plugin bundle and Temporal worker bundle build successfully
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke checks plus 68 tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts src/temporal/workflows.queries.test.ts src/tools/task.test.ts src/tools/gate.test.ts src/tools/checkpoint.test.ts (0) — Focused workflow/readiness/task tests pass (127 tests)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts src/temporal/workflows.queries.test.ts src/tools/task.test.ts src/tools/gate.test.ts src/tools/checkpoint.test.ts
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts src/temporal/workflows.queries.test.ts src/tools/task.test.ts src/tools/gate.test.ts src/tools/checkpoint.test.ts (0) — Workflow/task targeted tests passed; durable run tr_mrpg385l_f89c95eb.
- **[archive_only_evidence]** verification: pnpm run check (0) — Check passed; durable run tr_mrpg4qrw_238f7c2a.
- **[archive_only_evidence]** verification: pnpm run build (0) — Build passed; durable run tr_mrpg5fcv_e4c4bacd.
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke passed; durable run tr_mrpg6yg2_d54d616e.
- **[report_follow_up]** follow_ups: Fix the pre-existing spec-citation invariant failure for rq-crossProjectTrunkFirewall01 (advance-meta: Target-Relative Cross-Project Trunk Write Firewall). It is uncited in current source and unrelated to the test-evidence policy scope.
- **[unresolved_action]** required_main_agent_actions: Create or route a small follow-up change to add an external citation for advance-meta rq-crossProjectTrunkFirewall01 so the spec-citation-invariant test passes.
- **[archive_only_evidence]** decisions: Added four new spec requirements rather than only amending existing ones — A new rq-* requirement is the canonical spec-law mechanism; amending existing heuristic requirements alone would be ambiguous and harder to enforce via citation.
- **[archive_only_evidence]** decisions: Cited every new requirement with an HTML comment in the relevant command file — The spec-citation invariant requires each active requirement to be referenced outside docs/specs and its own spec.json; comments keep the citation explicit without changing runtime behavior.
- **[archive_only_evidence]** decisions: Left the pre-existing rq-crossProjectTrunkFirewall01 uncited failure as a follow-up — It belongs to advance-meta/cross-project trunk firewall, not the test-evidence policy scope; fixing it here would be scope expansion.
- **[archive_only_evidence]** verification: pnpm run check (0) — Passed: schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/adv-prep-assets.test.ts src/adv-review-assets.test.ts src/tools/test-contract-assets.test.ts src/adv-instructions-assets.test.ts src/workflow-noise-reduction-assets.test.ts src/approval-consequence-context-assets.test.ts src/adv-autonomy-quality-assets.test.ts src/adv-engineer-assets.test.ts src/adv-designer-assets.test.ts src/archive-branch-cleanup-assets.test.ts src/archive-release-finalization-assets.test.ts src/store-cleanup-consolidation-assets.test.ts src/handoff-footer-drift.test.ts src/adv-skill-backed-commands-assets.test.ts (0) — Passed: 268 asset tests across files touched by or adjacent to the spec/command updates.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/__tests__/spec-citation-invariant.test.ts (1) — Fails pre-existing: only rq-crossProjectTrunkFirewall01 (advance-meta) is uncited; all new requirements are cited. Not caused by this task.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/adv-prep-assets.test.ts src/adv-review-assets.test.ts src/tools/test-contract-assets.test.ts src/adv-instructions-assets.test.ts src/workflow-noise-reduction-assets.test.ts src/approval-consequence-context-assets.test.ts src/adv-autonomy-quality-assets.test.ts src/adv-engineer-assets.test.ts src/adv-designer-assets.test.ts src/archive-branch-cleanup-assets.test.ts src/archive-release-finalization-assets.test.ts src/store-cleanup-consolidation-assets.test.ts src/handoff-footer-drift.test.ts src/adv-skill-backed-commands-assets.test.ts
- **[archive_only_evidence]** verification: pnpm run check (0) — Check passed.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/adv-prep-assets.test.ts src/adv-review-assets.test.ts src/tools/test-contract-assets.test.ts src/adv-instructions-assets.test.ts src/workflow-noise-reduction-assets.test.ts src/approval-consequence-context-assets.test.ts src/adv-autonomy-quality-assets.test.ts src/adv-engineer-assets.test.ts src/adv-designer-assets.test.ts src/archive-branch-cleanup-assets.test.ts src/archive-release-finalization-assets.test.ts src/store-cleanup-consolidation-assets.test.ts src/handoff-footer-drift.test.ts src/adv-skill-backed-commands-assets.test.ts (0) — 260 command/spec asset tests passed; durable run tr_mrphtngx_b7fc93f7.
- **[archive_only_evidence]** decisions: Reset fake timers to real before reconfiguring in bounded-read-deadline tests — The three deadline tests rely on setImmediate draining timer-free stages at t=0; when beforeEach already installed fake timers, a direct useFakeTimers({toFake: [...]}) could leave setImmediate faked, causing the query/disk call synchronization loops to stall and counts to stay at zero/two.
- **[archive_only_evidence]** decisions: Register writeChangeProjection in withArtifactSignalWorker — Tests that supply projectionChangesDir (e.g., acceptance-no-disk) cause the workflow to schedule writeChangeProjection; without the activity registered the worker would fail/timeout on full-suite runs.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts src/temporal/workflows.signal-handlers.test.ts src/tools/task.test.ts src/utils/tool-arg-preflight.test.ts (0) — All 178 targeted tests pass across the four files
- **[archive_only_evidence]** verification: bin/oc-test full (0) — Full plugin suite passes: 396 files, 6124 tests + 1 expected fail
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest check, isolation check, lockfile check, lint, and format:check all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts src/temporal/workflows.signal-handlers.test.ts src/tools/task.test.ts src/utils/tool-arg-preflight.test.ts
- **[unresolved_action]** consumer_warnings: verification_mismatch: Reported exit_code 0 differs from durable adv_run_test evidence exitCode 1 for command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[report_follow_up]** follow_ups: Packet omitted explicit TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchor sections. Research followed the supplied prose scope; identity anchors were copied exactly.
- **[report_follow_up]** follow_ups: Define policy categories during agreement without numerical test-count, coverage, assertion-count, or CI-duration thresholds; external sources do not establish a universal cutoff.
- **[report_follow_up]** follow_ups: Validate mapping with concrete Advance, PokeEdge, and PokeEdge Web audit examples before enforcement, while keeping consumer-repository remediation out of scope.
- **[report_follow_up]** follow_ups: I don't know whether existing static analysis already catches fixed sleeps or leaked timers across all supported patterns; repository implementation discovery is needed before proposing any new checker or dependency.
- **[research_citation]** sources: ADV tdd-contract capability (local authoritative spec): Current ADV contract already uses typed tdd_intent values, defaults logic-bearing code to inline TDD, permits separate verification and not-applicable work, requires machine-readable non-code evidence, and keeps assertion/mock/behavior heuristics advisory. (file:///home/jon/dev/advance/.adv/specs/tdd-contract/spec.json)
- **[research_citation]** sources: NIST Secure Software Development Framework 1.1: NIST frames practices as risk-based rather than a universal checklist and includes complementary verification practices such as code review/analysis, executable testing, and software integrity verification. (https://csrc.nist.gov/pubs/sp/800/218/final)
- **[research_citation]** sources: Agile Alliance TDD glossary: Defines TDD as a programming workflow with tightly interwoven coding, testing, and design; supports red/green for programming work, not a claim that every non-code deliverable needs a failing automated test. (https://agilealliance.org/glossary/tdd/)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing ADV structure is directionally strong: typed tdd_intent already separates inline TDD, cross-cutting verification, and not-applicable work; non-code evidence is machine-readable; quality proxies remain advisory (file:///home/jon/dev/advance/.adv/specs/tdd-contract/spec.json). External references support refining this into a minimal typed risk/evidence policy rather than universal red/green or heuristic authority. NIST calls for risk-based applicability and multiple verification practices (https://csrc.nist.gov/pubs/sp/800/218/final); OWASP SAMM combines automation, risk-prioritized manual review, and architecture assessment (https://owaspsamm.org/model/verification/security-testing/ and https://owaspsamm.org/model/verification/architecture-assessment/). Universal inline red/green remains appropriate for logic-bearing behavior changes because TDD is a programming workflow (https://agilealliance.org/glossary/tdd/), but extending it to docs, research, generated artifacts, or review-only work would manufacture evidence without a defensible proof target. Heuristic-only gating is unsuitable because proxy measures such as coverage provide contextual feedback, not correctness proof (https://testing.googleblog.com/2020/08/code-coverage-best-practices.html). Recommended deterministic hygiene is behavior-focused assertions, hermetic/isolation expectations, controlled clocks/timers, explicit cleanup, and no fixed sleeps; supporting sources are https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html, https://testing.googleblog.com/2010/12/test-sizes.html, and https://github.com/vitest-dev/vitest/blob/v4.1.6/docs/guide/mocking/dates.md. No new dependency is justified initially: Vitest already supplies timer/date control and isolation, while semantic test quality cannot be safely reduced to static metrics. Maintenance should stay localized to one authoritative schema/classifier, deterministic mapping tables, validator tests, backward-compatible defaults, and review rendering; this costs schema/fixture/documentation upkeep but avoids divergent prompt-only policy.
- **[report_follow_up]** follow_ups: Prior-consideration/conflict-scan data was not included in packet, so candidates cannot be labeled new, archived, rejected, or conflict with confidence.
- **[report_follow_up]** follow_ups: Agreement/acceptance criteria were unavailable at discovery gate; contract ties use approved proposal constraints and scope rather than AC identifiers.
- **[report_follow_up]** follow_ups: Semantic lgrep timed out twice; exact lgrep text search and targeted file reads supplied local evidence instead.
- **[report_follow_up]** follow_ups: Episode recall returned no authoritative project decision relevant to this change; recalled content was not used as evidence.
- **[research_citation]** sources: Approved proposal: Requires proportionate, typed, validator-backed evidence without weakening logic-bearing regression protection; heuristics remain advisory. (adv://change/refineTestEvidencePolicy/proposal)
- **[research_citation]** sources: Task evidence schema: Task type and evidence_policy are typed, but tdd_intent remains arbitrary string metadata and evidence_policy is optional. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/types/tasks.ts#L171-L235)
- **[research_citation]** sources: Evidence policy vocabulary: Existing shared enum provides reusable evidence-policy vocabulary; no new dependency needed. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/types/evidence-policy.ts#L3-L23)
- **[research_citation]** sources.omitted: 8 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Five bounded candidates, sorted by payoff/risk: (1) AUTO-ADOPT: define one validator-owned compatibility matrix over existing task type, evidence_policy, and TDD intent, with explicit override rationale; high payoff/low discovery risk. (2) AUTO-ADOPT: layer deterministic hygiene—gate only exact repo-owned invariants and add broad real-wait/shared-state patterns to existing advisory scanner; high payoff/low risk, no dependency. (3) USER-SURFACE: either make existing lastEvidenceRunId authoritative for compatible proof-bearing policies or retire it while introducing policy-discriminated evidence refs; high payoff/medium compatibility risk. (4) USER-SURFACE: add typed completion evidence carrying policy, observable proof target, result/ref, while retaining verification prose for compatibility; high payoff/medium schema and migration risk. (5) INCONCLUSIVE: risk should choose a default evidence route but must not itself authorize completion; exact risk dimensions and thresholds require agreement/user-value synthesis because proposal deliberately defers them. Existing shape is close but splits policy across typed fields, arbitrary metadata, prose completion, and conditional run enforcement.
- **[report_follow_up]** follow_ups: Packet omitted explicit TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION sections; research followed the user-provided scoped brief without inferring additional boundaries.
- **[report_follow_up]** follow_ups: Prior-consideration/conflict-scan data was not supplied; candidate prior consideration remains unknown and should be checked by the orchestrator before adoption.
- **[research_citation]** sources: Existing shared task evidence vocabulary and task schema: Task already carries shared ContractEvidencePolicy and compatibility-preserving passthrough fields, providing extension seams for plan and completion evidence. (/home/jon/dev/advance/plugin/src/types/evidence-policy.ts:3-19; /home/jon/dev/advance/plugin/src/types/tasks.ts:171-263)
- **[research_citation]** sources: Existing classifier and compliance seam: One shared classifier already owns metadata-first intent resolution, legacy title fallback, and completion compliance; it can be evolved into the requested normalized compatibility resolver. (/home/jon/dev/advance/plugin/src/validator/task-classifier.ts:56-164)
- **[research_citation]** sources: Existing durable completion and run references: Completion payload already preserves verification prose and red/green/evidence run IDs, while workflow state resolves test-run records and persists completion fields. (/home/jon/dev/advance/plugin/src/types/signals.ts:160-175; /home/jon/dev/advance/plugin/src/temporal/change-state.ts:965-1021)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Draft follows existing architecture: extend TaskSchema and shared policy vocabulary, normalize compatibility through one pure resolver, and reuse durable test-run/report evidence. Highest-leverage additions are a structurally versioned cutover marker, proof-reference variants over existing stores, and one table-driven resolver matrix consumed by readiness/completion/review/contract tests. No parallel policy state machine or consumer-repository expansion is needed.
- **[report_follow_up]** follow_ups: BRIEFING PACKET projection was explicitly unavailable; supplied identity and scope anchors were complete, so validation proceeded without reconstructing packet context.
- **[report_follow_up]** follow_ups: Public example inspection followed Exa discovery, but searchcode returned clone_queue_full; official Temporal exercise documentation supplied example evidence instead.
- **[report_follow_up]** follow_ups: I don't know whether patched() is needed until final workflow command-producing diff exists; run committed-history replay against that diff before deciding.
- **[research_citation]** sources: Approved agreement and design: Agreement requires proportionate proof, bounded rationale plus review for non-test routes, structured review for uncertain logic, local bad-test cleanup, structural authority, and compatibility. Design proposes one normalized plan/resolver and additive completion-proof references. (adv://change/refineTestEvidencePolicy)
- **[research_citation]** sources: TDD Contract spec: Current law makes inline TDD default, requires metadata-first shared classification with title-heuristic legacy fallback, permits typed non-code evidence policies, makes quality signals advisory, and grandfathered red/green ordering conditional on structural run references. (https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/tdd-contract/spec.json)
- **[research_citation]** sources: Prep Readiness spec: Current law requires explicit tdd_intent, machine-readable evidence policy for non-code tasks, structural planning blockers, and advisory title heuristics. (https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/prep-readiness/spec.json)
- **[research_citation]** sources.omitted: 11 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Direction is correct and simpler than a parallel policy system: reuse the existing enum, normalize decisions once, and add typed proof references without deleting legacy prose. Deviation is MINOR, but design needs four explicit invariants before planning: (1) exact applicability/risk, provenance, resolver-result, review-conclusion, and proof-reference schema variants; (2) an exhaustive compatibility table that forbids evidence_policy=not_applicable for behavior-critical code and requires rationale plus a recorded review conclusion for every logic-bearing non-test route; (3) clear separation between deterministic automated hygiene blockers and evidence-backed reviewer blockers so approved local cleanup remains mandatory; and (4) a workflow-safe resolver module/import graph plus replay test decision. Existing laws that mandate title-based legacy classification must be amended rather than silently reinterpreted as advisory. Sources: https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/tdd-contract/spec.json ; https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/prep-readiness/spec.json ; https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/advance-workflow/spec.json ; https://docs.temporal.io/develop/typescript/workflows/versioning
- **[unresolved_action]** required_main_agent_actions: Resolve the unrelated red full-suite failure before release.
- **[archive_only_evidence]** findings: [issue] Pre-existing unrelated spec-citation invariant failure for advance-meta/rq-crossProjectTrunkFirewall01 keeps the full suite red.
- **[archive_only_evidence]** findings: [info] Touched evidence-policy suites pass and plugin/worker build succeeds.
- **[unresolved_action]** suggested_handoff: User decision required: separate follow-up versus explicit campsite scope expansion. — in_scope: Classify the unrelated full-suite failure and route it safely.
- **[unresolved_action]** recommended_next_action: ask_user
- **[unresolved_action]** required_main_agent_actions: Use this READY review report as acceptance evidence; no scope or gate mutation was performed by reviewer.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A normalized evidence-plan validator is insufficient if the task-creation API cannot supply mandatory non-test proof fields; validate the assembled plan before emitting its task-added signal.
- **[archive_only_evidence]** changes_made: plugin/src/tools/task.ts: Exposed bounded evidence rationale and linked review conclusion on adv_task_add, materialized them in new plans, and reject invalid behavior-critical non-test routes before signaling.
- **[archive_only_evidence]** changes_made: plugin/src/tools/task.test.ts: Added success and rejection coverage for creating behavior-critical review-route tasks.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/task.test.ts, pnpm --dir plugin run typecheck, pnpm --dir plugin exec prettier --check src/tools/task.ts src/tools/task.test.ts, git diff --check results=pass — Targeted Vitest: 1 file / 43 tests passed. TypeScript check, formatting check, and whitespace diff check passed. Existing bin/oc-test full pass was supplied in context.
- **[wisdom_candidate]** wisdom_candidates: [pattern] When adding an optional top-level schema field that rejects blank strict-mode placeholder values, add both its FIELD_POLICIES omission rule and an AUDITED_PREFLIGHT_POLICY_REQUIREMENTS entry; the coverage guard enforces both.
- **[archive_only_evidence]** changes_made: plugin/src/utils/tool-arg-preflight.ts: Added `adv_task_add.review_conclusion` blank-to-omitted policy, retaining route-specific evidence validation as authority.
- **[archive_only_evidence]** changes_made: plugin/src/utils/tool-arg-preflight.test.ts: Added audited reviewed-omission coverage for optional `review_conclusion` strict-mode blank fills.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- plugin/src/utils/tool-arg-preflight.test.ts (incorrect root-relative filter; exited 1 with no matching test file), bin/oc-test targeted -- src/utils/tool-arg-preflight.test.ts, pnpm --dir plugin exec prettier --check src/utils/tool-arg-preflight.ts src/utils/tool-arg-preflight.test.ts, git diff --check results=pass — Correct focused command passed 1 file / 97 tests. Prettier reported all matched files conform; git diff --check passed. Initial filter used a plugin-prefixed path while oc-test executes in plugin/, producing no test-file match; corrected command passed.
- **[unresolved_action]** required_main_agent_actions: Route to adv-engineer for in-scope semantic remediation.
- **[archive_only_evidence]** findings: [issue] Full suite completed with 3 failures; prior 5-minute adv_run_test timeout was tool-cap behavior, not a suite hang.
- **[archive_only_evidence]** findings: [issue] Epic membership signal-handler test times out because writeChangeProjection is not registered on the no-disk worker.

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
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm exec vitest run src/validator/task-classifier.test.ts src/tools/task.test.ts src/tools/report-followup.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.test.ts src/temporal/workflows.queries.test.ts src/tools/task.test.ts src/tools/gate.test.ts src/tools/checkpoint.test.ts
- Create or route a small follow-up change to add an external citation for advance-meta rq-crossProjectTrunkFirewall01 so the spec-citation-invariant test passes.
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/adv-prep-assets.test.ts src/adv-review-assets.test.ts src/tools/test-contract-assets.test.ts src/adv-instructions-assets.test.ts src/workflow-noise-reduction-assets.test.ts src/approval-consequence-context-assets.test.ts src/adv-autonomy-quality-assets.test.ts src/adv-engineer-assets.test.ts src/adv-designer-assets.test.ts src/archive-branch-cleanup-assets.test.ts src/archive-release-finalization-assets.test.ts src/store-cleanup-consolidation-assets.test.ts src/handoff-footer-drift.test.ts src/adv-skill-backed-commands-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts src/temporal/workflows.signal-handlers.test.ts src/tools/task.test.ts src/utils/tool-arg-preflight.test.ts
- verification_mismatch: Reported exit_code 0 differs from durable adv_run_test evidence exitCode 1 for command: bin/oc-test full
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- Resolve the unrelated red full-suite failure before release.
- User decision required: separate follow-up versus explicit campsite scope expansion. — in_scope: Classify the unrelated full-suite failure and route it safely.
- ask_user
- Use this READY review report as acceptance evidence; no scope or gate mutation was performed by reviewer.
- Route to adv-engineer for in-scope semantic remediation.
