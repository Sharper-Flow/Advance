## Design: programmaticGitMutationGuard (v2 — refined after CAUTION validation)

### Architecture: Layered Guard

Two enforcement layers:

**Layer 1: `tool.execute.before` Bash Guard** (new module: `plugin/src/tools/git-guard.ts`)
- Intercepts `input.tool === "bash"` in the hook
- Multi-pass command analysis pipeline:
  1. **Split on shell operators** — parse `args.command` on `&&`, `||`, `;`, `|` to extract individual command segments
  2. **Git subcommand extraction** — for each segment matching `^\s*git\s+`, extract the first positional arg (the subcommand)
  3. **Alias resolution** — resolve unrecognized subcommands against cached alias map from `git config --get-regexp '^alias.'` (cached per session, refreshed on cache miss or 5min TTL)
  4. **Classification** — map resolved subcommand to {MUTATION, STAGING, READ_ONLY, WORKTREE_MGMT}
  5. **Git fact checks** — only when a MUTATION or STAGING command is detected, run: `git rev-parse --show-toplevel`, `git rev-parse --abbrev-ref HEAD`, `git status --porcelain`
  6. **Decision** — apply ALLOW/BLOCK/WARN matrix based on context

- Workdir resolution priority: (1) `-C`/`--git-dir` flags in command string, (2) `args.workdir`, (3) project root
- Short-circuit: if no segment contains a git mutation keyword, return ALLOW immediately (no git subprocess calls)

**Layer 2: ADV Wrapper Validation** (existing, no new code)
- `adv_task_checkpoint` already validates branch/HEAD/repo state
- Archive flow already documents main-checkout invariant
- These use `runGit`/`execGit` (Node child_process), not bash — already validated

### Command Analysis Pipeline

```
Input: args.command (raw shell command string)
  │
  ├─ Step 1: Split on shell operators (&&, ||, ;, |)
  │   → segments: string[]
  │
  ├─ Step 2: For each segment, check for git invocation
  │   → /(?:^|\s)git\s+(\S+)/ → subcommand token
  │
  ├─ Step 3: Classify subcommand (with alias resolution)
  │   → MUTATION | STAGING | READ_ONLY | WORKTREE_MGMT | UNKNOWN
  │
  ├─ Step 4: If only READ_ONLY + WORKTREE_MGMT → ALLOW (fast path)
  │
  ├─ Step 5: If MUTATION or STAGING → run git fact checks
  │   → GuardContext { workdir, gitRoot, branch, isDefaultBranch, isDirty, isWorktree, dirtyFiles }
  │
  └─ Step 6: Apply decision matrix
      → ALLOW | BLOCK | WARN
```

### Git Mutation Pattern Classification

| Category | Subcommands | Default Policy |
|----------|------------|---------------|
| **MUTATION** | `commit`, `merge`, `rebase`, `push`, `reset` (--hard/--mixed), `cherry-pick`, `revert`, `amend` (via `commit --amend`) | Block if unsafe |
| **STAGING** | `add`, `rm`, `mv`, `stash` (push/pop/drop/clear) | Block if unsafe context |
| **READ_ONLY** | `log`, `diff`, `status`, `rev-parse`, `show`, `branch` (-l/--list), `worktree list`, `remote` (-v), `config` (--get/--list), `ls-files`, `ls-tree`, `describe`, `tag` (-l), `blame`, `shortlog`, `reflog`, `grep`, `count-objects`, `fsck`, `cat-file`, `name-rev` | Always allow |
| **WORKTREE_MGMT** | `worktree add/remove/list/lock/unlock/move/repair` | Always allow (managed by ADV tools) |
| **UNKNOWN** | Any subcommand not in above categories + unresolved aliases | WARN (log + allow) |

### Decision Matrix

| Context | MUTATION | STAGING | READ_ONLY | UNKNOWN |
|---------|----------|---------|-----------|---------|
| ADV worktree | ALLOW | ALLOW | ALLOW | WARN |
| Main + clean + default branch | ALLOW | ALLOW | ALLOW | WARN |
| Main + dirty | **BLOCK** | **BLOCK** | ALLOW | WARN |
| Main + push command | **BLOCK** (need commit-range) | n/a | ALLOW | WARN |
| Non-ADV non-main branch | WARN | WARN | ALLOW | WARN |
| Cannot determine context | WARN | WARN | ALLOW | WARN |

### Guard Context Resolution

```typescript
interface GuardContext {
  workdir: string;           // resolved working directory (from -C/args.workdir/project root)
  gitRoot: string;           // git rev-parse --show-toplevel
  branch: string;            // git rev-parse --abbrev-ref HEAD
  isDefaultBranch: boolean;  // compared against getDefaultBranch()
  isDirty: boolean;          // git status --porcelain non-empty
  isWorktree: boolean;       // cross-referenced with ADV worktree registry
  dirtyFiles: string[];      // parsed from porcelain output
}
```

### Alias Resolution

```typescript
interface AliasCache {
  aliases: Map<string, string>;  // alias name → expanded subcommand
  fetchedAt: number;             // epoch ms
  ttl: number;                   // ms (default 300000 = 5min)
}

// On UNKNOWN subcommand:
// 1. Check cache. If expired or empty, run git config --get-regexp '^alias.'
// 2. Parse each line: "alias.ci commit" → Map{"ci" → "commit"}
// 3. Resolve alias to base subcommand (handle chained aliases: alias.cp cherry-pick)
// 4. Re-classify resolved subcommand
// 5. If still UNKNOWN after resolution → WARN
```

### Residual Risk (Documented)

**Accepted limitations of the guard:**
1. Shell aliases/functions (`.bashrc` `gcmsg`, etc.) — fundamentally undetectable from plugin hook
2. Git commands inside scripts (`bash ./deploy.sh`) — guard sees only `bash ./deploy.sh`, not contents
3. `GIT_DIR`/`GIT_WORK_TREE` env vars — not inspectable from `args.command`
4. Pipes to `git` (`echo y | git ...`) — handled by segment splitting

**Mitigation:** ADV instruction surfaces already prohibit raw-bash git mutations. The guard enforces this at the structural layer for detectable patterns. Shell-level bypasses remain instruction-governed.

### Error Messages

Blocked mutations produce actionable errors:
```
Git mutation blocked: "git push" from main checkout requires commit-range verification.
→ Use adv_task_checkpoint for scoped commits, or run from a worktree branch.
```

### Performance Safeguards

1. **Fast path:** No git mutation keywords → ALLOW immediately (zero subprocess calls)
2. **Lazy fact checks:** Only run `git status --porcelain`, `rev-parse`, etc. when MUTATION/STAGING detected
3. **Alias cache:** 5-minute TTL, populated on first UNKNOWN subcommand
4. **No Temporal calls:** Guard is purely local git + worktree registry lookup

### File Impact

| File | Change |
|------|--------|
| `plugin/src/tools/git-guard.ts` | NEW — guard logic module (~200-300 lines) |
| `plugin/src/tools/git-guard.test.ts` | NEW — unit tests (~400-500 lines) |
| `plugin/src/index.ts` | MODIFY — wire guard into `handleToolExecuteBefore` (~5 lines) |
| `plugin/src/integration.test.ts` | MODIFY — hook-level bash interception test (~50 lines) |
| `.adv/specs/advance-meta/` | DELTA — must-not constraints for git mutation safety |
| `ADV_INSTRUCTIONS.md` | UPDATE — enforcement layers section |

### Spec Requirements (New)

**advance-meta** — new requirement:
> rq-gm01: The plugin MUST intercept bash-tool git mutations via the `tool.execute.before` hook and enforce worktree-scope and dirty-tree constraints. Raw-bash `git commit/push/merge/rebase` on non-worktree checkouts MUST be blocked with actionable error messages. The guard MUST handle git aliases (via config resolution), compound commands (via shell operator splitting), and `-C` flag overrides. Shell aliases/functions and script-internal git calls are accepted residual risk documented in specs.

### Non-Goals

- Guarding `execFile("git", ...)` from Node code (already validated in tool-layer)
- Guarding non-ADV projects (only activates when ADV plugin is loaded)
- Modifying OpenCode core snapshot behavior
- Detecting shell aliases/functions (fundamentally undetectable)