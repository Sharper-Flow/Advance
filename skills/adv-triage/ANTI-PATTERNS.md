# adv-triage Anti-Patterns + Coexistence

## Coexistence

| Command | Role | Relationship to `/adv-triage` |
|---|---|---|
| `/adv-status` | Read-only project overview | Prioritization counterpart |
| `/adv-cleanup` | Triage abandoned/duplicate ADV changes | Disjoint: cleanup on ADV changes; triage on GH backlog |
| `/adv-idea` / `/adv-problem` | Shape ideas / triage bugs into changes | Triage runs after items settle into agenda/notes; promotes to GH |
| `/adv-improve` | Suggest spec/implementation improvements | Suggestions become inventory items |
| `/adv-tron` | Codebase recon, hotspot detection | Findings → agenda → triage promotes to issues |

## Anti-patterns

| × Bad | ✓ Good |
|---|---|
| Auto-create GH issues without Tier B approval | Batch unrepresented items into explicit approval prompt |
| `git add -A` before roadmap commit | `git add ROADMAP.md .adv/roadmap-snapshot.json` only |
| Commit ROADMAP.md from feature branch | Commit only on default branch; abort otherwise |
| Assign Value to feature autonomously | Value is user-only unless user chooses autofill |
| Skip evidence trailer on agent-scored fields | Append `<!-- adv-triage:scoring v1 ... -->` |
| Write WSJF for bugs | Bugs use `priority:*` labels only |
| Recompute WSJF every run for already-scored features | Fill missing fields unless `--rescore` |
| Drop low-priority TODOs silently | Surface all inventory items, even deferred |
| Plain-text chat for Phase 3b assignments | Use `question` tool, structured options, one item at a time |
| Dump all items asking for `id=value` pairs | Batch-control question first, then per-item questions |
| Skip batch control | Stage 1 always first when matrix non-empty |
| Ignore `x-ratelimit-remaining` | Check after each GraphQL batch via `--include` |
| Use `rateLimit` query after every mutation | Prefer response headers; `rateLimit` is initial gate/fallback |
| Emit only top-N features | Phase 5.5 requires full `ROADMAP.md` fenced markdown echo |
| Replace echo with “see ROADMAP.md” | Echo + file are two required surfaces |

## Commit execution sequence

1. Resolve default branch via `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
2. Verify current branch is default branch. Otherwise abort.
3. Verify clean tree except `ROADMAP.md` + `.adv/roadmap-snapshot.json`.
4. Stage explicit paths only.
5. Commit `chore(roadmap): /adv-triage update {YYYY-MM-DD}`.
6. `git pull --rebase --autostash origin <default-branch>`.
7. `git push origin <default-branch>` if user chose push.
8. Emit pushed commit SHA.

Any step failure → stop, surface command + stderr, do not retry automatically.

## Roadmap echo

After `ROADMAP.md` is written, echo full generated content:

````markdown
## ROADMAP.md (generated)

```markdown
{full ROADMAP.md content}
```
````

Default execute echoes after commit or after write when `--no-commit`. Tier B `dry run` echoes instead of writing. `--dry-run` flag skips echo because no artifact was generated.
