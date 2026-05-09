# Design

## Architecture Overview

Single-layer file-write firewall replacing the current 6-category git-command classifier. Both layers plug into the same `tool.execute.before` hook in `plugin/src/index.ts`. The new layer dispatches by tool-name into `checkTrunkWrite()` for `write`/`edit`/`morph_edit`/destructive-`bash`; all `git`-classified branches are removed.

```
┌─────────────────────────────────────────────────────────────┐
│ OpenCode tool invocation                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ plugin/src/index.ts :: handleToolExecuteBefore(tool, args)   │
│                                                              │
│   switch (tool) {                                            │
│     case "task": …  (existing — sub-agent counter)           │
│     case "question": …  (existing)                           │
│     case "write" | "edit" | "morph_edit":                    │
│       checkTrunkWrite(args.filePath, deps)  ← NEW            │
│     case "bash":                                             │
│       checkTrunkWriteBash(args.command, args.workdir, deps)  │
│           ← NEW (replaces checkBashCommand entirely)         │
│   }                                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ plugin/src/tools/trunk-write-firewall.ts (NEW, ~250 lines)   │
│                                                              │
│   checkTrunkWrite(targetPath, deps) → Decision               │
│   checkTrunkWriteBash(cmd, workdir, deps) → Decision         │
│                                                              │
│   resolveTrunkContext(workdir, deps)                         │
│     → {gitRoot, isDefaultBranch, isWorktree, recoveryState}  │
│                                                              │
│   isPathInTrunkCheckout(path, ctx)                           │
│   isPathInWorktree(path, worktreePaths)                      │
│   detectInProgressOp(gitRoot)                                │
│     → "merging" | "rebasing" | "cherry-picking" | "reverting"│
│       | "ok"                                                 │
│   classifyDestructiveBash(cmd) → list of write targets       │
└─────────────────────────────────────────────────────────────┘
                          ↓ throws on BLOCK
┌─────────────────────────────────────────────────────────────┐
│ Tool execution refused; agent receives blocking error        │
└─────────────────────────────────────────────────────────────┘
```

## Key Decisions

### KD1 — Single-layer enforcement on file-write tools

Replace 6-category git classifier with file-write-only firewall. Rationale: per agreement Q4 + LBP signal, the current guard adds friction every time a legitimate git operation fails to be enumerated. Blocking writes at the editing-tool layer makes every downstream git op inherently safe — the bug class disappears.

### KD2 — Comprehensive in-progress escape hatch (4 states)

Allow trunk file edits when ANY of `MERGE_HEAD` / `REBASE_HEAD` / `rebase-merge/` / `rebase-apply/` / `CHERRY_PICK_HEAD` / `REVERT_HEAD` exists. Per user decision Q1. Reuses pattern from `checkpoint.ts:115-148` (`detectRepoState`) — extend the same returns to include all 4 in-progress states, then the firewall short-circuits ALLOW for any non-`ok` non-`detached` state.

### KD3 — Reuse existing helpers (DRY)

The current guard's reusable helpers move to the new firewall:

| Existing | Source | Reuse for |
|---|---|---|
| `getDefaultBranch` | `utils/git.ts:38` | Default-branch detection |
| `parseWorktreePaths` | `tools/git-guard.ts:656` | Worktree-list parsing — extract into `utils/worktree-paths.ts` |
| `isSameOrChildPath` | `tools/git-guard.ts` (inline) | Path containment check — extract into `utils/path.ts` |
| `detectRepoState` | `tools/checkpoint.ts:115-148` | Extend to return rebase/cherry-pick/revert states; reuse in firewall |

This avoids reintroducing the duplication that caused the current 717-line surface.

### KD4 — Destructive-bash classifier scope (minimal, per Q3)

Match these patterns in `bash` commands writing to trunk-checkout paths:

| Pattern | Match approach |
|---|---|
| `> /path` or `>> /path` | Regex on shell redirects (after splitting on `&&`/`||`/`;`/`\|`) |
| `tee /path` | Argument extraction after `tee` token |
| `sed -i ... /path` | Argument extraction after `sed -i` |
| `cp src /path` | Last positional argument |
| `mv src /path` | Last positional argument |
| `rm /path` | Each positional argument |

Heredoc-stripping retained from current guard (port `stripHeredocs`). Indirect writes via shell variables, external scripts, `dd`, `truncate`, `install`, `python -c`, `node -e` are NOT detected — documented as accepted residual risk per agreement avoidances.

### KD5 — Spec lifecycle: retire-and-mint

`advance-meta/rq-gm01` (Bash Git Mutation Interception, 7 scenarios) is fully retired. New `advance-meta/rq-twf01` (Trunk Write Firewall, 7 scenarios) is minted in the same `advance-meta/spec.json` location. Per agreement Q4. Spec deltas:

- **Retire** — delete `rq-gm01` from `.adv/specs/advance-meta/spec.json:1210-1307`
- **Mint** — append `rq-twf01` with the 7 scenarios drafted in discovery report
- **Doc surface** — replace `<!-- rq-gm01 -->` annotated section in `ADV_INSTRUCTIONS.md:447-452` (per validator note 2) with new `<!-- rq-twf01 -->` Trunk Write Firewall section

### KD6 — AC8/AC9 are documentation, not new code (REVISED scope)

**Discovery during design:** Worktree config infrastructure already exists at `tools/worktree/index.ts`:

- **Infrastructure** (lines 1559-1653): `runHooks()`, `loadWorktreeConfig()`, `copyFiles()`, `symlinkDirs()`
- **Invocation during worktree creation** (lines 1859-1886): config loaded, copyFiles applied, symlinks created, postCreate hooks run
- **Default config** (lines ~227-241 / inline at line 1613): `copyFiles: []`, `symlinkDirs: []`, `hooks.postCreate: []`, `hooks.preDelete: []`

This was inherited from the worktree plugin absorption (`unifyworktreeunderadvmultisess`, archived 2026-05-02). **AC8 and AC9 are 80% complete already.**

**Remaining work:**

- AC8 (worktree-include): document the existing `.opencode/worktree.jsonc` `sync.copyFiles` mechanism in `docs/worktree-guide.md`. **Decision (per agreement KD6):** keep empty default + document. Auto-copying secret-bearing files surprises users; opt-in via doc-discovery is safer.
- AC9 (setup-hook): document the existing `hooks.postCreate` mechanism. No code changes; default `[]` is correct.
- AC10 (port-isolation): pure docs as originally agreed.

This drops AC8/AC9 from "feature implementation" to "documentation + 0 default-config changes". Substantially reduces planning + execution scope.

### KD7 — Hook-refusal contract verified

Throwing from `tool.execute.before` cleanly aborts the tool call with the thrown error message visible to the agent. Verified by current guard's behavior on `bash` and structurally identical for `write`/`edit`/`morph_edit` — same hook, same throw semantics. No special handling needed per tool name.

### KD8 — Issue #101 closure copy (per Q5)

Single comment on issue #101 at archive time:

> Closed as fixed by `replacegitguardwithtrunkwritef` (archive bundle: `.adv/archive/<date>-replacegitguardwithtrunkwritef/`). The friction reported here — post-merge sync of trunk via `pull --ff-only`, plumbing recovery, etc. — is resolved by replacing the git-command classifier guard with a file-write firewall. Git commands now run with zero ADV-imposed friction; only direct file edits to the trunk checkout on the default branch are blocked. See `ADV_INSTRUCTIONS.md § Trunk Write Firewall` for details.

## Implementation Strategy

7 phases, sequenced by dependency:

| # | Phase | Depends on | TDD shape |
|---|---|---|---|
| A | Extract reusable helpers | none | Move `parseWorktreePaths` + `isSameOrChildPath` to `utils/`; existing tests cover; no new tests needed |
| B | Extend `detectRepoState` to return rebase/cherry-pick/revert | A | Add 3 unit tests in `checkpoint.test.ts` |
| C | Build `trunk-write-firewall.ts` + tests (red→green) | A, B | New unit-test file ~30 cases covering AC2/3/4/5/6; pure-DI |
| D | Rewire `index.ts` hook dispatch | C | Update `integration.test.ts`: replace 7 git-guard hook tests with firewall hook tests |
| E | Delete `git-guard.ts` + `git-guard.test.ts` | D | Verification: zero references via grep gate |
| F | Spec lifecycle: retire `rq-gm01`, mint `rq-twf01` | none (parallel with A-E) | Edit `.adv/specs/advance-meta/spec.json`; update `advance-meta` version to 1.8.0; replace `ADV_INSTRUCTIONS.md:447-452` annotated section |
| G | Documentation: AC8/AC9/AC10 in `docs/worktree-guide.md` | E | No code; markdown only |
| H | Issue #101 closure | E, F, G (post-archive) | One `gh issue close` + comment |

Phases A-F are the core; phase G is the documentation deliverable; phase H is post-archive cleanup.

## LBP Analysis

Confirmed long-term best practice via the proposal's LBP signal (8+ peer AI tools + 3 hook ecosystems all use file/branch-write firewalls, never git-command classifiers):

| Aspect | This design | Peer ecosystem | Verdict |
|---|---|---|---|
| Enforcement layer | File-write tools (`write`/`edit`/`morph_edit` + destructive `bash`) | Same: PreToolUse hooks on file-write tools | ✓ |
| Git-command policy | Unrestricted | Same: branch protection on remote, narrow `git commit` block-list | ✓ |
| In-progress escape | 4 states (MERGE/REBASE/CHERRY_PICK/REVERT) | Most tools use no escape (one-agent-one-worktree means trunk is never the work surface); we keep the escape because main-checkout merge/rebase remains a legitimate sometimes-flow | ✓ stronger than peers |
| Worktree config | `.opencode/worktree.jsonc` (already shipped) | Cursor `.cursor/worktrees.json`; Claude Code `.worktreeinclude` | ✓ already on par |
| Setup hook | `hooks.postCreate` (already shipped) | Cursor `setup` script; Claude Code postCreate hook | ✓ already on par |

LBP gaps closed: AC8/AC9 documentation surfaces existing parity. AC10 docs cover the only remaining gap (port-isolation guidance) without code commitment.

## Affected Components

| Path | Change |
|---|---|
| `plugin/src/tools/git-guard.ts` | DELETE (717 lines) |
| `plugin/src/tools/git-guard.test.ts` | DELETE (879 lines) |
| `plugin/src/tools/trunk-write-firewall.ts` | NEW (~250 lines) |
| `plugin/src/tools/trunk-write-firewall.test.ts` | NEW (~400 lines covering 30 cases) |
| `plugin/src/utils/worktree-paths.ts` | NEW or extracted (~30 lines + test) |
| `plugin/src/utils/path.ts` | NEW or extracted (`isSameOrChildPath` ~10 lines + test) |
| `plugin/src/tools/checkpoint.ts` | Extend `detectRepoState` to return 4 in-progress states (lines 115-148) |
| `plugin/src/tools/checkpoint.test.ts` | Add 3 tests (rebase/cherry-pick/revert) |
| `plugin/src/index.ts` | Replace lines 503-544 git-guard dispatch with firewall dispatch (~40 lines) |
| `plugin/src/integration.test.ts` | Replace 7 git-guard hook tests with firewall hook tests |
| `.adv/specs/advance-meta/spec.json` | Retire `rq-gm01` (lines 1210-1307); mint `rq-twf01`; bump version 1.7.2 → 1.8.0 |
| `ADV_INSTRUCTIONS.md` | Replace `<!-- rq-gm01 -->` section at lines 447-452 with `<!-- rq-twf01 -->` Trunk Write Firewall description |
| `docs/worktree-guide.md` | Add 3 sections: Worktree Include (AC8), Setup Hook (AC9), Port Isolation (AC10) |

Net change: -1596 lines guard code, +~700 lines firewall + helpers + extracted utilities. ~2.3× simpler.

## Risks / Mitigations

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Destructive-bash pattern misses a vector (e.g. `python -c '...write'`) | Documented as accepted residual risk per agreement avoidances; matches current guard's posture on shell aliases. Future variants surface as ad-hoc bug reports → narrow firewall extension if frequency warrants. |
| R2 | `parseWorktreePaths` returns paths for stale entries → false-allow on deleted worktree | Existing guard already has this gap; not introduced by this change. Worktree triage (`adv_worktree_triage`) catches via separate flow. |
| R3 | `detectRepoState` extension breaks existing `checkpoint.ts` callers expecting only "ok"/"detached"/"merging"/"not_git" | Extend the union additively; existing call sites that switch on the type get TypeScript exhaustiveness errors at build time → caught by `pnpm run check`. Backwards-compatible default: treat new states the same as "merging" for existing callers (also legitimate). |
| R4 | Bun `Bun.spawnSync` in `runHooks` (line 1568) won't run on Node test environment | Already handled — vitest mocks `Bun` per `AGENTS.md` § "Runtime is Bun, tests run on Node". No new exposure. |
| R5 | Spec retirement breaks any external tool reading `rq-gm01` | Specs are internal to ADV; no external consumers. Verified by validator: zero non-archive references to `rq-gm01` outside `ADV_INSTRUCTIONS.md:447-452` (which we update in phase F). |
| R6 | Live tool-call validation requires session restart per AGENTS.md source-vs-dist gotcha | Documented in agreement constraints. Final acceptance step is "fresh session smoke test" per AC12. |

## Validation Plan (per agreement AC12-14)

In-session: vitest covers all firewall logic via DI mocks. Integration tests cover hook wiring.
Out-of-session: post-build, fresh OpenCode session runs `/adv-discover` → `/adv-design` → `/adv-prep` → `/adv-apply` → `/adv-archive` on a dummy repo to verify live behavior.

---

## Validator Result

**Verdict: VALIDATED** (adv-researcher, 4-dimension review)

| Dim | Level | Summary |
|---|---|---|
| 1 — Correctness | info | Design correctly addresses all 5 stated objectives with no logical gaps. One imprecise line ref (1559-1653 vs 1859-1886) corrected in this revision. |
| 2 — Simplicity | info | No materially simpler approach. 717→250 lines is categorically simpler. Bash-pattern inclusion is good engineering judgment vs. residual-risk-only approach. |
| 3 — Spec-law compliance | info | No spec conflicts. `rq-gm01` retirement clean — only references are the requirement itself, `ADV_INSTRUCTIONS.md:447-452` (which we replace), and archived changes (historical). `worktree-lifecycle/rq-wl-setupReadiness01` already covers AC8/AC9 mechanism. |
| 4 — Key alternatives | info | All 4 alternatives evaluated: (a) retire-and-mint correct (precedent in 2026-05-07 archive), (b) empty copyFiles default safer, (c) separate functions enable cleaner testing, (d) extending `detectRepoState` follows P22/P20. |

Validator recommendation applied: line-ref correction + `ADV_INSTRUCTIONS.md:447-452` replacement scope added to phase F.
