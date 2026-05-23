# Agreement: Fix audit hygiene

## Objectives

1. Restore complete, order-independent active-change listing.
2. Keep status/list task counts and last activity consistent with full change state.
3. Prevent synthetic ADV test project/worktree directory accumulation.
4. Correct OpenCode DB path handling for session-debt diagnostics.
5. Reduce WIP poisoned-workflow noise while retaining recovery evidence for relevant workflows.

## Acceptance Criteria

- AC1: A test proves `listResolvedChanges()` cannot return only memo entries when other active changes exist in visibility/disk sources.
- AC2: A test proves status/list task counts for a previously completed-task change are not flattened to `0/0` by summary conversion.
- AC3: Synthetic cleanup tests prove stale `0000000000000000*` dirs can be safely reaped and real project IDs are preserved.
- AC4: Hygiene status reports zero synthetic dirs on this machine after cleanup verification.
- AC5: OpenCode session-debt tests cover relative `OPENCODE_DB` and canonical fallback/diagnostic behavior.
- AC6: WIP/worktree tests cover poisoned workflow handling without over-reporting workflows that do not own active worktrees.
- AC7: `pnpm run check`, `pnpm test`, and `pnpm run build` pass from `plugin/`.

## Constraints

- Use structural source-backed fixes and tests, not prose-only guidance.
- Preserve explicit recovery evidence for actual poisoned-history workflows.
- Preserve safe destructive boundaries: no automatic deletion of non-synthetic or real project state.
- Keep runtime changes compatible with Bun host and Node/Vitest tests.

## Avoidances

- Do not terminate/reset existing Temporal workflows as part of implementation.
- Do not add heavyweight telemetry infrastructure.
- Do not broaden cleanup to arbitrary `.local/share/opencode` paths.
