# adv-triage Schemas

## Inventory record

```jsonc
{
  "source": "github-issue | github-project | adv-change | adv-epic | wisdom | note | todo",
  "ref": "<stable-ref>",
  "title": "<short-title>",
  "body": "<bounded excerpt>",
  "kind_hint": "bug | feature | unknown",
  "issue_number": 42,
  "linked_change_id": "change-id",
  "epic": { "id": "epic-id", "title": "...", "order": 2 }
}
```

Only structurally available optional fields are populated. Heuristic `kind_hint` and candidate similarity never authorize persistence.

## Match collections

- `represented[]` — source item + GH issue + structural match reason.
- `unrepresented[]` — source item + proposed issue fields + optional advisory duplicate candidate.
- `active_changes[]` — typed open changes with issue links, gates, task counts, last activity, and optional Epic membership.
- `active_epics[]` — bounded typed Epic summaries used for context and stale-entry warnings.

## Source cleanup decisions (`cleanup_decisions[]`)

```jsonc
{
  "source": "adv-change | adv-epic | github-issue | wisdom | note | todo",
  "ref": "<stable-ref>",
  "classification": "relevant | stale/already-addressed | duplicate/superseded | should-merge | unclear",
  "evidence": ["<source-backed evidence>"],
  "proposedAction": "close | complete | cancel | merge-note | suppress | defer | ask-user | none",
  "survivorRef": "<optional stable survivor>",
  "requiresApproval": true,
  "approvalGroup": "<source>:<classification>"
}
```

Non-relevant decisions require structural evidence and explicit approval. Similarity is advisory only.

## Coalesce candidate

```jsonc
{
  "index": 1,
  "changeId": "change-id",
  "changeTitle": "...",
  "issueNumber": 42,
  "issueTitle": "...",
  "tier": "structural | heuristic",
  "score": 0.84,
  "evidence": "stable #42 reference in proposal",
  "issueUrl": "https://github.com/org/repo/issues/42",
  "epic": { "id": "epic-id", "title": "...", "order": 2 }
}
```

Rules:
- Existing links are excluded before candidates are numbered.
- `score` exists only for heuristic candidates.
- A batch displays at most 20 candidates.
- Approval applies only to displayed indices.

## Coalesce approval result

```jsonc
{ "kind": "approve_all | reject_all | link | skip | stop | unparsed", "indices": [1, 3] }
```

`approve_all` means all displayed candidates, never overflow.

## Portfolio-balance report

```jsonc
{
  "importantToComplete": [{ "changeId": "...", "gate": "execution", "tasksDone": 4, "tasksTotal": 5, "linkedIssue": 42, "priority": "high", "epic": { "id": "...", "order": 2 } }],
  "cleanupNeeded": { "readyToArchive": ["..."], "stuckAtProposal": [], "abandonedMidFlight": [], "duplicateOrSuperseded": [], "staleEpicEntries": [] },
  "openIssuesWorthSolving": [{ "number": 99, "title": "...", "priority": "medium", "epic": null }]
}
```

Exactly three rendered sections. Each caps at 10 rows and carries `(N more not shown)` when truncated.

## Triage-origin tagging

Issue promotion into a new ADV change uses:

- `origin_kind: 'triage'`
- `origin_issue_number: <issue-number>`
- optional stable `origin_source_artifact`

`roadmap` remains readable legacy provenance only and is rejected for new create/repair writes.

## Final report

Report mode, timestamp, project, source counts, created/prioritized issue counts, cleanup outcomes, coalesce proposed/linked/rejected/failed counts, active Epics inspected, and the three portfolio section counts. No roadmap file, snapshot, echo, commit, or push fields.
