# Archive Briefing Digest

**Change ID:** addReplayReportBounds
**Title:** Add replay report bounds
**Status:** archived
**Generated:** 2026-07-13T16:18:55.515Z

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

Showing 78 of 78 durable facts.

- **[agenda]** follow_ups: Task tk-6a69a5e89523 (seenReportIds 200-ID FIFO-plus-total bound, AC3/AC4/AC5) is the remaining execution task and is intentionally not touched here.
- **[agenda]** follow_ups: Task tk-ceae6f3a6166 (verification) should run the full invariant battery (transition, schema-generation, size-cap, workflow-bundle-boundary, replay) once tk-6a69a5e89523 lands.
- **[unresolved_action]** required_main_agent_actions: Commit/checkpoint the staged worktree changes (6 fixture files + extended replay-determinism.test.ts + 3 reproducibility scripts).
- **[unresolved_action]** required_main_agent_actions: Proceed to task tk-6a69a5e89523 (seenReportIds bound), then tk-ceae6f3a6166 (verification).
- **[archive_only_evidence]** decisions: Generated histories by driving controlled changeWorkflow executions against the local Temporal dev server instead of hunting for pre-existing histories. — Default namespace has 24h retention and all 200 listed changeWorkflow executions are RUNNING on current code, so no clean pre-existing Path C (pre-state-backed) history exists; the design explicitly calls for driving controlled executions.
- **[archive_only_evidence]** decisions: Generated Path C (ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH) via a controlled legacy-branch variant (current workflows.ts with the STATE_BACKED_ACCEPTANCE_PROOF_PATCH else-if removed) rather than checking out the old commit. — The legacy branch is reachable only when the state-backed marker is absent; the pre-state-backed code is ~892 commits back and not independently buildable in-repo. The variant executes the preserved disk-inspect branch verbatim, so the recorded command sequence is authentic, and current code replays it through the legacy path (patch-ordering invariant). Fully documented in metadata provenance.
- **[archive_only_evidence]** decisions: Used stable changeId/workflowId (no timestamps) and seeded state via seedState so only the target gate's gateCompleted signal drives each branch. — Makes the committed histories reproducible with identity-only sanitization and keeps each history focused on its patch branch (no unrelated gate activity).
- **[archive_only_evidence]** decisions: Sanitized only the per-worker `identity` field to temporal-cli@replay-host and formatted fixtures through the prettier API in the finalizer. — Matches the existing fixture convention, keeps histories host-independent, verified replay-safe (each sanitized history re-validated with Worker.runReplayHistory), and makes regeneration produce prettier-compliant output so format:check stays green.
- **[archive_only_evidence]** verification: pnpm test -- src/temporal/__tests__/replay-determinism.test.ts (RED, before fixture files committed) (1) — RED: fixtures 1-3 failed ENOENT (files not yet committed); legacy fixture 0 (TMPRL1100) passed, confirming existing coverage intact. runId tr_mrioypmu_abac9358
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/replay-determinism.test.ts --reporter=verbose (final GREEN) (0) — GREEN: all 4 fixtures pass Worker.runReplayHistory against current workflows.ts (legacy TMPRL1100 + state-backed-gate-artifact + state-backed-acceptance + acceptance-executive-summary). runId tr_mripdxx2_51ade237
- **[archive_only_evidence]** verification: for each branch: pnpm exec tsx scripts/check-replay-history.ts <committed history> <workflowId> (0) — Each of the 3 committed (sanitized, prettier-formatted) histories independently replays OK via Worker.runReplayHistory, including Path C through the legacy disk-inspect branch.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit passes.
- **[archive_only_evidence]** verification: pnpm run lint && pnpm run format:check (0) — eslint src/ and prettier --check src/ both pass (fixture JSON formatted via prettier API).
- **[archive_only_evidence]** verification: pnpm exec tsx scripts/check-test-isolation.ts (0) — Test-isolation checker passes.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/temporal/__tests__/replay-determinism.test.ts (RED, before fixture files committed)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/replay-determinism.test.ts --reporter=verbose (final GREEN)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: for each branch: pnpm exec tsx scripts/check-replay-history.ts <committed history> <workflowId>
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run lint && pnpm run format:check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx scripts/check-test-isolation.ts
- **[archive_only_evidence]** decisions: Changed duplicate report path to leave seenReportIds completely unchanged — Design requires 'duplicate paths leave retained IDs and total unchanged'. The previous code re-added evicted IDs to seenReportIds, which would cause unnecessary eviction of other IDs and violate the bound. The sidecar (subagent_reports) remains the authoritative duplicate-detection fallback after FIFO eviction.
- **[archive_only_evidence]** decisions: Added seenReportIdsTotal as additive-optional (undefined by default) — Replay-safe for histories predating the field, mirroring the signal_rejections_total pattern. Existing workflows without the field continue to replay cleanly; total counts only newly accepted reports after the bound was introduced.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/change-state.test.ts src/types/changes.signal-fields.test.ts (0) — 49 tests pass (RED→GREEN for 4 new tests)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/continue-as-new.itest.ts (0) — 3 tests pass including behavioral CAN round-trip for seenReportIds/seenReportIdsTotal
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/workflows.signal-handlers.test.ts -t "continues as new with every declared seedState field" (0) — Exhaustive seed-field coverage test passes with new seenReportIdsTotal field
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/workflow-bundle-boundary.test.ts src/temporal/__tests__/workflow-bundle-imports.test.ts (0) — 7 tests pass; workflow bundle boundary intact
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/replay-determinism.test.ts (0) — 4 replay fixture tests pass
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript compiles cleanly
- **[archive_only_evidence]** verification: pnpm run lint (0) — ESLint passes
- **[archive_only_evidence]** verification: pnpm run format:check (0) — Prettier formatting passes
- **[archive_only_evidence]** verification: pnpm run schemas:check (0) — Generated schemas match Zod definitions
- **[archive_only_evidence]** verification: bin/oc-test full (0) — 4,973 tests pass across 333 files
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts src/types/changes.signal-fields.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/continue-as-new.itest.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/workflows.signal-handlers.test.ts -t "continues as new with every declared seedState field"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/workflow-bundle-boundary.test.ts src/temporal/__tests__/workflow-bundle-imports.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/replay-determinism.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run lint
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[agenda]** follow_ups: During execution, choose the seenReportIds retention LIMIT above realistic max in-flight report volume so FIFO eviction cannot re-admit a still-relevant duplicate; keep the sidecar/task scan as authoritative dedupe.
- **[agenda]** follow_ups: Confirm the local Temporal dev server + `temporal` CLI are available in the execution environment; if history export is blocked, that is a STOP_WHEN source-access blocker per the change's no-fabrication boundary — do not synthesize fixtures.
- **[archive_only_evidence]** sources: Temporal TS SDK — patched()/deprecatePatch() semantics: patched() returns true when NOT replaying (always records a marker in new histories); during replay returns true only if the recorded history contains the same patchId marker, else false. New-code branch must sit at top of if-patched block.
- **[archive_only_evidence]** sources: Temporal TS SDK — Worker.runReplayHistories / runReplayHistory + JSON loading: Canonical replay-test harness: load history JSON (JSON.parse) and pass to Worker.runReplayHistories/runReplayHistory with a workflowBundle or workflowsPath. This is exactly the harness replay-determinism.test.ts already uses.
- **[archive_only_evidence]** sources: Temporal official — Versioning (TypeScript SDK): Non-determinism causes are 'adding, removing, or reordering await calls on Command-producing APIs such as Activities and timers. Each await is a yield point that affects the Command sequence.' Patching is required only for substantive Command-sequence changes.
- **[archive_only_evidence]** sources: Temporal skill-temporal-developer — versioning reference (safe vs unsafe changes): Explicit safe list: 'Changing activity implementations; changing arguments; retry policies; timer durations; adding new signal/query/update handlers (additive changes are safe); bug fixes that don't change Command sequence.' Unsafe list is Command-sequence only. Anti-pattern: 'Patching non-Command changes — unnecessary complexity.'
- **[archive_only_evidence]** sources: Temporal Community Forum — internal-only state changes: Maintainer confirmation: 'You can make changes to workflow code which will result in different internal state (different variable values, etc) without necessarily breaking determinism. However, if you were to change the order or type of commands based on that state, then determinism would again be broken.'
- **[archive_only_evidence]** sources: Temporal CLI PR #110 — replayable JSON export: 'temporal workflow show --output json' was made to produce replayable history. --no-json-shorthand-payloads (used by the existing fixture) preserves full payload fidelity for replay.
- **[archive_only_evidence]** sources: Temporal TS dev guide — durable execution replay testing: Official flow: run workflow to completion, `temporal workflow show --workflow-id <id> --output json > history.json`, then Worker.runReplayHistory over the JSON file. Adding activity/await events alters the Event History sequence and requires a fresh exported history.
- **[archive_only_evidence]** architecture_assessment: Two independent sub-questions. (A) Replay fixtures for the 3 uncovered live patch branches (STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH, ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH, STATE_BACKED_ACCEPTANCE_PROOF_PATCH at workflows.ts:975/1062/990). Each patched branch schedules NEW activity commands (writeArtifactActivity, inspectArtifactActivity, state-backed evidence path), so committing a replay fixture requires a real committed history that (1) contains the patch marker and (2) records the post-patch activity command sequence. The reproducible, replay-safe generator is the same one the existing single fixture used: drive a controlled changeWorkflow to the relevant gate on a local Temporal dev server so the new-branch is taken (patched()===true records marker + new activity events), then export via `temporal workflow show --output json --no-json-shorthand-payloads`, sanitize, and assert with Worker.runReplayHistory against ../workflows.ts. Fabricating/hand-editing event JSON is explicitly disallowed by the change's own rollback boundary and would not exercise real determinism. (B) seenReportIds FIFO retention: change-state.ts already carries an exact in-repo precedent — signal_rejections uses `[...existing, x].slice(-SIGNAL_REJECTION_RING_BUFFER_LIMIT)` + signal_rejections_total counter (change-state.ts:281-285), restored across continue-as-new via seedState (workflows.ts:657-661, 1725-1726). seenReportIds should mirror this: bounded slice + seenReportIds_total counter, seeded through continueAsNew (already carried at workflows.ts:1723).
- **[agenda]** follow_ups: Verify during planning that seenReportIdsTotal is added to both the ChangeWorkflowState schema Pick list (contracts.ts) and the seedState hydration block, not only the CAN seed write.
- **[agenda]** follow_ups: Consider a small comment at the reducer noting sidecar dedupe is the durable idempotency backstop once FIFO eviction can drop old IDs.
- **[archive_only_evidence]** sources: Temporal TS Versioning (official docs): Patch required only when a change causes non-deterministic replay, i.e. adding/removing/reordering await on Command-producing APIs (activities/timers). Each await is a yield point affecting the Command sequence. Internal state changes that produce no Command require no patch.
- **[archive_only_evidence]** sources: Temporal TS SDK patched()/deprecatePatch() source: patched() inserts a history marker; used to branch Command-producing code. Confirms markers exist to guard Command-sequence divergence, not pure in-memory data-structure changes.
- **[archive_only_evidence]** sources: Temporal CLI workflow show reference: `temporal workflow show --output json` produces replayable history for SDK replay; `--no-json-shorthand-payloads` emits raw payloads. Both flags in the design's export command are real and correct.
- **[archive_only_evidence]** sources: Temporal TS dev guide (replay testing): Canonical Worker.runReplayHistory(options, history, workflowId) usage from exported JSON history; adding events that alter the Event-History sequence causes replay failure — validating the fixture-per-branch strategy.
- **[archive_only_evidence]** sources: Local: workflows.ts CAN seed + hydration (590-672, 1723): seenReportIds is WRITTEN to the CAN seed (1723) and is in the seedState Pick list, but there is NO rehydration line (state.seenReportIds = input.seedState.seenReportIds) in the hydration block; signal_rejections(_total) ARE rehydrated (657-661). Latent pre-existing drop-on-restart bug AC5 must fix.
- **[archive_only_evidence]** sources: Local: change-state.ts reducer (1031-1060): Two seenReportIds write sites: duplicate/sidecar path (1040-1042) and new-accept path (1060). Both must apply slice(-200); total must increment only on the new-accept path to satisfy AC3/AC4.
- **[archive_only_evidence]** sources: Local: FIFO-plus-total reference pattern: SIGNAL_REJECTION_RING_BUFFER_LIMIT=20 with [...existing, x].slice(-LIMIT) plus signal_rejections_total++ (258,281-285) is the exact established shape the design mirrors; array-based deterministic, no Map/Set.
- **[archive_only_evidence]** sources: Local: seedState round-trip meta-test (1468-1485): Existing meta-test asserts only the WRITE side (`key: state.key`) — it does not assert rehydration, so it will NOT catch the missing seenReportIds hydration. A behavioral CAN round-trip test is required for AC5.
- **[archive_only_evidence]** architecture_assessment: Design is deterministic and patch-correct. Per official Temporal TS versioning guidance, a patch marker is required only for changes that alter the replay Command sequence (add/remove/reorder await on Command-producing APIs). seenReportIds slice(-200) + integer counter produce no Command and run inside the deterministic reducer, so NO new patch marker is correct (C2 satisfied). The FIFO-plus-total shape correctly mirrors the in-repo signal_rejections/_total ring-buffer precedent. Replay-fixture methodology (drive controlled workflow to each patched branch, export via `temporal workflow show --output json --no-json-shorthand-payloads`, replay via Worker.runReplayHistory) matches official CLI + SDK docs exactly; refusing to hand-author history is the correct determinism-preserving stance. Schema/CAN compatibility is sound EXCEPT one concrete gap: seenReportIds is written to the CAN seed but never rehydrated on restart (signal_rejections is), so AC5 ('CAN carries retained IDs') exposes a real latent drop-on-restart bug that this change must fix by adding the hydration line AND seenReportIdsTotal write+hydration. The existing seedState meta-test only checks the write side and will not catch it, so a behavioral CAN round-trip test is mandatory.
- **[wisdom_candidate]** wisdom_candidates: [pattern] For Temporal patch replay coverage, commit controlled real-history exports with metadata that names the patch ID, replay branch, and minimal sanitization; validate every pair through Worker.runReplayHistory.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/__tests__/continue-as-new.itest.ts src/temporal/__tests__/replay-determinism.test.ts src/types/changes.signal-fields.test.ts, bin/oc-test targeted -- src/temporal/workflow-bundle-boundary.test.ts, pnpm --dir plugin run check, pnpm --dir plugin run build:worker, git diff --check trunk...HEAD results=pass — Targeted suite: 4 files / 56 tests passed, including all four replay fixtures, FIFO/total, duplicate sidecar-after-eviction, and CAN round-trip tests. Workflow bundle-boundary: 6 tests passed. Schema check, typecheck, isolation/lockfile checks, lint, formatting, and Temporal worker build passed. git diff --check passed; worktree clean.
- **[unresolved_action]** required_main_agent_actions: Reconcile change/addReplayReportBounds with current origin/trunk in the ADV-managed worktree; do not archive the unreconciled branch.
- **[unresolved_action]** required_main_agent_actions: After reconciliation, rerun `bin/oc-test full` and `pnpm run check && pnpm run build`, inspect the final diff, then push/open or update the release PR and obtain its terminal CI/merge evidence before archive.
- **[wisdom_candidate]** wisdom_candidates: [convention] Release hardening should compare against origin/trunk (the repository default branch), not origin/main; the latter is absent here and can hide a stale release branch.
- **[archive_only_evidence]** verification: tests_run=git status --short && git diff --check, git merge-base --is-ancestor trunk HEAD; git rev-list --left-right --count trunk...HEAD, bin/oc-test full, pnpm run check && pnpm run build, git fsck --no-dangling results=pass — Worktree clean; git diff --check and git fsck passed. Full suite passed: 333 files, 4,973 tests. check passed schemas:check, typecheck, test-isolation, lockfile policy, lint, and format; build and Temporal worker bundle passed. Contract/static scan found no changed patch marker, command-producing API, Map/Set, nondeterministic workflow call, threshold/cap, signal, or query alteration. However ancestry check proves release branch is stale: 2 ahead / 8 behind trunk.
- **[unresolved_action]** required_main_agent_actions: Resolve the origin/trunk Prettier failures in plugin/src/tool-name-assets.test.ts and plugin/src/utils/tool-arg-preflight.test.ts in the appropriate hygiene scope; they are outside this change's replay/report-bound contract.
- **[unresolved_action]** required_main_agent_actions: After baseline repair is reconciled, rerun `pnpm --dir plugin run check` and release hardening before completing release/archive.
- **[unresolved_action]** required_main_agent_actions: Do not revisit replay fixtures, FIFO-plus-total state handling, schema projection, or continue-as-new plumbing unless the rerun exposes a new regression.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When invoking root bin/oc-test, its target paths are resolved inside plugin/; pass src/... paths, not plugin/src/... paths.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/__tests__/replay-determinism.test.ts src/temporal/__tests__/continue-as-new.itest.ts src/types/changes.signal-fields.test.ts, pnpm --dir plugin run build:worker, pnpm --dir plugin run check, git merge-base --is-ancestor origin/trunk HEAD && git diff --check origin/trunk...HEAD results=fail — Release-targeted verification passed: 4 files, 56 tests; all four replay histories ran through Worker.runReplayHistory; both continue-as-new cases passed; build:worker passed. HEAD f7c6a68 merges origin/trunk (35a4bd07), git status is clean, origin/trunk is an ancestor, and diff --check passed. Full check failed only Prettier on plugin/src/tool-name-assets.test.ts and plugin/src/utils/tool-arg-preflight.test.ts; both are identical to origin/trunk, so failure is upstream baseline, not this change.
- **[unresolved_action]** required_main_agent_actions: Release gate remains pending; proceed with normal release/archive orchestration. No reviewer remediation or contract re-entry needed.
- **[unresolved_action]** required_main_agent_actions: Do not revisit replay fixture provenance, FIFO bound, signal/query contracts, or formatting-only commit 9e94940c unless a new release-stage failure supplies contrary evidence.
- **[wisdom_candidate]** wisdom_candidates: [success] Replay-release hardening stays evidence-backed when committed histories carry reproducible controlled-workflow export provenance, branch-specific coverage, marker assertions, and Worker.runReplayHistory coverage.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir plugin run check, bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts src/temporal/change-state.test.ts src/types/changes.signal-fields.test.ts, bin/oc-test targeted -- src/temporal/__tests__/continue-as-new.itest.ts, git diff --check origin/trunk...HEAD, git status --porcelain results=pass — check passed schemas:check, typecheck, isolation/lockfile checks, lint, and Prettier format check. Targeted suite passed 53 tests: four Worker.runReplayHistory fixtures, 45 reducer tests including FIFO/total/duplicate paths, and four schema-field tests. Continue-as-new integration passed 3 tests, including preservation of seenReportIds and seenReportIdsTotal. Final diff checks and porcelain status were empty. The initial targeted invocation used repo-prefixed paths although oc-test runs from plugin/, exited 1 without discovering tests; corrected path invocation passed.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- Commit/checkpoint the staged worktree changes (6 fixture files + extended replay-determinism.test.ts + 3 reproducibility scripts).
- Proceed to task tk-6a69a5e89523 (seenReportIds bound), then tk-ceae6f3a6166 (verification).
- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/temporal/__tests__/replay-determinism.test.ts (RED, before fixture files committed)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/replay-determinism.test.ts --reporter=verbose (final GREEN)
- verification_missing: No adv_run_test evidence found for reported command: for each branch: pnpm exec tsx scripts/check-replay-history.ts <committed history> <workflowId>
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm run lint && pnpm run format:check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx scripts/check-test-isolation.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/change-state.test.ts src/types/changes.signal-fields.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/continue-as-new.itest.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/workflows.signal-handlers.test.ts -t "continues as new with every declared seedState field"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/workflow-bundle-boundary.test.ts src/temporal/__tests__/workflow-bundle-imports.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/replay-determinism.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm run lint
- verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- Reconcile change/addReplayReportBounds with current origin/trunk in the ADV-managed worktree; do not archive the unreconciled branch.
- After reconciliation, rerun `bin/oc-test full` and `pnpm run check && pnpm run build`, inspect the final diff, then push/open or update the release PR and obtain its terminal CI/merge evidence before archive.
- Resolve the origin/trunk Prettier failures in plugin/src/tool-name-assets.test.ts and plugin/src/utils/tool-arg-preflight.test.ts in the appropriate hygiene scope; they are outside this change's replay/report-bound contract.
- After baseline repair is reconciled, rerun `pnpm --dir plugin run check` and release hardening before completing release/archive.
- Do not revisit replay fixtures, FIFO-plus-total state handling, schema projection, or continue-as-new plumbing unless the rerun exposes a new regression.
- Release gate remains pending; proceed with normal release/archive orchestration. No reviewer remediation or contract re-entry needed.
- Do not revisit replay fixture provenance, FIFO bound, signal/query contracts, or formatting-only commit 9e94940c unless a new release-stage failure supplies contrary evidence.
