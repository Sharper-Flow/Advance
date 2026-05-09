# replaceGitGuardWithTrunkWriteFirewall

## Why

P32 (trunk-is-prod) is currently enforced by `plugin/src/tools/git-guard.ts` — a 717-line classifier (+ 879-line test) that intercepts every `bash` git command, splits shell ops, resolves aliases, and routes each subcommand through a 6-category severity ladder (MUTATION / STAGING / RECOVERY / READ_ONLY / WORKTREE_MGMT / UNKNOWN) with worktree-context detection and dirty-state tracking.

This is the **wrong enforcement layer**. The real P32 invariant — clarified by the user — is narrow and singular:

> Agents must not edit files directly on trunk instead of using a worktree or branch.

P32 is about *where work happens*, not whether commits/merges/pushes/pulls/resets/plumbing should be allowed. Once code is ready in a worktree branch, commits/merges to trunk are *encouraged* — they are the ship-to-prod signal.

The current guard misreads this. Every category and carve-out (FETCH_OVERRIDE, RECOVERY, the proposed PLUMBING in #101) was added because the guard blocked something legitimate. Issue #101 is the latest instance of a recurring bug class, not a one-off.

If file edits to the trunk checkout are blocked at the editing-tool layer, the trunk checkout never goes dirty. Every downstream git operation becomes inherently safe and needs zero classification. The bug class disappears entirely.

LBP signal: 8+ peer AI-coding tools (Claude Code, Cursor, Aider, Devin, Open SWE, Augment Code, KISS Sorcar, plus ecosystem hooks like `pre-commit`/`branch-guard`/`git-safe`) all enforce "where work happens" via worktree convention + narrow block-list (1–2 commands), never via a 6-category git classifier. ADV's 717-line guard is ~10× more complex than the strongest peer and produces a friction class no peer has.

## What Changes

1. **Delete** `plugin/src/tools/git-guard.ts` (717 lines) and `plugin/src/tools/git-guard.test.ts` (879 lines).
2. **Add** `plugin/src/tools/trunk-write-firewall.ts` — small file-write firewall enforcing the single P32 invariant.
3. **Rewire** `tool.execute.before` in `plugin/src/index.ts` (currently dispatches `bash` → `checkBashCommand`) to dispatch `write`/`edit`/`morph_edit`/destructive-`bash` → `checkTrunkWrite`. Remove `git`-related branch.
4. **Document** the new firewall in `ADV_INSTRUCTIONS.md` (replace § Git Mutation Guard) and `docs/worktree-guide.md`.
5. **Close** GitHub issue #101 wontfix with link to this change's archive bundle.
6. **Research** the 4 LBP gaps in worktree ergonomics surfaced during proposal research; recommend bundle-vs-follow-up at design gate.

## Success Criteria

- [ ] `git-guard.ts` and `git-guard.test.ts` deleted; zero remaining references in `plugin/src/`
- [ ] `trunk-write-firewall.ts` blocks `write`/`edit`/`morph_edit` and destructive `bash` patterns (`sed -i`, `>`/`>>` redirects, `cp`/`mv`/`rm`/`tee` writing into trunk checkout) when target path is inside trunk checkout AND HEAD is the default branch
- [ ] Firewall allows the same operations inside any active worktree path (verified via integration test)
- [ ] Firewall allows file edits in trunk checkout when `.git/MERGE_HEAD` exists (legitimate merge-conflict resolution)
- [ ] Zero ADV-imposed friction on any `git` command (commit, merge, pull, push, reset, plumbing) verified by removing all git-classifier tests and not replacing them
- [ ] All existing ADV gate workflows pass end-to-end through worktree workflow (`pnpm test` green, `pnpm run check` green)
- [ ] Issue #101 closed wontfix with PR/change link in closing comment
- [ ] Design-phase artifact includes documented recommendation for each of the 4 LBP gaps with proposed scope/sequencing

## Affected Code

- `plugin/src/tools/git-guard.ts` — delete
- `plugin/src/tools/git-guard.test.ts` — delete
- `plugin/src/tools/trunk-write-firewall.ts` — new file (target ~150 lines incl. tests-friendly DI)
- `plugin/src/tools/trunk-write-firewall.test.ts` — new file
- `plugin/src/index.ts` — replace git-guard dispatch (~480-547) with trunk-write-firewall dispatch; remove `GuardDeps` import
- `plugin/src/integration.test.ts` — replace 7 git-guard hook tests with trunk-write-firewall hook tests
- `ADV_INSTRUCTIONS.md` — replace `§ Git Mutation Guard` section
- `docs/worktree-guide.md` — update enforcement-layer description

## Scope

### In Scope

1. Delete current 6-category git-classifier guard (source + tests).
2. Implement file-write firewall on editing tools + destructive-bash redirect/cp/mv/rm/sed-i/tee patterns.
3. Reliable trunk-checkout detection via `git worktree list --porcelain` + `git rev-parse --show-toplevel` cross-check (already implemented in current guard — port the helpers).
4. `.git/MERGE_HEAD` escape hatch for in-progress merges.
5. Clear blocking error message that names the violation and points the agent to `adv_worktree_create`.
6. Documentation updates in `ADV_INSTRUCTIONS.md` + `docs/worktree-guide.md`.
7. Close issue #101 wontfix with archive-bundle link.
8. Research-only deliverable: recommendation per LBP gap (worktree-include, setup-worktree hook, port/resource-isolation guidance) with bundle-vs-follow-up call at design gate.

### Out of Scope

- Replacement enforcement for `git push --force` / `--force-with-lease` to default branch (separate concern; remote branch protection covers most cases; address only if user requests).
- Implementing the LBP gap remediations themselves — only research + recommendation in this change. Selected gaps move to follow-up changes per design-gate decision.
- Fixing OpenCode#1 snapshot race (out of ADV's layer).
- Any feature touching reflection, conformance, or non-worktree subsystems.
- Rebase/cherry-pick in-progress detection beyond `MERGE_HEAD` (defer; can extend if friction surfaces).

## Constraints

- **Hook surface contract:** `tool.execute.before` already dispatches by tool name (currently special-cases `bash`, `task`, `question`). New firewall plugs into the same dispatch table — no new hook needed.
- **DI for tests:** new firewall must follow the existing `GuardDeps` pattern (inject `getDefaultBranch`, `getWorktreePaths`, `getProjectRoot`) so vitest can run on Node without spawning git.
- **Determinism:** all classification must be pure given inputs — no time-based or random checks (per P33).
- **Backwards compat:** existing tests in `integration.test.ts` and `__tests__/compaction.test.ts` use `tool.execute.before` for `task`/`question`/`bash` flows — those branches must remain.

## Impact

- **Agents:** Lose 717 lines of git-command friction. Gain a clear "you tried to write to trunk on default branch" error directing them to a worktree.
- **Users:** Issue #101's reported friction (post-merge `pull --ff-only`, plumbing recovery, `git -C $MAIN merge --ff-only`) works frictionlessly. Worktree-merge protocol (`docs/worktree-guide.md`) becomes natural.
- **No breaking change to public ADV tool surface** — guard is a hook-internal concern.
- **Codebase:** -1596 lines guard code; +~300 lines firewall (5× simpler).

## Risks

- **R1 — Destructive-bash pattern coverage gap.** Missing a write vector (e.g. `python -c 'open(...).write(...)'`, `dd of=...`) could let an agent write trunk files. Mitigation: enumerate known vectors at design; document residual instruction-governed risk; lean on the principle that intentional bypass is a different threat model (the same tradeoff the current guard accepts for shell aliases).
- **R2 — `MERGE_HEAD` insufficient.** Rebase / cherry-pick / revert in-progress also legitimately need trunk writes. Mitigation: design-gate decision on whether to extend escape-hatch list to `REBASE_HEAD` / `CHERRY_PICK_HEAD` / `REVERT_HEAD`.
- **R3 — Worktree path detection misclassifies symlinked paths.** Existing guard already handles via `git worktree list --porcelain`; port the same logic.
- **R4 — Non-git directories (no `.git` at root)** trigger the firewall incorrectly. Mitigation: short-circuit when `git rev-parse --show-toplevel` fails — outside any repo means outside trunk.

## Validation Plan

- **Red phase tests** (write before implementation):
  - `write` to file inside trunk checkout on default branch → BLOCK with worktree-creation guidance
  - `write` to same path inside an ADV worktree → ALLOW
  - `write` to file inside trunk checkout when `MERGE_HEAD` exists → ALLOW
  - `edit` / `morph_edit` follow same matrix
  - `bash`: `echo x > /trunk/file`, `sed -i '...' /trunk/file`, `cp src /trunk/dst`, `mv src /trunk/dst`, `rm /trunk/file`, `tee /trunk/file` → BLOCK
  - `bash`: `git commit`, `git merge`, `git pull`, `git push`, `git reset`, `git read-tree`, `git update-ref` → ALLOW (zero classifier)
  - `bash`: `cat /trunk/file`, `ls /trunk/`, `grep ... /trunk/file` → ALLOW (read-only)
- **Integration**: full `/adv-discover` → `/adv-design` → `/adv-prep` → `/adv-apply` → merge cycle on a fresh dummy repo (covered by existing integration tests once guard is replaced)
- **Issue #101 repro**: from inside an ADV session, run the post-merge sync flow described in #101 — verify zero blocks
- **Verification**: `pnpm test` (1356+ tests), `pnpm run check` (typecheck/lint/format), `pnpm run build` (tsup ESM bundle)

## Discovery Agenda

Carry these unresolved unknowns into `/adv-discover`:

1. **Destructive-bash pattern catalog** — full enumeration of write vectors. Need to scan: `>`/`>>`, `tee`, `sed -i`, `cp`/`mv`/`rm`, `dd of=`, `truncate`, `install -m`, `python -c '...write'`, `node -e '...writeFileSync'`, redirected heredocs. Decide which are in firewall scope vs. instruction-only.
2. **`MERGE_HEAD` extension scope** — should `REBASE_HEAD` / `CHERRY_PICK_HEAD` / `REVERT_HEAD` also be escape hatches? Research how peer tools handle this.
3. **OpenCode hook refusal contract** — does throwing from `tool.execute.before` cleanly surface as a tool-error to the agent (the current guard does this and works)? Verify behavior is identical for editing-tool dispatch as it is for bash dispatch.
4. **Conformance path-policy interaction** — `ADV_INSTRUCTIONS.md § External Conformance` references "path policy blocks read/glob/grep/lgrep on locked conformance directories." Grep found no implementation; verify if this is aspirational or shipped, and whether new firewall needs to compose with it.
5. **LBP gap depth** (research-only deliverable for design):
   - **5a — `.worktreeinclude`-equivalent**: how Claude Code / Cursor copy gitignored env files into new worktrees; minimum viable ADV implementation.
   - **5b — setup-worktree hook**: per-worktree `npm ci` / migrations / port assignment patterns; mapping to `adv_worktree_create` post-create hook.
   - **5c — port/resource-isolation guidance**: documentation pattern from Cursor/Augment for per-worktree port offsets and DB instances.
   - **5d — OpenCode#1 snapshot race**: confirm tracking-only status; no ADV-side action.
6. **Trunk-detection edge cases** — symlinked checkouts, bare repos, submodules, `git worktree` with detached HEAD on default-branch sha. Verify port from current guard handles all.

## References

- GitHub issue: `https://github.com/Sharper-Flow/Advance/issues/101` — source ticket with friction repro
- ADV rule P32 (trunk-is-prod), corrected interpretation: "agents edit on a branch/worktree, ship to trunk via merge"
- `https://code.claude.com/docs/en/worktrees` — Anthropic first-class worktree integration
- `https://cursor.com/docs/configuration/worktrees` — Cursor 3 Agents Window worktree model
- `https://github.com/SpillwaveSolutions/parallel-worktrees/blob/main/SKILL.md` — multi-agent worktree patterns
- `https://www.augmentcode.com/guides/how-to-run-a-multi-agent-coding-workspace` — 6-pattern multi-agent playbook
- `pre-commit` `no-commit-to-branch` hook (~10 lines YAML) — narrowest comparable enforcement
- `branch-guard` (Claude Code hook, ~100 lines bash) — `git commit` PreToolUse block
- Current implementation: `plugin/src/tools/git-guard.ts` (717 lines), `plugin/src/tools/git-guard.test.ts` (879 lines), integration in `plugin/src/index.ts:480-547`
- Existing problem statement: `problem-statement.md` (already drafted with full LBP research)
