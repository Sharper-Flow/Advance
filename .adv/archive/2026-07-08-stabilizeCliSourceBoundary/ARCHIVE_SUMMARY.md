# Archive: Stabilize CLI source boundary

**Change ID:** stabilizeCliSourceBoundary
**Archived:** 2026-07-08T00:54:42.165Z
**Created:** 2026-07-07T22:57:44.211Z

## Tasks Completed

- ✅ Add advance-meta CLI source-boundary spec law
  > Added `rq-cliSourceBoundary01` to `advance-meta` and mirrored it in `docs/specs/advance-meta.md`. Requirement defines explicit root CLI plugin-source boundaries, forbids broad plugin internals via deterministic tests, preserves live Temporal fail-closed behavior, and avoids stale disk active-state fallback.
- ✅ Enforce CLI source boundary and consolidate Temporal imports
  > Added a root CLI plugin-source boundary test, introduced internal `plugin/src/cli/temporal-boundary.ts`, and updated only `bin/lib/live-status.ts` and `bin/lib/epic-list.ts` to use the new Temporal boundary. Existing Tier A `cli-projection` imports stayed intact. Boundary test includes bin-side allowlist and transitive forbidden-plugin-internal checks.
- ✅ Run CLI boundary compatibility verification
  > Ran final CLI boundary compatibility verification and incorporated acceptance-review hardening. Reviewer added dynamic import detection/regression coverage to `bin/lib/cli-source-boundary.test.ts`; all boundary/bin tests passed after the fix. Worktree checkpointed at af843af2deab75492043417dfece638753258587.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For root Bun CLI → plugin source boundaries, keep pure projection (`shared/cli-projection`) and live Temporal runtime surfaces as separate tiers. Tier A can stay zero-import; Tier B should be a narrow named boundary with transitive forbidden-import tests so live Temporal behavior is preserved without scattered deep imports.
