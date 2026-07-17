# Archive Briefing Digest

**Change ID:** strengthenAgentEvidence
**Title:** Strengthen agent evidence telemetry
**Status:** archived
**Generated:** 2026-07-15T21:55:19.386Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

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

Epic: systemizeAdvOrchestration · Finish structural evidence enforcement (order 1)

## Durable Facts

Showing 100 of 169 durable facts (69 omitted).

- **[archive_only_evidence]** decisions: Mirrored DesignConcernDisposition as a separate VerificationEvidenceDisposition store rather than reusing the design-concern store — AC1/AC2 require a distinct typed blocker (VERIFICATION_EVIDENCE_MISSING) with its own clear semantics; parallel mechanism keeps the two concern families independently auditable and avoids cross-contamination of disposition state
- **[archive_only_evidence]** decisions: Block fires at BOTH acceptance and release gates, and is NOT bypassed by compatibilityReason — Mirrors checkUnresolvedDesignConcerns exactly; prevents silent grandfathering of legacy changes that would otherwise skip the new readiness gate
- **[archive_only_evidence]** decisions: Only test/static_check/review/artifact_reference evidence policies block; source_citation/source_audit/rubric_review/stakeholder_acceptance/design_proof/not_applicable remain warn-first — SC4 requires proof-bearing policies to gate while keeping non-proof policies advisory, avoiding false blocks on citation/review-style evidence
- **[archive_only_evidence]** decisions: Per-task disposition uses concernKey 'verification' (single key clears all verification blockers for that task) — Verification warnings are per-task aggregates, not per-line concerns; a single stable key matches the latest-wins report model and keeps the disposition surface minimal
- **[archive_only_evidence]** decisions: Added `// prettier-ignore` on the workflows.ts persist line (first in codebase) — Field name verification_evidence_dispositions (34 chars) exceeds the 80-column wrap, but the structural seedState test asserts a single-line `key: state.key` via toContain; the ignore is the minimal way to satisfy both
- **[archive_only_evidence]** decisions: Did not modify subagent-report.ts — DONT3 keeps verification warnings submit-time advisory; the readiness gate (not the submit path) is the correct enforcement point
- **[archive_only_evidence]** verification: adv_run_test gate-readiness RED (runId tr_mrip8bnl_dea27037) (1) — RED confirmed: checkUnresolvedVerificationEvidence tests failed before implementation
- **[archive_only_evidence]** verification: adv_run_test gate-readiness + verification-evidence tool (runId tr_mriq0phb_ac5bbfa0) (0) — GREEN: 73 gate-readiness + 9 verification-evidence tool tests pass
- **[archive_only_evidence]** verification: adv_run_test change-state apply (runId tr_mriq10z3_7a26cd4c) (0) — GREEN: 3 applyVerificationEvidenceDispositionedToState tests pass
- **[archive_only_evidence]** verification: adv_run_test types/subagent-reports + contract + _recovery-writers + tool-registry.surface (runId tr_mriqbg4g_8265174d) (0) — GREEN: 104 tests pass across schema/recovery-writer/surface
- **[archive_only_evidence]** verification: adv_run_test workflows.signal-handlers + workflows.projection + change-state full (runId tr_mriqcjwz_7fd4c976) (0) — GREEN: signal handler seed/handler/persist + projection tests pass
- **[archive_only_evidence]** verification: adv_run_test gate + subagent-report + workflows.ops-follow-up (runId tr_mriqd4cy_0fd461af) (0) — GREEN: 75 tests pass; submit path unchanged/advisory
- **[archive_only_evidence]** verification: bin/oc-test full (0) — Full suite green: 334 test files, 4999 tests passed (includes updated surface/census locks)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, isolation, lockfile, lint, format all green
- **[archive_only_evidence]** verification: pnpm run build && pnpm run build:worker (0) — Plugin + Temporal worker bundle build success; workflow-bundle constraint holds
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test gate-readiness RED (runId tr_mrip8bnl_dea27037)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test gate-readiness + verification-evidence tool (runId tr_mriq0phb_ac5bbfa0)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test change-state apply (runId tr_mriq10z3_7a26cd4c)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test types/subagent-reports + contract + _recovery-writers + tool-registry.surface (runId tr_mriqbg4g_8265174d)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test workflows.signal-handlers + workflows.projection + change-state full (runId tr_mriqcjwz_7fd4c976)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test gate + subagent-report + workflows.ops-follow-up (runId tr_mriqd4cy_0fd461af)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build && pnpm run build:worker
- **[archive_only_evidence]** decisions: Used isWorkflowCompletedError(error) as the sole authorization gate for the non-terminal race fallback — AC3/SC2 require one deterministic recovery route or one typed failure route; the structural classifier is the authoritative gatekeeper already used by gate/contract recovery paths. It replaces the loose regex that both missed err.name-only matches and false-positived on benign substrings.
- **[archive_only_evidence]** decisions: Derived audit evidence as `${err.name}: ${err.message}` when name is not the default 'Error' — The previous code stored the raw message, which could be generic ('unreachable') and useless for audit. Including the error name ensures the recovery_audit evidence always cites the actual completed-workflow marker.
- **[archive_only_evidence]** decisions: Added two new spec scenarios (rq-subagentReports22.6/22.7) and bumped spec version to 1.7.2 — The existing spec at rq-subagentReports22.5 described the old unconditional behavior. Targeted law update keeps the spec aligned with the tightened authorization without broadening scope.
- **[archive_only_evidence]** decisions: Updated ops-follow-up-assets.test.ts version lock to 1.7.2 — Campsite fix: the test asserts exact spec version; bumping the spec without updating the lock breaks the full suite.
- **[archive_only_evidence]** verification: adv_run_test subagent-report non-terminal WorkflowNotFound tests (RED) (1) — RED confirmed: 3 tests failed before implementation (authorized name-match, unauthorized substring, no-re-signal)
- **[archive_only_evidence]** verification: adv_run_test subagent-report non-terminal WorkflowNotFound tests (GREEN) (0) — GREEN: all 7 new tests pass after replacing regex with isWorkflowCompletedError
- **[archive_only_evidence]** verification: adv_run_test subagent-report + _recovery-writers + recovery-classification (0) — GREEN: 67 tests pass across the three related suites
- **[archive_only_evidence]** verification: adv_run_test ops-follow-up-assets + spec tests (0) — GREEN: 36 tests pass after spec version bump and lock update
- **[archive_only_evidence]** verification: bin/oc-test full (0) — Full suite green: 334 test files, 5006 tests passed
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, isolation, lockfile, lint, format all green
- **[archive_only_evidence]** verification: pnpm run build && pnpm run build:worker (0) — Plugin + Temporal worker bundle build success; workflow-bundle constraint holds
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test subagent-report non-terminal WorkflowNotFound tests (RED)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test subagent-report non-terminal WorkflowNotFound tests (GREEN)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test subagent-report + _recovery-writers + recovery-classification
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: adv_run_test ops-follow-up-assets + spec tests
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build && pnpm run build:worker
- **[archive_only_evidence]** decisions: Omission marker rendered as a research_citation fact with source_label 'sources.omitted' — AC4 requires exactly one deterministic omission marker above the bound. Rendering it as a research_citation keeps the outcome taxonomy closed (no new outcome) while source_label distinguishes it from the actual citation facts. Content is fully deterministic from source count alone.
- **[archive_only_evidence]** decisions: Citation content includes label, summary, and locator in a single string — The existing briefing-fact shape carries content as a single string. Including locator preserves actionability (engineers can navigate to the cited source) without adding a new schema field, keeping the change additive.
- **[archive_only_evidence]** decisions: RESEARCH_CITATION_RENDER_LIMIT exported as a named constant — Makes the bound explicit and test-pinned, prevents hidden magic numbers, and lets tests reference the same source of truth. C5 requires bounded stable-order rendering; a named constant is the structural enforcement.
- **[archive_only_evidence]** decisions: Added targeted rq-subagentReports21.4/21.5 scenarios and bumped spec to 1.7.3 — Design spec-impact section called for targeted updates to subagent-reports briefing-packet laws. Added exactly two scenarios to pin AC4 (bounded citations) and AC5 (anchor tier boundary). Version bump follows the pattern from the prior task.
- **[archive_only_evidence]** decisions: AC5 tests pin disjoint strict and warn-first anchor sets via direct membership assertions — DONT1 forbids global hardening of warn-first anchors. The previous asset tests verified anchor presence in fenced blocks but not tier membership. The new tests fail loudly if a warn-first anchor is added to the strict set or vice versa.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/briefing-fact-classifier.test.ts src/types/briefing-packets.test.ts src/briefing-packets-command-assets.test.ts src/briefing-packets-spec-assets.test.ts src/utils/briefing-packet-renderer.test.ts src/ops-follow-up-assets.test.ts src/tools/change.test.ts src/archive/archive.test.ts (0) — GREEN: 221 tests pass across 8 files (18 net new vs prior baseline of 5006). AC4 citation tests (8) and AC5 anchor-tier tests (6) all green.
- **[archive_only_evidence]** verification: bin/oc-test full (0) — Full suite green: 334 test files, 5024 tests passed. No regressions.
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, isolation, lockfile, lint, format all green.
- **[archive_only_evidence]** verification: cd plugin && pnpm run build && pnpm run build:worker (0) — Plugin + Temporal worker bundle build success; workflow-bundle constraint holds.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/briefing-fact-classifier.test.ts src/types/briefing-packets.test.ts src/briefing-packets-command-assets.test.ts src/briefing-packets-spec-assets.test.ts src/utils/briefing-packet-renderer.test.ts src/ops-follow-up-assets.test.ts src/tools/change.test.ts src/archive/archive.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run build && pnpm run build:worker
- **[archive_only_evidence]** decisions: Added a new rq-verificationEvidence01 requirement in advance-workflow/spec.json as a sibling of rq-designQualityEvidence01, rather than amending rq-designQualityEvidence01 or rq-gateReadiness01 — The verification-evidence blocker is a parallel mechanism to design-concern (per the tk-668a71d0ecae implementation report) with its own blocker code, disposition tool, and policy split. A distinct requirement keeps the two families independently auditable and matches the design-concern law's structure exactly (body + 4 scenarios). rq-gateReadiness01 is the generic blocker-shape law; the new law is the specific enforcement surface.
- **[archive_only_evidence]** decisions: Bumped advance-workflow spec version 1.27.0 → 1.28.0 and updated both asset-test version locks (ops-follow-up-assets.test.ts, adv-skill-backed-commands-assets.test.ts) — Existing pattern from prior tasks in this change (subagent-reports 1.7.0 → 1.7.1 → 1.7.2 → 1.7.3). Hard-coded version locks in asset tests pin the exact version so silent spec drift fails loudly.
- **[archive_only_evidence]** decisions: Added // rq-verificationEvidence01 comment in plugin/src/temporal/gate-readiness.ts above checkUnresolvedVerificationEvidence — spec-citation-invariant test requires every requirement to be cited in at least one of plugin/src/**, .opencode/**, skills/**, docs/, ADV_INSTRUCTIONS.md, AGENTS.md, or CHANGELOG.md. The implementing module is the natural citation site; matches the pattern used by other spec-cited laws (e.g. rq-temporalTsDeterminismDocs01 in AGENTS.md).
- **[archive_only_evidence]** decisions: Did not modify delegation-defaults/spec.json despite the design's advisory spec-impact note — Audit of rq-delDefaults05 confirmed it already pins strict identity anchors (WORKING DIRECTORY, CHANGE, TASK, ATTEMPT, PHASE) and warn-first context anchors (TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, VERIFICATION) exactly as AC5/DONT1 require. No code change in delegation occurred across the three implementation tasks, so no law delta is needed. Adding one anyway would duplicate rq-subagentReports21.5.
- **[archive_only_evidence]** decisions: Did not add a standalone no-telemetry spec — No-telemetry is a per-change constraint, not a durable capability law. It is already encoded where enforcement surfaces were added: rq-subagentReports21.4 (no adoption/usage/delivery/click telemetry for citations) and the new rq-verificationEvidence01 body + scenario .4 (no counters/dashboards/status metrics/adoption analytics as part of enforcement). A standalone global no-telemetry law would overreach this change's scope.
- **[archive_only_evidence]** verification: cd plugin && pnpm run schemas:generate && pnpm run schemas:check (0) — schemas:generate produced no diff (change.schema.json already aligned by prior tasks); schemas:check green
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/ops-follow-up-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/briefing-packets-command-assets.test.ts src/subagent-reports-spec-assets.test.ts src/briefing-packets-spec-assets.test.ts src/temporal/gate-readiness.test.ts src/tools/verification-evidence.test.ts src/tools/subagent-report.test.ts src/utils/briefing-fact-classifier.test.ts src/types/briefing-packets.test.ts (0) — 278 tests pass across 10 files: spec/asset locks, anchor tier boundary, gate readiness, verification-evidence tool, subagent-report recovery, briefing-fact classifier
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, isolation, lockfile, lint, format all green
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts (0) — Citation invariant green after adding // rq-verificationEvidence01 to gate-readiness.ts
- **[archive_only_evidence]** verification: bin/oc-test full (0) — Full suite green: 334 test files, 5024 tests passed. No regressions.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:generate && pnpm run schemas:check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/ops-follow-up-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/briefing-packets-command-assets.test.ts src/subagent-reports-spec-assets.test.ts src/briefing-packets-spec-assets.test.ts src/temporal/gate-readiness.test.ts src/tools/verification-evidence.test.ts src/tools/subagent-report.test.ts src/utils/briefing-fact-classifier.test.ts src/types/briefing-packets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:generate && pnpm run schemas:check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/ops-follow-up-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/briefing-packets-command-assets.test.ts src/subagent-reports-spec-assets.test.ts src/briefing-packets-spec-assets.test.ts src/temporal/gate-readiness.test.ts src/tools/verification-evidence.test.ts src/tools/subagent-report.test.ts src/utils/briefing-fact-classifier.test.ts src/types/briefing-packets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[report_follow_up]** follow_ups: Terminal `loadChange` path may reject persisted reports carrying `recovery_audit`, causing fallback to weaker projections. Writer-side change is complete; promote a follow-up to normalize or type recovery_audit for persisted report reads.
- **[unresolved_action]** required_main_agent_actions: Mark `tk-7a29cb34b3ae` complete and proceed to bounded strict-validation task.
- **[archive_only_evidence]** decisions: Validate authoritative bundle manifest structurally instead of `ChangeSchema.parse`. — Existing strict report schemas reject recovery-audited report rows; structural validation preserves required bundle fields verbatim while failing closed on invalid manifests.
- **[archive_only_evidence]** decisions: Dedupe returns freshly loaded authoritative projection, not caller object reference. — Persistence idempotence is keyed on authoritative projection; production callers ignore return identity.
- **[archive_only_evidence]** decisions: Fail closed on unreadable, invalid, non-object, or ID-mismatched bundle manifests. — Fallback to stale input would reintroduce the archive-clobber race.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts (0) — GREEN: 23/23 pass. RED evidence: four new race/validation tests failed before fix; 19 existing tests passed before and after.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts src/tools/subagent-report.test.ts src/archive/archive.test.ts src/types/subagent-reports.test.ts (0) — 141/141 pass across recovery writer, report tool, archive, and report-schema suites.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/index.status-repair-readback.test.ts src/storage/json.test.ts src/tools/change.status-repair.test.ts (0) — 122/122 pass across terminal-projection read path and status-repair suites.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, tsc --noEmit, test-isolation, lockfile policy, eslint, prettier all green.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts src/tools/subagent-report.test.ts src/archive/archive.test.ts src/types/subagent-reports.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/index.status-repair-readback.test.ts src/storage/json.test.ts src/tools/change.status-repair.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[report_follow_up]** follow_ups: Terminal read path may need explicit recovery_audit tolerance in persisted report rows; out of scope for this writer-side fix.
- **[unresolved_action]** required_main_agent_actions: Complete task and continue strict-validation remediation.
- **[archive_only_evidence]** decisions: Mutate from a structurally validated authoritative bundle projection. — Prevents stale pre-archive input from clobbering terminal state; preserves recovery-audited report rows that strict report schema rejects.
- **[archive_only_evidence]** decisions: Fail closed on invalid or mismatched bundle manifest. — Fallback to stale input would recreate the reviewer-found race.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts (0) — Durable adv_run_test evidence `tr_mrmi61as_976fb098`: 23/23 passed; includes four active→archived race/manifest-validation regression tests.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts
- **[report_follow_up]** follow_ups: `adv_change_archive` is another loadValidationContext consumer; separate tool contract needs independent scope before applying same bound.
- **[archive_only_evidence]** decisions: Bound validate input load with shared `withTimeout` at 8,000 ms. — Sequential unbounded Temporal-backed reads exceed the 10s safeExecute ceiling; 8s uses existing safe-budget-below-ceiling convention without changing global timeout.
- **[archive_only_evidence]** decisions: Return typed `VALIDATION_TIME_BUDGET_EXHAUSTED` degraded result rather than a completed-looking partial verdict. — Callers get deterministic diagnostics and no authoritative validation fields when input loading expires.
- **[archive_only_evidence]** decisions: Keep archived change-list deadline/resolver design out of this change. — Used branch-local shared timeout utility only; no duplicate resolver implementation.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change-validate-hang.repro.test.ts (temp repro, deleted) (0) — RED: unbounded store change/context reads never settle after 60 fake seconds, reproducing observed unclassified timeout.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change.test.ts -t "adv_change_validate" (0) — GREEN: 8/8; includes degraded slow change/context reads and within-budget completion.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: adv_run_test gate-readiness RED (runId tr_mrip8bnl_dea27037)
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test gate-readiness + verification-evidence tool (runId tr_mriq0phb_ac5bbfa0)
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test change-state apply (runId tr_mriq10z3_7a26cd4c)
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test types/subagent-reports + contract + _recovery-writers + tool-registry.surface (runId tr_mriqbg4g_8265174d)
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test workflows.signal-handlers + workflows.projection + change-state full (runId tr_mriqcjwz_7fd4c976)
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test gate + subagent-report + workflows.ops-follow-up (runId tr_mriqd4cy_0fd461af)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build && pnpm run build:worker
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test subagent-report non-terminal WorkflowNotFound tests (RED)
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test subagent-report non-terminal WorkflowNotFound tests (GREEN)
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test subagent-report + _recovery-writers + recovery-classification
- verification_missing: No adv_run_test evidence found for reported command: adv_run_test ops-follow-up-assets + spec tests
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build && pnpm run build:worker
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/briefing-fact-classifier.test.ts src/types/briefing-packets.test.ts src/briefing-packets-command-assets.test.ts src/briefing-packets-spec-assets.test.ts src/utils/briefing-packet-renderer.test.ts src/ops-follow-up-assets.test.ts src/tools/change.test.ts src/archive/archive.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run build && pnpm run build:worker
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:generate && pnpm run schemas:check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/ops-follow-up-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/briefing-packets-command-assets.test.ts src/subagent-reports-spec-assets.test.ts src/briefing-packets-spec-assets.test.ts src/temporal/gate-readiness.test.ts src/tools/verification-evidence.test.ts src/tools/subagent-report.test.ts src/utils/briefing-fact-classifier.test.ts src/types/briefing-packets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:generate && pnpm run schemas:check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/ops-follow-up-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/briefing-packets-command-assets.test.ts src/subagent-reports-spec-assets.test.ts src/briefing-packets-spec-assets.test.ts src/temporal/gate-readiness.test.ts src/tools/verification-evidence.test.ts src/tools/subagent-report.test.ts src/utils/briefing-fact-classifier.test.ts src/types/briefing-packets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- Mark `tk-7a29cb34b3ae` complete and proceed to bounded strict-validation task.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts src/tools/subagent-report.test.ts src/archive/archive.test.ts src/types/subagent-reports.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/index.status-repair-readback.test.ts src/storage/json.test.ts src/tools/change.status-repair.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- Complete task and continue strict-validation remediation.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts
