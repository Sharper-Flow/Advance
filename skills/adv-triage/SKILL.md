---
name: adv-triage
description: "Backlog reconciliation, WSJF scoring, and ROADMAP.md regeneration methodology"
keywords: ["triage", "backlog", "wsjf", "roadmap", "github-projects", "prioritization", "scoring"]
---

# Triage Skill — Backlog Reconciliation & WSJF Scoring

## Purpose

Methodology for `/adv-triage`: reconcile backlog sources into GH issues, score features via WSJF on a GH Projects v2 board, regenerate `ROADMAP.md`. Storage of truth = GH Projects v2 (typed NUMBER fields); ROADMAP.md = generated mirror. Hybrid HITL: agent fills RROE/TimeCriticality/Effort autonomously; pauses for user-only bug Priority + feature Value.

**Canonical source:** `.opencode/command/adv-triage.md` owns phase orchestration. This skill owns rubrics, formulas, prompt templates, schemas, anti-patterns.

## Phase 0 — Project Bootstrap Methodology

### Required label set

`bug`, `feature`, `priority:critical`, `priority:high`, `priority:medium`, `priority:low`. Auto-create missing via `gh label create` (idempotent). Log creations.

### Project resolution

1. Read `adv_project_metadata key: 'github_project'`
2. If absent: resolve `<owner>` from `gh repo view`, try `gh project list --owner <owner>` matching title `ADV: <repo-name>` exactly
3. Still no match → Tier B inline approval to create (template below)

### Required custom fields

| Field | Type | Options |
|---|---|---|
| `ADV Type` | SINGLE_SELECT | `bug,feature` |
| `Priority` | SINGLE_SELECT | `critical,high,medium,low` |
| `Value` | NUMBER | — |
| `TimeCriticality` | NUMBER | — |
| `RROE` | NUMBER | — |
| `Effort` | NUMBER | — |
| `WSJF` | NUMBER | — |
| `Status` | SINGLE_SELECT | `Backlog,Ready,In Progress,Blocked,Done` (only if absent — GH provides by default) |

Persist via `adv_project_metadata action: 'write' key: 'github_project' value: { owner, project_number, project_id, fields: { ... } }`.

### Repository filter auto-detect (rq-repoFilter01, first-run only)

Decide whether to populate `repository_filter` on `.adv/github-project.json` (`GitHubProjectConfigSchema`). Use `parseGitRemoteUrl` (`plugin/src/utils/git-remote.ts`) on `git remote get-url origin`:

| Precondition | Action |
|---|---|
| Existing config has `repository_filter` | Do NOT overwrite |
| `parseGitRemoteUrl` returns `null` | Skip |
| Parsed `owner` ≠ project owner | Skip (cross-owner out of scope) |
| Project title matches `^ADV: ` | Skip (board already per-repo scoped) |
| All preconditions pass | Write `repository_filter: <repo-name>` (bare repo name) |

Bootstrap is first-run-only (C6). Re-runs MUST NOT mutate existing filter; manual edits to `.adv/github-project.json` are the override path.

### Bootstrap approval prompt (Tier B, when project must be created)

```
ADV needs a GitHub Projects v2 board for backlog scoring.

Owner: {owner}
Title: ADV: {repo-name}
Linked repo: {owner}/{repo}
Custom fields to create: ADV Type, Priority, Value, TimeCriticality, RROE, Effort, WSJF

Reply EXACTLY one of:
- `create` — create project, link to repo, create fields, persist metadata
- `use existing N` — use an existing project number N owned by {owner}
- `cancel` / `stop` — halt the entire /adv-triage run

Anything else → re-prompt with the same options.
```

**Anchor:** `Reply EXACTLY one of:`. On `use existing N`: validate, ensure fields, persist; do not silently fall back.

## Phase 1 — Source Inventory Methodology

### Source enumeration

| Source | Tool | Extract |
|---|---|---|
| GH open issues | `gh issue list --state open --limit 500 --json number,title,body,labels,url,createdAt` | full list + labels |
| GH Projects items | `gh project item-list <N> --owner <owner> --format json --limit 500` (append `--query "repo:<owner>/<repository_filter>"` when typed config sets `repository_filter` — rq-repoFilter01) | items + field values |
| Active ADV changes | `adv_change_list status: 'in-flight'` | id, title, summary |
| ADV agenda | `adv_agenda_list` | pending + active |
| ADV wisdom (failures+gotchas) | `adv_wisdom_list type: 'failure'` then `type: 'gotcha'` | content snippets |
| Cross-session notes | `glob .adv/CROSS-SESSION-NOTES-*.md` + `read` | bullets, headings, action lines |
| TODO/FIXME | `lgrep_search_text query: 'TODO\|FIXME' path: <repo-root>` (filter `plugin/src/**`, `.opencode/**`, `docs/**`) | file:line + text |

Cap each source at 100 items; sort overflow by recency, surface "(N more not shown)".

### Inventory record schema

```
{ source: <source-name>, ref: <stable-ref>, title: <short-title>, body: <excerpt>, kind_hint: <bug|feature|unknown> }
```

### kind_hint heuristics (advisory only — P33)

| Source | Heuristic |
|---|---|
| `wisdom type:failure` | → `bug` |
| `wisdom type:gotcha` | likely `bug` (verify body) |
| `agenda` | use category if present, else `unknown` |
| `TODO\|FIXME` | `bug` if matches `/(?:bug|broken|fix|incorrect|wrong|crash|leak)/i`, else `feature` |
| ADV active changes | `feature` if `proposalKind ∈ {addCapability, modifyCapability}`, `bug` if `bugfix`, else `unknown` |
| Notes lines | `unknown` (defer to user in Phase 3) |

P33 guardrail: `kind_hint` is advisory triage only. May prefill Phase 3 prompt labels but must NOT create issues, mutate labels, or suppress candidates without explicit user confirmation.

## Phase 2 — Match Algorithm

**Structural first, heuristic last:**

1. **Stable ref match** — issue body contains source's `ref` (e.g. `wisdom-id`, `tk-…`, `file:line` for TODO, `change-id`). Exact evidence → mark **represented**.
2. **Body excerpt match** — first 80 chars of source `body` (lowercased, normalized) appears verbatim in any open issue body. Exact evidence → mark **represented**.
3. **Title similarity** — Jaccard similarity of normalized title tokens ≥ `0.6`. Title normalization: lowercase, trim, collapse whitespace, strip punctuation, drop stopwords (`a`, `the`, `and`, `or`, `for`, `to`, `of`, `in`). Heuristic only → mark **candidate duplicate**, NOT represented.

Only ref/body matches may auto-suppress issue creation. Title-similarity matches stay in Phase 3 user-confirmation list with candidate issue number.

### Output collections

- `represented[]` — `(source-item, gh-issue-number, exact_match_reason)` (informational)
- `unrepresented[]` — items with `kind_hint`, proposed title/body for issue creation, optional `candidate_duplicate_issue`

If `unrepresented[]` empty AND all represented issues have required fields → skip Phases 3-5, jump to Phase 6 ("No new issues, no field gaps. Roadmap may still need regen if `--rescore`.").

## Phase 3a — Confirm New GH Issues Prompt (Tier B)

Only when `unrepresented[]` is non-empty.

```
Found {N} backlog item(s) not represented by any open GH issue:

1. [bug?] {title} — {source}: {ref} {optional: — possible duplicate #{num}}
   {body excerpt 1-2 lines}
2. [feature?] {title} — {source}: {ref} {optional: — possible duplicate #{num}}
   {body excerpt}
...

Reply EXACTLY one of:
- `create all` — open all listed items as GH issues
- `create none` / `skip` — open nothing in this batch
- `create N` (or `create N,M`) — open only the listed numbers
- `reclassify N as bug` / `reclassify N as feature` — flip kind_hint, re-prompt
- `stop` / `abort` — halt the entire /adv-triage run

Anything else → re-prompt with the same options.
```

**Anchor:** `Reply EXACTLY one of:`

For each approved item:
- `gh issue create --title "<title>" --body "<body+source-trailer>" --label "<bug|feature>"`
- Body trailer: `\n\n---\n_Promoted by /adv-triage from {source}: {ref}_`
- Add to project: `gh project item-add <N> --owner <owner> --url <issue-url>`
- Set `ADV Type` field via GraphQL

Items still `unknown` after reclassify and no user override → skip; surface in report under "skipped: ambiguous kind".

### Triage-origin tagging (rq-issueChangeLinkage01)

If user immediately starts new ADV change for one of these issues via `/adv-proposal` afterwards, the proposal MUST pass:

- `origin_kind: 'triage'`
- `origin_source_artifact: '<promoted-from-ref>'` (e.g. `ag-abc123`, `ws-xyz`, `path/to/file.ts:42`)
- `origin_issue_number: <created-issue-number>`

Triage promotion does NOT auto-create the ADV change — change creation is user-initiated. Origin args record promotion lineage for `/adv-archive --close-issue` and `/adv-roadmap` cross-reference.

## Phase 3b — User-Only Field Assignments (question tool)

Build assignment matrix from open issues (existing + just-created):

| Need | Population condition |
|---|---|
| `priority:*` label on bug | issue has `bug` label, no `priority:*` label |
| `Value` field on feature | issue has `feature` label, project `Value` field null |

If matrix non-empty: use `question` tool — **never plain-text chat**. Two-stage: batch control then per-item.

### Stage 1: Batch control

```
question({
  questions: [{
    header: "Batch assignment: {N} item(s)",
    question: "{N} issue(s) need user-only field assignments:\n\n{numbered list}\n\nChoose how to proceed:",
    options: [
      { label: "One by one (Recommended)", description: "Prompt each item individually via structured questions" },
      { label: "Autofill all features", description: "Agent assigns Value from issue body content. Bug priority still prompted." },
      { label: "Defer all", description: "Leave all unscored, exclude from roadmap this run" },
      { label: "Stop", description: "Halt the entire /adv-triage run" }
    ]
  }]
})
```

| Choice | Action |
|---|---|
| `One by one` | Per-item loop (Stage 2) for all items |
| `Autofill all features` | Autofill all features per Autofill semantics; per-item loop for bug priorities only |
| `Defer all` | Skip all, exclude from roadmap, → Phase 4 |
| `Stop` | Halt run |

### Stage 2: Per-item loop

Bugs first (by issue number asc), then features. One `question` call per item.

**Bug priority:**

```
question({
  questions: [{
    header: "Bug #{num}: {title}",
    question: "Set priority for bug #{num}:\n{body excerpt, 1-2 lines}",
    options: [
      { label: "critical", description: "System down, data loss, security" },
      { label: "high", description: "Major functionality broken, no workaround" },
      { label: "medium", description: "Workaround exists, notable friction" },
      { label: "low", description: "Minor, cosmetic, deferrable" },
      { label: "Defer", description: "Skip this item; exclude from roadmap this run" }
    ]
  }]
})
```

**Feature Value:**

```
question({
  questions: [{
    header: "Feature #{num}: {title}",
    question: "Set business Value (1-13) for feature #{num}:\n{body excerpt}\n\nRubric: 1-2 cosmetic/niche · 3 quality-of-life · 5 active workflow improvement · 8 core differentiator · 13 strategic/foundational",
    options: [
      { label: "1", description: "Cosmetic, niche, single-user, easily-deferrable" },
      { label: "2", description: "Slightly above cosmetic" },
      { label: "3", description: "Quality-of-life, narrow surface, no growth multiplier" },
      { label: "5", description: "Active workflow improvement, recurring friction signal" },
      { label: "8", description: "Core differentiator, unblocks roadmap stream, broad surface" },
      { label: "13", description: "Strategic, foundational, blocks multiple workflows" },
      { label: "Defer", description: "Skip; exclude from roadmap this run" },
      { label: "Autofill", description: "Agent assigns Value from issue body using rubric" }
    ]
  }]
})
```

### Per-item response handling

1. Concrete value → record, continue.
2. `Defer` → exclude from roadmap, continue.
3. `Autofill` (features only) → apply autofill, record evidence block, continue.
4. Write-in/custom → validate (rules below); if invalid, inline error + re-prompt same item.
5. After all items → apply assignments as batch via GraphQL mutations.

### Validation

- Bug values: `critical|high|medium|low` (case-insensitive). Apply via `gh issue edit <num> --add-label "priority:<value>"`.
- Feature values: integer `[1,13]`. Apply via single-field GraphQL:

```bash
gh api graphql --include -f query="
  mutation { update: updateProjectV2ItemFieldValue(input: {
    projectId: \"<project_id>\", itemId: \"<item_id>\",
    fieldId: \"<Value_field_id>\", value: {number: <n>}
  }) { projectV2Item { id } } }"
```

- Check `x-ratelimit-remaining` after each write. If `< 10`, stop, report reset time.
- Invalid write-in → inline error + re-prompt same item.

### GraphQL budget gate (before Value writes)

```bash
budget_info=$(gh api graphql -f query='{ rateLimit { remaining resetAt } }')
graphql_remaining=$(echo "$budget_info" | jq '.data.rateLimit.remaining')
graphql_reset=$(echo "$budget_info" | jq -r '.data.rateLimit.resetAt')
estimated=$((feature_count + 100))
if [ "$graphql_remaining" -lt "$estimated" ]; then
  echo "[ADV:BLOCKED] GraphQL budget insufficient for Value writes: ${graphql_remaining} remaining, ${estimated} needed. Resets at ${graphql_reset}."
fi
```

Deferred/skipped items excluded from Phase 5 rendering; surfaced in final report under "deferred / unscored".

### Autofill semantics (Phase 3b only)

When user selects `Autofill all features` (Stage 1) or `Autofill` (per-item feature), agent assigns Value (1-13) using modified-Fibonacci rubric. Anti-hallucination evidence mandatory: every autofilled Value MUST be backed by a quote from issue body (or `(no body content)` marker) and recorded in `<!-- adv-triage:scoring v1 ... -->` block alongside `scored_by=agent` and `scored_at`.

| Anchor | Signal in issue body |
|---|---|
| 1-2 | Cosmetic, niche, single-user, easily-deferrable |
| 3 | Quality-of-life, narrow surface, no growth multiplier |
| 5 | Active workflow improvement, recurring friction signal |
| 8 | Core differentiator, unblocks roadmap stream, broad surface |
| 13 | Strategic, foundational, blocks multiple workflows or external commitments |

Failure: if issue body empty or insufficient → log `autofill_failed: insufficient_signal`, defer. Do not guess. Report's "Updated" count includes autofilled separately as `Autofilled: {N}`.

× Autofill MUST NOT apply to bug `priority:*` — bug priority is user-only (impact severity judgment, not body heuristic).

## Phase 4 — Agent Scoring Methodology

For each feature with `Value` set but missing `TimeCriticality`/`RROE`/`Effort` (or all when `--rescore`), agent assigns number `[1,13]` per dimension. `WSJF = (Value + TimeCriticality + RROE) / Effort`, rounded 1 decimal.

### Cached project-state protocol

Reuse `project_items` map from Phase 1: `{issue_number → {item_id, fields: {value, timeCriticality, rROE, effort, wSJF}, ...}}`. Do NOT call `gh project item-list` again in Phase 4.

### GraphQL budget estimation gate

```bash
estimated=$((features_needing_scoring + 1 + 100))
# Same gate pattern as Phase 3b
```

### Batched GraphQL mutation (4 fields per item)

```bash
gh api graphql --include -f query="
  mutation {
    tc: updateProjectV2ItemFieldValue(input: { projectId: \"$PROJECT_ID\", itemId: \"$ITEM_ID\", fieldId: \"$TC_FIELD_ID\", value: {number: $TC_VALUE} }) { projectV2Item { id } }
    rroe: updateProjectV2ItemFieldValue(input: { projectId: \"$PROJECT_ID\", itemId: \"$ITEM_ID\", fieldId: \"$RROE_FIELD_ID\", value: {number: $RROE_VALUE} }) { projectV2Item { id } }
    effort: updateProjectV2ItemFieldValue(input: { projectId: \"$PROJECT_ID\", itemId: \"$ITEM_ID\", fieldId: \"$EFFORT_FIELD_ID\", value: {number: $EFFORT_VALUE} }) { projectV2Item { id } }
    wsjf: updateProjectV2ItemFieldValue(input: { projectId: \"$PROJECT_ID\", itemId: \"$ITEM_ID\", fieldId: \"$WSJF_FIELD_ID\", value: {number: $WSJF_VALUE} }) { projectV2Item { id } }
  }"
```

### Sequential paced writes

- 1-second `sleep 1` between batches.
- After each batch, parse `x-ratelimit-remaining` from headers (`--include` flag).
- If `< 10`: stop immediately, report `x-ratelimit-reset`.
- If headers missing (error responses): fall back to `rateLimit` query.
- Parse response for `errors` array — GraphQL returns HTTP 200 even with errors. Log per-alias errors, continue.

### Idempotent resume

Before each batch:

1. Check cached `project_items[issue_number].fields` against target values.
2. All 4 match → skip item, log "skipped: already correct".
3. Subset matches → only include non-matching fields in batch.
4. `--rescore` overrides: always include all 4.
5. WSJF float comparison: `±0.05` tolerance.

### Scoring rubric

Modified Fibonacci: `1, 2, 3, 5, 8, 13`. Closest value, no interpolation.

| Dimension | Anchor 1-2 | Anchor 8-13 |
|---|---|---|
| **Value** (user-supplied) | nice-to-have polish, niche audience | core differentiator, broad user impact |
| **TimeCriticality** | no decay, can wait 6+ months | hard deadline, security, user-blocking |
| **RROE** | independent feature | unblocks roadmap, reduces arch debt, enables follow-ons |
| **Effort** | <1 day, single-file mechanical | multi-week, cross-system, requires research + migration |

### Evidence requirements (anti-hallucination)

For each agent-assigned dimension, attach one-line justification in project field's adjacent `Notes` field, OR `<!-- adv-triage:scoring -->` HTML comment in issue body:

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

Update project fields via batched `gh api graphql --include` mutations above.

### Bug rebound

Bugs do NOT get `Value`/`TC`/`RROE`/`Effort`/`WSJF`. They use `priority:*` only. If bug mistakenly has numeric fields, log warning in report; do NOT modify (user may have intended unified ranking).

## Phase 5 — ROADMAP.md Generation Methodology

Read final state via fresh `gh project item-list <N> --owner <owner> --format json --limit 500` filtered to open issues. **Fresh read mandatory** — do NOT reuse Phase 1/4 caches (Phase 4 mutations may have changed values).

### Server-side scoping (rq-repoFilter01)

When typed config sets `repository_filter`, fresh read MUST append `--query "repo:<owner>/<repository_filter>"` to match Phase 1 universe. Omitting inflates ROADMAP.md and `.adv/roadmap-snapshot.json` with cross-repo items Phase 1 excluded, producing snapshots that disagree with `adv_roadmap source: 'live'`. Snapshot writer mirrors value onto optional top-level `repository_filter` field so `adv_roadmap source: 'file'` surfaces same scope.

### Two outputs from one read (mandatory)

| Artifact | Path | Audience |
|---|---|---|
| `ROADMAP.md` | repo root | Humans + agents reading prose |
| `.adv/roadmap-snapshot.json` | `.adv/roadmap-snapshot.json` | `adv_roadmap` MCP tool, programmatic reads |

Both MUST be written before Phase 5.5 echo and commit/push. Snapshot is structured mirror — `adv_roadmap source: 'file'` reads without parsing markdown.

### Snapshot schema (version 1)

```jsonc
{
  "version": 1,
  "generated_at": "<ISO-8601 UTC>",
  // rq-repoFilter01: optional, mirrors typed-config field; omitted when unset.
  "repository_filter": "<bare-repo-name>",
  "project": { "owner": "<owner>", "number": <N>, "title": "ADV: <repo-name>" },
  "counts": { "total": <N>, "bugs": <N>, "features": <N>, "deferred": <N> },
  "bugs": [ { "number": 89, "title": "...", "priority": "high", "labels": [] }, ... ],
  "features": [ { "number": 51, "title": "...", "value": 8, "time_criticality": 3, "rroe": 13, "effort": 3, "wsjf": 8.0, "labels": [] }, ... ],
  "deferred": [ { "number": 90, "title": "...", "reason": "user-deferred (Value)" }, ... ]
}
```

Sort `features` by WSJF desc (ties: Value desc, then issue number asc). `bugs` in priority-tier order (critical → high → medium → low → unprioritized). Commit together: `git add ROADMAP.md .adv/roadmap-snapshot.json`.

### ROADMAP.md layout

```markdown
# Roadmap

<!-- adv-triage generated: {ISO-8601 UTC} | DO NOT EDIT MANUALLY -->
<!-- Source of truth: GitHub Project #{N} owned by @{owner} -->

Regenerate with `/adv-triage`. Manual edits are overwritten.

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

(Skip subsection if zero items.)

## Features (by WSJF, descending)

| # | Title | V | TC | RROE | E | WSJF | Labels |
|---|-------|---|----|------|---|------|--------|
| #{num} | {title} | 8 | 5 | 8 | 3 | 7.0 | {labels except feature} |

(Sort: WSJF desc, ties → Value desc → issue number asc.)

## Deferred / Unscored

- #{num} — {title} — _reason_ ({user-deferred|missing kind|missing Value})

## Triage Run Summary

- Run timestamp: {ISO-8601 UTC}
- Sources scanned: {comma-separated source names with counts}
- Issues opened this run: {N}
- Field assignments this run: {N}
- Items deferred: {N}
```

### Local source deprecation prompt (Tier B batch)

For each item promoted from non-GH source in Phase 3a:

```
Promoted {N} item(s) to GH issues. Deprecate the local sources?

1. .adv/CROSS-SESSION-NOTES-2026-05-04.md line 42 → #123
2. agenda item ag-xyz → #124
3. plugin/src/foo.ts:88 TODO → #125
…

Reply EXACTLY one of:
- `deprecate all` — apply per-source deprecation
- `deprecate N` (or `deprecate N,M`) — apply only listed numbers
- `keep all` — leave local sources intact
- `stop` / `abort` — halt before commit

Anything else → re-prompt with the same options.
```

**Per-source deprecation actions:**

| Source | Action |
|---|---|
| TODO/FIXME comment | `edit` replace `// TODO: …` with `// see #{num}` (preserve comment style) |
| Agenda item | `adv_agenda_complete itemId: <id> notes: "promoted to #{num}"` |
| ADV wisdom | append `Promoted to #{num}` line to wisdom entry (no delete; append-only) |
| Cross-session note line | `edit` prefix line with `~~`, append ` → #{num}` (markdown strikethrough) |
| Active ADV change | no deprecation; change continues, issue is informational link |

### ROADMAP.md commit prompt (Tier B, execute mode when not `--no-commit`)

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
- `commit and push` — stage, commit, pull --rebase, push
- `commit only` — commit locally, no push
- `dry run` — print full ROADMAP.md to chat, no file write, no commit
- `cancel` / `stop` — halt; do not write file

Anything else → re-prompt with the same options.
```

**Anchor:** `Reply EXACTLY one of:`

### `commit and push` execution sequence (each step gates next)

1. Resolve default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`
2. Verify current branch IS default branch. Else abort: ROADMAP commit must run on default branch (P32 trunk-is-prod alignment).
3. Verify clean tree except `ROADMAP.md` + `.adv/roadmap-snapshot.json`: `git status --porcelain` must show only those two paths. Else abort with offending paths.
4. `git add ROADMAP.md .adv/roadmap-snapshot.json` (explicit paths — never `git add -A`)
5. `git commit -m "chore(roadmap): /adv-triage update $(date -u +%Y-%m-%d)"`
6. `git pull --rebase --autostash origin <default-branch>` — abort and surface error if conflicts
7. `git push origin <default-branch>`
8. Emit `[ADV:WORK] Pushed roadmap commit <sha> to origin/<default-branch>.`

Any step fails → stop, surface failing command + stderr, do NOT retry. Commit is small enough to redo manually.

## Phase 5.5 — Roadmap Echo (mandatory)

After ROADMAP.md is written (committed or not), agent MUST emit full generated content as fenced markdown in chat.

| Mode | Echo trigger |
|---|---|
| Default execute (file written + committed) | Echo after Phase 5 commit step (or after write if `--no-commit`) |
| Execute with Tier B `dry run` reply at commit prompt | Echo in place of write — explicitly substitutes for file |
| `--dry-run` flag | Skip echo — no ROADMAP.md generated |

Echo format:

````
## ROADMAP.md (generated)

```markdown
{full ROADMAP.md content}
```
````

Echo is NOT optional and MUST NOT be replaced by "see ROADMAP.md" pointer or top-N truncation. User reads table directly in chat; file write and chat echo are two surfaces of same artifact.

× Anti-pattern: emit only "Top 5 features" or "Top 10 features" instead of full table.
× Anti-pattern: link to ROADMAP.md on disk without inline echo.
✓ Correct: echo full markdown, then Phase 6.

## Phase 6 — Final Report Template

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
- Autofilled (Phase 3b agent-assigned Value): {N}
- Deferred: {N}
- Skipped (ambiguous kind): {N}
- Skipped (autofill_failed: insufficient_signal): {N}

### Roadmap
- Bugs: {critical}/{high}/{medium}/{low}
- Features: {N} ranked by WSJF
- Full table: see Phase 5.5 echo above (mandatory chat output)

### Local sources deprecated
- {N} TODOs replaced with `// see #{num}`
- {N} agenda items completed
- {N} note lines struck through
- {N} wisdom entries annotated

### File written
- ROADMAP.md ({size} bytes)
- Commit: {sha or "not committed"}
- Pushed: {yes / no / dry-run}

### API Budget
- GraphQL points consumed: {N} (estimated from batch count)
- GraphQL points remaining: {N}
- GraphQL reset: {ISO-8601}
- Batch mutations issued: {N}
- Items skipped (already correct): {N}
```

If `--dry-run`: append `Re-run without `--dry-run` to apply mutations.`

## Coexistence

| Command | Role | Relationship to /adv-triage |
|---|---|---|
| `/adv-status` | Read-only project overview | `adv-triage` is prioritization counterpart |
| `/adv-cleanup` | Triage abandoned/duplicate active changes | Disjoint — `cleanup` on ADV changes, `triage` on GH backlog |
| `/adv-idea` / `/adv-problem` | Shape new ideas / triage bugs into changes | `triage` runs after these settle into agenda/notes; promotes to GH |
| `/adv-improve` | Suggest spec/impl improvements | Improvement suggestions → inventory items in Phase 1 (notes/wisdom) |
| `/adv-tron` | Codebase recon, hotspot detection | Tron findings → agenda → `triage` promotes to issues |

## Anti-Patterns

| × Bad | ✓ Good |
|---|---|
| Auto-create GH issues without Tier B approval | Batch unrepresented into single approval prompt |
| `git add -A` before roadmap commit | `git add ROADMAP.md .adv/roadmap-snapshot.json` only — explicit paths |
| Commit ROADMAP.md from feature branch | Commit only on default branch; abort otherwise |
| Assign Value to feature autonomously | Value is user-only; defer if user does not assign |
| Skip evidence trailer on agent-scored fields | Always append `<!-- adv-triage:scoring v1 ... -->` block |
| Write WSJF for bugs | Bugs use `priority:*` labels only |
| Recompute WSJF on every run for already-scored features | Only fill missing fields unless `--rescore` |
| Drop low-priority TODOs without surfacing | All inventory items appear in final report, even deferred |
| Plain-text chat for Phase 3b assignments | `question` tool with structured options, one at a time |
| Dump all items in single text blob asking for `id=value` pairs | Batch control question first, then per-item `question` calls |
| Skip batch control, go straight to per-item | Stage 1 (batch control) always first when matrix non-empty |
| Ignore `x-ratelimit-remaining` response header | Check after each batch via `--include`; stop if `< 10` |
| Use `rateLimit` query for every post-mutation check | Response headers (primary); `rateLimit` only for initial gate and fallback when headers missing |
| Emit only "Top 5 features" summary instead of full table | Phase 5.5 mandates full ROADMAP.md fenced markdown echo |
| Replace Phase 5.5 echo with "see ROADMAP.md" pointer | Echo + file are two surfaces of same artifact; both required |
