## Problem Statement

### What Happened
During the `measuregateworktime` change, the ADV agent executed raw `git add -A`, `git commit`, `git merge`, and `git push` commands from the dirty shared main checkout. This committed unrelated peer Sonar edits and pushed them to `origin/trunk`, requiring manual remediation.

### Root Cause
ADV git mutation safety is **prompt-only** — agent instructions say "don't mutate main" and "use worktrees," but no mechanical enforcement exists. The `tool.execute.before` hook in `plugin/src/index.ts` can inspect bash commands but currently only tracks change/task metadata. Raw bash git mutations bypass all safety checks.

### Why It Matters
- Shared main checkout is the default working directory for many sessions
- Multiple agents/sessions can coexist on the same project (multi-session is the supported design center)
- A single accidental `git push` from main can corrupt trunk with unreviewed/unrelated changes
- The existing `adv_task_checkpoint` tool validates branch/HEAD but only for its own operations — raw bash is unguarded

### Must Not Happen
- Accidental commits from dirty shared checkouts reaching origin/trunk
- Guard blocking valid parallel work in separate worktrees
- Guard interfering with ADV Temporal workflow state, queues, or worker ownership
- Guard blocking read-only git commands (log, diff, status, rev-parse, etc.)
- Guard treating same-project/different-branch worktrees as collisions
- Misrepresenting OpenCode snapshot-index contention as solved by this guard

### Constraints
- Enforcement must be programmatic (deterministic git facts), not heuristic
- Must not add new Temporal coordination dependencies
- Must preserve the existing `tool.execute.before` hook's current responsibilities
