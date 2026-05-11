---
name: adv-triage
description: Triage all backlog sources, score features with WSJF, regenerate ROADMAP.md
---
<!-- manifest: adv-triage · requiresChangeId: false -->
# ADV Triage — Backlog Reconciliation, WSJF Scoring, Roadmap Regen

Reconcile every backlog source into GitHub Issues, score features with WSJF, and regenerate the prioritized `ROADMAP.md` at repo root. Storage of truth is a GitHub Projects v2 board (typed NUMBER fields); ROADMAP.md is a generated mirror committed and pushed at the end of the run. Hybrid HITL: agent fills RROE / Time Criticality / Effort autonomously, pauses only for user-only assignments (bug Priority, feature Value).

> **CHECKLIST**: Default to execute. Use `--dry-run` to preview without mutations. Tier B inline approval required before opening GH issues, before writing/pushing ROADMAP.md, and before deprecating local sources — these gates run in execute mode regardless of how the command was invoked. Bug priority uses existing `priority:{critical,high,medium,low}` labels; features use Projects v2 number fields (Value, TimeCriticality, RROE, Effort, WSJF). WSJF formula = `(Value + TimeCriticality + RROE) / Effort`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Parse Flags

Extract from `$ARGUMENTS`:

- `--dry-run` — preview only: scan inventory, show planned mutations, skip all GH/file/git mutations and Tier B approval prompts (default: execute)
- `--no-commit` — generate and write ROADMAP.md but skip the commit/push step (ignored when `--dry-run` is set)
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

<!-- rq-repoFilter01 -->
**Repository filter auto-detect (first run only):** after the project handle is resolved and BEFORE custom-field reconciliation, decide whether to populate `repository_filter` on the typed config (`.adv/github-project.json`, `GitHubProjectConfigSchema`). Use the `parseGitRemoteUrl` utility (`plugin/src/utils/git-remote.ts`) on `git remote get-url origin`:

| Precondition | Action |
|---|---|
| Existing config already has `repository_filter` | Do NOT overwrite — single source of truth wins |
| `parseGitRemoteUrl` returns `null` (non-GitHub or ambiguous remote) | Skip — leave filter unset |
| Parsed `owner` ≠ resolved project `owner` | Skip — cross-owner filtering is out of scope (DONT4) |
| Project title matches regex `^ADV: ` (per-repo board) | Skip — board is already single-repo scoped (AC5) |
| All preconditions pass | Write `repository_filter: <repo-name>` (bare repo name, owner inherited from config.owner) |

Bootstrap is first-run-only (C6). Re-runs that observe an existing filter MUST NOT mutate it; manual edits to `.adv/github-project.json` are the override path.

| Field name | Data type | Single-select options |
|---|---|---|
| `ADV Type` | `SINGLE_SELECT` | `bug,feature` |
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
Custom fields to create: ADV Type, Priority, Value, TimeCriticality, RROE, Effort, WSJF

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
| GH Projects v2 items | `gh project item-list <N> --owner <owner> --format json --limit 500` (append `--query "repo:<owner>/<repository_filter>"` when the typed config sets `repository_filter` — rq-repoFilter01) | current items + field values |
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

Structural-correctness guardrail (P33): `kind_hint` is advisory triage only. It may prefill labels for the Phase 3 user prompt, but must not create issues, mutate labels, or suppress candidates without explicit user confirmation.

---

## Phase 2: Match + Identify Gaps

For each non-GH inventory item, check if it is already represented by an open GH issue.

### Match algorithm (structural first, heuristic last)

1. **Stable ref match** — issue body contains the source's `ref` (e.g. `wisdom-id`, `tk-…`, file:line for TODO, `change-id`). Exact evidence; may mark **represented**.
2. **Body excerpt match** — first 80 chars of source `body` (lowercased, normalized) appears verbatim in any open issue body. Exact evidence; may mark **represented**.
3. **Title similarity** — Jaccard similarity of normalized title tokens ≥ `0.6`. Title normalization: lowercase, trim, collapse whitespace, strip punctuation, drop stopwords (`a`, `the`, `and`, `or`, `for`, `to`, `of`, `in`). Heuristic evidence only; mark **candidate duplicate**, not represented.

Only exact ref/body matches may suppress issue creation automatically. Title-similarity matches must remain in the Phase 3 user-confirmation list with the candidate issue number shown.

### Output

Build two collections:
- `represented[]` — `(source-item, gh-issue-number, exact_match_reason)` pairs (informational)
- `unrepresented[]` — items with `kind_hint`, proposed title/body for issue creation, and optional `candidate_duplicate_issue` from title similarity

If `unrepresented[]` is empty AND every represented issue already has the required field values populated → skip Phases 3-5, jump to Phase 6 with "No new issues, no field gaps. Roadmap may still need regen if `--rescore`."

---

## Phase 3: User Assignments (Tier B, batched)

Two separate user pauses. Both required when the underlying set is non-empty. Each is structured per `docs/command-voice-standard.md § Inline Approval Voice`. Skip empty sets.

### 3a. Confirm new GH issues to create

Only run if `unrepresented[]` is non-empty.

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
- `reclassify N as bug` / `reclassify N as feature` — flip the kind_hint, then re-prompt this list
- `stop` / `abort` — halt the entire /adv-triage run

Anything else → re-prompt with the same options.
```

**Anchor phrase:** `Reply EXACTLY one of:`

For each approved item:
- Create with `gh issue create --title "<title>" --body "<body+source-trailer>" --label "<bug|feature>"`
- Body trailer: `\n\n---\n_Promoted by /adv-triage from {source}: {ref}_`
- Capture the new issue number; add to project via `gh project item-add <N> --owner <owner> --url <issue-url>`
- Set the project `ADV Type` field to `bug` or `feature` accordingly

> **Triage-origin tagging (rq-issueChangeLinkage01):** if the user immediately starts a new ADV change for one of these promoted issues via `/adv-proposal` afterwards, that proposal MUST pass:
>
> - `origin_kind: 'triage'`
> - `origin_source_artifact: '<promoted-from-ref>'` (e.g. `ag-abc123` for an agenda item, `ws-xyz` for a wisdom entry, `path/to/file.ts:42` for a TODO)
> - `origin_issue_number: <created-issue-number>`
>
> The triage promotion itself does NOT auto-create an ADV change — change creation is always user-initiated. The origin args record the promotion lineage so archive flows (`/adv-archive --close-issue`) and roadmap surfaces (`/adv-roadmap` active-change cross-reference) can act on the linkage.

Skip items where `kind_hint` is still `unknown` after reclassify and no user override — surface in the final report under "skipped: ambiguous kind".

### 3b. User-only field assignments (question tool, one-by-one)

Build the assignment matrix from open GH issues (existing + just-created):

| Need | Population condition |
|---|---|
| `priority:*` label on bug | issue has `bug` label, no `priority:*` label |
| `Value` field on feature | issue has `feature` label, project `Value` field is null |

If the matrix is non-empty, use the `question` tool — **never plain-text chat** — to collect user assignments. Two-stage flow: batch control question first, then per-item questions.

#### Stage 1: Batch control

Present a single `question` call offering batch actions before entering the per-item loop:

```
question({
  questions: [{
    header: "Batch assignment: {N} item(s)",
    question: "{N} issue(s) need user-only field assignments:\n\n{numbered list of all items with issue numbers and titles}\n\nChoose how to proceed:",
    options: [
      { label: "One by one (Recommended)", description: "Prompt for each item individually using structured questions" },
      { label: "Autofill all features", description: "Agent assigns Value for all features from issue body content. Bug priority still prompted individually." },
      { label: "Defer all", description: "Leave all items unscored, exclude from roadmap this run" },
      { label: "Stop", description: "Halt the entire /adv-triage run" }
    ]
  }]
})
```

| Choice | Action |
|---|---|
| `One by one` | Enter per-item loop (Stage 2) for all items |
| `Autofill all features` | Apply autofill to all feature items per Autofill semantics below; then enter per-item loop for bug priorities only |
| `Defer all` | Skip all items, exclude from roadmap, proceed to Phase 4 |
| `Stop` | Halt the entire `/adv-triage` run |

#### Stage 2: Per-item loop

Iterate items one at a time: bugs first (by issue number ascending), then features. Each item gets its own `question` call.

**Bug priority items:**

```
question({
  questions: [{
    header: "Bug #{num}: {title}",
    question: "Set priority for bug #{num}:\n{body excerpt, 1-2 lines if available}",
    options: [
      { label: "critical", description: "System down, data loss, security vulnerability" },
      { label: "high", description: "Major functionality broken, no workaround" },
      { label: "medium", description: "Workaround exists, notable friction" },
      { label: "low", description: "Minor, cosmetic, or deferrable" },
      { label: "Defer", description: "Skip this item for now, exclude from roadmap this run" }
    ]
  }]
})
```

**Feature Value items:**

```
question({
  questions: [{
    header: "Feature #{num}: {title}",
    question: "Set business Value (1-13) for feature #{num}:\n{body excerpt, 1-2 lines if available}\n\nRubric: 1-2 cosmetic/niche · 3 quality-of-life · 5 active workflow improvement · 8 core differentiator · 13 strategic/foundational",
    options: [
      { label: "1", description: "Cosmetic, niche, single-user, easily-deferrable" },
      { label: "2", description: "Slightly above cosmetic" },
      { label: "3", description: "Quality-of-life, narrow surface, no growth multiplier" },
      { label: "5", description: "Active workflow improvement, recurring friction signal" },
      { label: "8", description: "Core differentiator, unblocks roadmap stream, broad surface" },
      { label: "13", description: "Strategic, foundational, blocks multiple workflows" },
      { label: "Defer", description: "Skip this item for now, exclude from roadmap this run" },
      { label: "Autofill", description: "Agent assigns Value from issue body using rubric" }
    ]
  }]
})
```

#### Per-item response handling

1. On concrete value → record assignment, continue to next item.
2. On `Defer` → exclude from roadmap this run, continue to next item.
3. On `Autofill` (features only) → apply autofill per Autofill semantics below, record evidence block, continue to next item.
4. On write-in/custom value → validate per rules below; if invalid, inline error message and re-prompt same item (not the whole batch).
5. After all items processed → apply recorded assignments as a batch via GraphQL mutations.

#### Validation

- Bug values must be one of `critical`, `high`, `medium`, `low` (case-insensitive). Apply via `gh issue edit <num> --add-label "priority:<value>"`.
- Feature values must be integer in `[1,13]`. Apply via single-field `gh api graphql --include` mutation:

```bash
gh api graphql --include -f query="
  mutation { update: updateProjectV2ItemFieldValue(input: {
    projectId: \"<project_id>\", itemId: \"<item_id>\",
    fieldId: \"<Value_field_id>\", value: {number: <n>}
  }) { projectV2Item { id } } }"
```

- Check `x-ratelimit-remaining` from response headers after each write. If `< 10`, stop and report reset time.
- Invalid write-in value → inline error message + re-prompt same item.

### GraphQL budget gate (before Value writes)

Before applying feature Value assignments, check budget:

```bash
budget_info=$(gh api graphql -f query='{ rateLimit { remaining resetAt } }')
graphql_remaining=$(echo "$budget_info" | jq '.data.rateLimit.remaining')
graphql_reset=$(echo "$budget_info" | jq -r '.data.rateLimit.resetAt')
estimated=$((feature_count + 100))
if [ "$graphql_remaining" -lt "$estimated" ]; then
  echo "[ADV:BLOCKED] GraphQL budget insufficient for Value writes: ${graphql_remaining} remaining, ${estimated} needed. Resets at ${graphql_reset}."
fi
```

Items deferred or skipped due to ambiguity are excluded from Phase 5 roadmap rendering and surfaced in the final report under "deferred / unscored".

### Autofill semantics (Phase 3b only)

When the user selects `Autofill all features` in the Stage 1 batch control, or `Autofill` on a per-item feature question, the agent assigns Value (1-13) using the same modified-Fibonacci rubric as Phase 4. Anti-hallucination evidence is mandatory: every autofilled Value MUST be backed by a quote from the issue body (or `(no body content)` marker) and recorded in the `<!-- adv-triage:scoring v1 ... -->` block alongside `scored_by=agent` and `scored_at`.

Autofill rubric for Value:
| Anchor | Signal in issue body |
|---|---|
| 1-2 | Cosmetic, niche, single-user, easily-deferrable |
| 3 | Quality-of-life, narrow surface, no growth multiplier |
| 5 | Active workflow improvement, recurring friction signal |
| 8 | Core differentiator, unblocks a roadmap stream, broad surface |
| 13 | Strategic, foundational, blocks multiple workflows or external commitments |

Failure mode: if the issue body is empty or insufficient to anchor a Value, log `autofill_failed: insufficient_signal` and defer the item — do not guess. After autofill, the report's "Updated" count includes autofilled items separately as `Autofilled: {N}`.

× Autofill MUST NOT be applied to bug `priority:*` labels — bug priority remains user-only because it encodes user-judgement on impact severity, not an issue-content heuristic.

---

## Phase 4: Agent Scoring (autonomous)

For each feature with `Value` set but missing `TimeCriticality`, `RROE`, or `Effort` (or all of them when `--rescore`), the agent must assess and assign a number in `[1,13]` for each missing dimension. Then compute `WSJF = (Value + TimeCriticality + RROE) / Effort` and round to one decimal place.

### Cached project-state protocol

Reuse the `project_items` map built in Phase 1. It already contains `{issue_number → {item_id, fields: {value, timeCriticality, rROE, effort, wSJF}, ...}}`. Do NOT call `gh project item-list` again in Phase 4 — the Phase 1 cache is sufficient.

### GraphQL budget estimation gate

Before entering the scoring loop, check budget:

```bash
budget_info=$(gh api graphql -f query='{ rateLimit { remaining resetAt } }')
graphql_remaining=$(echo "$budget_info" | jq '.data.rateLimit.remaining')
graphql_reset=$(echo "$budget_info" | jq -r '.data.rateLimit.resetAt')
estimated=$((features_needing_scoring + 1 + 100))  # 1 batch/item + 1 Phase 5 read + 100 buffer
if [ "$graphql_remaining" -lt "$estimated" ]; then
  echo "[ADV:BLOCKED] GraphQL budget insufficient: ${graphql_remaining} remaining, ${estimated} needed. Resets at ${graphql_reset}."
  # Skip to Phase 6 report
fi
```

### Batched GraphQL mutation (4 fields per item)

For each item needing scoring, construct a single `gh api graphql` call with 4 aliased mutations:

```bash
gh api graphql --include -f query="
  mutation {
    tc: updateProjectV2ItemFieldValue(input: {
      projectId: \"$PROJECT_ID\", itemId: \"$ITEM_ID\",
      fieldId: \"$TC_FIELD_ID\", value: {number: $TC_VALUE}
    }) { projectV2Item { id } }
    rroe: updateProjectV2ItemFieldValue(input: {
      projectId: \"$PROJECT_ID\", itemId: \"$ITEM_ID\",
      fieldId: \"$RROE_FIELD_ID\", value: {number: $RROE_VALUE}
    }) { projectV2Item { id } }
    effort: updateProjectV2ItemFieldValue(input: {
      projectId: \"$PROJECT_ID\", itemId: \"$ITEM_ID\",
      fieldId: \"$EFFORT_FIELD_ID\", value: {number: $EFFORT_VALUE}
    }) { projectV2Item { id } }
    wsjf: updateProjectV2ItemFieldValue(input: {
      projectId: \"$PROJECT_ID\", itemId: \"$ITEM_ID\",
      fieldId: \"$WSJF_FIELD_ID\", value: {number: $WSJF_VALUE}
    }) { projectV2Item { id } }
  }"
```

### Sequential paced writes

- 1-second `sleep 1` between batch requests.
- After each batch, parse `x-ratelimit-remaining` from response headers (`--include` flag).
- If `x-ratelimit-remaining < 10`: stop immediately, report `x-ratelimit-reset` time.
- If response headers are missing (error responses): fall back to `rateLimit` query.
- Parse response for `errors` array — GraphQL returns HTTP 200 even with errors. Log per-alias errors and continue.

### Idempotent resume

Before each batch mutation:

1. Check cached `project_items[issue_number].fields` against target values.
2. If all 4 fields already match targets → skip entire item, log "skipped: already correct".
3. If subset matches → only include non-matching fields in the batch (omit matching aliases).
4. `--rescore` flag overrides: always include all 4 fields.
5. WSJF float comparison uses `±0.05` tolerance (values in range 0-39, float64 is exact, tolerance is safety margin).

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

Update the project fields via batched `gh api graphql --include` mutations as specified above.

### Bug rebound

Bugs do **not** get `Value`/`TC`/`RROE`/`Effort`/`WSJF`. They use `priority:*` labels only. If a bug has been mistakenly given numeric fields, log a warning in the report but do not modify (user may have intended unified ranking).

---

## Phase 5: Generate ROADMAP.md

Read final state from the project: `gh project item-list <N> --owner <owner> --format json --limit 500` filtered to open issues only. **This must be a fresh read** — do NOT reuse the Phase 1 or Phase 4 cached state, since Phase 4 mutations may have changed field values. Correctness of the generated ROADMAP depends on reflecting the actual post-mutation project state.

<!-- rq-repoFilter01 -->
**Server-side scoping (must match Phase 1):** when the typed config sets `repository_filter`, the fresh read MUST append `--query "repo:<owner>/<repository_filter>"` so Phase 5 sees the same item universe as Phase 1. Omitting the filter here would inflate ROADMAP.md and `.adv/roadmap-snapshot.json` with cross-repo items that Phase 1 already excluded, producing a snapshot that disagrees with `adv_roadmap source: 'live'` for the same project. Snapshot writer mirrors the value onto the optional top-level `repository_filter` field so downstream `adv_roadmap source: 'file'` reads surface the same scope.

### Two outputs from one read (mandatory)

Phase 5 emits BOTH artifacts from the fresh project state:

| Artifact | Path | Audience |
|---|---|---|
| `ROADMAP.md` | repo root | Humans + agents reading prose |
| `.adv/roadmap-snapshot.json` | `.adv/roadmap-snapshot.json` | `adv_roadmap` MCP tool, programmatic agent reads |

Both files MUST be written before the Phase 5.5 echo and Phase 5 commit/push. The snapshot is the structured mirror — `adv_roadmap source: 'file'` reads it without parsing markdown. Schema (version `1`):

```jsonc
{
  "version": 1,
  "generated_at": "<ISO-8601 UTC>",
  // rq-repoFilter01: optional, mirrors the typed-config field; omitted when unset.
  "repository_filter": "<bare-repo-name>",
  "project": { "owner": "<owner>", "number": <N>, "title": "ADV: <repo-name>" },
  "counts": { "total": <N>, "bugs": <N>, "features": <N>, "deferred": <N> },
  "bugs": [ { "number": 89, "title": "...", "priority": "high", "labels": [] }, ... ],
  "features": [ { "number": 51, "title": "...", "value": 8, "time_criticality": 3, "rroe": 13, "effort": 3, "wsjf": 8.0, "labels": [] }, ... ],
  "deferred": [ { "number": 90, "title": "...", "reason": "user-deferred (Value)" }, ... ]
}
```

Sort the `features` array by WSJF descending (ties broken by Value desc, then issue number asc) before writing. The `bugs` array stays in priority-tier order (critical → high → medium → low → unprioritized). Both files commit together in the Phase 5 commit step (`git add ROADMAP.md .adv/roadmap-snapshot.json`).

### Layout

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

### ROADMAP.md write + commit (execute mode, when not `--no-commit`)

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
3. Verify clean working tree except for `ROADMAP.md` and `.adv/roadmap-snapshot.json`: `git status --porcelain` must show only those two paths. If anything else is dirty, abort with the offending paths listed.
4. `git add ROADMAP.md .adv/roadmap-snapshot.json` (explicit paths — never `git add -A`)
5. `git commit -m "chore(roadmap): /adv-triage update $(date -u +%Y-%m-%d)"`
6. `git pull --rebase --autostash origin <default-branch>` — abort and surface error if rebase has conflicts (extremely unlikely for ROADMAP.md only)
7. `git push origin <default-branch>`
8. Emit `[ADV:WORK] Pushed roadmap commit <sha> to origin/<default-branch>.`

If any step fails: stop, surface the failing command + stderr, do not retry. The commit itself is small enough to redo manually.

---

## Phase 5.5: Roadmap echo (mandatory)

After ROADMAP.md is written (whether or not the commit step ran), the agent MUST emit the full generated content as a fenced markdown block in chat. This applies to every mode that produces a roadmap artifact:

| Mode | Echo trigger |
|---|---|
| Default execute (file written + committed) | Echo after Phase 5 commit step (or after the write step if `--no-commit`) |
| Execute with Tier B `dry run` reply at the commit prompt | Echo in place of the write — explicitly substitutes for the file |
| `--dry-run` flag (no mutations) | Skip echo — no ROADMAP.md was generated |

Echo format:

````
## ROADMAP.md (generated)

```markdown
{full ROADMAP.md content}
```
````

The echo is NOT optional and MUST NOT be replaced by a "see ROADMAP.md" pointer or a top-N truncation. The user reads the table directly in the chat transcript; the file write and the chat echo are two surfaces of the same canonical artifact.

× Anti-pattern: emitting only "Top 5 features" or "Top 10 features" in lieu of the full table.
× Anti-pattern: linking to ROADMAP.md on disk without the inline echo.
✓ Correct: echo the full markdown, then proceed to Phase 6 final report.

---

## Phase 6: Final Report

After all phases (or after a `--dry-run` scan), emit:

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
| Use plain-text chat for Phase 3b priority/Value assignments | Use `question` tool with structured options, one item at a time |
| Dump all items in a single text blob asking for `id=value` pairs | Batch control question first, then per-item `question` calls |
| Skip the batch control question and go straight to per-item | Stage 1 (batch control) always runs first when matrix is non-empty |
| Ignore `x-ratelimit-remaining` response header | Check after each batch via `--include` flag; stop if < 10 |
| Use `rateLimit` query for every post-mutation check | Use response headers (primary); `rateLimit` query only for initial gate and fallback when headers missing |
| Emit only "Top 5 features" summary in chat after a regen | Phase 5.5 mandates echoing the full ROADMAP.md as a fenced markdown block |
| Replace the Phase 5.5 echo with a "see ROADMAP.md" pointer | Echo + file are two surfaces of the same artifact; both are required |

---

## Key Tools

| Purpose | Tool |
|---|---|
| List open GH issues | `gh issue list --state open --json …` |
| Create issue | `gh issue create` |
| Edit issue labels | `gh issue edit <num> --add-label / --remove-label` |
| List project items | `gh project item-list <N> --owner <owner> --format json` |
| Add issue to project | `gh project item-add` |
| Edit project field (single) | `gh api graphql --include -f query='mutation { update: updateProjectV2ItemFieldValue(input: {...}) { projectV2Item { id } } }'` |
| Edit project fields (batch 4) | `gh api graphql --include -f query='mutation { tc: ... rroe: ... effort: ... wsjf: ... }'` |
| Check GraphQL budget (initial gate) | `gh api graphql -f query='{ rateLimit { remaining resetAt } }'` |
| Check GraphQL budget (per-response) | Parse `x-ratelimit-remaining` from `--include` response headers |
| Create project field | `gh project field-create` |
| Persist project metadata | `adv_project_metadata` (read/write `github_project`) |
| Active ADV changes | `adv_change_list status: 'in-flight'` |
| Agenda | `adv_agenda_list`, `adv_agenda_complete` |
| Wisdom | `adv_wisdom_list` |
| Local source scan | `glob`, `read`, `lgrep_search_text` |
| Phase 3b user assignments | `question` tool (batch control + per-item structured questions) |
| Roadmap edit | `write` (whole file each run; deterministic from project state) |
| Git ops | `bash` (`git status`, `git add ROADMAP.md`, `git commit`, `git pull --rebase`, `git push`) |
