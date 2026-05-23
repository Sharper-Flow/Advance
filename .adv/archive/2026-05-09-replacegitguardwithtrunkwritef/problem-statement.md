## Problem

P32 (trunk-is-prod) is currently enforced by `plugin/src/tools/git-guard.ts` — a 689-line classifier that intercepts every `bash` git command, splits shell ops, resolves aliases via cached `git config --get-regexp`, and routes each subcommand through a 6-category severity ladder (MUTATION / STAGING / RECOVERY / READ_ONLY / WORKTREE_MGMT / UNKNOWN) with worktree-context detection and dirty-state tracking.

This is the wrong enforcement layer.

## Root cause

The actual P32 invariant — clarified by user — is narrow and singular:

> **Agents must not edit files directly on trunk instead of using a worktree or branch.**

P32 is about *where work happens*, not whether commits, merges, pushes, pulls, resets, or plumbing operations should be allowed. Once code is ready (built and verified in a worktree branch), commits and merges to trunk are *encouraged* — they are the ship-to-prod signal.

The current guard misreads this. It blocks git commands. Every category and carve-out (FETCH_OVERRIDE, RECOVERY, the proposed PLUMBING in #101) was added because the guard blocked something legitimate. This is a feedback loop: each carve-out makes the next carve-out more likely. Issue #101 is the latest instance of a recurring bug class, not a one-off.

If file edits to the trunk checkout are blocked at the editing-tool layer, the trunk checkout never goes dirty. Every downstream git operation becomes inherently safe and needs zero classification:
- `git commit` in trunk checkout → no-op or merge-only commit (always safe)
- `git pull --ff-only` → no local changes to conflict (always safe)
- `git merge change/X` → clean tree, simple FF or merge commit (always safe)
- `git reset`, `git read-tree`, `git update-ref`, plumbing → user's tools, work as expected

The bug class disappears entirely. No future variants of #101 can occur.

## LBP signal — peer ecosystem unanimity

Researched against 8+ peer AI-coding tools and the surrounding worktree/git-hook ecosystem. Universal pattern:

| Tool | Approach |
|---|---|
| Claude Code (Anthropic) | First-class `--worktree` flag; one agent = one worktree = one branch; no git-command guards |
| Cursor 3 Agents Window | Automatic worktree per parallel agent; `/best-of-n` runs N models in N worktrees |
| Aider, Devin, Open SWE, Augment Code, KISS Sorcar | Same model: worktree (or sandbox) per agent, no git-command classification |
| `pre-commit` (`no-commit-to-branch`) | ~10-line YAML hook, blocks `git commit` only |
| `branch-guard` (Claude Code hook, ~100 lines bash) | PreToolUse hook blocks `git commit` on protected branches; `--amend` allowed |
| `git-safe` (Claude Code hook) | Block-list for `push --force` / `reset --hard` only |
| GitHub branch protection | Server-side enforcement on the remote |

Every peer enforces "where work happens" via worktree convention + narrow block-list (1–2 commands), not via 6-category classifier. ADV's 689-line guard is ~10× more complex than the strongest comparable tool and produces a friction class no peer has.

## LBP gaps in ADV worktree integration (research targets)

Same research surfaced gaps where ADV is *behind* peer tools in worktree ergonomics:

1. **No `.worktreeinclude`-equivalent.** Claude Code copies gitignored env files (`.env`, secrets) into new worktrees automatically. Cursor `.cursor/worktrees.json` setup-worktree-unix scripts achieve same. ADV worktrees start empty; agents manually re-source envs ad-hoc.
2. **No setup-worktree hook.** Cursor runs `npm ci`, migrations, port assignment per new worktree. ADV's `adv_worktree_create` returns a path with no automatic setup. Plugin development survives this; multi-stack apps would suffer.
3. **No port/resource-isolation guidance.** Cursor and Augment guide per-worktree port offsets and separate DB instances. ADV silent on this.
4. **`OpenCode#1` snapshot race on shared projectID.** Known, tracked, out of ADV's layer (sharper-flow/Advance#1) — noted for completeness.

## Goal

Replace `plugin/src/tools/git-guard.ts` and its test file with a small file-write firewall enforcing the single invariant. Eliminate issue #101's bug class. Investigate and propose remediation paths for the LBP gaps above as part of the change's design phase (do not necessarily implement all of them in this change — sequence based on user value).

## In scope

1. Delete `plugin/src/tools/git-guard.ts` and `plugin/src/tools/git-guard.test.ts`.
2. Implement file-write firewall: hook `tool.execute.before` for `write`, `edit`, `morph_edit`, and destructive `bash` patterns (`sed -i`, redirects via `>`/`>>`, `cp`/`mv`/`rm` writing into trunk checkout). Block when target path is inside trunk checkout AND HEAD is the default branch AND the path is not in a worktree.
3. Detect trunk checkout reliably via `git worktree list --porcelain` + `git rev-parse --show-toplevel` cross-check.
4. Allow merge-conflict edits when `.git/MERGE_HEAD` exists (legitimate human-driven recovery during merge).
5. Document the file-write firewall in `ADV_INSTRUCTIONS.md` and update onboarding docs.
6. Close GitHub issue #101 wontfix with link to this change.
7. Research and present a recommended path for each LBP gap (worktree-include / setup-hook / port-isolation guidance). Decision on which to bundle in this change vs. separate follow-up changes happens at the design gate.

## Out of scope

- Replacement enforcement for `git push --force` / `--force-with-lease` to default branch (separate concern; remote branch protection covers most cases; address if user requests).
- Fixing OpenCode#1 (out of ADV's layer).
- Any feature touching reflection, conformance, or non-worktree subsystems.

## Success criteria

- `git-guard.ts` and `git-guard.test.ts` deleted; no remaining references in `plugin/src/`.
- New file-write firewall blocks `write`/`edit`/`morph_edit`/destructive-`bash` targeting trunk-checkout paths when on default branch.
- New firewall allows the same operations inside any active worktree path.
- New firewall allows file edits in trunk checkout when `.git/MERGE_HEAD` exists (merge in progress).
- All existing ADV gate workflows continue to work end-to-end through worktree workflow (verified via integration tests).
- Issue #101 closed wontfix with PR/change link in the closing comment.
- Design-phase artifacts include a documented recommendation for each of the 4 LBP gaps with proposed scope/sequencing.
- Test suite passes: `pnpm test` green; `pnpm run check` green.

## Acceptance criteria

- A user creates a change in a fresh ADV session, runs `/adv-discover`/`/adv-design`/`/adv-prep`/`/adv-apply`, observes worktree creation, edits files inside the worktree, merges to trunk, and pushes — entire flow works.
- An agent attempting `write`/`edit` on a trunk-checkout file (HEAD = default branch) receives a clear blocking error message guiding them to create a worktree.
- An agent attempting any `git` command (commit, merge, pull, push, reset, plumbing) experiences zero ADV-imposed friction.
- Issue #101's reported friction (post-merge sync of trunk via `pull --ff-only`, plumbing operations during recovery) works without any guard intervention.

## References

- `https://github.com/Sharper-Flow/Advance/issues/101` — source ticket.
- `https://code.claude.com/docs/en/worktrees` — Anthropic's first-class worktree integration.
- `https://cursor.com/docs/configuration/worktrees` — Cursor 3 Agents Window worktree model.
- `https://github.com/SpillwaveSolutions/parallel-worktrees/blob/main/SKILL.md` — multi-agent worktree coordination patterns.
- `https://www.augmentcode.com/guides/how-to-run-a-multi-agent-coding-workspace` — 6-pattern multi-agent playbook.
- ADV rule P32 (trunk-is-prod), corrected interpretation: "agents edit on a branch/worktree, ship to trunk via merge".
- This session's chat log (LBP synthesis, gap analysis).