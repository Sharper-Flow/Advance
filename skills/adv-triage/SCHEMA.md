# adv-triage Schemas

## Inventory record

```jsonc
{
  "source": "<source-name>",
  "ref": "<stable-ref>",
  "title": "<short-title>",
  "body": "<excerpt>",
  "kind_hint": "<bug|feature|unknown>"
}
```

## Match output collections

- `represented[]` — `(source-item, gh-issue-number, exact_match_reason)`.
- `unrepresented[]` — item with `kind_hint`, proposed title/body, optional `candidate_duplicate_issue`.

If `unrepresented[]` empty and represented issues have required fields, skip issue-creation phases and continue to scoring/roadmap as needed.

## Source cleanup validation

`cleanup_decisions[]` is command-local planning/report state produced after match/gap analysis and before issue creation or user-owned scoring.

```jsonc
{
  "source": "adv-change | github-issue | agenda | wisdom | note | todo",
  "ref": "<stable-source-ref>",
  "title": "<short-title>",
  "classification": "relevant | stale/already-addressed | duplicate/superseded | should-merge | unclear",
  "evidence": ["<source-backed evidence item>"],
  "proposedAction": "<close|complete|cancel|merge-note|suppress|defer|ask-user|none>",
  "survivorRef": "<canonical surviving issue/change/source when applicable>",
  "requiresApproval": true,
  "approvalGroup": "<source>:<classification>"
}
```

Every non-`relevant` decision must include source, ref, classification, evidence, proposed action, and approval group. Title similarity and agent inference may populate evidence as advisory flags only; they do not authorize mutation, suppression, or removal without structural evidence and explicit approval.

## Triage-origin tagging (`rq-issueChangeLinkage01`)

When user starts a new ADV change from an issue created by `/adv-triage`, proposal creation MUST pass:

- `origin_kind: 'triage'`
- `origin_source_artifact: '<promoted-from-ref>'`
- `origin_issue_number: <created-issue-number>`

Triage promotion does NOT auto-create the ADV change. Origin records lineage for archive close behavior and roadmap cross-reference.

## Roadmap snapshot schema v1

```jsonc
{
  "version": 1,
  "generated_at": "<ISO-8601 UTC>",
  "repository_filter": "<bare-repo-name>",
  "project": { "owner": "<owner>", "number": 1, "title": "ADV: <repo-name>" },
  "counts": { "total": 0, "bugs": 0, "features": 0, "deferred": 0 },
  "bugs": [
    { "number": 89, "title": "...", "priority": "high", "labels": [] }
  ],
  "features": [
    { "number": 51, "title": "...", "value": 8, "time_criticality": 3, "rroe": 13, "effort": 3, "wsjf": 8.0, "labels": [] }
  ],
  "deferred": [
    { "number": 90, "title": "...", "reason": "user-deferred (Value)" }
  ]
}
```

`repository_filter` mirrors typed config and is omitted when unset. Snapshot writer must preserve same scope as live Project read.

## ROADMAP.md layout

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

## Features (by WSJF, descending)

| # | Title | V | TC | RROE | E | WSJF | Labels |
|---|-------|---|----|------|---|------|--------|
| #{num} | {title} | 8 | 5 | 8 | 3 | 7.0 | {labels except feature} |

## Deferred / Unscored

- #{num} — {title} — _reason_ ({user-deferred|missing kind|missing Value})

## Triage Run Summary

- Run timestamp: {ISO-8601 UTC}
- Sources scanned: {source counts}
- Issues opened this run: {N}
- Field assignments this run: {N}
- Items deferred: {N}
```

Skip empty bug priority subsections. Sort features by WSJF desc, Value desc, then issue number asc. Sort bugs critical → high → medium → low → unprioritized.

## Final report shape

Report mode, timestamp, project, source counts, created/updated/deferred/skipped issue counts, roadmap counts, local-source deprecations, files written, commit/push status, and API budget.
