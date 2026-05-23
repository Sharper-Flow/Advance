# Design

## Architecture Overview

This change makes worktree isolation structural and easier for agents by splitting gate completion into metadata-only gates and working-tree-impacting gates, while replacing retired registry read paths with one authoritative Temporal-backed worktree registry snapshot path.

The design has three core pieces:

1. Gate classification lives with gate domain types.
2. Worktree remediation uses supported session/worktree routing text instead of drifted per-surface strings.
3. Registry consumers read a Temporal-backed registry snapshot instead of retired `listWorktrees()` / `getChangeSummaries()` stub behavior.

No bypass flag is introduced. Code/git-mutating paths stay guarded.

## Key Decisions

### 1. Gate kind is a structural table

Add a gate-kind classification beside the canonical gate definitions in `plugin/src/types/gates.ts`:

- `metadata`: proposal, discovery, design
- `worktree_mutation`: planning, execution, acceptance, release

`adv_gate_complete` uses that classification so metadata gates can complete from main checkout when they only record workflow metadata. Mutation gates still delegate to the worktree isolation guard.

### 2. Task execution guard remains unchanged

Task add/update/execution mutation paths remain guarded. This change does not add bypass flags or weaken task execution isolation.

### 3. Remediation uses supported routing

Remediation text points agents at supported surfaces:

- Resume or create the ADV worktree with `adv_worktree_resume` / `adv_worktree_create`.
- Retry from inside the worktree session or use supported target-path routing where available.
- Do not suggest unsupported `workdir` arguments on `adv_gate_complete`.
- Do not suggest bypass flags.

### 4. Registry reads use one Temporal-backed snapshot path

Expose a narrow registry snapshot helper in `plugin/src/tools/worktree/state.ts` backed by Temporal visibility plus per-change workflow state.

Consumers migrate to the snapshot:

- `plugin/src/tools/worktree/triage.ts`
- `plugin/src/validator/file-overlap.ts`
- `plugin/src/utils/branch-integration.ts`
- `plugin/src/validator/merge-order.ts`

The snapshot returns materialized worktree records, change summaries, warnings, poisoned workflow evidence, and explicit unavailable state. Consumers must handle unavailable/warning state instead of treating retired empty stubs as authoritative.

### 5. Summary data is derived from workflow state

Touched-file summaries are derived from workflow `tasks[].touched_files` / `tasks[].filesTouched`. Branch summary selection is stable and prefers canonical `change/${changeId}` when multiple materialized worktrees exist.

## Implementation Strategy

- Update `.adv/specs/worktree-lifecycle/spec.json` to encode gate-impact semantics.
- Add `GATE_WORKTREE_IMPACT` and helper predicates in `plugin/src/types/gates.ts`; export them through `plugin/src/types/index.ts`.
- Update `plugin/src/tools/gate.ts` to allow metadata gates and keep mutation gates guarded.
- Update worktree isolation remediation builders/tests to remove invalid `workdir` guidance.
- Implement `getWorktreeRegistrySnapshot()` in `plugin/src/tools/worktree/state.ts`.
- Route compatibility `listWorktrees()` and `getChangeSummaries()` through the registry snapshot rather than silent stubs.
- Migrate triage, file-overlap, branch-integration, and merge-order to the snapshot helper.
- Add regression tests for classification, remediation text, triage recommendations, registry snapshot, unavailable/poisoned workflow handling, and migrated consumers.

## Validation Plan

- Focused red/green tests for gate classification and worktree isolation guard behavior.
- Focused tests for remediation text and absence of unsupported `workdir` / `--adopt` guidance.
- Registry snapshot tests for materialized records, compatibility views, unavailable state, poisoned workflows, touched-file summaries, and stable branch selection.
- Consumer tests for triage, file-overlap, branch-integration, and merge-order.
- Integrated `pnpm run check`, `pnpm test`, and strict change validation.

## Risks and Mitigations

- Risk: Metadata gate allowance accidentally weakens mutation gates. Mitigation: structural classification table plus regression tests for both allowed metadata gates and blocked mutation gates.
- Risk: Temporal visibility or per-change workflow query failures look like no worktrees. Mitigation: explicit unavailable/warning result path and consumer handling.
- Risk: Multiple worktrees per change produce unstable summaries. Mitigation: sorted entries and canonical branch preference.

## Out of Scope

- OpenCode cwd/session model changes.
- General cleanup deletion-policy rewrite.
- Sidecar SQLite/JSONL registry restoration.
- Any isolation bypass flag.