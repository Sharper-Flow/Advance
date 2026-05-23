---
name: ship
description: Ship current work to production with quality gate and push
---
<!-- manifest: ship · requiresChangeId: false -->
# /ship — Trunk-to-Live Pipeline

Commit all uncommitted work, merge to default branch, run quality gate, push, and optionally deploy. Handles worktree branches natively — detects and cleans up after merge.

**ADV-aware:** If an ADV change has completed its release gate, skip steps ADV already handled (commit, merge, quality, docs, push) and run only what's left (deploy + optional changelog).

## Safety

- **Quality gate is hard** — if lint/typecheck/test/build fails, STOP before push. Report failures. User must fix or explicitly override with `--force`
- **Dirty tree commit** — by design, `/ship` commits all uncommitted changes (staged + unstaged + untracked). This is the intended behavior
- **Never force-push** — `--force` flag only bypasses quality gate, never uses `git push --force`

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Argument Parsing

| Argument | Meaning |
|----------|---------|
| (none) | Full pipeline: commit → merge → check → docs → push → deploy |
| `--force` | Skip quality gate, proceed to push |
| `--dry-run` | Preview what would happen without executing |
| `--no-deploy` | Stop after push, skip deploy step |
| `--no-docs` | Skip doc/changelog updates |
| `<message>` | Use as commit message instead of auto-generating |

---

## Phase 0: ADV Detection

Determine whether ADV has already handled most of the pipeline.

1. Call `adv_change_list status: "active"` (and check archived changes too via `adv_change_list status: "archived"`)
2. If ADV is available in this project:

### Scenario A: ADV release gate complete (archived change, unmerged or just merged)

ADV has already: committed per-task checkpoints, run 12-dimension review, run 6-scanner harden, completed archive (spec deltas, docs), and attempted git finalization (merge + push).

- Report: "ADV change `{id}` — release gate complete. ADV handled: commit, review, harden, archive, merge, push."
- **Skip** Phases 2–6 (ADV already did them)
- Proceed to **Phase 5b** (Changelog — ADV generates ARCHIVE_SUMMARY.md but not CHANGELOG.md)
- Proceed to **Phase 7** (Deploy — ADV has no deploy step)
- If `--no-deploy` and `--no-docs`: just report "Already shipped by ADV. Nothing to do."

### Scenario B: ADV change active, release gate incomplete

ADV change exists but hasn't completed the release gate. `/ship` is the wrong tool.

- Report: "ADV change `{id}` is active with incomplete gates. Use the ADV workflow instead:"
- Show which gate is next from `adv_gate_status`
- Suggest the appropriate `/adv-*` command
- Exit unless user says `--force` (then proceed as non-ADV)

### Scenario C: No ADV change, or ADV not available

Run the full pipeline (Phases 1–7). This is the default path.

---

## Phase 1: Pre-flight

1. `git status --porcelain` — check dirty state
2. `git branch --show-current` — capture current branch
3. `git remote -v` — confirm origin exists
4. `git stash list` — note any existing stashes
5. `git worktree list --porcelain` — detect worktree context

If clean tree (nothing to commit) AND on default branch AND up to date with origin:
- Report "Nothing to ship — tree clean, main up to date"
- Check for pending deploy; if deploy target detected, offer to deploy only
- Exit

If no remote configured:
- `[SHIP:BLOCKED] No git remote configured. Add one with git remote add origin <url>.`
- Exit

### Worktree detection

If current directory is inside a worktree (not the main checkout), note:
- The worktree path
- The branch name
- That Phase 3 will need to merge from this worktree branch to default branch

---

## Phase 2: Commit

1. Stage everything: `git add -A`
2. Generate commit message from diff:
   - If user provided `<message>` in arguments → use it
   - Otherwise: `git diff --cached --stat` + `git diff --cached` → synthesize message
   - Format: conventional commits style (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)
   - Subject line ≤50 chars; body with bullet summary of changes
3. Commit: `git commit -m "<message>"`
4. If `--dry-run`: report staged commit message, stop

**Commit message inference rules:**

| Diff pattern | Prefix |
|---|---|
| New files in `src/`, `lib/` | `feat:` |
| Changes to test files only | `test:` |
| Changes to `*.md`, `docs/` | `docs:` |
| Changes to `package.json`, `pyproject.toml`, deps files | `chore(deps):` |
| Changes to `.yml`, `.yaml`, `Dockerfile`, CI configs | `ci:` |
| Mixed/ambiguous | `feat:` or `fix:` based on whether bugs seem addressed |

---

## Phase 3: Merge to Default Branch

Detect default branch name:

```
git remote show origin | grep 'HEAD branch'
```

Fallback: try `main`, then `master`, then `trunk`.

### If already on default branch

Skip merge. Commit already landed on default.

### If on feature branch (including worktree branches)

1. Note current branch name and HEAD commit
2. Resolve main checkout path:
   - `git worktree list --porcelain` → find the worktree whose branch is the default branch, OR the entry with no branch prefix (bare main checkout)
   - If not found, use `git common dir` parent
3. In main checkout: `git checkout <default-branch>`
4. In main checkout: `git pull --ff-only origin <default-branch>` — fast-forward only; if diverged, STOP and report conflict
5. In main checkout: `git merge --no-edit <feature-branch>` — merge feature branch
6. If merge conflict: report files, STOP. User must resolve.

### Merge conflict handling

On conflict:
```
[SHIP:BLOCKED] Merge conflict on <default-branch>.
Conflicting files:
  - path/to/file.ts
  - path/to/other.ts
Resolve conflicts, then re-run /ship.
```
Abort merge (`git merge --abort`), switch back to feature branch. Do not push.

### Worktree cleanup (after successful merge)

After merge succeeds on default branch, clean up the feature branch worktree:

1. Verify worktree has no uncommitted changes: `git -C <worktree-path> status --porcelain`
   - If dirty: report, skip cleanup, warn user
2. Remove worktree: `git worktree remove <worktree-path>`
3. Delete local branch: `git branch -d <feature-branch>`
4. If remote branch exists: `git push origin --delete <feature-branch>` (only if remote tracking branch existed and merge was to default)
5. Report cleanup result

Cleanup is automatic — no user confirmation needed (branch is merged, worktree is clean).

---

## Phase 4: Quality Gate

Run verification (equivalent to `/check`):

1. Use the embedded Global Verification Contract below
2. Detect stack from repo files
3. Run appropriate: lint, typecheck, tests, build
4. Report results

### Result handling

| Result | Action |
|--------|--------|
| All pass | Continue to Phase 5 |
| Any failure | STOP. Report failures. Suggest fixes |
| `--force` flag present | Warn about failures, continue to Phase 5 |

On failure (without `--force`):
```
[SHIP:BLOCKED] Quality gate failed.
FIX: address failures above, then re-run /ship.
Override: /ship --force (not recommended)
```

---

## Phase 5: Docs

Skip if `--no-docs` flag present.

### 5a: Stale Doc Scan

1. Collect list of changed files from commit (`git diff-tree --no-commit-id --name-only -r HEAD`)
2. For each changed file, check if any of these reference it:
   - `README.md` — check for mentions of changed modules/paths
   - `docs/**/*.md` — check for references to changed paths or APIs
   - Inline code docs (docstrings, JSDoc) in changed files — check consistency
3. If stale references found:
   - List them with file:line references
   - Ask user via `question`: update all / skip / review individually

### 5b: Changelog

1. Check for existing changelog file: `CHANGELOG.md`, `CHANGES.md`, `HISTORY.md` (in order of preference)
2. If found: prepend entry under "Unreleased" or new version header
3. If not found: offer to create `CHANGELOG.md` with initial entry
4. Entry format:
   ```markdown
   ## [Unreleased] - YYYY-MM-DD

   ### Changed
   - <summary from commit message>
   ```
5. If changelog was updated: `git add -A && git commit -m "docs: update changelog"` (amend is NOT used — separate commit)

---

## Phase 6: Push

1. `git push origin <default-branch>`
2. If push rejected (remote ahead):
   - `git pull --rebase origin <default-branch>`
   - Re-run quality gate (lightweight — just build + test)
   - `git push origin <default-branch>`
3. If on feature branch (and merged): ask user whether to delete feature branch
4. Report push result with commit hash and remote URL

---

## Phase 7: Deploy

Skip if `--no-deploy` flag present.

### Deploy Detection (Convention-Based)

Scan for deployment targets in priority order:

| Detection | Command |
|-----------|---------|
| `package.json` has `scripts.deploy` | `npm run deploy` (or `bun run deploy` if bun detected) |
| `package.json` has `scripts.release` | `npm run release` |
| `Makefile` has `deploy` target | `make deploy` |
| `fly.toml` exists | `fly deploy` |
| `vercel.json` exists or `.vercel/` dir | `vercel --prod` |
| `Dockerfile` exists + `docker-compose.yml` | `docker compose up -d --build` |
| `Procfile` exists | `git push heroku main` (if heroku remote exists) |
| `Cargo.toml` exists + deploy script hint | Check for `scripts/` directory or `justfile` |
| `.github/workflows/deploy*.yml` | Report: "Deploy workflow detected — push should trigger CI deploy" |

### Execution

1. If deploy target detected:
   - Report what was detected and what command will run
   - Run the command with a 120s timeout
   - Report success/failure
2. If no deploy target detected:
   - Report: "No deployment target detected. Push is live if CI handles deploy."
   - If `.github/workflows/` exists: list relevant workflow files
3. If deploy fails:
   - Report error output
   - Do NOT rollback push (push already happened)
   - Suggest manual fix steps

---

## Phase 8: Summary

Report final state:

```
## Ship Complete

MODE: [ADV (release gate complete) | standalone]
COMMIT: <short-hash> <subject>
BRANCH: <default-branch>
PUSHED: <remote-url>
QUALITY: [PASS|SKIP (--force)|HANDLED BY ADV]
DOCS: [updated|skipped|none needed]
DEPLOY: [success|failed|none detected]
WORKTREE: [cleaned up <branch>|none]

<deploy output if applicable>
```

If feature branch was not cleaned up during Phase 3 (e.g., merge conflict), offer cleanup:
- Delete local feature branch
- Delete remote feature branch (if it existed)
- Remove worktree (if applicable)

---

## Error Recovery

| Error | Recovery |
|-------|----------|
| Merge conflict | Abort merge, return to feature branch, report conflicting files |
| Quality gate fail | Stop before push, report failures |
| Push rejected (diverged) | Pull --rebase, re-check, retry push |
| Push rejected (force needed) | STOP. Never force-push. Report situation. |
| Deploy failure | Report error, suggest manual steps. Push already completed. |
| No remote | Block at Phase 1, suggest `git remote add` |
| Detached HEAD | Block at Phase 1, suggest checkout branch |
| Worktree dirty at cleanup | Skip cleanup, warn user to resolve manually |

---

## Anti-Patterns

| × Bad | ✓ Good |
|---|---|
| Force-push to default branch | Never. `--force` only bypasses quality gate |
| Amend commits during ship | Separate commits for changelog/docs updates |
| Skip quality gate silently | `--force` requires explicit flag; always warn |
| Leave merged worktree branches behind | Auto-detect and clean up after merge |
| Push from feature branch | Always push from default branch after merge |
| `git add -A` after merge commit | Only stage before the initial commit; changelog gets its own explicit stage |

---

## Key Tools

| Purpose | Tool |
|---|---|
| Detect current context | `git status`, `git branch --show-current`, `git worktree list` |
| Stage and commit | `git add -A`, `git commit -m` |
| Merge to default | `git merge --no-edit`, `git checkout` |
| Worktree cleanup | `git worktree remove`, `git branch -d` |
| Quality gate | Embedded Global Verification Contract + stack detection |
| Push | `git push origin <default-branch>` |
| Deploy detection | `bash` (ls, jq, grep for deploy targets) |
