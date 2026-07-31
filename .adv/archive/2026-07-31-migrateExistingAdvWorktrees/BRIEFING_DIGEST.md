# Archive Briefing Digest

**Change ID:** migrateExistingAdvWorktrees
**Title:** Migrate existing ADV worktrees
**Status:** archived
**Generated:** 2026-07-31T01:36:16.945Z

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

Showing 45 of 45 durable facts.

- **[report_follow_up]** follow_ups: Investigate the 26 unrelated failures in plugin/src/storage/store-temporal/index.test.ts (archive-first terminal projection and aggregate metadata); likely Temporal worker/environmental, not caused by this change.
- **[unresolved_action]** required_main_agent_actions: Re-run the full plugin test suite once the Temporal worker is healthy to confirm the store-temporal failures are environmental.
- **[unresolved_action]** required_main_agent_actions: Review the PR diff and conventional-commit title (suggest `feat: expose operator-only adv_worktree_detach tool`).
- **[archive_only_evidence]** decisions: Classified adv_worktree_detach as operator-only in tool-role-policy and denied it in all agent asset tests — Task requires the tool never be auto-invoked by agents; lifecycle law enforcement depends on role policy plus prompt manifests.
- **[archive_only_evidence]** decisions: Added a regression asset test that scans cleanup/reaper/startup/triage/migration files for advWorktreeDetachBatch calls — Structural proof that the directory-only detach primitive stays out of terminal cleanup paths.
- **[archive_only_evidence]** decisions: Included adv_worktree_cleanup in the adv-verifier explicit blocked list — The verifier asset test was missing the already-registered worktree cleanup tool; adding it keeps the deny list complete and passed CI.
- **[archive_only_evidence]** decisions: Regenerated the frozen codemode MCP contract baseline — Adding a tool changes the assembled prompt size; the baseline must be re-frozen and annotated with the change summary.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/tools/adv-worktree.test.ts src/__tests__/worktree-lifecycle-assets.test.ts (0) — 2 files, 42 tests passed
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/tool-registry.test.ts src/tool-registry.inventory.test.ts src/tool-role-policy.test.ts src/utils/tool-arg-preflight.test.ts src/utils/tool-title.test.ts (0) — 5 files, 165 tests passed
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/adv-engineer-assets.test.ts src/adv-designer-assets.test.ts src/adv-reviewer-asset.test.ts src/adv-verifier-assets.test.ts src/cli-bridge-contract.test.ts (0) — 5 files, 155 tests passed
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — schemas, typecheck, manifests, frontmatter, test isolation, lockfile policy, lint, and format:check all green; 3 pre-existing eslint warnings in manifest-frontmatter.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms830ysn_89c09b25
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms831ftb_0da2857a
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms831ft3_6e263afc
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms834gj4_9af6fdb7
- **[report_follow_up]** follow_ups: Design phase must define the exact dematerialize workflow update/signal name and its poison-history/unavailable-Temporal refusal behavior (constraint: 'Do not treat unavailable Temporal, failed registry lookup, or poisoned history as safe to detach').
- **[report_follow_up]** follow_ups: Verify idempotent-replay semantics: git worktree remove errors on an already-removed worktree, so the typed authority must treat an already-materialized=false record as idempotent success keyed on request identity (AC6/AC7).
- **[report_follow_up]** follow_ups: Confirm startup pending-delete drain (index.ts:3235) and adv_worktree_cleanup discover path never re-touch a detached materialized=false record (AC8 'never auto-triggered') - structurally likely safe since terminal cleanup requires terminal change state, but add a regression test.
- **[research_citation]** sources: advWorktreeResume rematerialization fallthrough: advWorktreeResume reuses the worktree only when materialized!==false AND path exists; otherwise falls through to advWorktreeCreate. A materialized=false record rematerializes via the normal create path for free. (plugin/src/tools/worktree/index.ts:1406-1505 (resume falls through to advWorktreeCreate when materialized===false))
- **[research_citation]** sources: census unmaterialized projection: Read projection already models branch-without-worktree as materialized:false / 'unmaterialized'. No type change needed to represent a detached record. (plugin/src/tools/worktree/census.ts:174-213 (materialized:false, status:'unmaterialized'))
- **[research_citation]** sources: removeWorktree is terminal (worktreeDeletedSignal): removeWorktree signals worktreeDeletedSignal with reason 'missing_from_disk_cleanup' and is gated to terminal (archived/closed) changes. There is NO existing write that sets materialized=false while keeping an OPEN change record. (plugin/src/tools/worktree/state.ts:594-648)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The agreement is well-formed and contract-tight. The single most important realization: the registry-write half of AC4/AC5 has NO existing primitive. removeWorktree/maybeRemoveMissingFromDiskRegistryEntry are terminal (worktreeDeletedSignal, archived/closed-gated) and only run post-hoc once the directory is already gone. The requested detach is the inverse: a PRE-hoc, NON-terminal dematerialize that must remove the directory then set materialized=false + empty path while keeping the open change record. The read+rematerialization half (AC5) IS already structural: advWorktreeResume falls through to advWorktreeCreate when materialized===false, and census already projects materialized:false. So the design splits cleanly into (a) a new non-terminal dematerialize signal/workflow-update (new surface) and (b) reuse of existing resume/create/census (free). Concurrency (AC7) and audit (AC6) both have proven in-repo primitives (git-worktree-flock + workflow updates; cutover-receipt pattern + approvalEvidence preflight). The agreement does not contain a blocker; the one caution is that the new dematerialize workflow update may be a design-scope decision about whether it belongs in this fast-follow or in the parent fixMultiSessionConcurrency change.
- **[unresolved_action]** required_main_agent_actions: Remediate all three blockers in plugin/src/tools/worktree/detach.ts and extend targeted tests before acceptance.
- **[unresolved_action]** required_main_agent_actions: Rerun the corrected targeted worktree detach/state/lifecycle/wrapper suite and the relevant quality check after remediation.
- **[unresolved_action]** required_main_agent_actions: Leave terminal cleanup, reaper, startup cleanup, triage, migration automation, local branches, and owning change lifecycle state unchanged; they are outside this review scope.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] For destructive directory-only operations, a warning-only failure after filesystem mutation is not safe when durable state is the idempotency and audit authority; test unavailable workflow and post-mutation signal failure explicitly.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted plugin/src/tools/worktree/detach.test.ts plugin/src/temporal/change-state.worktree-dematerialize.test.ts plugin/src/__tests__/worktree-lifecycle-assets.test.ts plugin/src/tools/adv-worktree.test.ts, bin/oc-test targeted src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/__tests__/worktree-lifecycle-assets.test.ts src/tools/adv-worktree.test.ts, git diff --check origin/trunk...HEAD results=pass — First targeted invocation used repository-prefixed paths although the test wrapper runs from plugin/ and returned 'No test files found' (exit 1). Corrected invocation passed 65 tests across 4 files in 17.21s. git diff --check passed; worktree remained clean.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted plugin/src/tools/worktree/detach.test.ts plugin/src/temporal/change-state.worktree-dematerialize.test.ts plugin/src/__tests__/worktree-lifecycle-assets.test.ts plugin/src/tools/adv-worktree.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/__tests__/worktree-lifecycle-assets.test.ts src/tools/adv-worktree.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
- **[unresolved_action]** required_main_agent_actions: Checkpoint the four scoped remediation files using the owning task/worktree workflow; reviewer must not perform ADV task or checkpoint mutations.
- **[unresolved_action]** required_main_agent_actions: Resolve the branch's 9-commit origin/trunk freshness gap, then rerun applicable acceptance verification before final acceptance decision.
- **[unresolved_action]** required_main_agent_actions: Do not revisit unrelated baseline storage-suite failures in this detach remediation; they are known to reproduce on trunk.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A signal payload's Zod schema must model refused mutations separately from successful ones: a mandatory approval field makes an approval-required refusal receipt structurally invalid. Receipt delivery failure must be a typed hard failure, not a warning, whenever auditability is required.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/detach.ts: Made refusal and failed-removal receipt delivery fail closed, and omitted blank approval evidence from refused receipt payloads.
- **[archive_only_evidence]** changes_made: plugin/src/types/signals.ts: Allowed approval evidence to be omitted only for refused receipts; retained non-empty evidence as a structural requirement for detached and idempotent outcomes.
- **[archive_only_evidence]** changes_made: plugin/src/tools/worktree/detach.test.ts: Added regression coverage that early-refusal receipts are schema-valid and that inability to record one is a hard failure.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/change-state.worktree-dematerialize.test.ts: Distinguished approval-evidence requirements for actual detaches from legitimate evidence-free refusal receipts.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/temporal/messages.test.ts, pnpm --dir plugin run typecheck, pnpm --dir plugin exec eslint src/tools/worktree/detach.ts src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/types/signals.ts, pnpm --dir plugin exec prettier --check src/tools/worktree/detach.ts src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/types/signals.ts, git diff --check results=pass — 32 targeted tests passed. TypeScript typecheck, scoped ESLint, scoped Prettier, and diff whitespace validation passed. The known baseline storage-suite failures were not rerun; user states they reproduce on trunk and change branch and are unrelated to detach.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/temporal/messages.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec eslint src/tools/worktree/detach.ts src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/types/signals.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check src/tools/worktree/detach.ts src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/types/signals.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check

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
| AC9 | acceptance_criterion | pass |
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
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |

## Unresolved Actions

- Re-run the full plugin test suite once the Temporal worker is healthy to confirm the store-temporal failures are environmental.
- Review the PR diff and conventional-commit title (suggest `feat: expose operator-only adv_worktree_detach tool`).
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms830ysn_89c09b25
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms831ftb_0da2857a
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms831ft3_6e263afc
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms834gj4_9af6fdb7
- Remediate all three blockers in plugin/src/tools/worktree/detach.ts and extend targeted tests before acceptance.
- Rerun the corrected targeted worktree detach/state/lifecycle/wrapper suite and the relevant quality check after remediation.
- Leave terminal cleanup, reaper, startup cleanup, triage, migration automation, local branches, and owning change lifecycle state unchanged; they are outside this review scope.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted plugin/src/tools/worktree/detach.test.ts plugin/src/temporal/change-state.worktree-dematerialize.test.ts plugin/src/__tests__/worktree-lifecycle-assets.test.ts plugin/src/tools/adv-worktree.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/__tests__/worktree-lifecycle-assets.test.ts src/tools/adv-worktree.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
- Checkpoint the four scoped remediation files using the owning task/worktree workflow; reviewer must not perform ADV task or checkpoint mutations.
- Resolve the branch's 9-commit origin/trunk freshness gap, then rerun applicable acceptance verification before final acceptance decision.
- Do not revisit unrelated baseline storage-suite failures in this detach remediation; they are known to reproduce on trunk.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/temporal/messages.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec eslint src/tools/worktree/detach.ts src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/types/signals.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check src/tools/worktree/detach.ts src/tools/worktree/detach.test.ts src/temporal/change-state.worktree-dematerialize.test.ts src/types/signals.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
