# Design

## Architecture Overview

This change is an audit-and-cleanup change, not a behavior rewrite. The durable output is an in-repo audit report plus safe local cleanup. Riskier findings become follow-up issues or agenda items.

The design preserves these boundaries:

- Core Temporal architecture remains unchanged.
- Workflow-reachable code receives comment-only changes, no imports, no control-flow changes, and no signal/query handler changes.
- Direct cleanup is limited to stale terminology, comments, docs/tool descriptions, and ignored generated local output if present.
- Behavior-changing work is filed separately.

## Key Decisions

1. **Use `docs/post-cutover-wide-system-audit.md` as the audit report path.**
   - Rationale: repo-tracked, discoverable, not an ADV instruction surface, no spec delta required.

2. **Apply comment-only cleanup for `safeUpdateHandler`; do not rename the symbol.**
   - Rationale: validator confirmed all references are file-local, but a rename in `workflows.ts` creates unnecessary workflow-file churn. The desired fix is clarity, not behavior.
   - Scope: JSDoc/comment wording only; no imports, no handler changes, no symbol rename.

3. **Limit PSW cleanup to clearly stale comments and file follow-up for `sourceVersion` lifecycle.**
   - Direct cleanup: `emitChangeSummarySignal` no-op comment and `dualWriteAfterMutation` JSDoc should no longer imply active projectWorkflow/PSW signal writes.
   - Follow-up: whether `sourceVersion` and memo PSW lifecycle comments/fields are vestigial after PSW retirement.

4. **Refresh worktree legacy terminology in exact files only.**
   - `plugin/src/tools/worktree/index.ts`: OCX/SQLite/legacy database comments.
   - `plugin/src/tools/worktree/launch-context.ts`: OCX launch-context comments if stale.
   - Avoid touching behavior or state schema.

5. **Provider eval output cleanup is conditional.**
   - If `scripts/provider-eval-results/` exists in the execution worktree and is ignored/untracked, remove it.
   - If absent, record no-op.

6. **Follow-up filing instead of implementation for risky findings.**
   - archived/terminal list timeout and state-shadow fragility
   - status/health TTL caching
   - projection/memo/sourceVersion lifecycle
   - dangling commit and branch reachability
   - target_path task mutation routing
   - large-file decomposition already tracked by #82/#83/#84
   - traceability/read-surface work already tracked by #99/#104

## Implementation Strategy

1. Create/reuse ADV worktree for repo mutations.
2. Add `docs/post-cutover-wide-system-audit.md` with:
   - scope and method
   - current state evidence
   - categorized findings by quality/architecture/performance/DX
   - direct cleanup completed
   - follow-up recommendations and duplicate reconciliation
3. Apply safe comment/docs cleanup:
   - `plugin/src/temporal/workflows.ts`: clarify `safeUpdateHandler` comments as signal-handler wrapper after Update removal; no rename.
   - `plugin/src/storage/store-temporal/index.ts`: refresh no-op PSW/projectWorkflow comments only.
   - `plugin/src/tools/worktree/index.ts` and possibly `plugin/src/tools/worktree/launch-context.ts`: replace stale OCX/SQLite wording with ADV/worktree terminology.
4. File/update follow-up work for findings not already represented.
5. Verify:
   - targeted source inspection for no imports/control-flow changes in workflow-reachable files
   - `pnpm run check` from `plugin/`
   - targeted tests only if touched code requires them; comments/docs should not require full suite, but workflow-boundary tests may be run if workflow source changed.

## LBP Analysis

LBP favors boring, evidence-backed cleanup inventory plus small safe fixes for a solo-maintainer internal system. Building a dashboard, replacing Temporal, or broadening this change into architecture work would add process/tooling overhead without matching current user needs.

The current Temporal signal/query design remains aligned with Temporal TypeScript best practice. The highest leverage work is to reduce confusion and make follow-up risk visible.

## Affected Components

Direct write candidates:

- `docs/post-cutover-wide-system-audit.md`
- `plugin/src/temporal/workflows.ts` comments only
- `plugin/src/storage/store-temporal/index.ts` comments only
- `plugin/src/tools/worktree/index.ts` comments only
- `plugin/src/tools/worktree/launch-context.ts` comments only if stale wording is present
- `scripts/provider-eval-results/` only if ignored/untracked generated output exists

Follow-up-only areas:

- `plugin/src/storage/store-temporal-memo.ts` sourceVersion lifecycle
- `plugin/src/tools/status.ts` health probe caching
- `plugin/src/tools/change.ts` / worktree/status decomposition
- cross-project task mutation tools
- archive branch/commit reachability

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Scope creep into behavior changes | Tasks explicitly separate direct cleanup from follow-up filing |
| Workflow file churn | Comment-only, no imports/control-flow/symbol rename |
| Duplicate issues | Reconcile against roadmap/agenda before filing |
| Validator caution about PSW/sourceVersion half-state | Direct cleanup only for clearly stale comments; sourceVersion lifecycle follow-up |
| Provider eval cleanup no-op | Conditional task; record absent directory as no-op |

## Validator Result

VERDICT: CAUTION

Resolved required changes before gate:

1. `safeUpdateHandler` plan changed to comment/JSDoc refresh only; no symbol rename.
2. PSW cleanup narrowed to clearly stale comments; `sourceVersion`/memo lifecycle becomes follow-up.
3. Provider eval cleanup made conditional because directory may not exist.
4. Workflow-reachable file safety explicitly stated: no imports, no control-flow changes, no handler changes.

No unresolved conflict. No contract-compromise risk.