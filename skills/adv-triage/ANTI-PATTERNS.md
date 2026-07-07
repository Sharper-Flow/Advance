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
| Create/open GH issues before source cleanup validation | Run cleanup validation after match/gap and before issue creation |
| `git add -A` before roadmap commit | `git add ROADMAP.md .adv/roadmap-snapshot.json` only |
| Commit ROADMAP.md from feature branch | Commit only on default branch; abort otherwise |
| Apply bug priority labels autonomously without context | Gather up to 2 context questions per bug, then assign; default to medium + `context_insufficient` if still unclear |
| Ask users to assign priority to stale or already-addressed items | Relevance-check field-gap candidates first; resolve stale/duplicate items with explicit approval |
| Ask users for priority before cleanup validation completes | Complete source cleanup validation before any bug priority assignment |
| Ask users to confirm or choose a priority | User questions gather context only; agent owns priority choice |
| Close, complete, cancel, remove, suppress, merge-note, or deprioritize items from title similarity alone | Treat title similarity as advisory; require structural evidence and explicit approval |
| Assume `gh issue close --duplicate-of` exists or never exists | Capability-detect via `gh issue close --help`; fallback to `Duplicate of #N` comment semantics plus supported close reasons |
| Mark agenda superseded/should-merge items as resolved without provenance | Use `adv_agenda_complete` with a note referencing the survivor/source |
| Drop low-priority TODOs silently | Surface all inventory items, even deferred |
| Post priority rationale as an issue comment | Emit `<issue#>: priority=<tier> :: <rationale>` in chat output only |
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
