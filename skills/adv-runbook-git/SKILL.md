---
name: adv-runbook-git
description: Full recipes, tier matrices, and command references for trunk-worktree isolation and git freshness (oc-fresh). Load when you need exact command syntax, tier details, or fallback procedures for worktree or freshness operations.
---

# Git Runbook

## Trunk-Stays-On-Default + Worktree-First PR Policy

Enforced by `plugin/src/tools/trunk-write-firewall.ts` (`rq-crossProjectTrunkFirewall01`) and `oc-worktree` (refuses `change/*`).

| Constraint | Value |
|---|---|
| Trunk | Main checkout stays on default branch; branch work uses a worktree. |
| ADV worktrees | Use `adv_worktree_resume` / `adv_worktree_create`; tool owns paths. |
| PR source | Worktree, never trunk; CI behavior matches trunk pushes. |
| Locations | ADV: `$ADV_WORKTREE_HOME/{projectId}/{branch}`; ad-hoc: `~/.local/share/opencode/worktree-adhoc/{repo-basename}/{branch-slug}`. |
| Deletion | Merge branch to default before removing worktree. |
| Deploy/rebuild | Run `deploy`, `build`, `release`, `install`, `publish`, and `scripts/deploy-*.sh` from merged default branch only. |
| Firewall | Target-relative; foreign-repo default trunks are protected; eligible linked worktrees are allowed. |

### Hard Rules

- Never switch trunk to a feature branch manually.
- Never run deploy/rebuild from a worktree.
- Never `git checkout -b <feature>` or `git switch -c <feature>` in a main/trunk checkout.

## Git Freshness (`oc-fresh`)

Enforced by `~/.local/bin/oc-fresh` (source: `dev/oc-fresh/oc-fresh`). See `dev/oc-fresh/README.md` § Safety rails.

| Constraint | Value |
|---|---|
| Commands | `status [--repo <path>] [--json] [--force]`; `sync [--repo <path>] [--force]`. |
| TTL | `OC_FRESH_TTL`, default `300s`; `0` always fetches; `--force` bypasses suppression. |
| Trigger points | First read; before judgement/write/push; after waits; before deploy/rebuild; on surprise. |
| Status | Reports default/current branch, behind count, dirty flag, fetch result, and TTL age. |
| Shared clock | `ocfresh.lastFetchEpoch` via `git config --local` in `$GIT_COMMON_DIR/config`; one fetch serves sibling worktrees. |
| Trunk sync | `git pull --ff-only`; refuses dirty tree or divergence. |
| Branch sync | `git fetch` + `git rebase origin/{default}`; refuses dirty tree; conflict aborts rebase and lists files. |
| Failure result | Offline/auth/ref-lock/shallow/origin-HEAD/nonzero git failures return `stale/unknown`, never `current`/`synced`. |
| Fallback | Native git uses the same rails when `oc-fresh` is absent. |

### Freshness Anti-Patterns

- Never sleep, poll, or wait in a loop to stay fresh; freshness is trigger-driven.
- Never use `git pull` (merge) on a worktree branch instead of fetch plus rebase.
- Never run `git pull` or `git rebase` on a dirty tree.
- Never use `--autostash`, force-push, or auto-resolve a rebase conflict.
- Never revert the TTL clock to `.git/FETCH_HEAD` mtime; it is per-worktree.
- Never assume freshness from a prior fetch without checking at a trigger.
- Never edit `~/.local/bin/oc-fresh` directly; edit `dev/oc-fresh/`, then deploy with `scripts/deploy-oc-fresh.sh`.

## Merge-Before-Delete Recipe

1. In the worktree, verify `git status` is clean.
2. Resolve the main checkout without switching branches:

   ```bash
   MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   git -C "$MAIN" branch --show-current
   git -C "$MAIN" status --porcelain
   git -C "$MAIN" merge --ff-only change/{change-id}
   ```

3. Confirm `git -C "$MAIN" log --oneline trunk..change/{change-id}` is empty.
4. Delete only after the branch is archived, merged, and clean. For ADV deletion, first run the dry-run plan, retain its `planToken`, then apply with nonblank approval evidence.
