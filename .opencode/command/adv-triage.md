---
name: adv-triage
description: Triage all backlog sources, score features with WSJF, regenerate ROADMAP.md
---
<!-- manifest: adv-triage · requiresChangeId: false -->
# ADV Triage — Backlog Reconciliation, WSJF Scoring, Roadmap Regen

Reconcile every backlog source into GitHub Issues, score features with WSJF, and regenerate the prioritized `ROADMAP.md` at repo root. Storage of truth is a GitHub Projects v2 board (typed NUMBER fields); ROADMAP.md is a generated mirror committed and pushed at the end of the run. Hybrid HITL: agent fills RROE / Time Criticality / Effort autonomously, pauses only for user-only assignments (bug Priority, feature Value).

> **CHECKLIST**: Default to dry-run. Apply requires `--execute`. Tier B inline approval required before opening GH issues, before writing/pushing ROADMAP.md, and before deprecating local sources. Bug priority uses existing `priority:{critical,high,medium,low}` labels; features use Projects v2 number fields (Value, TimeCriticality, RROE, Effort, WSJF). WSJF formula = `(Value + TimeCriticality + RROE) / Effort`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Parse Flags

Extract from `$ARGUMENTS`:

- `--execute` — apply mutations after Tier B approval (default: dry-run)
- `--no-commit` — generate ROADMAP.md but skip the commit/push step (still requires `--execute` to write the file)
- `--source <name>` — limit Phase 1 scan to one source: `gh` / `agenda` / `wisdom` / `notes` / `changes` / `todos`
- `--rescore` — recompute WSJF for all features even if all fields are already populated (otherwise only missing fields are filled)

Reject unknown flags with a single-line error and the valid list.

---

## Phase 0: Preflight

Run these checks in order. Any failure → emit `[ADV:BLOCKED]` with the specific cause and stop.

| # | Check | Failure mode |
|---|-------|--------------|
| 1 | `gh auth status` shows authenticated user | "Not authenticated. Run `gh auth login`." |
| 2 | Token scopes include `project` and `repo` | "Token missing scope `<name>`. Run `gh auth refresh -s project,repo`." |
| 3 | `git rev-parse --show-toplevel` resolves | "Not a git repo." |
| 4 | `gh repo view --json nameWithOwner` resolves | "No GitHub remote configured for this repo." |
| 5 | Required label set exists: `bug`, `feature`, `priority:critical`, `priority:high`, `priority:medium`, `priority:low` | Auto-create any missing labels via `gh label create` (idempotent). Log creations in the report. |

### Project bootstrap

Look up the linked Projects v2 board:

1. Read `adv_project_metadata action: 'read' key: 'github_project'`
2. If absent or invalid:
   - Resolve `<owner>` from `gh repo view --json owner -q .owner.login`
   - Try `gh project list --owner <owner> --format json` and match a project titled exactly `ADV: <repo-name>`
   - If still no match: present a Tier B inline approval to **create** the project (see Bootstrap approval below)
3. Once the project number is known, ensure the required custom fields exist; create any that are missing via `gh project field-create`:

| Field name | Data type | Single-select options |
|---|---|---|
| `Type` | `SINGLE_SELECT` | `bug,feature` |
| `Priority` | `SINGLE_SELECT` | `critical,high,medium,low` |
| `Value` | `NUMBER` | — |
| `TimeCriticality` | `NUMBER` | — |
| `RROE` | `NUMBER` | — |
| `Effort` | `NUMBER` | — |
| `WSJF` | `NUMBER` | — |
| `Status` | `SINGLE_SELECT` | `Backlog,Ready,In Progress,Blocked,Done` (only create if absent — GH provides Status by default) |

4. Persist via `adv_project_metadata action: 'write' key: 'github_project' value: { owner, project_number, project_id, fields: { ... } }`

### Bootstrap approval (Tier B inline, only when project must be created)

```
ADV needs a GitHub Projects v2 board for backlog scoring.

Owner: {owner}
Title: ADV: {repo-name}
Linked repo: {owner}/{repo}
Custom fields to create: Type, Priority, Value, TimeCriticality, RROE, Effort, WSJF

Reply EXACTLY one of:
- `create` — create project, link to repo, create fields, persist metadata
- `use existing N` — use an existing project number N owned by {owner} (must already exist)
- `cancel` / `stop` — halt the entire /adv-triage run

Anything else → re-prompt with the same options.
```

**Anchor phrase:** `Reply EXACTLY one of:`

If `use existing N`: validate the project exists, ensure required fields exist (create missing), then persist metadata. Do not silently fall back if validation fails — re-prompt.

---

## Phase 1: Gather All Sources

Inline parallel reads. No sub-agents (this phase is I/O bound, not reasoning bound).

| Source | Tool / command | What to extract |
|---|---|---|
| GitHub issues (open) | `gh issue list --state open --limit 500 --json number,title,body,labels,url,createdAt` | full issue list with current labels |
| GH Projects v2 items | `gh project item-list <N> --owner <owner> --format json --limit 500` | current items + field values |
| Active ADV changes | `adv_change_list status: 'in-flight'` | id, title, summary, drafts included |
| ADV agenda | `adv_agenda_list` | pending + active items |
| ADV wisdom (failures, gotchas) | `adv_wisdom_list type: 'failure'` then `adv_wisdom_list type: 'gotcha'` | content snippets |
| Cross-session notes | `glob` `.adv/CROSS-SESSION-NOTES-*.md` then `read` each | bullet items, headings, action lines |
| TODO / FIXME comments | `lgrep_search_text query: 'TODO\|FIXME' path: <repo-root>` (filter to `plugin/src/**`, `.opencode/**`, `docs/**`) | file:line + comment text |

Cap each source at 100 items; if more, sort by recency and surface a "(N more not shown)" note in the report.

Build a master inventory record per source item:

```
{ source: <source-name>, ref: <stable-ref>, title: <short-title>, body: <excerpt>, kind_hint: <bug|feature|unknown> }
```

`kind_hint` heuristics:
- `wisdom type:failure` → `bug`
- `wisdom type:gotcha` → likely `bug` (verify with body)
- `agenda` items → use category if present, else `unknown`
- `TODO|FIXME:` → `bug` if matches `/(?:bug|broken|fix|incorrect|wrong|crash|leak)/i`, else `feature`
- ADV active changes → `feature` if `proposalKind ∈ {addCapability, modifyCapability}`, `bug` if `bugfix`, else `unknown`
- Notes lines → `unknown` (defer to user in Phase 3)

---

## Phase 2: Match + Identify Gaps

For each non-GH inventory item, check if it is already represented by an open GH issue.

### Match algorithm (cheap → expensive, first match wins)

1. **Stable ref match** — issue body contains the source's `ref` (e.g. `wisdom-id`, `tk-…`, file:line for TODO, `change-id`).
2. **Title similarity** — Jaccard similarity of normalized title tokens ≥ `0.6`. Title normalization: lowercase, trim, collapse whitespace, strip punctuation, drop stopwords (`a`, `the`, `and`, `or`, `for`, `to`, `of`, `in`).
3. **Body excerpt match** — first 80 chars of source `body` (lowercased, normalized) appears verbatim in any open issue body.

If any rule matches → mark item as **represented** with the issue number.
If none match → mark as **unrepresented** with the inventory record retained.

### Output

Build two collections:
- `represented[]` — `(source-item, gh-issue-number)` pairs (informational)
- `unrepresented[]` — items with `kind_hint` and proposed title/body for issue creation

If `unrepresented[]` is empty AND every represented issue already has the required field values populated → skip Phases 3-5, jump to Phase 6 with "No new issues, no field gaps. Roadmap may still need regen if `--rescore`."

---

## Phase 3: User Assignments (Tier B, batched)

Two separate user pauses. Both required when the underlying set is non-empty. Each is structured per `docs/command-voice-standard.md § Inline Approval Voice`. Skip empty sets.

### 3a. Confirm new GH issues to create

Only run if `unrepresented[]` is non-empty.

```
Found {N} backlog item(s) not represented by any open GH issue:

1. [bug?] {title} — {source}: {ref}
   {body excerpt 1-2 lines}
2. [feature?] {title} — {source}: {ref}
   {body excerpt}
...

Reply EXACTLY one of:
- `create all` — open all listed items as GH issues
- `create none` / `skip` — open nothing in this batch
- `create N` (or `create N,M`) — open only the listed numbers
- `reclassify N as bug` / `reclassify N as feature` — flip the kind_hint, then re-prompt this list
- `stop` / `abort` — halt the entire /adv-triage run

Anything else → re-prompt with the same options.
```

**Anchor phrase:** `Reply EXACTLY one of:`

For each approved item:
- Create with `gh issue create --title "<title>" --body "<body+source-trailer>" --label "<bug|feature>"`
- Body trailer: `\n\n---\n_Promoted by /adv-triage from {source}: {ref}_`
- Capture the new issue number; add to project via `gh project item-add <N> --owner <owner> --url <issue-url>`
- Set the project `Type` field to `bug` or `feature` accordingly

Skip items where `kind_hint` is still `unknown` after reclassify and no user override — surface in the final report under "skipped: ambiguous kind".

### 3b. User-only field assignments

Build the assignment matrix from open GH issues (existing + just-created):

| Need | Population condition |
|---|---|
| `priority:*` label on bug | issue has `bug` label, no `priority:*` label |
| `Value` field on feature | issue has `feature` label, project `Value` field is null |

If the matrix is non-empty:

```
{N} issue(s) need user-only field assignments:

Bugs (priority):
1. #{num} — {title}
2. #{num} — {title}

Features (Value 1-13):
3. #{num} — {title}
4. #{num} — {title}

Reply EXACTLY one of:
- `assign 1=high 2=critical 3=8 4=5 ...` — space-separated `id=value` pairs (priority labels for bugs; integer 1-13 for features)
- `defer N` (or `defer N,M`) — leave listed items unscored, exclude from roadmap this run
- `defer all` — leave all listed items unscored
- `stop` / `abort` — halt the entire /adv-triage run

Anything else → re-prompt with the same options.
```

**Anchor phrase:** `Reply EXACTLY one of:`

Validation:
- Bug values must be one of `critical`, `high`, `medium`, `low` (case-insensitive). Apply via `gh issue edit <num> --add-label "priority:<value>"`.
- Feature values must be integer in `[1,13]`. Apply via `gh project item-edit --project-id <pid> --id <item-id> --field-id <Value-field-id> --number <n>`.
- Any invalid pair → reject the entire reply, re-prompt unchanged.

Items deferred or skipped due to ambiguity are excluded from Phase 5 roadmap rendering and surfaced in the final report under "deferred / unscored".

---

## Phase 4: Agent Scoring (autonomous)

For each feature with `Value` set but missing `TimeCriticality`, `RROE`, or `Effort` (or all of them when `--rescore`), the agent must assess and assign a number in `[1,13]` for each missing dimension. Then compute `WSJF = (Value + TimeCriticality + RROE) / Effort` and round to one decimal place.

### Scoring rubric

Modified Fibonacci: `1, 2, 3, 5, 8, 13`. Pick the closest value, do not interpolate.

| Dimension | Anchor at low (1-2) | Anchor at high (8-13) |
|---|---|---|
| **Value** (user-supplied) | nice-to-have polish, niche audience | core differentiator, broad user impact |
| **TimeCriticality** | no decay, can wait 6+ months | hard deadline, security, user-blocking |
| **RROE** (risk reduction / opportunity enablement) | independent feature | unblocks roadmap, reduces architectural debt, enables several follow-ons |
| **Effort** | <1 day, single-file mechanical | multi-week, cross-system, requires research + migration |

### Evidence requirements (anti-hallucination)

For each agent-assigned dimension, attach a one-line justification in the project field's adjacent **Notes** field if present, OR as a `<!-- adv-triage:scoring -->` HTML comment appended to the issue body. Format:

```
<!-- adv-triage:scoring v1
TimeCriticality=5: blocks /adv-discover for new users; user growth-aware
RROE=8: enables Phase 5 roadmap auto-update without manual edits
Effort=3: contained in single command + manifest entry
WSJF=5.3 = (8 + 5 + 8) / 3
scored_by=agent
scored_at=2026-05-08T12:34:56Z
-->
```

Update the project fields via `gh project item-edit` for each numeric dimension and `WSJF`.

### Bug rebound

Bugs do **not** get `Value`/`TC`/`RROE`/`Effort`/`WSJF`. They use `priority:*` labels only. If a bug has been mistakenly given numeric fields, log a warning in the report but do not modify (user may have intended unified ranking).

---

## Phase 5: Generate ROADMAP.md

Read final state from the project: `gh project item-list <N> --owner <owner> --format json --limit 500` filtered to open issues only.

### Layout

```markdown
# Roadmap

<!-- adv-triage generated: {ISO-8601 UTC} | DO NOT EDIT MANUALLY -->
<!-- Source of truth: GitHub Project #{N} owned by @{owner} -->

Regenerate with `/adv-triage --execute`. Manual edits are overwritten.

## Bugs (by priority)

### Critical
| # | Title | Labels |
|---|-------|--------|
| #{num} | {title} | {labels except priority:* and bug} |

### High
…

### Medium
…

### Low
…

(Skip any subsection with zero items.)

## Features (by WSJF, descending)

| # | Title | V | TC | RROE | E | WSJF | Labels |
|---|-------|---|----|------|---|------|--------|
| #{num} | {title} | 8 | 5 | 8 | 3 | 7.0 | {labels except feature} |

(Sort key: WSJF descending, ties broken by Value descending, then issue number ascending.)

## Deferred / Unscored

- #{num} — {title} — _reason_ ({user-deferred|missing kind|missing Value})

## Triage Run Summary

- Run timestamp: {ISO-8601 UTC}
- Sources scanned: {comma-separated source names with counts}
- Issues opened this run: {N}
- Field assignments this run: {N}
- Items deferred: {N}
```

### Local source deprecation

For each item promoted from a non-GH source in Phase 3a, surface a Tier B inline batch prompt:

```
Promoted {N} item(s) to GH issues. Deprecate the local sources?

1. .adv/CROSS-SESSION-NOTES-2026-05-04.md line 42 → #123
2. agenda item ag-xyz → #124
3. plugin/src/foo.ts:88 TODO → #125
…

Reply EXACTLY one of:
- `deprecate all` — apply per-source deprecation (delete TODO line, mark agenda done, strike note line)
- `deprecate N` (or `deprecate N,M`) — apply only the listed numbers
- `keep all` — leave local sources intact
- `stop` / `abort` — halt before commit

Anything else → re-prompt with the same options.
```

**Per-source deprecation actions:**

| Source | Action |
|---|---|
| TODO / FIXME comment | `edit` to replace `// TODO: …` with `// see #{num}` (preserve language comment style) |
| Agenda item | `adv_agenda_complete itemId: <id> notes: "promoted to #{num}"` |
| ADV wisdom | append `Promoted to #{num}` line to the wisdom entry note (no delete; wisdom is append-only) |
| Cross-session note line | `edit` to prefix the line with `~~` and append ` → #{num}` (markdown strikethrough) |
| Active ADV change | no deprecation; the change continues normally — issue is informational link |

### ROADMAP.md write + commit (when `--execute` and not `--no-commit`)

Final Tier B inline approval before any git mutation:

```
Ready to commit and push ROADMAP.md to {default-branch}.

Diff summary:
- {bug_count_delta} bugs ({by_tier})
- {feature_count_delta} features ({top-3 by WSJF preview})
- {deferred_count} deferred

Files staged: ROADMAP.md (only)
Commit: chore(roadmap): /adv-triage update {YYYY-MM-DD}
Target: origin/{default-branch}

Reply EXACTLY one of:
- `commit and push` — stage ROADMAP.md only, commit, pull --rebase, push to origin
- `commit only` — commit locally, do not push (user pushes manually)
- `dry run` — print full ROADMAP.md to chat, no file write, no commit
- `cancel` / `stop` — halt; do not write file

Anything else → re-prompt with the same options.
```

**Anchor phrase:** `Reply EXACTLY one of:`

`commit and push` execution sequence (each step gates the next):

1. Resolve default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`
2. Verify current branch is the default branch. If not, abort with explicit error: ROADMAP commit must run on default branch (P32 trunk-is-prod alignment — generated artifact only).
3. Verify clean working tree except for ROADMAP.md: `git status --porcelain` must show only `ROADMAP.md`. If anything else is dirty, abort with the offending paths listed.
4. `git add ROADMAP.md` (explicit path — never `git add -A`)
5. `git commit -m "chore(roadmap): /adv-triage update $(date -u +%Y-%m-%d)"`
6. `git pull --rebase --autostash origin <default-branch>` — abort and surface error if rebase has conflicts (extremely unlikely for ROADMAP.md only)
7. `git push origin <default-branch>`
8. Emit `[ADV:WORK] Pushed roadmap commit <sha> to origin/<default-branch>.`

If any step fails: stop, surface the failing command + stderr, do not retry. The commit itself is small enough to redo manually.

---

## Phase 6: Final Report

After all phases (or after a dry-run scan), emit:

```
## /adv-triage report

Mode: {dry-run | execute}
Run timestamp: {ISO-8601}
Project: #{N} ({owner}/ADV: {repo-name})

### Sources scanned
- gh: {open_issue_count} (represented {R})
- agenda: {N}
- wisdom (failure+gotcha): {N}
- notes: {N} files, {M} candidate items
- changes (in-flight): {N}
- todos: {N}

### Issues
- Created: {N} (with numbers and titles)
- Updated (priority/Value/scoring): {N}
- Deferred: {N}
- Skipped (ambiguous kind): {N}

### Roadmap
- Bugs: {critical}/{high}/{medium}/{low}
- Features: {N} ranked by WSJF
- Top 5 features:
  1. #{num} — {title} — WSJF {n}
  …

### Local sources deprecated
- {N} TODOs replaced with `// see #{num}`
- {N} agenda items completed
- {N} note lines struck through
- {N} wisdom entries annotated

### File written
- ROADMAP.md ({size} bytes)
- Commit: {sha or "not committed"}
- Pushed: {yes / no / dry-run}
```

If dry-run: append `Re-run with `--execute` to apply mutations.`

---

## Coexistence

| Command | Role | Relationship to /adv-triage |
|---|---|---|
| `/adv-status` | Read-only project overview | `adv-triage` is the prioritization counterpart |
| `/adv-cleanup` | Triage abandoned/duplicate active changes | Disjoint scope — `cleanup` operates on ADV changes, `triage` on the GH backlog |
| `/adv-idea` / `/adv-problem` | Shape new ideas / triage bugs into changes | `triage` runs after these have settled into agenda or notes; promotes them to GH issues |
| `/adv-improve` | Suggest spec/impl improvements | Improvement suggestions become inventory items in Phase 1 (notes / wisdom) |
| `/adv-tron` | Codebase reconnaissance, hotspot detection | Tron findings can feed agenda → which `triage` then promotes to issues |

---

## Anti-Patterns

| × Bad | ✓ Good |
|---|---|
| Auto-create GH issues without Tier B approval | Batch unrepresented items into a single approval prompt |
| Use `git add -A` before the roadmap commit | `git add ROADMAP.md` only — explicit single-file stage |
| Commit ROADMAP.md from a feature branch | Commit only on default branch; abort otherwise |
| Assign Value to a feature autonomously | Value is user-only; defer if user does not assign |
| Skip evidence trailer on agent-scored fields | Always append `<!-- adv-triage:scoring v1 ... -->` block to issue body |
| Write WSJF for bugs | Bugs use `priority:*` labels only |
| Recompute WSJF on every run for already-scored features | Only fill missing fields unless `--rescore` is set |
| Drop low-priority TODOs on the floor without surfacing | All inventory items appear in the final report, even if deferred |
| LLM fallback on ambiguous Tier B reply | Whitelist + regex only; re-prompt unchanged |

---

## Key Tools

| Purpose | Tool |
|---|---|
| List open GH issues | `gh issue list --state open --json …` |
| Create issue | `gh issue create` |
| Edit issue labels | `gh issue edit <num> --add-label / --remove-label` |
| List project items | `gh project item-list <N> --owner <owner> --format json` |
| Add issue to project | `gh project item-add` |
| Edit project field | `gh project item-edit` |
| Create project field | `gh project field-create` |
| Persist project metadata | `adv_project_metadata` (read/write `github_project`) |
| Active ADV changes | `adv_change_list status: 'in-flight'` |
| Agenda | `adv_agenda_list`, `adv_agenda_complete` |
| Wisdom | `adv_wisdom_list` |
| Local source scan | `glob`, `read`, `lgrep_search_text` |
| Roadmap edit | `write` (whole file each run; deterministic from project state) |
| Git ops | `bash` (`git status`, `git add ROADMAP.md`, `git commit`, `git pull --rebase`, `git push`) |
