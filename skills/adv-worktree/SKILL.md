---
name: adv-worktree
description: "ADV worktree workflow — create, manage, triage, and clean up git worktrees with Temporal-coordinated state and per-worktree git isolation. Covers when to isolate, multi-session model, merge-before-delete protocol, and tmux navigation."
keywords: ["worktree", "git-worktree", "branch-isolation", "feature-branch", "parallel-experiment", "merge-before-delete", "multi-session", "adv-worktree"]
license: MIT
metadata:
  priority: medium
  replaces: worktree
---

## When to Load This Skill

Load this skill when you need to **create, manage, triage, or clean up git worktrees** in an ADV-managed project. Covers decision criteria, multi-session model, merge protocol, and tmux navigation hints.

## Multi-Session Note

This skill applies in single-session AND multi-session modes. **Concurrent worktrees per project are first-class and Temporal-coordinated** — no soft-locks, no warnings, no fallback framing. ADV serializes state writes via Temporal workflow updates; per-worktree git isolation eliminates working-tree races between sessions. See `ADV_INSTRUCTIONS.md § Multi-Session Coordination`.

## When to Create a Worktree

Use `adv_worktree_create` (or the `worktree_create` alias) when:
- **Risky refactors** — large structural changes that might break the codebase
- **Parallel experiments** — trying two different approaches to the same problem
- **Feature branches** — the user asks you to start a new feature in isolation
- **Exploratory work** — spiking on an idea without polluting the main branch
- **Concurrent ADV changes** — running multiple changes in the same project at the same time, each isolated to its own worktree

## When NOT to Create a Worktree

- Small, contained changes (bug fixes, config tweaks, single-file edits)
- When the change is low-risk and easily reversible

(Note: being in a peer-session of the same project is **not** a reason to skip — multi-session is supported.)

## Behavior

- Default flow is inline: create worktree, then continue in the same agent session
- After creation, use the returned worktree path as `workdir` for subsequent tool calls
- On delete, the change branch must be archived AND merged AND clean (3-condition gate); pre-delete and post-delete hooks run with safety bounds (timeout, env sanitization, exit-code surfaced)
- Multiple worktrees per project are first-class — coordinate-by-design via Temporal `worktree_registry`

## Post-Change Cleanup (Merge Before Delete)

**Never delete a worktree until its branch is merged to the default branch (e.g. `main` or `trunk`).** The 3-condition deletion gate enforces this.

After implementation is complete and the change is archived/signed off:

### Step 1: Verify the branch is clean

```bash
# In the worktree directory — no uncommitted changes
git status
# Should show "nothing to commit, working tree clean"
```

### Step 2: Merge to the default branch

```bash
# Switch back to the main working directory (not the worktree)
# Merge the change branch into the default branch
git checkout trunk        # or main — use the repo's default branch
git merge --no-edit change/{change-id}
```

Alternatively, if the project uses pull requests, push the branch and open a PR:

```bash
git push -u origin change/{change-id}
gh pr create --title "Archive {change-id}" --body "Merges completed change."
```

Wait for the PR to be merged before proceeding to deletion.

### Step 3: Verify the merge

```bash
# Confirm the change branch commits are reachable from the default branch
git log --oneline trunk..change/{change-id}
# Should return EMPTY (no commits ahead) — meaning everything is merged
```

### Step 4: Delete the worktree

Only after merge is confirmed:

```bash
adv_worktree_delete branch: "change/{change-id}" reason: "Change {change-id} merged to default branch"
```

The 3-condition gate (archived AND merged AND clean) blocks unsafe deletion. Force only with explicit `opts.force: true` and audit trail.

### Checklist

- [ ] All changes committed in the worktree branch
- [ ] Branch merged to default branch (direct merge or PR)
- [ ] Merge verified — no commits ahead of default branch
- [ ] `adv_worktree_delete` called with reason

**If the merge is not yet complete, do NOT delete the worktree.** The worktree protects unmerged work from being lost.

## Inspecting Peer Sessions

Use these tools to see other sessions working in the same project:

| Tool | Purpose |
|------|---------|
| `adv_status` | Includes Peer Sessions section with session_id + started_at + worktree-basename (privacy-defensive — no PID, no full path) |
| `adv_session_list` | List all peer sessions in same project |
| `adv_session_show <session_id>` | Own-session details (full info for current session only) |
| `adv_temporal_diagnose` | Includes peer count, worker-lock holder PID, project workflow presence |

## Triaging Drift

When the worktree registry diverges from on-disk state, use `adv_worktree_triage` (read-only, advisory). Common drift causes: process killed mid-create, manual `git worktree remove` outside ADV, stale session entries.

## Navigating to the New Worktree Tab

When a worktree is created, openchad may open a new tmux window for it. The agent continues working inline via `workdir` — but you can inspect the worktree directly using these keybinds:

| Key | Action |
|-----|--------|
| `Ctrl+b n` | Next tmux window |
| `Ctrl+b l` | Last (previously active) window |
| `Ctrl+b w` | Interactive window chooser |
| `oc switch` | Switch between openchad sessions |

The agent will emit this hint immediately after `adv_worktree_create` succeeds so you always know how to reach the new tab.

## Ask Only When Needed

Before creating a worktree, explain why isolation helps. Ask the user only when the decision is materially ambiguous or when the action is destructive/irreversible. Otherwise, proceed with the safest reasonable default.

## Keywords
worktree, git worktree, branch isolation, parallel development, merge before delete,
worktree create, worktree delete, tmux navigation, feature branch, risky refactor,
exploratory work, worktree cleanup, multi-session, peer-session, Temporal coordination,
adv-worktree
