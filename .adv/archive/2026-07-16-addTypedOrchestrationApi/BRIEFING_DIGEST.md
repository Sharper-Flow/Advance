# Archive Briefing Digest

**Change ID:** addTypedOrchestrationApi
**Title:** Add typed orchestration API
**Status:** archived
**Generated:** 2026-07-16T18:40:30.170Z

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

Epic: systemizeAdvOrchestration · Add typed orchestration API (order 2)

## Durable Facts

Showing 100 of 207 durable facts (107 omitted).

- **[report_follow_up]** follow_ups: tk-24c49be3f36b: expose plan via typed query + opt-in adv_change_show projection; derivePhasePlanFromState mirrors the getDirective call pattern at temporal/workflows.ts:727
- **[report_follow_up]** follow_ups: Later migration task: replace deriveDirectiveSafe undefined-degradation in tool consumers (tools/gate.ts, tools/change.ts, tools/change/recovery.ts, tools/status-enrich.ts) with typed degraded plans per design strategy step 4
- **[report_follow_up]** follow_ups: tk-181fde6bc5d5: table-driven parity suite + structural manifest-to-GATE_COMMAND mapping test (AC7); GATE_COMMAND now lives in phase-plan.ts (re-exported from workflow-directive.ts)
- **[archive_only_evidence]** decisions: Made PhasePlan the canonical derivation and refactored WorkflowDirective into a pure adapter (directiveFromPlan) over it, moving the normalized kernel (DirectiveContext, directiveCtxFromState, GATE_COMMAND) into the new phase-plan module — Design decision 4 (canonical plan + lossless legacy adapter) prevents two independently evolving derivations; one-way value imports (workflow-directive -> phase-plan) avoid ESM cycles in the workflow bundle
- **[archive_only_evidence]** decisions: Used Zod v4 strict schemas (z.object().strict() + z.discriminatedUnion) for the plan contract and parsePhasePlan boundary validator — Zod is already workflow-bundled via types/gates.ts, so C3 holds; DDC1 requires malformed/unsupported payloads to fail parsing rather than fall through to a command
- **[archive_only_evidence]** decisions: failClosed is a per-variant literal (false only on actionable) and provenance is a discriminated union (canonical{bucket} | degraded{reason,diagnostics}) — Design decision 2: non-authorizing variants carry stable provenance and fail_closed:true; AC4 requires distinguishing source provenance and recovery-required state from ordinary progress
- **[archive_only_evidence]** decisions: Actionable plans carry initial flag + bounded evidence (durable gate-fact refs) and guidance (1 snippet) derived deterministically from ctx; caps pinned to contract constants 12/3 and enforced in schema and derivation — AC5/DDC2 bounds; preserves the legacy never_started vs continue distinction losslessly (AC1 collapses both into actionable)
- **[archive_only_evidence]** decisions: derivePhasePlan throws on conflicting normalized state; derivePhasePlanSafe maps throws to typed degraded reasons (TypeError -> missing_state, 'conflicting state' message -> conflicting_state, else derivation_error) — AC3/SC3: missing/conflicting/unsupported state must become a typed non-authorizing result, never an invented action; strict path keeps workflow-side throws deterministic
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan.test.ts (red, module absent) (1) — RED recorded (runId tr_mrmwjfkj_87f57b1e): new suite fails before implementation; baseline workflow-directive.test.ts 21/21 green (runId tr_mrmwjfs0_cb0e2e26)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts (0) — GREEN (runId tr_mrmwlhvz_92fa41af): 67/67 — 46 new plan tests (AC1-AC5, DDC1 parser, precedence, adapter losslessness) + 21 legacy directive tests unchanged
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts src/utils/buckets.test.ts src/utils/context-snapshot.test.ts src/utils/compaction-context.test.ts src/tools/gate.test.ts src/tools/status-enrich.test.ts src/tools/change.test.ts src/temporal/workflows.queries.test.ts src/temporal/workflows.projection.test.ts src/temporal/workflow-bundle-boundary.test.ts (0) — 307/307 across 11 consumer + boundary suites; bundle boundary test transitively covers new phase-plan module
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, tsc --noEmit, test-isolation, lockfile-policy, eslint, prettier all pass
- **[archive_only_evidence]** verification: pnpm run build:worker (0) — Temporal worker bundle builds successfully with new workflow-reachable module
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts src/temporal/workflow-bundle-boundary.test.ts (post-format verify) (0) — VERIFY (runId tr_mrmwp2iw_ee804cc5): 73/73 green after prettier normalization
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts (red, module absent)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts src/utils/buckets.test.ts src/utils/context-snapshot.test.ts src/utils/compaction-context.test.ts src/tools/gate.test.ts src/tools/status-enrich.test.ts src/tools/change.test.ts src/temporal/workflows.queries.test.ts src/temporal/workflows.projection.test.ts src/temporal/workflow-bundle-boundary.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build:worker
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts src/temporal/workflow-bundle-boundary.test.ts (post-format verify)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan.test.ts (0) — 46/46 passing; recorded as adv_run_test run tr_mrnsa042_58572026.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts (0) — 67/67 passing (runId tr_mrnsmz0n_462aa341)
- **[report_follow_up]** follow_ups: Table-driven parity matrix covering every variant + orientation consumer (AC10) and manifest-to-workflow-safe command mapping parity (AC7) remain for later tasks per scope
- **[report_follow_up]** follow_ups: Machine-wide bridge-build/cutover-receipt work (AC9/DDC5-DDC7) remains for later tasks; this task adds no fail-closed routing
- **[archive_only_evidence]** decisions: Placed canonical wire name adv.change.getPhasePlan in CHANGE_WORKFLOW_COMPAT_QUERY_NAMES beside getDirective; both the messages.ts client binding and workflows.ts handler bind from the constant — Design decision 5 (centralized query wire name): one constant drives binding + registration so the name cannot drift; compat object is where read-query compat names already live
- **[archive_only_evidence]** decisions: adv_change_show projection derives locally via derivePhasePlanSafe(changeToDirectiveState(...)) instead of issuing a live workflow query — Matches the established snapshot/directive pattern (deriveDirectiveSafe over the disk projection), keeps target_path disk-snapshot support working, and yields the same plan because both sides derive from the same durable state with the same kernel
- **[archive_only_evidence]** decisions: Hoisted a lazy shared projection-state loader used by both include.snapshot and include.phasePlan — Guarantees the _contextSnapshot Next line and _phasePlan derive from one reconciled gates projection per call (they cannot disagree); loads at most once and only when requested; snapshot external behavior unchanged (existing snapshot + recovery tests pass)
- **[archive_only_evidence]** decisions: Tool-layer degradation always returns a typed DegradedPhasePlan (loader failure → missing_state; derive throw handled inside derivePhasePlanSafe) instead of an _phasePlanError string — AC3/SC3: missing/conflicting/unsupported state must become a typed non-authorizing result with provenance and no route/command, never an invented next action
- **[archive_only_evidence]** decisions: Fixed pre-existing stale 'defines the 51 signal surface' assertion to 52 — Same-file campsite fix blocking GREEN; closeChange made 52 signals but the hardcoded length stayed 51; confirmed the failure exists at checkpoint 3cc07eaa without my changes
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/messages.test.ts src/tools/change.test.ts src/temporal/workflows.queries.test.ts (1) — RED (runId tr_mrmx4gl3_3ddcede3): expected failures — getPhasePlanQuery unbound, workflow query unregistered, _phasePlan absent in all 4 new tool tests
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/messages.test.ts src/tools/change.test.ts src/temporal/workflows.queries.test.ts (0) — GREEN (runId tr_mrmxade5_29d37acc): 127/127 — canonical wire-name binding, workflow plan query parses via parsePhasePlan (actionable acceptance/adv-review), tool projection actionable/approval-required/terminal/degraded variants with no route/command on non-authorizing kinds, zero additional mutations, defaults unchanged
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts src/temporal/workflow-bundle-boundary.test.ts src/temporal/workflows.projection.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/workflows.epic.test.ts src/temporal/workflows.ops-follow-up.test.ts src/temporal/workflows.search-attrs.test.ts src/tools/gate.test.ts src/tools/status-enrich.test.ts src/tools/status.test.ts (0) — VERIFY (runId tr_mrmxbehr_3e65e07a): consumer regression sweep pass incl. AC6 adv_gate_status directive-compatible guidance and workflow bundle boundary
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/snapshot.test.ts src/tools/recovery-audit.test.ts src/tools/recovery-probe.test.ts src/tools/_recovery-writers.test.ts src/tools/change.read-artifact.test.ts src/utils/compaction-context.test.ts src/utils/context-snapshot.test.ts src/utils/context-snapshot.purity.test.ts src/tools/change.status-repair.test.ts src/tools/change-claim.test.ts (0) — VERIFY (runId tr_mrmxbo23_95a177f0): 144/144 snapshot/recovery/compaction consumers pass
- **[archive_only_evidence]** verification: pnpm run check && pnpm run build:worker (0) — VERIFY (runId tr_mrmxeevr_9256dc50): schemas:check, typecheck, isolation/lockfile checks, lint, format:check, worker bundle build all pass
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/ (0) — VERIFY (runId tr_mrmxgyq7_bb7160d1): full temporal directory suite pass
- **[archive_only_evidence]** verification: pnpm run build (0) — VERIFY (runId tr_mrmxhlo3_ac5ccc37): full plugin + Temporal worker bundle build pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/messages.test.ts src/tools/change.test.ts src/temporal/workflows.queries.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/messages.test.ts src/tools/change.test.ts src/temporal/workflows.queries.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts src/temporal/workflow-bundle-boundary.test.ts src/temporal/workflows.projection.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/workflows.epic.test.ts src/temporal/workflows.ops-follow-up.test.ts src/temporal/workflows.search-attrs.test.ts src/tools/gate.test.ts src/tools/status-enrich.test.ts src/tools/status.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/snapshot.test.ts src/tools/recovery-audit.test.ts src/tools/recovery-probe.test.ts src/tools/_recovery-writers.test.ts src/tools/change.read-artifact.test.ts src/utils/compaction-context.test.ts src/utils/context-snapshot.test.ts src/utils/context-snapshot.purity.test.ts src/tools/change.status-repair.test.ts src/tools/change-claim.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check && pnpm run build:worker
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/messages.test.ts src/temporal/workflows.queries.test.ts src/tools/change.test.ts (0) — 145/145 passing; recorded as adv_run_test run tr_mrnsaaw6_21d8d84a.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/messages.test.ts src/temporal/workflows.queries.test.ts src/tools/change.test.ts
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/messages.test.ts src/temporal/workflows.queries.test.ts src/tools/change.test.ts (0) — PASS (runId tr_mrnso67s_13adbf19): 145/145 tests passed in 3 files
- **[report_follow_up]** follow_ups: tk-c9beb1315936 (concurrent, same worktree) is writing plugin/src/migration/* — pnpm run check fails format:check on those files only; orchestrator must stage/checkpoint my 4 files separately from migration/* and let that task's owner fix its formatting
- **[report_follow_up]** follow_ups: When the migration task replaces deriveDirectiveSafe undefined-degradation in consumers with typed degraded plans, update matrix expectations in plugin/src/__tests__/phase-plan-parity-matrix.ts (approval/blocked/recovery recommendation rows and the malformed row) — the matrix is the single flip point by design
- **[archive_only_evidence]** decisions: Shared matrix fixture in plugin/src/__tests__/phase-plan-parity-matrix.ts consumed by three suites (utils parity, gate.test.ts, change.test.ts) — DDC4 requires ONE table-driven matrix covering all consumers; P04 locality keeps tool-level assertions next to their proven mock harnesses instead of duplicating the heavy change.ts/gate.ts mock surface in a fourth file
- **[archive_only_evidence]** decisions: Fixture states use status 'draft' and toolChangeFor routes through normalizeLegacyChangeStatus — tsc typechecks non-test fixture modules but excludes *.test.ts — Change/ChangeWorkflowState status unions exclude legacy 'active'; normalization mirrors the production seed boundary so derivation results are identical
- **[archive_only_evidence]** decisions: Malformed row excluded from the adv_gate_status table; degraded coverage lives in change-show + derivation suites — adv_gate_status throws on a gate record with missing entries (getIncompleteGates indexes undefined.status) before the directive fallback engages — documented in the fixture header so future readers know the exclusion is deliberate
- **[archive_only_evidence]** decisions: AC7 proven three ways: structural first-class assertions (keys, cardinality, reverse gate-field, plan-command tie), 5 injected-drift detection proofs, and one live mutation (GATE_COMMAND.design→adv-harden) recorded failing then reverted — 'Detects every manifest-to-workflow-safe command mapping mismatch' (AC7) is a detection claim — injected drift + live mutation demonstrate the suite is not vacuous
- **[archive_only_evidence]** decisions: Recovery handoff and mutation-response snapshots covered at formatter level; no new Temporal test-env rows added to workflows.queries.test.ts — buildReentryResult/change-create/gate-complete all share buildChangeContextSnapshot, so formatter parity covers them; query-handler binding is structural over the same kernel and already covered by workflows.queries.test.ts — avoids slow duplicate test-env rows
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (fixture absent) (1) — RED (runId tr_mrmy40o6_21f80bf7): all 3 suites fail collection — parity fixture module not yet implemented
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (0) — GREEN (runId tr_mrmy59mi_14176e68): 321/321 — 18-row matrix across derivation, adapter, AC7 mapping, consumers, adv_gate_status (17 rows), adv_change_show (18 rows)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (with GATE_COMMAND.design mutated to adv-harden) (1) — MUTATION RED (runId tr_mrmy60y5_18ba5617): mapping drift detected across derivation rows, AC7 structural asserts, snapshot/compaction/recommendation consumers; mutation reverted after capture
- **[archive_only_evidence]** verification: pnpm exec vitest run <15 derivation+consumer+workflow suites> (0) — VERIFY (runId tr_mrmy701l_676cd87d): 587/587 across parity, phase-plan, workflow-directive, buckets, snapshots, compaction, status-enrich, status, manifest, workflows.queries, bundle boundary
- **[archive_only_evidence]** verification: pnpm run check (1) — VERIFY (runId tr_mrmycgp6_c6b2592e): schemas:check, tsc, isolation, lockfile, eslint all pass; prettier clean on my 4 files — format:check red ONLY on concurrent sibling task's src/migration/* WIP files (not my scope; two earlier fix iterations tr_mrmy7eay_bde575ee + tr_mrmy91rb_4944b23b resolved tsc status-union errors in fixture)
- **[archive_only_evidence]** verification: pnpm run build:worker && pnpm run build (0) — VERIFY (runId tr_mrmydcoc_c03a78c8): Temporal worker bundle + full plugin build pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- <21 derivation/consumer/recovery/temporal suites> (0) — VERIFY (runId tr_mrmyef3l_5b23297c): wide throttled sweep pass incl. snapshot/recovery-audit/recovery-probe/status-repair/workflows.projection+signal-handlers
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (post-prettier) (0) — VERIFY (runId tr_mrmyb9gp_9e9e712c): 321/321 after formatting normalization
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (fixture absent)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (with GATE_COMMAND.design mutated to adv-harden)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run <15 derivation+consumer+workflow suites>
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build:worker && pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- <21 derivation/consumer/recovery/temporal suites>
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (post-prettier)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (0) — 321/321 passing; recorded as adv_run_test run tr_mrnsakep_f51fbcc0.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts
- **[archive_only_evidence]** decisions: Ran verification in plugin/ subdirectory because the command uses src/... paths relative to plugin — The task command is pnpm exec vitest run src/... and the Advance repo keeps plugin code under plugin/; executing from plugin/ produces the exact reported command without path prefix changes
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (0) — 321/321 passed (runId tr_mrnso4c2_37c7684c)
- **[report_follow_up]** follow_ups: PRE-EXISTING DEBT (not this task's diff): bin/oc-test full has 5 failures also present at base checkpoint 816717bdc, root-caused via git history: (1) adv_verification_evidence_disposition tool (commit 3f0edcd5, checkpoint tk-668a71d0ecae) missing from docs/tool-ownership.md, tool-role-policy.ts classification, and .opencode/agents/adv.md manifest -> fails tool-ownership-assets + 3 tool-role-policy tests; (2) rq-delDefaults10 (delegation-defaults spec from updateSubagentDispatch archive) lacks an external citation -> fails spec-citation-invariant. Release-verification task tk-7b0032f82437 needs these resolved or dispositioned before AC11's full-suite gate can pass.
- **[report_follow_up]** follow_ups: Operator cutover sequence remains (runbook, not code): deploy bridge build (pnpm run build && ./scripts/deploy-local.sh --fix), restart all agent sessions so they register loaded-build identity, then activate with pnpm exec tsx scripts/cutover-receipt.ts activate --plugin-root ~/.local/share/Advance/plugin.
- **[report_follow_up]** follow_ups: Temporal OOP/replay integration tests require the worker bundle built (pnpm run build:worker) — done in this worktree; any fresh worktree resume must rebuild before running replay verification.
- **[unresolved_action]** required_main_agent_actions: Checkpoint task tk-c9beb1315936 — IMPORTANT: stage ONLY this task's files; parallel parity task tk-181fde6bc5d5 has uncommitted edits in the same worktree (plugin/src/__tests__/phase-plan-parity-matrix.ts, plugin/src/utils/phase-plan-parity.test.ts, modifications to plugin/src/tools/gate.test.ts and plugin/src/tools/change.test.ts) that must NOT be swept into this checkpoint.
- **[unresolved_action]** required_main_agent_actions: Resolve or disposition the 5 pre-existing bin/oc-test full failures (tool-ownership/role-policy rows for adv_verification_evidence_disposition + external citation for rq-delDefaults10) before release verification tk-7b0032f82437.
- **[archive_only_evidence]** decisions: Receipt binds to immutable content-hash digest of dist/ (sha256 composite over sorted file hashes), not mtime — Mtime is forgeable and non-unique; content hash makes 'new build = new proof' structural (C5)
- **[archive_only_evidence]** decisions: Worker staleness proofed via process start time (procfs start ticks) vs build identity installedAtMs, with deployed/foreign classification by argv worker bundle path — Worker birth time is unforgeable by the worker itself; foreign workers without verifiable identity block cutover as worker_foreign_unknown
- **[archive_only_evidence]** decisions: Malformed receipt fails closed; digest-mismatched (stale) receipt does NOT fail closed — Malformed = unknown state (conservative). Stale = known old state; C5 requires re-proof, so routing stays legacy rather than half-blocking
- **[archive_only_evidence]** decisions: Session proof uses both an opt-in loaded-build registry (sessions/{pid}.json with PID-reuse-safe liveness) and /proc session classification — Pre-bridge sessions cannot register; unknown live opencode sessions block as session_process_unknown, forcing restart onto current build
- **[archive_only_evidence]** decisions: Operator CLI guides activation with --plugin-root pointed at the DEPLOYED plugin dir — Receipt must bind to the build sessions actually load (~/.local/share/Advance/plugin); otherwise deployed workers classify as foreign
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Parallel task tk-181fde6bc5d5 (phase-plan parity coverage) is actively editing the same worktree: new files plugin/src/__tests__/phase-plan-parity-matrix.ts and plugin/src/utils/phase-plan-parity.test.ts, plus modifications to plugin/src/tools/gate.test.ts and plugin/src/tools/change.test.ts appeared mid-session. Verified my edits (gate.ts, status-enrich.ts) are disjoint from its test-file edits; its suites pass alongside mine (included in 512/512 sweep). Took no action on its files.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/migration/ src/tools/gate-status-fail-closed.test.ts src/tools/status-enrich-fail-closed.test.ts src/plugin-init.session-registration.test.ts (0) — 94/94 pass across 12 new suites (procfs, build-identity, session-registry, process-inventory, inventory, replay-verification incl. real committed fixtures, cutover-receipt, routing-guard, strict-plan-validation, gate-status fail-closed, status-enrich fail-closed, plugin-init session registration). Final confirm run tr_mrmz8m14_99435b05.
- **[archive_only_evidence]** verification: pnpm exec vitest run <26 targeted suites incl. migration, consumers, boundary, phase-plan, gate, status, plugin-init, change> (0) — 512/512 pass — all new tests plus consumers and boundary/phase-plan regression, including parallel task's parity suites
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile, lint, format all pass
- **[archive_only_evidence]** verification: pnpm run build (0) — plugin + worker bundles built; build identity recorded (29 files, sha256:1fe42b3d...)
- **[archive_only_evidence]** verification: bin/oc-test full (1) — 5 failures, ALL pre-existing at base checkpoint 816717bdc: tool-ownership-assets (adv_verification_evidence_disposition missing docs row), tool-role-policy x3 (same tool unclassified), spec-citation-invariant (rq-delDefaults10 lacks external citation). Zero failures in files touched by this task; isolated re-run of the 3 failing files reproduces identical signatures.
- **[archive_only_evidence]** verification: timeout 60 pnpm exec tsx scripts/cutover-receipt.ts status (0) — Operator CLI runs against real machine: build identity match, readiness correctly blocked on 5 real foreign deployed workers (no identity) and live unregistered opencode sessions — proof machinery honest end-to-end
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/migration/ src/tools/gate-status-fail-closed.test.ts src/tools/status-enrich-fail-closed.test.ts src/plugin-init.session-registration.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run <26 targeted suites incl. migration, consumers, boundary, phase-plan, gate, status, plugin-init, change>
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: timeout 60 pnpm exec tsx scripts/cutover-receipt.ts status
- **[archive_only_evidence]** verification: pnpm exec vitest run src/migration/ src/tools/gate-status-fail-closed.test.ts src/tools/status-enrich-fail-closed.test.ts (0) — 92/92 passing; recorded as adv_run_test run tr_mrnsay5w_ab0d7a2f.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/migration/ src/tools/gate-status-fail-closed.test.ts src/tools/status-enrich-fail-closed.test.ts
- **[archive_only_evidence]** verification: pnpm exec vitest run src/migration/ src/tools/gate-status-fail-closed.test.ts src/tools/status-enrich-fail-closed.test.ts (0) — 92/92 pass; recorded as adv_run_test run tr_mrnsojah_6792fbbd.

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
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
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

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts (red, module absent)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts src/utils/buckets.test.ts src/utils/context-snapshot.test.ts src/utils/compaction-context.test.ts src/tools/gate.test.ts src/tools/status-enrich.test.ts src/tools/change.test.ts src/temporal/workflows.queries.test.ts src/temporal/workflows.projection.test.ts src/temporal/workflow-bundle-boundary.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build:worker
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts src/temporal/workflow-bundle-boundary.test.ts (post-format verify)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/messages.test.ts src/tools/change.test.ts src/temporal/workflows.queries.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/messages.test.ts src/tools/change.test.ts src/temporal/workflows.queries.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan.test.ts src/utils/workflow-directive.test.ts src/temporal/workflow-bundle-boundary.test.ts src/temporal/workflows.projection.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/workflows.epic.test.ts src/temporal/workflows.ops-follow-up.test.ts src/temporal/workflows.search-attrs.test.ts src/tools/gate.test.ts src/tools/status-enrich.test.ts src/tools/status.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/snapshot.test.ts src/tools/recovery-audit.test.ts src/tools/recovery-probe.test.ts src/tools/_recovery-writers.test.ts src/tools/change.read-artifact.test.ts src/utils/compaction-context.test.ts src/utils/context-snapshot.test.ts src/utils/context-snapshot.purity.test.ts src/tools/change.status-repair.test.ts src/tools/change-claim.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check && pnpm run build:worker
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/messages.test.ts src/temporal/workflows.queries.test.ts src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (fixture absent)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (with GATE_COMMAND.design mutated to adv-harden)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run <15 derivation+consumer+workflow suites>
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build:worker && pnpm run build
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- <21 derivation/consumer/recovery/temporal suites>
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts (post-prettier)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/phase-plan-parity.test.ts src/tools/gate.test.ts src/tools/change.test.ts
- Checkpoint task tk-c9beb1315936 — IMPORTANT: stage ONLY this task's files; parallel parity task tk-181fde6bc5d5 has uncommitted edits in the same worktree (plugin/src/__tests__/phase-plan-parity-matrix.ts, plugin/src/utils/phase-plan-parity.test.ts, modifications to plugin/src/tools/gate.test.ts and plugin/src/tools/change.test.ts) that must NOT be swept into this checkpoint.
- Resolve or disposition the 5 pre-existing bin/oc-test full failures (tool-ownership/role-policy rows for adv_verification_evidence_disposition + external citation for rq-delDefaults10) before release verification tk-7b0032f82437.
- finish_owned_scope_then_report: Parallel task tk-181fde6bc5d5 (phase-plan parity coverage) is actively editing the same worktree: new files plugin/src/__tests__/phase-plan-parity-matrix.ts and plugin/src/utils/phase-plan-parity.test.ts, plus modifications to plugin/src/tools/gate.test.ts and plugin/src/tools/change.test.ts appeared mid-session. Verified my edits (gate.ts, status-enrich.ts) are disjoint from its test-file edits; its suites pass alongside mine (included in 512/512 sweep). Took no action on its files.
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/migration/ src/tools/gate-status-fail-closed.test.ts src/tools/status-enrich-fail-closed.test.ts src/plugin-init.session-registration.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run <26 targeted suites incl. migration, consumers, boundary, phase-plan, gate, status, plugin-init, change>
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- verification_missing: No adv_run_test evidence found for reported command: timeout 60 pnpm exec tsx scripts/cutover-receipt.ts status
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/migration/ src/tools/gate-status-fail-closed.test.ts src/tools/status-enrich-fail-closed.test.ts
