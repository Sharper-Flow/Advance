# adv-triage Prompts

## Bootstrap approval prompt (Tier B)

Use only when project must be created.

```text
ADV needs a GitHub Projects v2 board for backlog coordination.

Owner: {owner}
Title: ADV: {repo-name}
Linked repo: {owner}/{repo}
Custom fields to create: ADV Type, Priority, Status

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

## Source cleanup validation prompt (Tier B)

Use after match/gap analysis and before confirming new GH issues or applying bug priority labels.

Group `cleanup_decisions[]` by source/reason (`approvalGroup`) so users can approve narrow buckets without accepting unrelated cleanup.

```text
Found {N} cleanup candidate(s) before bug priority assignment:

Group: {source}/{reason}

1. {source}:{ref} — {title}
   Classification: {stale/already-addressed|duplicate/superseded|should-merge|unclear}
   Evidence: {source-backed evidence}
   Proposed action: {action}
   Survivor/source: {survivorRef or none}
...

Reply EXACTLY one of:
- `approve all` — apply every proposed action in this source/reason group
- `approve N` (or `approve N,M`) — apply only listed actions
- `keep all` — take no cleanup action for this group
- `keep N` (or `keep N,M`) — keep listed items, re-prompt for remaining actions
- `stop` / `abort` — halt the entire /adv-triage run

Anything else → re-prompt with the same options. No LLM fallback.
```

Action mapping after approval:

- GitHub duplicate handling → capability-detect with `gh issue close --help`. If `--duplicate-of` is supported, use native duplicate close. If not, add documented `Duplicate of #N` comment semantics and close only with locally supported reasons.
- ADV changes → use ADV close/archive recommendations only; never mutate workflow state outside ADV tools.

Use the `question` tool only for `unclear` relevance choices and bug context-gathering questions. Cleanup approval itself is Tier B inline text with exact whitelist parsing.

## Bug priority context-gathering

### Relevance validation

Before applying any `priority:*` label, relevance-check each field-gap candidate.

Evidence sources:

- Issue body, labels, comments, state, and Project status.
- Linked ADV change state, gates, tasks, and proposal/agreement/design artifacts.
- Current source/docs/tests when the issue claims an implementation gap.
- User-provided context from the current triage run.

Outcomes:

| Outcome | Action |
|---|---|
| `relevant` | Continue to the bug priority assignment. |
| `stale/already-addressed` | Present evidence; close/remove/defer only after explicit user approval. |
| `duplicate/superseded` | Present candidate survivor; close/supersede only after explicit user approval. |
| `unclear` | Ask a focused relevance question before gathering priority context. |

Use the `question` tool for unclear relevance choices and for bug context-gathering questions. Relevance heuristics are advisory only; they MUST NOT auto-close, auto-suppress, or auto-label an item.

Build the bug priority candidate list from open issues:

| Need | Condition |
|---|---|
| `priority:*` label on bug | issue has `bug`, no priority label |

For each candidate, the agent may ask up to 2 focused context-gathering questions (impact, frequency, workaround). Questions gather context only; the agent assigns priority autonomously and MUST NOT ask the user to confirm or choose a priority.

If context remains insufficient after 2 questions, assign `priority:medium` and add `context_insufficient` label.

After each assignment, emit `<issue#>: priority=<tier> :: <rationale>` in chat output only. Never post rationale as an issue comment.

### Response handling

1. Concrete answer → record context.
2. `Defer` → exclude from the current Open issues worth solving list.
3. Write-in/custom → validate; invalid means inline error + same-item re-prompt.
4. After all items → apply label assignments as batch.

## Local source deprecation prompt (Tier B)

After local items are promoted:

```text
Promoted {N} item(s) to GH issues. Deprecate the local sources?

1. .adv/CROSS-SESSION-NOTES-2026-05-04.md line 42 → #123
2. plugin/src/foo.ts:88 TODO → #124

Reply EXACTLY one of:
- `deprecate all` — apply per-source deprecation
- `deprecate N` (or `deprecate N,M`) — apply only listed numbers
- `keep all` — leave local sources intact
- `stop` / `abort` — halt before further mutation

Anything else → re-prompt with the same options.
```

Per-source actions: TODO/FIXME comment → `// see #{num}`; wisdom → append promotion note; cross-session note → strikethrough line; active ADV change → no deprecation.

## Coalesce link approval prompt (Tier B)

```text
Coalesce — link these active changes to open GitHub issues?

1. {change-id} — {change-title} ↔ #{issue-number} — {issue-title}
   Evidence: {structural|heuristic}: {bounded evidence}
   Epic: {epic-id / entry order / title, or none}
2. ...

Displayed: {displayed_count}; overflow: {overflow_count}

Reply EXACTLY one of:
- `approve all` — link every DISPLAYED pair only; overflow is not approved
- `reject all` — link none of the displayed pairs
- `link N` (or `link N,M`) — link only listed pairs
- `skip N` (or `skip N,M`) — link every displayed pair except listed pairs
- `stop` / `abort` — halt without linking

Anything else → re-prompt with the same options.
```

After approval, call `adv_change_update_issues` once per approved pair. Hidden overflow requires a separate prompt. Partial failures preserve successful links and report exact retry calls.
