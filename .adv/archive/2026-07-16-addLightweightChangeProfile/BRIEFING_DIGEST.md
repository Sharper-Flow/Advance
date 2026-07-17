# Archive Briefing Digest

**Change ID:** addLightweightChangeProfile
**Title:** Add lightweight change profile
**Status:** archived
**Generated:** 2026-07-16T22:02:39.701Z

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

Showing 89 of 89 durable facts.

- **[archive_only_evidence]** decisions: Implemented a pure evaluator with no host I/O — Design (DDC1) requires evaluator to accept normalized snapshots and perform zero host I/O; Git/worktree collection is deferred to the next task.
- **[archive_only_evidence]** decisions: Computed result downgraded only when previousResult was qualified and current result is not qualified — Preserves design AC7: revalidation failure after qualification records downgrade reason and continues standard workflow without resetting gates.
- **[archive_only_evidence]** decisions: Used stable evaluation key {requestId}:{phase}:{fingerprint} for append-only deduplication — Same request/phase/fingerprint retry reuses result; changed evidence appends once, preventing history growth.
- **[archive_only_evidence]** decisions: Made omission policy a single immutable object with exactly four boolean flags — Matches agreement/decision that eligible changes may omit only four bounded advisory categories.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile, lint, and format:check all pass
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/temporal/messages.test.ts src/types/lightweight-change-profile.test.ts src/types/lightweight-change-profile.state.test.ts src/temporal/workflows.lightweight-profile.test.ts (0) — 27 targeted tests pass (evaluator, reducer, signal contract, workflow signal handlers)
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- -t "continues as new with every declared seedState field" src/temporal/workflows.signal-handlers.test.ts (0) — Continue-as-new seed field invariant passes with lightweight_profile included
- **[archive_only_evidence]** verification: pnpm run build (0) — Plugin and Temporal worker bundles build successfully
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/temporal/messages.test.ts src/types/lightweight-change-profile.test.ts src/types/lightweight-change-profile.state.test.ts src/temporal/workflows.lightweight-profile.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- -t "continues as new with every declared seedState field" src/temporal/workflows.signal-handlers.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[archive_only_evidence]** decisions: Used real git repositories in temp directories for the evidence-collector tests instead of mocking git-binary. — Parsing git porcelain/diff output is critical to the collector; real repos exercise the complete baseline-to-current range, rename scoring, and untracked detection more faithfully than a mock.
- **[archive_only_evidence]** decisions: Counted task types 'code' and 'verification' as implementation tasks. — The TaskTypeSchema does not define 'implementation'; 'code' is the canonical implementation type, and 'verification' also produces implementation evidence.
- **[archive_only_evidence]** decisions: Let git-detected spec-law path changes override stored spec deltas. — The live worktree is the authoritative source for what changed; if a .adv/specs/ path appears in the diff range the change is ineligible regardless of stored delta state.
- **[archive_only_evidence]** decisions: Passed the public-root API-compatibility policy into the collector as an optional input rather than embedding it in project.json. — Policy shape is new; keeping it caller-supplied lets the project config/policy evolve without changing the collector module.
- **[archive_only_evidence]** decisions: Resolved import specifiers by checking file existence across source extensions and directory-index candidates. — First-candidate resolution produced false graph failures (e.g., reading 'src/public' instead of 'src/public.ts'); existence checks make the reachability graph accurate.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/lightweight-change-profile-evidence.test.ts (0) — 14 tests pass (multi-commit, rename, delete, untracked, stale fingerprint, dependency/spec-law detection, policy_absent, public_impact, proven_private, graph_failure, durable task/delta/scope facts, collector+evaluator integration)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/types/lightweight-change-profile.test.ts src/types/lightweight-change-profile.state.test.ts (0) — Existing lightweight profile pure-evaluator and state-reducer tests still pass (22 tests)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test isolation, lockfile policy, lint, and format:check all pass
- **[archive_only_evidence]** verification: pnpm run build (0) — Plugin and Temporal worker bundles build successfully; the worker bundle does not pull in the new host-side collector
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[archive_only_evidence]** decisions: Added `rangeStatus` enum to `changedPaths` in the snapshot schema instead of a boolean or top-level flag. — A typed enum carries the failure surface (rev-parse, diff, status) in the evidence, keeps the evaluator pure, and gives a clear fail-closed reason. A boolean would hide which collection step failed.
- **[archive_only_evidence]** decisions: Forced `changed_file_count` to `failed` when `rangeStatus !== "complete"`. — The contract requires missing/unavailable evidence to be ineligible, not unknown. The criterion is the direct consumer of path-range completeness; failing it ensures result != qualified.
- **[archive_only_evidence]** decisions: Included `rangeStatus` in the content fingerprint. — Prevents a transition from incomplete to complete evidence from reusing the same fingerprint if the path set happens to be identical.
- **[archive_only_evidence]** decisions: Updated all existing snapshot literals in tests to include `rangeStatus: "complete"`. — The schema now requires the field; this preserves existing behavior and makes the type checker happy.
- **[archive_only_evidence]** verification: cd plugin && pnpm vitest run src/utils/lightweight-change-profile-evidence.test.ts (0) — 16 tests passed, including new invalid-baseline and non-git-workdir fail-closed tests.
- **[archive_only_evidence]** verification: cd plugin && pnpm vitest run src/types/lightweight-change-profile.test.ts (0) — 18 tests passed, including new direct incomplete-range evaluator test.
- **[archive_only_evidence]** verification: cd plugin && pnpm vitest run src/tools/lightweight-profile.test.ts (0) — 10 tests passed; updated mock snapshots remain compatible.
- **[archive_only_evidence]** verification: cd plugin && pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run schemas:check && pnpm exec tsx scripts/check-test-isolation.ts (0) — All static checks pass: typecheck, lint, format, schemas, and test isolation.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm vitest run src/utils/lightweight-change-profile-evidence.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm vitest run src/types/lightweight-change-profile.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm vitest run src/tools/lightweight-profile.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run schemas:check && pnpm exec tsx scripts/check-test-isolation.ts
- **[archive_only_evidence]** decisions: Registered adv_lightweight_profile_evaluate as orchestrator class in tool-role-policy.ts — Tool is workflow-driven by gate completion and signals Temporal workflow; no destructive/operator-only surface
- **[archive_only_evidence]** decisions: Placed command markdown routing guidance under existing delegation and boundary sections — Keeps the lightweight profile policy co-located with the routing decisions it affects, avoiding a scattered cross-file policy
- **[archive_only_evidence]** decisions: Ran pnpm run format to satisfy Prettier after check failure — CI requires format:check green; formatting changes are style-only and do not alter behavior
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript passes
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tool-role-policy.test.ts src/tool-ownership-assets.test.ts src/cli-surface-matrix.test.ts src/cli-bridge-contract.test.ts src/tools/lightweight-profile.test.ts src/tools/gate.test.ts src/utils/workflow-directive.test.ts src/tool-registry.inventory.test.ts src/tool-name-assets.test.ts src/latent-tool-removal.test.ts src/advance-epics-assets.test.ts (0) — 308 tests pass across 11 files
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.lightweight-profile.test.ts src/types/lightweight-change-profile.test.ts src/utils/lightweight-change-profile-evidence.test.ts src/temporal/change-state.test.ts (0) — 95 prior lightweight profile tests still pass
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, isolation, lockfile, lint, and format all green
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tool-role-policy.test.ts src/tool-ownership-assets.test.ts src/cli-surface-matrix.test.ts src/cli-bridge-contract.test.ts src/tools/lightweight-profile.test.ts src/tools/gate.test.ts src/utils/workflow-directive.test.ts src/tool-registry.inventory.test.ts src/tool-name-assets.test.ts src/latent-tool-removal.test.ts src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.lightweight-profile.test.ts src/types/lightweight-change-profile.test.ts src/utils/lightweight-change-profile-evidence.test.ts src/temporal/change-state.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: Loaded public-root policy from store.config/project.json passthrough field and validated with PublicRootPolicySchema in gate.ts rather than changing ProjectConfigSchema — Avoids a public Zod schema change and circular import risk while still centralizing and validating the policy for both boundary evaluations
- **[archive_only_evidence]** decisions: Recorded boundary failures by sending lightweightProfileEvaluatedSignal directly from gate.ts — The existing evaluateLightweightProfileAndSignal returns errors instead of throwing for most failures; emitting a synthetic signal durably updates workflow state so prior qualified cannot remain directive. Preserves no-reset semantics: prior qualified becomes downgraded, otherwise ineligible.
- **[archive_only_evidence]** decisions: Exported CRITERION_ORDER from types/lightweight-change-profile.ts — Needed to construct a schema-valid criteria array (6 items) for synthetic failure evaluations without hard-coding criterion IDs in gate.ts.
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run src/tools/gate.test.ts --reporter=verbose (0) — 42 tests passed (including 4 new RED→GREEN tests for policy propagation and failure-downgrade semantics)
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run src/tools/lightweight-profile.test.ts src/types/lightweight-change-profile.test.ts --reporter=verbose (0) — 28 tests passed (no regressions in profile evaluator/type tests)
- **[archive_only_evidence]** verification: cd plugin && pnpm run schemas:check && pnpm run typecheck && pnpm exec tsx scripts/check-test-isolation.ts && pnpm exec eslint src/tools/gate.ts src/tools/gate.test.ts src/types/lightweight-change-profile.ts && pnpm exec prettier --check src/tools/gate.ts src/tools/gate.test.ts src/types/lightweight-change-profile.ts (0) — Schemas, typecheck, test isolation, lint, and format checks all passed for changed files
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:check && pnpm run typecheck && pnpm exec tsx scripts/check-test-isolation.ts && pnpm exec eslint src/tools/gate.ts src/tools/gate.test.ts src/types/lightweight-change-profile.ts && pnpm exec prettier --check src/tools/gate.ts src/tools/gate.test.ts src/types/lightweight-change-profile.ts
- **[report_follow_up]** follow_ups: Active-change inventory was degraded by a Temporal deadline; prior-consideration/conflict absence is unknown and must not be inferred.
- **[report_follow_up]** follow_ups: TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION anchors were present and followed.
- **[report_follow_up]** follow_ups: No files were edited.
- **[research_citation]** sources: Current proposal and problem statement: Defines structural eligibility, fail-closed revalidation before execution and acceptance, preserved seven gates, and visible/auditable downgrade reasons. (adv_change_show:addLightweightChangeProfile)
- **[research_citation]** sources: Fast-track command contract: Current /adv-task always performs researcher validation, source scan, conflict scan, and task generation while crossing proposal through planning. (/home/jon/dev/advance/.opencode/command/adv-task.md:46-109)
- **[research_citation]** sources: Central gate-readiness composition: Structural blockers are composed centrally into a typed ready/blockers result for acceptance and release. (/home/jon/dev/advance/plugin/src/temporal/gate-readiness.ts:901-957)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Direction is sound but discovery should lock four leverage points and one unresolved evidence question. Auto-adopt: (1) implement one pure typed profile evaluator and call it from classification plus execution/acceptance readiness instead of duplicating command prose; (2) use a change-baseline-to-head repository diff as authoritative file-count evidence, because current checkpoint evidence is HEAD~1-only; (3) persist a discriminated eligibility result containing per-criterion reason, evidence/provenance, evaluation time, and downgrade history. User-surface: define an explicit allowlist of advisory workflow work that lightweight mode may omit; current /adv-task mandates researcher and scan work, while central gate-readiness blockers must remain untouched. Inconclusive: no bounded local evidence identified a repository-wide structural authority for both new-dependency and breaking-API detection, so these criteria need explicit evidence contracts before implementation.
- **[report_follow_up]** follow_ups: TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION anchors were present and followed.
- **[report_follow_up]** follow_ups: Local semantic search timed out twice, including required non-hybrid retry; symbol/text search and direct source reads supplied local evidence instead.
- **[report_follow_up]** follow_ups: Episode recall returned no relevant authoritative project decision and was not used as evidence.
- **[research_citation]** sources: ADV gate readiness implementation: Central readiness returns structured blockers; adjacent criterion evaluation is explicitly advisory and uses pass/fail/na semantics. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/gate-readiness.ts#L901-L975)
- **[research_citation]** sources: ADV workflow state contracts: Continue-as-new/bootstrap seed state uses an explicit Pick list, so new durable profile state must be added deliberately. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/contracts.ts#L214-L277)
- **[research_citation]** sources: ADV change-state seed mapping: Initial state and persisted-change seed mapping are explicit, creating another required profile-state propagation point. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/change-state.ts#L121-L180)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Scout candidates (5): [auto-adopt] Keep profile qualification separate from advisory evaluateGateCriteria semantics; unknown/error must produce ineligible/downgraded, never advisory na. [auto-adopt] Split evidence collection from evaluation: an outer collector obtains Git/worktree/API evidence, while one workflow-safe pure evaluator consumes the normalized snapshot. [auto-adopt] Persist one append-only evaluation history whose downgraded entries carry reason and prior revision; derive downgrade history and active result instead of maintaining two competing histories. [auto-adopt] Treat profile state propagation as one atomic contract change across ChangeWorkflowState, seedState Pick, createChangeWorkflowState, changeSeedStateFromChange, signals/handlers, and continue-as-new tests. [inconclusive] No existing typed API-compatibility authority was found; keep this criterion fail-closed until a specific authority and freshness rule are named. Additional cross-cutting guard: the omission allowlist must suppress only default optional specialist delegation, not explicit delegation_hint or risk-forced inline routing.
- **[report_follow_up]** follow_ups: All required identity and scope anchors were present.
- **[report_follow_up]** follow_ups: No new user-value commitment was introduced.
- **[report_follow_up]** follow_ups: Episode was not recalled again; prior single advisory recall supplied no authoritative evidence.
- **[research_citation]** sources: Approved agreement: Requires complete-range evidence, fail-closed API evidence, exactly six criteria, central typed routing, seven retained gates, and unchanged safety/review/release controls. (adv://change/addLightweightChangeProfile/agreement)
- **[research_citation]** sources: Revised design: Now includes porcelain-derived untracked paths, a content-sensitive full evidence fingerprint, deny-by-default public-root reachability, stable evaluation idempotency, and focused regression tests. (adv://change/addLightweightChangeProfile/design)
- **[research_citation]** sources: Git status documentation: Porcelain status provides stable scripting output and separately represents untracked paths, supporting explicit complete-worktree enumeration. (https://git-scm.com/docs/git-status)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The two prior blockers are resolved without weakening the agreement. Explicit porcelain-derived untracked paths close the complete-range enumeration gap, while the fingerprint binds untracked content and every material mutable evidence dimension so same-HEAD worktree changes become stale. The API criterion now has a conservative structural authority: named public roots plus deny-by-default import/export reachability, with policy absence, unsupported/failed graph analysis, reachable paths, and unknown outcomes all ineligible. This proves only absence of modeled public-interface reachability and deliberately leaves behavioral correctness to retained specs, targeted tests, and review; that separation is compatible with the agreement because uncertainty falls back to standard workflow. Stable request+phase+fingerprint keys resolve retry-driven history growth while preserving distinct initial, execution, and acceptance records. Core shape remains simple: one evaluator, one snapshot, one central policy, no competing state machine.
- **[unresolved_action]** required_main_agent_actions: Route the three blockers to an ADV engineer within this change; retain acceptance gate pending.
- **[unresolved_action]** required_main_agent_actions: Require focused tests for automatic execution/acceptance qualification, failed boundary evaluation with prior qualification, and Git collection failure before rerunning scoped review.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A fail-closed evaluator is insufficient when upstream collectors collapse unavailable evidence into ordinary empty values or boundary callers discard evaluation failures; freshness/completeness must be represented in typed state consumed by routing.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/types/lightweight-change-profile.test.ts src/types/lightweight-change-profile.state.test.ts src/temporal/workflows.lightweight-profile.test.ts src/utils/lightweight-change-profile-evidence.test.ts src/tools/lightweight-profile.test.ts src/tools/gate.test.ts src/utils/workflow-directive.test.ts results=pass — 110/110 tests passed in 7 files. Source review found the three fail-closed routing/evidence gaps above; existing tests do not exercise them.
- **[unresolved_action]** required_main_agent_actions: Acceptance review may proceed; do not revisit unrelated full-suite-only failures under this scope.
- **[wisdom_candidate]** wisdom_candidates: [pattern] For boundary-dependent advisory routing, derive authorization from both latest evaluation and durable gate phase; a stale qualified evaluation alone must never authorize omissions after an adjacent gate has completed.
- **[archive_only_evidence]** changes_made: plugin/src/utils/workflow-directive.ts: Fail-closed directive derivation now suppresses a prior qualified lightweight result whenever durable planning/execution gate state lacks its required execution/acceptance boundary revalidation.
- **[archive_only_evidence]** changes_made: plugin/src/utils/workflow-directive.test.ts: Added regression coverage for missing execution-boundary and acceptance-boundary revalidations after their adjacent durable gate transitions.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/utils/workflow-directive.test.ts src/tools/gate.test.ts src/tools/lightweight-profile.test.ts src/utils/lightweight-change-profile-evidence.test.ts, pnpm --dir plugin exec prettier --check src/utils/workflow-directive.ts src/utils/workflow-directive.test.ts, git diff --check results=pass — Focused suites: 4 files, 94 passed. Prettier reported all matched files formatted. git diff --check produced no errors. Reviewed Git range failures as fail-closed via rangeStatus, verified boundary policy resolution is supplied at planning and acceptance boundaries, and added durable directive-level suppression for collector/service/signal failure paths.
- **[unresolved_action]** required_main_agent_actions: Use this READY hardening report with focused 96-test and plugin-check evidence for release readiness.
- **[unresolved_action]** required_main_agent_actions: Leave unrelated full-suite-only Temporal/filesystem/status failures untouched per OUT_OF_SCOPE.
- **[wisdom_candidate]** wisdom_candidates: [pattern] When a lightweight boundary revalidation signal cannot be durably appended, derive-on-read routing must fail closed from durable gate progress so a stale qualified evaluation cannot activate advisory omissions.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/utils/workflow-directive.test.ts src/tools/gate.test.ts src/tools/lightweight-profile.test.ts src/types/lightweight-change-profile.test.ts, pnpm --dir plugin run check results=pass — Focused profile/routing suite: 4 files, 96 tests passed. Plugin check passed schemas:check, typecheck, isolation/lockfile checks, ESLint, and Prettier. An initial invocation from plugin/ used bin/oc-test and failed because the wrapper lives at repository root; rerun from locked workdir passed. Reviewed release hardening diff: completed planning/execution gates require their respective boundary phase; missing durable revalidation suppresses profile routing as ineligible.

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
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
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

- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/temporal/messages.test.ts src/types/lightweight-change-profile.test.ts src/types/lightweight-change-profile.state.test.ts src/temporal/workflows.lightweight-profile.test.ts
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- -t "continues as new with every declared seedState field" src/temporal/workflows.signal-handlers.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm vitest run src/utils/lightweight-change-profile-evidence.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm vitest run src/types/lightweight-change-profile.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm vitest run src/tools/lightweight-profile.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run schemas:check && pnpm exec tsx scripts/check-test-isolation.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tool-role-policy.test.ts src/tool-ownership-assets.test.ts src/cli-surface-matrix.test.ts src/cli-bridge-contract.test.ts src/tools/lightweight-profile.test.ts src/tools/gate.test.ts src/utils/workflow-directive.test.ts src/tool-registry.inventory.test.ts src/tool-name-assets.test.ts src/latent-tool-removal.test.ts src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/workflows.lightweight-profile.test.ts src/types/lightweight-change-profile.test.ts src/utils/lightweight-change-profile-evidence.test.ts src/temporal/change-state.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:check && pnpm run typecheck && pnpm exec tsx scripts/check-test-isolation.ts && pnpm exec eslint src/tools/gate.ts src/tools/gate.test.ts src/types/lightweight-change-profile.ts && pnpm exec prettier --check src/tools/gate.ts src/tools/gate.test.ts src/types/lightweight-change-profile.ts
- Route the three blockers to an ADV engineer within this change; retain acceptance gate pending.
- Require focused tests for automatic execution/acceptance qualification, failed boundary evaluation with prior qualification, and Git collection failure before rerunning scoped review.
- Acceptance review may proceed; do not revisit unrelated full-suite-only failures under this scope.
- Use this READY hardening report with focused 96-test and plugin-check evidence for release readiness.
- Leave unrelated full-suite-only Temporal/filesystem/status failures untouched per OUT_OF_SCOPE.
