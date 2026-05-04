# Agreement

## Objectives

1. Fix all 31 identified instruction findings in one bundled change.
2. Preserve ADV safety contracts while removing contradictory/stale prose.
3. Add manifest-backed `phaseGoal` coverage where docs claim manifest canonicality.
4. Keep docs aligned with source truth: specs + current `plugin/src` implementation.
5. Apply voice cleanup piece by piece, balancing brevity with safety.

## Acceptance Criteria

1. C1-C3 + H1-H8 repaired with before/after evidence.
2. M1-M11 repaired or explicitly closed with rationale.
3. L1-L9 repaired or explicitly closed with rationale; voice-density cleanup handled piece by piece.
4. `ADV_INSTRUCTIONS.md` has no direct contradictions after final read-through.
5. `AGENTS.md` no longer claims stale command count or SQLite persistence.
6. `cost-governance.md` no longer presents `auto.*` as active tuning knob unless implementation confirms it is active.
7. `plugin/src/manifest.ts` has code-backed phaseGoal coverage consistent with Phase Goals doc claim.
8. Worktree-unavailable instruction hard-blocks mutating ADV work.
9. Verification passes: targeted asset tests, `pnpm test`, `scripts/sync-global.sh --check`.

## Constraints

- No spec changes.
- No direct reads of ADV state files.
- Work continues in isolated worktree `change/repair-adv-instructions-drift`.
- Preserve generated/provider asset boundaries.
- Avoid broad historical-doc rewrite unless a live instruction or test requires it.
- Mutating ADV work hard-blocks if worktree tooling is unavailable.

## Avoidances

- Do not rewrite workflow semantics.
- Do not expand into full prose-load-reduction project.
- Do not preserve graceful in-place fallback for mutating ADV work.

## Decisions

### User Decisions

| Decision | User choice | Why it matters |
|---|---|---|
| M9 Phase Goals | Add manifest phaseGoals | Makes the docs' manifest-canonicality claim true instead of weakening it. Adds scoped code/test work. |
| LOW-tier voice cleanup | Happy medium between conservative/aggressive; go piece by piece | Prevents both over-trimming safety nuance and leaving obvious redundancy untouched. |
| Worktree fallback | Hard block | Preserves per-change isolation for mutating ADV work and removes unsafe main-checkout fallback. |

### Agent Decisions (LBP)

| Decision | Agent resolution | Rationale |
|---|---|---|
| Drift source of truth | Specs + current code win over stale prose | Long-term best practice: live instruction surfaces should describe shipped behavior, not historical behavior. |
| Spec deltas | None | Existing specs already encode relevant workflow laws. This is doc/code metadata alignment. |
| Historical docs | Do not rewrite unless live instruction/test requires it | Avoids scope creep into archived/historical references. |

## Deferred Questions

None.

## Sign-Off

User approved acceptance criteria with `approve` on 2026-05-04.