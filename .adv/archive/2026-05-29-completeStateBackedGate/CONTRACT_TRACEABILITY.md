# Contract Traceability

**Change ID:** completeStateBackedGate
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-29T04:38:18.815Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | workflows.signal-handlers.test.ts 'completes acceptance state-backed with no pre-existing disk file (AC1, AC5, AC7)' — acceptance gate reaches 'done' from state.documents.executiveSummary + state.artifacts metadata with no disk file. New STATE_BACKED_ACCEPTANCE_PROOF_PATCH branch in workflows.ts reads proof from state via stateBackedAcceptanceProof(). |
| AC2 | acceptance_criterion | pass | test | gate.test.ts 'poisoned-history acceptance recovery writes disk projection' + recovery suite pass unchanged. git diff 8408c1cf..HEAD shows gate.ts and _recovery-writers.ts have ZERO diff — recovery path inspectArtifactActivity + hash comparison fully preserved per C2/C4. |
| AC3 | acceptance_criterion | pass | test | workflows.signal-handlers.test.ts 'checks state-backed acceptance patch before the legacy disk-inspect patch (AC3)' — asserts wf.patched(STATE_BACKED_ACCEPTANCE_PROOF_PATCH) precedes wf.patched(ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH) so old histories fall through to legacy branch deterministically. workflow-bundle-boundary.test.ts + workflows.test.ts pass. |
| AC4 | acceptance_criterion | pass | test | archive.test.ts 'archives cleanly when the source change dir is absent (legacy/no-disk safe)' + 'includes executive-summary.md and acceptance.md from the source change dir in the bundle'. Legacy on-disk acceptance handled via same readdir sibling-copy path in createInRepoArchive. |
| AC5 | acceptance_criterion | pass | test | New no-disk acceptance test through full workflow signal path (workflows.signal-handlers.test.ts). Existing acceptance pattern tests extended/updated to state-backed model (acceptance-projection test seeds state.documents; stale-hash test reframed to state-missing-content blocker). Full suite pnpm test --maxWorkers=4 exit 0. |
| AC6 | acceptance_criterion | pass | test | docs/temporal-recovery.md updated: State-backed acceptance note added to poisoned-history-recovery distinction section; 'Stuck ... gates' section title+symptom+procedure extended to acceptance/executive-summary.md. workflows.ts inline comments explain state-backed vs recovery division + STATE_BACKED_ACCEPTANCE_PROOF_PATCH rationale + deprecation plan. |
| AC7 | acceptance_criterion | pass | test | State-backed acceptance branch materializes executive-summary.md + acceptance.md to active change dir via writeArtifactActivity (proxy kind union extended with executiveSummary). archive.test.ts confirms createInRepoArchive readdir-copy includes executive-summary.md in bundle. workflows.signal-handlers no-disk test asserts executive-summary.md readable on disk after acceptance. |
| AC8 | acceptance_criterion | pass | test | contract.test.ts 'adv_contract_mint uses Temporal-fresh agreement over stale disk (AC8)' — Temporal-fresh agreement (3 contract items) used over stale disk (2 items). readAgreement now delegates to readArtifact(store, change.id, 'agreement') Temporal-first → disk → archive. No import cycle (change.ts does not import contract.ts). Unused readFile/join imports removed. |
| AC9 | acceptance_criterion | pass | test | changes.test.ts 'invalidates change cache after updateArtifacts (AC9)' — invalidateChange(changeId) now called (was 0 in RED). Single invalidateChange call added before return in updateArtifacts, matching save/close/refresh/bulk-close. Root cause of stale-contract symptom. |
| C1 | constraint | respected | static_check | No production-write disk dual-write added. fireContentSignalsSequentially unchanged. AC7 materialization is a separate one-time acceptance-gate lifecycle (mirrors existing acceptance.md write). no-disk-writes-invariant test passes in full suite (exit 0). |
| C2 | constraint | respected | static_check | git diff 8408c1cf..HEAD shows activities.ts has ZERO diff — inspectArtifactActivity interface + implementation unchanged. Only its non-recovery acceptance use-site changed (now state-backed). |
| C3 | constraint | respected | static_check | All workflow changes gated behind STATE_BACKED_ACCEPTANCE_PROOF_PATCH marker. AC7 writeArtifactActivity(executiveSummary) sits inside the new patched branch. AC3 patch-ordering test + workflow-bundle-boundary determinism guards pass. |
| C4 | constraint | respected | static_check | git diff --stat 8408c1cf..HEAD: only 4 fix surfaces + tests + docs touched (9 files). Recovery path (gate.ts, _recovery-writers.ts) zero diff. inspectArtifactActivity (activities.ts) zero diff. AC8 limited to readAgreement (contract.ts +27 lines incl import). AC9 single invalidateChange call (changes.ts +9). Not broadened. |
| C5 | constraint | respected | static_check | All edits made in change worktree /home/jon/.local/share/opencode/worktree/.../change/completeStateBackedGate on branch change/completeStateBackedGate. No trunk edits. Each task git-checkpointed in worktree. |
| C6 | constraint | respected | static_check | TDD red→green across all 3 fix surfaces: AC9 (RED tk-846d, GREEN tk-9498), AC8 (RED tk-8699, GREEN tk-ecf0), AC1/5/7 (RED tk-926f, GREEN tk-8c1f). Each RED confirmed failing before GREEN. Targeted + full suite (exit 0) pass before review. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-846d583d45dd |  | AC9 | C6 |  |
| tk-94986affe9a1 | AC9 |  | C4, C6 |  |
| tk-86999763efe3 |  | AC8 | C6 |  |
| tk-ecf010403ffe | AC8 |  | C4, C6 |  |
| tk-926fd197fa7a |  | AC1, AC5 | C6 |  |
| tk-8c1f75224607 | AC1, AC3, AC7 |  | C2, C3, C4, C6 |  |
| tk-716366e248b8 |  | AC2, AC3 | C6 |  |
| tk-0b42dbca9450 |  | AC4, AC7 | C6 |  |
| tk-fab242837980 | AC6 |  |  |  |
| tk-5da91a4bb404 |  | C1, C6 | C2, C4, C5 |  |
