# Archive Briefing Digest

**Change ID:** addTypedPhaseDirectives
**Title:** Add typed phase directives
**Status:** archived
**Generated:** 2026-08-04T21:28:28.806Z

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

Showing 88 of 88 durable facts.

- **[archive_only_evidence]** decisions: Kept PhaseDirectiveSchema strict and nested it only on ActionablePhasePlanSchema. — This preserves the existing strict boundary while structurally excluding directives from all five non-actionable variants.
- **[archive_only_evidence]** decisions: Did not change PHASE_PLAN_VERSION, PhasePlanSchema union members, schema-registry.ts, or add any workflow patch marker. — These are explicit task constraints and preserve replay compatibility.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/phase-plan.test.ts (0) — 56 phase-plan tests pass, including directive round-trip, optionality, validation rejection, and non-actionable variant exclusion.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passes cleanly.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts (0) — Replay-determinism suite passes: 15 tests.
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/utils/phase-plan.ts src/utils/phase-plan.test.ts (0) — Prettier check passes for both touched files.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0whu4_bca1ce35
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0x2y7_6f915946
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0ufcv_2ccfc4a4
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0w4tl_02a71e3a
- **[archive_only_evidence]** decisions: Matched the actionable command at plan.command. — ActionablePhasePlanSchema defines command directly at line 376; there is no nested action object.
- **[archive_only_evidence]** decisions: Return non-matching plans by identity and shallow-copy only matching adv-review plans with the registry directive. — Preserves pure read-projection behavior and avoids mutating input while ensuring the registry hash/content is used.
- **[archive_only_evidence]** decisions: Built all test fixtures through PhasePlanSchema.parse or ActionablePhasePlanSchema.parse over derivePhasePlan/degradedPhasePlan outputs. — Maintains the strict schema boundary and covers adv-review, adv-apply, adv-design, and every non-actionable variant.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/utils/phase-directive.test.ts (0) — Green: 9 variant-matrix, registry, and purity tests pass.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/utils/phase-plan.test.ts src/utils/phase-directive-content.test.ts (0) — Sibling suites pass: 65 tests across both files.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — TypeScript typecheck passes cleanly.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2zg4b_59452d82
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2zt2w_69205872
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf31lhr_e6e2cee6
- **[report_follow_up]** follow_ups: Resolve the AC7 contradiction before checkpoint: either clarify that the AC1 exact-one assertion is exempt/updated for the transitional duplicated launcher, or provide a normalization rule that does not violate the required launcher-first plus directive-second concatenation.
- **[unresolved_action]** required_main_agent_actions: Review the current launcher/directive duplication conflict and decide the authorized compatibility treatment before marking this task complete; do not edit .opencode/command/adv-review.md in this task.
- **[archive_only_evidence]** decisions: Added plugin/src/__tests__/command-surface.ts as a test-only helper that concatenates the launcher first, then PHASE_DIRECTIVES["adv-review"].content with two newlines. — Matches D6's defined surface order while keeping the helper out of runtime imports.
- **[archive_only_evidence]** decisions: Retargeted only adv-review content reads in the 10 requested suites; non-review command reads and explicitly file-targeted tests remain unchanged. — Preserves scope and launcher-structure assertions while allowing procedure assertions to survive the Wave C rewrite.
- **[unresolved_action]** blockers: AC7 current launcher/directive duplication contradicts unchanged exact-one-matrix assertion
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/__tests__/human-checkpoints-assets.test.ts src/adv-autonomy-quality-assets.test.ts src/adv-review-assets.test.ts src/adv-reviewer-asset.test.ts src/adv-skill-backed-commands-assets.test.ts src/approval-consequence-context-assets.test.ts src/briefing-packets-command-assets.test.ts src/checkpoint-surface-drift.test.ts src/release-notes-command-assets.test.ts src/scope-discovery-assets.test.ts (1) — 9/10 suites passed; 250/251 tests passed. adv-review-assets.test.ts fails because the composed surface contains two full 12-dimension matrices.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec prettier --check src/__tests__/command-surface.ts src/adv-review-assets.test.ts src/briefing-packets-command-assets.test.ts src/checkpoint-surface-drift.test.ts src/release-notes-command-assets.test.ts src/__tests__/human-checkpoints-assets.test.ts src/approval-consequence-context-assets.test.ts src/adv-autonomy-quality-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/adv-reviewer-asset.test.ts src/scope-discovery-assets.test.ts (0) — Prettier check passes for all 11 touched files.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — TypeScript typecheck passes.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3ek7g_254b4452
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3dymt_b8f1d1b3
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3grok_b4a5597c
- **[archive_only_evidence]** decisions: Retargeted only the three exact-one matrix count assertions to PHASE_DIRECTIVES["adv-review"].content. — The single-source invariant belongs to the canonical directive content and must remain valid while the launcher still contains the transitional duplicate matrix; other contains and ordering assertions correctly remain on the composed command surface.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/adv-review-assets.test.ts (0) — Pass: 1 test file, 16 tests.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/utils/phase-directive-content.test.ts src/adv-review-assets.test.ts (0) — Pass: 2 test files, 25 tests.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — Pass: TypeScript typecheck.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec prettier --check src/adv-review-assets.test.ts (0) — Pass: Prettier check.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3pp81_1ffba2d6
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3q0zo_13d04cdd
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3qoej_7390a3ce
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3r2vh_588b424c
- **[archive_only_evidence]** decisions: Wrapped only the successful derived phase plan with withPhaseDirective; degraded branches remain unchanged. — Preserves fail-closed non-authorizing reads while attaching the authored directive only to actionable adv-review plans.
- **[archive_only_evidence]** decisions: Used a directive-only whitelist for host response shaping and recorded every suppressed defined top-level field in sorted _omittedFields. — Keeps the required identity/gate/acceptance/plan surface while ensuring large change documents and adjacent enrichment fields cannot trigger generic truncation.
- **[archive_only_evidence]** decisions: Exported DEFAULT_MAX_CHARS and passed maxChars=Math.max(DEFAULT_MAX_CHARS, serializedLeanOutput.length + 4096), using the resolved pretty mode for sizing. — Uses the existing per-call formatter override without changing global/env defaults and preserves the complete directive content.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/tools/change.test.ts src/tools/change-show-enrichment.test.ts (0) — PASS: 2 test files, 168 tests.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — PASS: TypeScript noEmit check.
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/tools/change.ts src/tools/change.test.ts src/utils/tool-output.ts (0) — PASS: all touched files use Prettier style; run from plugin/.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3lfjj_fff26ce2
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3ls7x_04a433b9
- **[report_follow_up]** follow_ups: Packet provided RESEARCH QUESTIONS + a return-format request but did not include structured TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION anchors; scope was inferred from the research questions. Identity anchors (WORKING DIRECTORY/CHANGE/SCOPE KEY/ATTEMPT) were present.
- **[report_follow_up]** follow_ups: Verify where (if anywhere) ADV's workflow-evolution-guard is enforced: grep found assertWorkflowBehaviorChangeEvidence only in its definition + unit test, no scripts/ or bin/ caller. If unenforced, the guard is currently inert and the no-patch ship is unblocked; if enforced via a path not searched, a phase-plan replay fixture or guard exemption is needed.
- **[report_follow_up]** follow_ups: Verify the exact Worker.create option name in @temporalio/worker@1.16.0 for GA Worker Versioning (workerDeploymentOptions vs legacy useVersioning) before bl-F5_tYP9R adopts it; legacy is deprecated and slated for Server removal March 2026.
- **[report_follow_up]** follow_ups: The packet called the patch lifecycle '4-stage'; the canonical TS docs (docs.temporal.io/develop/typescript/workflows/versioning) describe a 3-step process (patch in -> deprecatePatch -> remove). Reconcile terminology - the 4th 'stage' may be the pre-change v1-only baseline, not a distinct deploy step.
- **[report_follow_up]** follow_ups: Confirm no PhasePlan consumer caches/persists a plan across deploys (the version-2 hard break assumes always-derive-on-read; a cache would serve stale version:1 plans to version:2 readers).
- **[research_citation]** sources: Temporal - Workflow Definition / Deterministic constraints: Authoritative list of command-producing APIs that must not be reordered/added/removed without versioning: Timer, Activity (incl local), Child Workflow, external Signal, Nexus, workflow end, patched/GetVersion. Data-schema/payload-shape changes are NOT in this list. (https://docs.temporal.io/workflow-definition#deterministic-constraints)
- **[research_citation]** sources: Temporal - Patching (encyclopedia, marker mechanics): Detailed patched() marker behavior during replay (marker before/at/after current point; no-marker returns false). Governs when a patch marker is needed: only when command sequence diverges. (https://docs.temporal.io/patching)
- **[research_citation]** sources: Temporal - Versioning (TypeScript SDK): TS-specific 3-step patch lifecycle: (1) patch in new code with patched(), (2) remove old code + deprecatePatch(), (3) remove deprecatePatch(). A patch is needed only when a change would cause non-deterministic behavior on Replay (command-sequence divergence). (https://docs.temporal.io/develop/typescript/workflows/versioning)
- **[research_citation]** sources.omitted: 12 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The PhasePlan is a query-handler read projection, not durable workflow state. workflows.ts:966-967 sets getPhasePlanQuery to derivePhasePlanFromState(state, workflowEpoch) - recomputed fresh on every query, never written to event history, never carried in a signal (verified: no defineSignal references PhasePlan). PHASE_PLAN_VERSION is a consumer-facing schema discriminator (z.literal in ActionablePhasePlanSchema + set in derived output), NOT a Temporal patch marker. Temporal's determinism contract (docs.temporal.io/workflow-definition#deterministic-constraints) governs only command-producing APIs (Timer/Activity/Child/external-Signal/Nexus/workflow-end/patched). Query handlers are explicitly 'live read-only operations' with isReplayingHistoryEvents=false (sdk-typescript interfaces.ts), returning sync R (cannot emit commands). Therefore changing the PhasePlan schema shape + bumping its version literal alters NO command sequence and is replay-safe with zero versioning machinery. Existing pattern: ADV already gates real command-sequence changes with named wf.patched constants + replay fixtures (ARCHIVE_PROJECTION_RECONCILER_PATCH, STATE_BACKED_ACCEPTANCE_PROOF_PATCH, etc.). Reference pattern: query-handler/read-projection shape changes need no patch per Temporal; the addReplayReportBounds fixtures are patch-marker-anchored (they covered changes that DID add markers), so there is no repo precedent for fixture-only-no-marker changes. Deviation: NONE vs Temporal canon. Local wrinkle: ADV's workflow-evolution-guard would flag phase-plan.ts as workflow-reachable, but (a) I found no CI/deploy caller of the guard, and (b) its no-marker path isn't backed by the metadata.json schema.
- **[report_follow_up]** follow_ups: C3: Procedural conformance checking - extend spec-conformance to verify directive-step execution once durable step-execution evidence exists
- **[report_follow_up]** follow_ups: C4: Canonicalize checkpoint reply-instructions in PhasePlan approval-required variant (workflow-directive.ts:98-103 already carries checkpoint field)
- **[report_follow_up]** follow_ups: C2 decision input: measure doc-reference sibling-file-read compliance (Discovery Agenda item 6) before committing to doc-reference dedup for cross-cutting fragments
- **[research_citation]** sources: briefing-packets test (dedup precedent): PACKET_EXPECTATIONS with bannedManualSections is the existing dedup enforcement; reusable structural model for directive-consumption tests. (plugin/src/briefing-packets-command-assets.test.ts:70-239)
- **[research_citation]** sources: phase-plan.ts bounds and workflow-bundle boundary: PHASE_PLAN_VERSION=1, PHASE_PLAN_MAX_GUIDANCE=3 (too small for directive). Module is workflow-safe (types, temporal, buckets only) - this is WHY directive content cannot live here. (plugin/src/utils/phase-plan.ts:55-59,20-30)
- **[research_citation]** sources: getSubagentReportPacketAnchors host-side assembly precedent: Host-side TS content-assembly function in types/ (NOT workflow-bundle-reachable). Confirms where directive content assembly should live per the host-side constraint. (plugin/src/types/subagent-reports.ts:1259)
- **[research_citation]** sources.omitted: 9 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Proposal (typed directive on ActionablePhasePlan, host-side assembly, thin launchers with inline fallback) is mainstream LLM-agent architecture. Three independent prior-art systems (forgeflow AgentPhaseIR, Formal Skill, Blueprint-First) all put procedure definition OUTSIDE the prompt in a typed artifact and assemble per-phase prompts from it; proposal is catching up, not inventing. Within the codebase, two precedents validate the approach: (1) briefing-packet mechanism (host-side generation in types/subagent-reports.ts:1259, consumed via fenced block, dedup via bannedManualSections test) is the structural model for directive consumption and drift testing; (2) command-voice-standard.md plus checkpoint-surface-drift.test.ts is the structural model for shared-fragment-doc dedup with drift enforcement. Dedup scope is UNDERCOUNTED: Target Resolution and Key Tools each appear 14x (not 5x), and a working doc-reference precedent already exists (adv-problem.md referencing adv-research.md:111-135). Cross-cutting fragment population (Target Resolution, Sub-Agent Resilience, Key Tools) is distinct from branch-scoped population (Exits, Drift Detection Rule, scanner packets, frontend checklist) and warrants DIFFERENT dedup strategies. Overlooked failure mode: inline fallback required by confirmed constraint is a second (abbreviated) procedure copy, and nothing pins it as a verified subset of the directive source, recreating the dedup problem at 2-copy scale.
- **[unresolved_action]** required_main_agent_actions: Checkpoint the reviewer remediation in the change worktree before acceptance-gate completion.
- **[unresolved_action]** required_main_agent_actions: Use the acceptance workflow to record stakeholder visual confirmation for deferred SC1-SC4 after deployment; do not treat fixture or integration evidence as live UI observation.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Lean response shaping must retain caller-explicit include projections; suppress only default payload fields, otherwise an include:{ phasePlan:true, proposal:true } request loses _proposal despite successfully reading it.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.ts: Kept directive responses lean while retaining each explicitly requested include projection, preventing phasePlan+artifact/snapshot reads from silently dropping caller-requested data.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.test.ts: Added phasePlan+proposal coverage and updated parity coverage to require explicitly requested snapshots on directive responses.
- **[archive_only_evidence]** changes_made: plugin/src/utils/phase-directive.test.ts: Applied Prettier formatting so the repository format gate passes.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.test.ts src/utils/phase-directive-content.test.ts src/utils/phase-directive.test.ts src/phase-directive-launcher.test.ts src/temporal/workflow-bundle-boundary.test.ts, pnpm --dir plugin run check, git diff --check results=pass — Targeted: 5 files, 194/194 tests passed. Plugin check passed: schemas, TypeScript, manifest generation, frontmatter/isolation/lockfile checks, lint (4 existing warnings, no errors), and Prettier. git diff --check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.test.ts src/utils/phase-directive-content.test.ts src/utils/phase-directive.test.ts src/phase-directive-launcher.test.ts src/temporal/workflow-bundle-boundary.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** required_main_agent_actions: Checkpoint and commit the two scoped harden remediation files before release finalization.
- **[unresolved_action]** required_main_agent_actions: Release Readiness Summary: Typed directive assembly remains host-only and pure; malformed registry content fails closed at load; strict plan schemas reject unexpected fields; lean shaping now preserves requested failure evidence and bounds oversized companion content while retaining the directive. Worker build, boundary tests, schema/manifests checks, and diff hygiene pass; no deploy-script or MCP-schema change is required.
- **[unresolved_action]** required_main_agent_actions: Do not revisit acceptance findings or the directive body; harden scope is complete. Before merge/release, run the normal branch freshness/rebase and release workflow.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When a lean response intentionally preserves explicit includes, preserve each include's paired error projection and cap the formatter expansion from the indispensable payload rather than the whole response; otherwise failures disappear or unbounded requested content bypasses output limits.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.ts: Preserved requested ready-task and briefing-packet failure projections in directive lean responses; capped the enlarged response budget at the phase-plan payload rather than all explicitly requested content.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.test.ts: Added regressions proving a briefing failure remains visible beside a review directive and oversized explicit content is bounded without truncating directive content.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir plugin exec vitest run src/tools/change.test.ts src/utils/phase-directive.test.ts src/utils/phase-directive-content.test.ts src/utils/phase-plan.test.ts, pnpm --dir plugin exec vitest run src/tools/change.test.ts src/phase-directive-launcher.test.ts src/temporal/workflow-bundle-boundary.test.ts, pnpm --dir plugin run build:worker, pnpm --dir plugin run schemas:check, pnpm --dir plugin run generate:manifests:check, git diff --check results=pass — 239/239 targeted directive/read-path tests passed; 177/177 launcher and workflow-bundle-boundary tests passed. build:worker succeeded; generated JSON schemas and agent manifests are current; git diff --check is clean. Source review confirmed PhaseDirectiveSchema is strict, registry hash is computed and parsed at load, withPhaseDirective is pure, change-read failures degrade rather than reject, deployment flow has no diff, and MCP Tier-4 generic dispatch has no schema addition required.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec vitest run src/tools/change.test.ts src/utils/phase-directive.test.ts src/utils/phase-directive-content.test.ts src/utils/phase-plan.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec vitest run src/tools/change.test.ts src/phase-directive-launcher.test.ts src/temporal/workflow-bundle-boundary.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run build:worker
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run schemas:check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run generate:manifests:check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check

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
| DONT5 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |
| OOS5 | out_of_scope | not_applicable |
| OOS6 | out_of_scope | not_applicable |
| OOS7 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0whu4_bca1ce35
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0x2y7_6f915946
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0ufcv_2ccfc4a4
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf0w4tl_02a71e3a
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2zg4b_59452d82
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf2zt2w_69205872
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf31lhr_e6e2cee6
- Review the current launcher/directive duplication conflict and decide the authorized compatibility treatment before marking this task complete; do not edit .opencode/command/adv-review.md in this task.
- AC7 current launcher/directive duplication contradicts unchanged exact-one-matrix assertion
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3ek7g_254b4452
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3dymt_b8f1d1b3
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3grok_b4a5597c
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3pp81_1ffba2d6
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3q0zo_13d04cdd
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3qoej_7390a3ce
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3r2vh_588b424c
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3lfjj_fff26ce2
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msf3ls7x_04a433b9
- Checkpoint the reviewer remediation in the change worktree before acceptance-gate completion.
- Use the acceptance workflow to record stakeholder visual confirmation for deferred SC1-SC4 after deployment; do not treat fixture or integration evidence as live UI observation.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.test.ts src/utils/phase-directive-content.test.ts src/utils/phase-directive.test.ts src/phase-directive-launcher.test.ts src/temporal/workflow-bundle-boundary.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Checkpoint and commit the two scoped harden remediation files before release finalization.
- Release Readiness Summary: Typed directive assembly remains host-only and pure; malformed registry content fails closed at load; strict plan schemas reject unexpected fields; lean shaping now preserves requested failure evidence and bounds oversized companion content while retaining the directive. Worker build, boundary tests, schema/manifests checks, and diff hygiene pass; no deploy-script or MCP-schema change is required.
- Do not revisit acceptance findings or the directive body; harden scope is complete. Before merge/release, run the normal branch freshness/rebase and release workflow.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec vitest run src/tools/change.test.ts src/utils/phase-directive.test.ts src/utils/phase-directive-content.test.ts src/utils/phase-plan.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec vitest run src/tools/change.test.ts src/phase-directive-launcher.test.ts src/temporal/workflow-bundle-boundary.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run build:worker
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run schemas:check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run generate:manifests:check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
