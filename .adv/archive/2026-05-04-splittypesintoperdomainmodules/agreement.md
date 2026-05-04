## Objectives

1. Eliminate the 1852-line `types.ts` mega-file in favor of per-domain modules.
2. Establish a barrel-pattern split that follow-on splits (`change.ts`, `worktree/index.ts`) can replicate.
3. Preserve all 76 import sites unchanged (zero import-site edits).
4. Maintain workflow-bundle boundary invariants.

## Acceptance Criteria

- **AC1** `plugin/src/types.ts` deleted; `plugin/src/types/` contains 8–13 domain files + `index.ts`.
- **AC2** All 76 import sites compile unchanged (no edits outside `types/`).
- **AC3** `pnpm test` passes (baseline: 1356+ tests); zero test-logic changes outside `types/`.
- **AC4** `pnpm run check` passes (typecheck + lint + format).
- **AC5** `pnpm run build` succeeds; `dist/index.js` within 755–835 KB (±5% of 794,944 B baseline).
- **AC6** `temporal/workflow-bundle-boundary.test.ts` passes — no forbidden imports introduced.
- **AC7** No circular imports between domain files (verified by `pnpm run typecheck`).
- **AC8** `src/types.test.ts` relocated to `src/types/index.test.ts`.
- **AC9** Each domain file ≤ 400 lines (soft hygiene; single domain may exceed if natural).

## Discovery Findings

- **D1 (partitioning):** DAG, no cycles. 9 leaf domains + 2 branch domains (`changes`, `agenda`) + 3 helper modules.
- **D2 (cyclic risk):** None. `Change → Task + Gates` unidirectional. `Agenda → Gates` unidirectional.
- **D3 (token budget):** `.opencode/token-budgets.json` tracks command files only. Soft 400-line target advisory.
- **D4 (test colocation):** Repo convention is colocated. `src/types.test.ts` → `src/types/index.test.ts`.
- **D5 (build baseline):** `dist/index.js` = 794,944 B (23,221 lines). ±5% = 755–835 KB.

## Proposed Domain Layout (subject to design refinement)

```
plugin/src/types/
├── index.ts          # barrel
├── specs.ts          # Priority, Scenario, Requirement, Spec, Dependency, Delta
├── tasks.ts          # TaskStatus, Task, TaskType, Cancellation, Tdd*, Attempt, ErrorRecovery, TaskRun*
├── gates.ts          # GateId, Gates, GateCompletion, GATE_DEFS, helpers
├── changes.ts        # Change, ChangeStatus, ReentryHistory, CrossProject*, ExternalDep, FastFollow, ClarifyFinding, BulkClose
├── wisdom.ts         # WisdomType, WisdomEntry
├── agenda.ts         # Agenda*, AGENDA_PRIORITY_ORDER
├── investment.ts     # InvestmentReport, JudgmentCall, ThresholdTier
├── project.ts        # ProjectConfig, ProjectMetadataEntry, RelatedRepo, FeatureFlags
├── conformance.ts    # Conformance*, EMPTY_CONFORMANCE_STATE
├── responses.ts      # SpecListResponse, ChangeListResponse, TaskReadyResponse, ProjectStatus, ChangeRecency
├── status.ts         # STATUS_MARKERS, StatusMarker
└── tdd-helpers.ts    # TDD_REQUIRED_PATTERNS, isLogicTask, isTrivialTask, hasCompleteTddEvidence, etc.
```

User approved 2026-05-04T06:28Z.