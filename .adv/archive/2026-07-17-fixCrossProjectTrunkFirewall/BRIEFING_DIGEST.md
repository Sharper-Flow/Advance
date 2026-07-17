# Archive Briefing Digest

**Change ID:** fixCrossProjectTrunkFirewall
**Title:** Fix cross-project trunk firewall
**Status:** archived
**Generated:** 2026-07-17T17:27:17.217Z

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

Showing 100 of 107 durable facts (7 omitted).

- **[report_follow_up]** follow_ups: Pre-existing prettier drift in plugin/src/index.ts and plugin/src/utils/morph-worktree-authorization.test.ts was verified on base and remains untouched.
- **[report_follow_up]** follow_ups: ADV_INSTRUCTIONS.md firewall prose may need cross-project wording in the dedicated docs task.
- **[unresolved_action]** required_main_agent_actions: Checkpoint and complete this task after inspecting worktree diff.
- **[unresolved_action]** required_main_agent_actions: Treat the pre-existing full-format drift separately from this task.
- **[archive_only_evidence]** decisions: Resolve trunk-ness target-relatively through bounded existing ancestor and target worktree porcelain topology. — Foreign main checkouts were allowed because authorization used session projectRoot.
- **[archive_only_evidence]** decisions: Exclude prunable worktree entries from eligibility and preserve mutable branch/default/recovery probes outside topology memo. — Stale topology must not authorize writes; mutable state must remain fresh.
- **[archive_only_evidence]** decisions: Evaluate exact artifact allowlist relative to target main checkout root. — Cross-project artifact exception must not use session root.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/worktree-paths.test.ts src/tools/trunk-write-firewall.test.ts (1) — RED: 14 failed / 51 passed — foreign main checkout writes allowed and parseWorktreeTopology missing.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/worktree-paths.test.ts src/tools/trunk-write-firewall.test.ts (0) — GREEN: 65 passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/trunk-write-firewall.regression.test.ts src/integration.test.ts src/trunk-write-firewall-spec-assets.test.ts (0) — 57 passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/worktree-paths.test.ts src/tools/trunk-write-firewall.test.ts src/tools/trunk-write-firewall.regression.test.ts src/integration.test.ts (0) — 118 passed after format.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/test.test.ts src/tools/subagent-report.test.ts (0) — 57 passed.
- **[archive_only_evidence]** verification: pnpm run check (1) — Schemas, typecheck, isolation, lockfile, and lint passed; format check fails only on pre-existing base drift in src/index.ts and src/utils/morph-worktree-authorization.test.ts.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/worktree-paths.test.ts src/tools/trunk-write-firewall.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/worktree-paths.test.ts src/tools/trunk-write-firewall.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/trunk-write-firewall.regression.test.ts src/integration.test.ts src/trunk-write-firewall-spec-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/worktree-paths.test.ts src/tools/trunk-write-firewall.test.ts src/tools/trunk-write-firewall.regression.test.ts src/integration.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/test.test.ts src/tools/subagent-report.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[report_follow_up]** follow_ups: Pre-existing rq-delDefaults10 citation invariant failure.
- **[report_follow_up]** follow_ups: Pre-existing formatter drift in src/index.ts and src/utils/morph-worktree-authorization.test.ts.
- **[report_follow_up]** follow_ups: Bounded-read-deadline test may be load-sensitive; passed during reported full run.
- **[archive_only_evidence]** decisions: Check merge/rebase/cherry-pick/revert markers before detached HEAD classification. — Recovery operations detach HEAD; detached-first masked required in-progress state.
- **[archive_only_evidence]** decisions: Add detached-rebase integration coverage including abort/re-block. — Proves recovery allowance holds during rebase and strict firewall returns after recovery.
- **[archive_only_evidence]** verification: pnpm test -- src/tools/checkpoint.test.ts (1) — RED: six new precedence tests failed; detached classification masked recovery state.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/checkpoint.test.ts src/integration.test.ts src/tools/trunk-write-firewall.test.ts (0) — GREEN: 120 passed.
- **[archive_only_evidence]** verification: pnpm run check (1) — Schemas/typecheck/isolation/lockfile/lint passed; pre-existing format drift only in src/index.ts and src/utils/morph-worktree-authorization.test.ts.
- **[archive_only_evidence]** verification: bin/oc-test full (1) — 5496/5497 passed; sole pre-existing rq-delDefaults10 citation invariant failure.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/tools/checkpoint.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/checkpoint.test.ts src/integration.test.ts src/tools/trunk-write-firewall.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[report_follow_up]** follow_ups: Pre-existing branch formatter violations in plugin/src/index.ts and plugin/src/utils/morph-worktree-authorization.test.ts.
- **[unresolved_action]** required_main_agent_actions: Resolve unrelated format failures before final full check.
- **[archive_only_evidence]** decisions: Derive local queue readiness from per-queue worker diagnostics. — Raw registered queues include failed queues and unrelated queue liveness was unsafe.
- **[archive_only_evidence]** decisions: Use fresh server poller as conservative admission only and emit remediation field. — Poller freshness is not liveness; AC9 requires typed actionable refusal.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/target-project.test.ts (0) — 30 passed; eight RED-first hardening tests now green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- related target queue consumers (0) — 551 related tests passed.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit; eslint; prettier on touched files (0) — Touched files clean.
- **[archive_only_evidence]** verification: pnpm run check (1) — Only pre-existing prettier violations in plugin/src/index.ts and plugin/src/utils/morph-worktree-authorization.test.ts.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/target-project.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- related target queue consumers
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit; eslint; prettier on touched files
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: Select cwd from explicit workdir before target default and bind target path to common Git dir. — Prevents target store from causing unrelated or wrong worktree commits.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/checkpoint.test.ts (0) — 33 passed; four tests red before fix.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- checkpoint,target-project,task (0) — 104 passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- gate,firewall,cli bridge (0) — 113 passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/checkpoint.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- checkpoint,target-project,task
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- gate,firewall,cli bridge
- **[report_follow_up]** follow_ups: Pre-existing formatter drift in plugin/src/index.ts and plugin/src/utils/morph-worktree-authorization.test.ts.
- **[report_follow_up]** follow_ups: Non-blocking consistency: adv_gate_complete recomputes target ID from store root instead of consuming projectContext.projectId.
- **[report_follow_up]** follow_ups: Archive target_path execution has dry-run routing coverage; full archive test remains archive-owner scope.
- **[archive_only_evidence]** decisions: No production changes after routing audit. — All in-scope artifact mutation and close routes already bind target stores/workflow identity to the resolved target project.
- **[archive_only_evidence]** decisions: Add seam-level snapshot-authority tests. — All snapshot reads share the target-project formatter/path, so seam proof avoids redundant per-tool mocks.
- **[archive_only_evidence]** decisions: Add negative source-identity guards for close routes. — Prevents passing tests if source and target workflows are both addressed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/target-project.test.ts (0) — 34/34 pass; includes four snapshot-authority seam tests.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts (0) — 114/114 pass; three target-routing identity pins.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/cross-project-coordination.test.ts src/tools/change-cross-project-create.test.ts src/tools/change.status-repair.test.ts src/tools/gate.test.ts (0) — 64/64 pass across adjacent cross-project suites.
- **[archive_only_evidence]** verification: pnpm run check (1) — Schemas/typecheck/isolation/lockfile/lint passed; format check fails only on pre-existing drift in src/index.ts and src/utils/morph-worktree-authorization.test.ts. Touched files are clean.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/target-project.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/cross-project-coordination.test.ts src/tools/change-cross-project-create.test.ts src/tools/change.status-repair.test.ts src/tools/gate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[report_follow_up]** follow_ups: User-global ~/.config/opencode/instructions/trunk-worktree-isolation.md still says firewall guards only current session project; update its Structural guard status after this change archives.
- **[unresolved_action]** required_main_agent_actions: Update the user-global trunk-worktree-isolation.md instruction after archive/deploy; it is outside this repo worktree.
- **[archive_only_evidence]** decisions: Extend owning requirements rather than add IDs. — The change refines existing firewall, checkpoint, and readiness laws; keeping them local preserves discoverability.
- **[archive_only_evidence]** decisions: Leave already-aligned laws unchanged. — Target-read authority, canonical shards, task mutation routing, and coordination laws already match implementation.
- **[archive_only_evidence]** decisions: Avoid unrelated documentation churn. — Other scanned recovery/worktree/readme surfaces were accurate.
- **[archive_only_evidence]** verification: pnpm exec tsx -e "SpecSchema.parse(...) for advance-meta + advance-workflow spec.json" (0) — Both edited spec.json files parse against SpecSchema: advance-meta 54 requirements, advance-workflow 102.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- spec/doc drift assets (0) — 6 files, 48 asset and drift tests passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- firewall/checkpoint/target-project/spec asset tests (0) — 9 files, 287 behavior/spec/mirror asset tests passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- asset/drift files after prose polish (0) — 9 files, 120 tests passed.
- **[archive_only_evidence]** verification: pnpm run schemas:check (0) — Generated JSON schemas have no drift.
- **[archive_only_evidence]** verification: node mirror-alignment script (0) — Scenario order and requirement bodies match across specs and docs mirrors.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx -e "SpecSchema.parse(...) for advance-meta + advance-workflow spec.json"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- spec/doc drift assets
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- firewall/checkpoint/target-project/spec asset tests
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- asset/drift files after prose polish
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: node mirror-alignment script
- **[archive_only_evidence]** decisions: Rewrote rq-delDefaults10 as 'Designer-Direct Frontend Dispatch' (title/body/tags/scenarios) mirroring adv-apply.md Priority 1.5 routing — Spec law must match the authoritative executable routing: metadata.frontend=="true" routes directly to adv-designer, with Priority 1 delegation_hint override and step-4 risk-inline precedence; the stale engineer-first body contradicted it
- **[archive_only_evidence]** decisions: Kept scenario rq-delDefaults10.3 (reviewer retains review/harden ownership) unchanged — Semantics already correct and matched both spec and mirror; no drift to repair
- **[archive_only_evidence]** decisions: Strengthened the routing regression test with negative assertions against engineer-first semantics — Prevents reintroduction of the rejected engineer-first routing while citing rq-delDefaults10 for the citation invariant
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts src/adv-designer-assets.test.ts src/delegation-matrix.test.ts src/subagent-reports-spec-assets.test.ts src/command-requirement-citations.test.ts (0) — 86/86 tests pass across citation invariant, designer assets, delegation matrix/mirror, spec-assets schema, and command-citation suites (runId tr_mrmsihzr_b3be2f1d)
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/adv-designer-assets.test.ts (after --write) (0) — Format-clean; .adv/specs and docs/specs are outside prettier scope (format:check covers src/ only)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts src/adv-designer-assets.test.ts src/delegation-matrix.test.ts src/subagent-reports-spec-assets.test.ts src/command-requirement-citations.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/adv-designer-assets.test.ts (after --write)
- **[archive_only_evidence]** findings: [info] Scoped firewall contract tests pass.
- **[report_follow_up]** required_follow_ups: Provide the missing SCOPE KEY and rerun independent acceptance review.
- **[unresolved_action]** required_main_agent_actions: Resend independent review packet with explicit SCOPE KEY, PHASE, ATTEMPT, CHANGE, and WORKING DIRECTORY anchors.
- **[unresolved_action]** required_main_agent_actions: Use scope key review:acceptance unless an alternate independent-review scope was intentionally designated.
- **[archive_only_evidence]** verification: tests_run= results=n/a — No repository analysis or edits performed: packet identity validation stopped before scope lock.
- **[unresolved_action]** required_main_agent_actions: Record independent acceptance evidence and continue normal acceptance-gate evaluation.
- **[unresolved_action]** required_main_agent_actions: Leave browser review and broader shell parsing unchanged: visual_surface is false and agreement preserves the recognized-command boundary.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/trunk-write-firewall.test.ts src/tools/checkpoint.test.ts src/tools/target-project.test.ts src/integration.test.ts, pnpm run check, git diff --check $(git merge-base HEAD origin/trunk) HEAD results=pass — 157 targeted tests passed; pnpm run check passed; diff check clean. AC1-AC7 firewall target topology and Bash parity verified; AC8 checkpoint workdir/store separation verified; AC9 queue readiness fail-closed verified; AC10 target workflow/store identity tests verified; AC11 non-authoritative snapshot marker verified.
- **[unresolved_action]** required_main_agent_actions: Record this READY release-hardening evidence in the acceptance/release flow.
- **[unresolved_action]** required_main_agent_actions: Do not revisit plugin source, specs, or docs for this accepted scope unless new release evidence fails; worktree was clean after verification.
- **[wisdom_candidate]** wisdom_candidates: [success] Release hardening confirmed target-relative firewall, checkpoint workdir/store separation, queue-readiness routing, docs/spec assets, type/lint/format checks, and both plugin/Temporal worker bundles without producing generated worktree drift.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| SC6 | success_criterion | pass |
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
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- Checkpoint and complete this task after inspecting worktree diff.
- Treat the pre-existing full-format drift separately from this task.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/worktree-paths.test.ts src/tools/trunk-write-firewall.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/worktree-paths.test.ts src/tools/trunk-write-firewall.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/trunk-write-firewall.regression.test.ts src/integration.test.ts src/trunk-write-firewall-spec-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/worktree-paths.test.ts src/tools/trunk-write-firewall.test.ts src/tools/trunk-write-firewall.regression.test.ts src/integration.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/test.test.ts src/tools/subagent-report.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/tools/checkpoint.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/checkpoint.test.ts src/integration.test.ts src/tools/trunk-write-firewall.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- Resolve unrelated format failures before final full check.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/target-project.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- related target queue consumers
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit; eslint; prettier on touched files
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/checkpoint.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- checkpoint,target-project,task
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- gate,firewall,cli bridge
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/target-project.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/cross-project-coordination.test.ts src/tools/change-cross-project-create.test.ts src/tools/change.status-repair.test.ts src/tools/gate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- Update the user-global trunk-worktree-isolation.md instruction after archive/deploy; it is outside this repo worktree.
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx -e "SpecSchema.parse(...) for advance-meta + advance-workflow spec.json"
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- spec/doc drift assets
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- firewall/checkpoint/target-project/spec asset tests
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- asset/drift files after prose polish
- verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check
- verification_missing: No adv_run_test evidence found for reported command: node mirror-alignment script
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts src/adv-designer-assets.test.ts src/delegation-matrix.test.ts src/subagent-reports-spec-assets.test.ts src/command-requirement-citations.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/adv-designer-assets.test.ts (after --write)
- Resend independent review packet with explicit SCOPE KEY, PHASE, ATTEMPT, CHANGE, and WORKING DIRECTORY anchors.
- Use scope key review:acceptance unless an alternate independent-review scope was intentionally designated.
- Record independent acceptance evidence and continue normal acceptance-gate evaluation.
- Leave browser review and broader shell parsing unchanged: visual_surface is false and agreement preserves the recognized-command boundary.
- Record this READY release-hardening evidence in the acceptance/release flow.
- Do not revisit plugin source, specs, or docs for this accepted scope unless new release evidence fails; worktree was clean after verification.
