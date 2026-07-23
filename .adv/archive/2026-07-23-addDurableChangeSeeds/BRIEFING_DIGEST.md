# Archive Briefing Digest

**Change ID:** addDurableChangeSeeds
**Title:** Add durable change seeds
**Status:** archived
**Generated:** 2026-07-23T17:57:54.162Z

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

Epic: systemizeAdvOrchestration · Add durable change seeds (order 13)

## Durable Facts

Showing 55 of 55 durable facts.

- **[archive_only_evidence]** decisions: Added FutureWorkContextPacketSchema as a standalone module under types/future-work.ts — Keeps the new packet type cohesive and lets it be imported by epics, backlog, and the barrel without cycles
- **[archive_only_evidence]** decisions: Regenerated JSON schemas after modifying BacklogItemSchema — Project requires tracked generated schemas to stay in sync with Zod source; pnpm run check enforces this
- **[archive_only_evidence]** verification: pnpm exec vitest run src/types/future-work.test.ts (1) — RED phase: tests fail because FutureWorkContextPacketSchema module does not yet exist
- **[archive_only_evidence]** verification: pnpm exec vitest run src/types/future-work.test.ts (0) — GREEN phase: all 8 tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — Full check passes: schemas up to date, typecheck, manifests, test isolation, lockfile policy, lint, prettier
- **[unresolved_action]** required_main_agent_actions: Restore or recreate the ADV worktree for change addDurableChangeSeeds and re-spawn adv-engineer on task tk-c59149a602d5.
- **[unresolved_action]** blockers: Working directory disappeared
- **[archive_only_evidence]** verification: test -d /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc65b085528d/change/addDurableChangeSeeds (1) — Working directory does not exist; cannot proceed.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: workdir-preflight-fail
- **[report_follow_up]** follow_ups: Review checkpoint commit 72c2a8393c05a6e1c6a49d4333e421c4bbccb6d6 to confirm the plugin files should remain in this task's checkpoint or be split/reverted.
- **[report_follow_up]** follow_ups: Address pre-existing plugin lint/format issues that block `pnpm run check`: plugin/src/utils/context-packet-validation.test.ts has unused `i` vars; several plugin/src files fail Prettier formatting. These are outside the current task scope.
- **[unresolved_action]** required_main_agent_actions: Review the checkpoint commit and decide whether the plugin files should stay in this task's checkpoint.
- **[archive_only_evidence]** decisions: Verified existing implementation rather than rewriting — The bin/adv roadmap command, bin/lib/roadmap.ts, and bin/lib/roadmap.test.ts were already present at HEAD from the prior checkpoint (ee1d86c2). No diff was required. I verified the behavior with unit tests and a live CLI query against the systemizeAdvOrchestration Epic.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: adv_task_checkpoint committed dirty plugin files under this task's checkpoint because the bin files were already clean in HEAD. Those plugin changes belong to earlier tasks in the same change and were not part of this task's scoped bin-only work.
- **[archive_only_evidence]** verification: bun test bin/ (0) — 300 pass, 0 fail, 1374 expect() calls; covers shell/backlog [ctx] marker behavior
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bin-test-suite-2026-07-23
- **[report_follow_up]** follow_ups: Checkpoint adv_task_checkpoint committed all dirty files in the worktree, not only the three files staged for this task. Other touched files (bin/adv, bin/lib/roadmap.*, plugin/src/storage/store-types.ts, plugin/src/tools/backlog-shell.ts, plugin/src/tools/epic.ts, plugin/src/utils/backlog-store.ts) belong to parallel tasks in the same change.
- **[archive_only_evidence]** decisions: Queried active Epics only for future_work shells — Future-work inventory is semantically active work; archived/merged Epics should not surface future shells
- **[archive_only_evidence]** decisions: Included future_work in summary, health, and hygiene views; omitted from changes view — Matches peer overview-section projection patterns (terminal_cleanup_retained) and keeps the changes view focused on active changes
- **[archive_only_evidence]** decisions: Wrapped Epic and backlog reads in best-effort try/catch — Status must remain available even if optional future-work data sources fail
- **[archive_only_evidence]** decisions: Defined has_context_packet as Object.keys(packet).length > 0 — Task requires non-empty context_packet; an empty object is not a meaningful packet
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/status.test.ts (0) — All 60 tests pass, including 3 new future_work projection tests
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (0) — TypeScript typecheck passes with no errors
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: vitest-status-test-tk-5db2144410df
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tsc-status-tk-5db2144410df
- **[archive_only_evidence]** decisions: Implemented context_packet as z.unknown().optional() in tool args schemas and validated via parsePacket/assertPacketSize in handlers — Keeps schema loose (raw input) so per-field bound errors come from the shared validation utility, satisfying the contract
- **[archive_only_evidence]** decisions: Enforced Epic aggregate cap in adv_epic_add_shell by loading the Epic and calling assertEpicAggregatePackets(existingShells, incomingBytes) before addShell — AC7/SC1 requires the 256 KiB aggregate budget to be checked at shell-add time
- **[archive_only_evidence]** decisions: Returned structured tool errors with codes invalid_context_packet / context_packet_too_large / epic_aggregate_context_packets_exceeded instead of letting exceptions propagate — MCP tool contract requires typed failures, not uncaught throws
- **[archive_only_evidence]** verification: pnpm exec vitest run src/__tests__/backlog-shell.test.ts src/tools/epic.test.ts src/__tests__/backlog-epic-bridge.test.ts src/utils/context-packet-validation.test.ts (0) — 99 tests passed; context_packet persistence, invalid/oversize, and Epic aggregate cap covered
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit passed
- **[archive_only_evidence]** verification: pnpm run schemas:check (0) — JSON schemas up to date
- **[archive_only_evidence]** verification: pnpm run lint (0) — eslint src/ passed
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-green-1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-typecheck-1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-schemas-1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-lint-1
- **[archive_only_evidence]** decisions: Inject the shell's context_packet into the proposal.md seed as a structured Future-Work Context appendix during adv_epic_promote_shell when a new change is created. — AC4 requires the packet's background, design_seed, references, constraints, and avoidances to reach the generated proposal seed.
- **[archive_only_evidence]** decisions: Re-validate packet size with assertPacketSize before rendering; catch ContextPacketTooLargeError and emit an omission placeholder instead of crashing. — SC2 requires bounded injection; defensive handling keeps promotion safe even if an oversized packet somehow reaches the shell.
- **[archive_only_evidence]** decisions: Added the context-packet appendix after the existing Scope section and left the original Intent/Scope/Problem/Success Criteria sections untouched. — Requirement: additive, structured, no clobbering.
- **[archive_only_evidence]** decisions: Formatted plugin/src/tools/status.test.ts with Prettier. — Prior task in this branch left it unformatted, causing pnpm run check to fail. Formatting-only change with no logic edits.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/epic.test.ts --reporter=verbose (0) — RED: 2 new context_packet injection tests failed before implementation (77 total, 2 failed).
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/epic.test.ts --reporter=verbose (0) — GREEN: 77/77 tests pass after implementation, including 3 new promotion/proposal-seeding tests.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check all pass.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: epic-test-red
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: epic-test-green
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: check-suite
- **[report_follow_up]** follow_ups: Episode advisory recall was unavailable on the active tool surface.
- **[report_follow_up]** follow_ups: After C1 remediation, verify target_path hints do not bypass normal target_confirmed and confirmationEvidence checks required by AC9.
- **[research_citation]** sources: Approved agreement and design: C1 requires a ≤16 KiB packet and ≤256 KiB per-Epic aggregate; AC1–AC9 define additive schemas, seed injection, status/CLI, agent-mediated backlog transfer, and target-path reauthorization. (adv://change/addDurableChangeSeeds/artifacts/agreement@0ae330b790831b99721c8692558532bd2dd26322ee5e49e8a1c606a1a399d3e9;design@7afb1d6f57f7d8fad1bbfbc2333bf1d0d6ec3c25c9739e12849b5f2ccd5b8559)
- **[research_citation]** sources: Advance Epics specification: Shell entries require title and success hint, support provenance, and remain lightweight/promotable. (adv://spec/advance-epics#rq-epicEntries01)
- **[research_citation]** sources: Backlog specification: Backlog rows are independently Zod-validated JSONL records and promotion appends lifecycle state. (adv://spec/backlog#rq-backlogFormat01,rq-backlogLifecycle01)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Shared optional packet schemas plus additive projection and CLI surfaces are the simplest spec-compatible shape. C1 is not met because the design maps the per-Epic budget to a Change-document guard that cannot observe Epic-shell packets.
- **[unresolved_action]** validation.blockers: DDC3 relies on AGGREGATE_HARD_CAP for the per-Epic packet budget, but that guard sums only Change state.documents while EpicSchema permits an unbounded entries array.
- **[epic_terminal_note]** epic.membership: systemizeAdvOrchestration · Add durable change seeds (order 13)

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
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |

## Unresolved Actions

- Restore or recreate the ADV worktree for change addDurableChangeSeeds and re-spawn adv-engineer on task tk-c59149a602d5.
- Working directory disappeared
- verification_missing: No durable adv_run_test evidence found for run_id: workdir-preflight-fail
- Review the checkpoint commit and decide whether the plugin files should stay in this task's checkpoint.
- finish_owned_scope_then_report: adv_task_checkpoint committed dirty plugin files under this task's checkpoint because the bin files were already clean in HEAD. Those plugin changes belong to earlier tasks in the same change and were not part of this task's scoped bin-only work.
- verification_missing: No durable adv_run_test evidence found for run_id: bin-test-suite-2026-07-23
- verification_missing: No durable adv_run_test evidence found for run_id: vitest-status-test-tk-5db2144410df
- verification_missing: No durable adv_run_test evidence found for run_id: tsc-status-tk-5db2144410df
- verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-green-1
- verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-typecheck-1
- verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-schemas-1
- verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-lint-1
- verification_missing: No durable adv_run_test evidence found for run_id: epic-test-red
- verification_missing: No durable adv_run_test evidence found for run_id: epic-test-green
- verification_missing: No durable adv_run_test evidence found for run_id: check-suite
- DDC3 relies on AGGREGATE_HARD_CAP for the per-Epic packet budget, but that guard sums only Change state.documents while EpicSchema permits an unbounded entries array.
