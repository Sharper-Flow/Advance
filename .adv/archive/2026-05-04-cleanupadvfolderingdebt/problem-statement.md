# Problem Statement

ADV's external state and worktree foldering has accumulated structural debt across several seams. The contract is sound — project-id-keyed external state plus per-branch worktrees — but execution has drifted, leaving silent disk growth, layout bugs, duplicate archive listings, and gaps in defensive guards.

## Concrete symptoms

| # | Severity | Symptom |
|---|---|---|
| F1 | HIGH | `reflections.jsonl` lands at `{ext}/.adv/reflections.jsonl` instead of `{ext}/reflections.jsonl`. |
| F2 | HIGH | Synthetic-id state/worktree dirs leak into the user's XDG tree because vitest writes synthetic project IDs with no cleanup hook. |
| F3 | MEDIUM | `worktree/{pid}/change/` and similar empty parent dirs persist after `git worktree remove` reaps the leaf. |
| F4 | MEDIUM | `db/spec.db` and `db_dir` path allocation remain despite Temporal-only runtime. |
| F5 | MEDIUM | Hardcoded `~/.local/share/opencode/worktree/` ignores `XDG_DATA_HOME`; `getExternalRoot()` honours it. |
| F6 | LOW | `worker.lock.releasing` lifecycle — out of scope; owned by `fixZombieWorkerLockTemporal`. |
| F7 | LOW | Defensive XDG-path guard exists in `recover-db.js` but not central resolvers. |
| F8 | LOW | `adv_status hygiene` and cleanup tools do not surface cross-project XDG debt. |
| F9 | MEDIUM | Archived change listings can duplicate rows because archive bundle dir names are unioned before canonical `change.json.id` de-dupe. |

## Desired outcome

Flat external-state layout; no synthetic test leaks; dry-run-first cleanup; XDG-compliant sibling worktree paths; retired `db/` allocation removed/deprecated safely; empty worktree parents reaped; tree-wide disk hygiene visible; archived listings canonical-id de-duped; XDG resolvers guarded.

## Out of scope

Worker-lock lifecycle, moving worktrees under ADV state, auto-deleting pre-existing artifacts without approval, and `.adv/specs/` semantic changes.
