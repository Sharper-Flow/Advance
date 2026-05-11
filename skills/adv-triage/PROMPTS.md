# adv-triage Prompts

## Bootstrap approval prompt (Tier B)

Use only when project must be created.

```text
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

On `use existing N`: validate, ensure fields, persist; do not silently fall back.

## Confirm new GH issues prompt (Tier B)

Use only when `unrepresented[]` is non-empty.

```text
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

For each approved item: `gh issue create`, add source trailer, add to project, set `ADV Type` field.

## User-only field assignments

Build matrix from open issues:

| Need | Condition |
|---|---|
| `priority:*` label on bug | issue has `bug`, no priority label |
| `Value` field on feature | issue has `feature`, project Value null |

If matrix non-empty, use `question` tool — never plain chat. Stage 1 batch control first, then Stage 2 per-item loop.

### Stage 1: batch control

Options: `One by one (Recommended)`, `Autofill all features`, `Defer all`, `Stop`. Include write-in/custom option if tool surface does not add one automatically.

| Choice | Action |
|---|---|
| One by one | Per-item loop for all items |
| Autofill all features | Autofill features; still prompt bug priorities |
| Defer all | Skip all, exclude from roadmap, continue |
| Stop | Halt run |

### Stage 2: per-item loop

Bugs first by issue number, then features. One `question` call per item.

Bug priority options: `critical`, `high`, `medium`, `low`, `Defer`.

Feature Value options: `1`, `2`, `3`, `5`, `8`, `13`, `Defer`, `Autofill`.

Response handling:

1. Concrete value → record.
2. `Defer` → exclude from roadmap.
3. `Autofill` for features → assign from body, evidence required.
4. Write-in/custom → validate; invalid means inline error + same-item re-prompt.
5. After all items → apply assignments as batch.

## Local source deprecation prompt (Tier B)

After local items are promoted:

```text
Promoted {N} item(s) to GH issues. Deprecate the local sources?

1. .adv/CROSS-SESSION-NOTES-2026-05-04.md line 42 → #123
2. agenda item ag-xyz → #124
3. plugin/src/foo.ts:88 TODO → #125

Reply EXACTLY one of:
- `deprecate all` — apply per-source deprecation
- `deprecate N` (or `deprecate N,M`) — apply only listed numbers
- `keep all` — leave local sources intact
- `stop` / `abort` — halt before commit

Anything else → re-prompt with the same options.
```

Per-source actions: TODO/FIXME comment → `// see #{num}`; agenda item → complete with note; wisdom → append promotion note; cross-session note → strikethrough line; active ADV change → no deprecation.

## ROADMAP.md commit prompt (Tier B)

```text
Ready to commit and push ROADMAP.md to {default-branch}.

Diff summary:
- {bug_count_delta} bugs ({by_tier})
- {feature_count_delta} features ({top-3 by WSJF preview})
- {deferred_count} deferred

Files staged: ROADMAP.md and .adv/roadmap-snapshot.json only
Commit: chore(roadmap): /adv-triage update {YYYY-MM-DD}
Target: origin/{default-branch}

Reply EXACTLY one of:
- `commit and push` — stage, commit, pull --rebase, push
- `commit only` — commit locally, no push
- `dry run` — print full ROADMAP.md to chat, no file write, no commit
- `cancel` / `stop` — halt; do not write file

Anything else → re-prompt with the same options.
```
