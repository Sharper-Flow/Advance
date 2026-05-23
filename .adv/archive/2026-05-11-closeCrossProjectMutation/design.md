# Design — closeCrossProjectMutation

## Architecture Overview

This change completes the operational layer for product-linked cross-project ADV work without changing the shipped product-linking data model.

Design uses three layers:

1. **Target routing parity** — all task mutation tools that mutate change/task state use the existing `withTargetPathStore` target-store discipline.
2. **Same-shape dryRun** — destructive tools run validation and build their normal response, but mutation side effects are guarded behind `!dryRun`.
3. **CLI best-fit investigation** — non-LLM cross-project execution is designed as an evidence-backed outcome, not a blind implementation. Current evidence says OpenCode lacks a stable tool-execute endpoint and direct ADV CLI would duplicate runtime lifecycle; design records this and updates #71/F10 unless a safe implementation path is proven during design/prep.

## Key Decisions

### KD1 — Shared target_path schema fragment

Create a shared schema helper for the target-path argument family in `target-project.ts`:

```ts
export const targetPathSchema = z.object({
  target_path: z.string().optional().describe(...),
  target_confirmed: z.literal(true).optional().describe(...),
  confirmationEvidence: z.string().optional().describe(...),
});
```

Tools merge it into their arg schema. Runtime trust remains in `resolveTargetProject`, where relatedness is knowable.

Rationale:
- Prevents future schema omission drift.
- Keeps target trust logic centralized.
- Avoids Zod refinements that cannot know whether a target is trusted.

### KD2 — Add target_path to three holdout task tools only

Extend:
- `adv_task_add`
- `adv_task_cancel`
- `adv_task_reclassify_tdd`

Each follows established sibling pattern. Wrap the **entire** execute body in `withTargetPathStore` when `target_path` is present, so gate checks, task lookups, handle resolution, signals, and cache refresh all use the target store.

Rationale:
- Parity with `adv_task_update`, `adv_task_completed`, and `adv_run_test`.
- No new trust model.
- `fireSignalAndRefresh` receives the target store, preserving `rq-cacheRefresh01`.

### KD3 — dryRun is same-shape, no mutation

Add `dryRun?: boolean` to:
- `adv_change_close`
- `adv_change_bulk_close`
- `adv_change_reenter`
- `adv_task_cancel`
- `adv_worktree_delete`
- `adv_worktree_cleanup`
- `adv_conformance` unlock/override actions

DryRun behavior:
- run schema validation
- run relational validation where safe
- return normal response shape plus `dryRun: true`
- do not fire Temporal signals
- do not write files
- do not delete worktrees
- do not append conformance audit entries
- do not run worktree preDelete hooks

Rationale:
- Matches existing `adv_change_archive` precedent.
- Keeps UX simple and tool-compatible.
- Avoids separate plan artifacts in this change.

### KD4 — dryRun + target_path separates backend choice from mutation trust

When a tool supports both `dryRun` and `target_path`, target resolution must distinguish **state backend** from **mutation trust**.

Design adjustment:
- Add optional `mutation?: boolean` override to `WithTargetPathStoreInput`.
- Derive mutation as: `mutation: input.mutation ?? (input.stateRequirement !== "snapshot-ok")`.
- The override flows only to `resolveTargetProject`; it never changes `stateRequirement` or store selection.
- For dryRun paths needing current target state, call `withTargetPathStore({ stateRequirement: "temporal-required", mutation: false, ... })`.
- For real mutation paths, keep default behavior.

Rationale:
- DryRun is read-only and should not require mutation confirmation.
- Temporal-backed reads may be needed for accurate validation.
- Trust boundary remains unchanged: untrusted **mutations** require confirmation.

### KD5 — CLI work is investigation outcome, not required implementation

Design outcome for #71:
- Do **not** implement a CLI unless a safe runtime path is proven.
- Record researched blockers in `docs/f10-investigation.md` and #71.
- Current best-fit result: upstream `opencode tool <name>` remains the LBP path; ADV direct CLI is high-cost because it must own STSL, worker registration, store init, tool binding, permission hooks, and source-vs-dist semantics.

Implementation possibility remains only if design/prep identifies a thin wrapper around existing OpenCode runtime that:
- executes tools without LLM loop
- preserves plugin hooks / permissions / trunk firewall
- reuses existing worker lifecycle
- avoids duplicated runtime code

## ADR Drafts

### Candidate ADR: `docs/adr/NNNN-cross-project-tool-exec.md`

Decision: defer ADV-owned non-LLM CLI implementation until stable OpenCode tool-execute surface or proven safe runtime reuse path exists.

Status: candidate; prep should decide whether to materialize.

## Implementation Strategy

### Phase A — Target routing parity

1. Extract shared target path schema/helper in `target-project.ts`.
2. Refactor existing target-path tools to import shared shape where straightforward.
3. Add target_path family to holdout task tools.
4. For each holdout, split current execute body into `runX(activeStore, projectContext?)` closure.
5. Add tests using target project store fixture:
   - target store mutated
   - caller store untouched
   - untrusted target rejects without confirmation
   - related repo target succeeds without confirmation

### Phase B — same-shape dryRun

1. Add shared `dryRun` arg helper if useful.
2. Implement per-tool guard pattern:
   - validate first
   - compute response preview
   - if `dryRun`, return preview + `dryRun: true`
   - else run existing mutation
3. Tool-specific handling:
   - `adv_change_close`: validate approval/status/supersededBy; skip `changeCancelledSignal`.
   - `adv_change_bulk_close`: resolve full target set; fail-all on invalid/protected; skip all signals.
   - `adv_change_reenter`: validate change/gate; skip `gateReenteredSignal`.
   - `adv_task_cancel`: validate reasons/approval/task IDs; skip `taskCancelledSignal`.
   - `adv_worktree_delete`: run cleanliness/integration checks; skip hooks and deletion.
   - `adv_worktree_cleanup`: list queued deletions and what would be retried; skip deletion attempts.
   - `adv_conformance` unlock/override: validate required audit fields; skip save + signal.
4. Tests assert no signal/fs mutation for dryRun and existing behavior for real-run.

### Phase C — CLI investigation outcome

1. Update `docs/f10-investigation.md` with current evidence:
   - `/experimental/tool` list-only
   - tool execute PR closed/unmerged
   - #25478 still open
   - direct ADV CLI risks
2. Update GH #71 with current best-fit disposition.
3. If a safe path is discovered during design/prep, implement only after explicit design note update. Otherwise mark #71 as superseded/deferred, not implemented.

### Phase D — Specs/docs/dogfood

1. Add/extend spec requirements:
   - `rq-crossProjectTaskMutation01`
   - `rq-dryRunMutation01`
   - `rq-nonLlmToolExec01`
2. Update ADV instructions/tool matrix.
3. Dogfood with example-product ↔ example-web:
   - activate product link config outside this repo
   - run real cross-project dryRun and task mutation
   - capture evidence before archive

## LBP Analysis

- **Target routing parity** is LBP: correctness belongs in schemas/routing helpers, not agent memory.
- **Same-shape dryRun** is LBP for this codebase because `adv_change_archive` already established that contract and users selected it.
- **CLI deferral/investigation** is LBP: upstream OpenCode lacks stable execute surface; building runtime duplicate now increases long-term maintenance risk. Better outcome is evidence-backed deferral or proven reuse path.
- **Trust model preservation** is LBP: related repos are declared product boundary; untrusted paths still need explicit confirmation for mutation.

## Affected Components

| Component | Change |
|---|---|
| `plugin/src/tools/target-project.ts` | shared target args + mutation override for dryRun reads |
| `plugin/src/tools/task.ts` | target_path for add/cancel/reclassify; dryRun cancel |
| `plugin/src/tools/change.ts` | dryRun close/bulk/reenter |
| `plugin/src/tools/adv-worktree.ts` | dryRun delete/cleanup |
| `plugin/src/tools/conformance.ts` | dryRun unlock/override |
| Tests | cross-project routing + dryRun no-side-effect coverage |
| Specs/docs | new laws + F10 update + instruction matrix |

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Schema fragment refactor breaks existing tool arg types | Typecheck + targeted tests; keep fields optional |
| dryRun accidentally mutates state | tests spy on signal/fs/store calls; mutation guarded behind `!dryRun` |
| dryRun validation diverges from real-run validation | share validation path before mutation branch |
| target_path dryRun uses stale disk snapshot | mutation override allows Temporal-backed read without mutation trust |
| direct CLI scope creeps into runtime clone | AC4 + design explicitly allow documented deferral; prep tasks separate investigation from implementation |
| dogfood depends on external ExampleProduct repo readiness | make dogfood an acceptance/harden task; if blocked, archive blocks with clear external dependency |

## Validator Result

**VALIDATED** with implementation cautions.

Findings:
- Correctness: three holdout tools confirmed; design targets right gap.
- Correctness: same-shape dryRun matches existing archive precedent.
- Caution: `mutation?: boolean` override must affect only trust-gate resolution, not `stateRequirement` or store selection.
- Correctness: CLI deferral/investigation is architecturally sound given OpenCode/runtime evidence.
- Simplicity: shared schema fragment in `target-project.ts` is simplest non-drift approach.
- Spec-law: no conflicts found; design extends existing patterns.
- Alternatives: dryRun middleware and direct CLI alternatives considered and correctly rejected/deferred.

Validator recommendations incorporated:
1. `mutation: input.mutation ?? (input.stateRequirement !== "snapshot-ok")` with explicit comment.
2. `adv_task_add` wraps entire execute body so planning-gate lock check uses target store.
3. Export one `targetPathSchema` Zod object from `target-project.ts` and merge in tools.
