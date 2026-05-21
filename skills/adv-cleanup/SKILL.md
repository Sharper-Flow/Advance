---
name: adv-cleanup
description: "Active ADV cleanup triage: stale, abandoned, duplicate, and ready-to-archive changes"
keywords:
  [
    "adv",
    "cleanup",
    "stale",
    "abandoned",
    "duplicate",
    "archive",
    "triage",
  ]
metadata:
  priority: medium
  source: adv-cleanup-command
---

# ADV Cleanup Skill

## Purpose

Methodology for `/adv-cleanup`: bucket active changes, report candidates, and guide command-owned closure after strict approval. Skill is read-only guidance; command owns ADV tool calls, state mutation, and approval enforcement.

## Defaults

- Mode: dry-run.
- Scope: active changes, oldest-first, hot recency band excluded.
- Staleness threshold: `7d` unless `--age-threshold` overrides.
- Bucket filter: optional `duplicate` / `stuck` / `abandoned` / `ready-to-archive`.
- No sub-agents.
- Never auto-archive; recommend `/adv-archive {id}`.

## Bucket Precedence

Most-specific wins. First match owns classification.

| # | Bucket | Detection | Action target |
|---|---|---|---|
| 1 | Duplicate | Normalized title equals another active/archived title, OR ID matches `<stem><N>` where `N >= 2`, `<stem>` exists, and `<stem>` length >= 3 | Explicit close, `reason: superseded`, `supersededBy` required |
| 2 | Stuck at proposal | `gates.proposal.status == "pending"`, `tasks.length == 0`, stale past threshold | Filter close, `reason: not_planned` |
| 3 | Abandoned mid-flight | Proposal done, any pending/in-progress task, stale past threshold, no gate completed within threshold | Filter close, `reason: cancelled` |
| 4 | Ready to archive | All gates except release done, all tasks done, no unresolved review findings | Recommend `/adv-archive {id}` |
| 5 | Healthy | Anything else | Skip |

## Normalization

Title normalization: trim, replace Unicode whitespace runs with one ASCII space, lowercase.

Duplicate ID suffix is a conservative hint only. If target cannot be verified before apply, skip that candidate.

Draft-only duplicate titles are not scanned until the draft appears in active cleanup list; cleanup handles active state, not proposal shaping.

## Inspection Sequence

Minimize tool calls:

1. Build active+archived comparison set for duplicate title/ID checks.
2. If `lastActivityAgeMinutes <= threshold` and not Duplicate → Healthy.
3. For stale/non-duplicate changes, inspect once and cache gates/tasks.
4. Apply Stuck → Abandoned → Ready-to-archive.
5. Else Healthy.

For ~17 active changes with half stale, expect ~8 deep inspections. Cap each displayed bucket at 20 entries and append `(N more not shown)`.

## Child-Lineage Guard

Before any closure bucket, check unarchived fast-follow children: any active change whose `parent_change_id` equals candidate ID.

If found, move candidate to `Blocked: has unarchived child`; do not include in approval prompt or close set.

## Worktree Drift Report (report-only)

Call `adv_worktree_triage` to produce a separate worktree drift report. This section is always report-only; even `--execute` does not delete worktrees here.

Classify each worktree into one of four drift groups:

| Group | Meaning |
|---|---|
| **safe** | No active sessions, not the current process CWD, eligible for cleanup |
| **blocked** | Has active sessions or is the current process CWD; skip deletion |
| **dirty/in-use** | Uncommitted changes or running processes detected; defer to user |
| **needs-investigation** | Classification ambiguous (missing registry entry, stale head, etc.) |

Required snippet:

- Worktree drift → `Worktree drift report (report-only): {safe} safe, {blocked} blocked, {dirty/in-use} dirty/in-use, {needs-investigation} needs-investigation.`

Actual worktree deletion remains owned by `adv_worktree_delete` and `adv_worktree_cleanup`; `/adv-cleanup` never deletes worktrees.

## Report Shape

Inline report, no `question` popup.

Required sections:

```text
## /adv-cleanup triage report

Mode: {dry-run | execute}
Active changes scanned: {N}
Hot excluded: {M}
Age threshold: {value}

### Ready to archive ({count})
- {id} ({tasks done}/{total} tasks, all gates except release done)
  → Run `/adv-archive {id}` to ship.

### Stuck at proposal ({count})
- {id} (0/0 tasks, {age}h stale, proposal gate pending)

### Abandoned mid-flight ({count})
- {id} ({done}/{total} tasks, {age}h stale, last gate: {last-completed-gate})

### Duplicate/superseded ({count})
- {id} → superseded by {target-id} ({matching-rule: title-equality | suffix-pattern})

### Blocked: has unarchived child ({count})
- {id} → child {child-id} still active (close child or archive parent first)

Total candidates: {sum non-empty closure buckets}
```

If `--bucket` was used, prefix report with `Filtered to bucket: <name>`.

If all buckets empty: `No cleanup candidates. All active changes are healthy or hot.`

Dry-run footer: `Re-run with --execute to apply per-bucket actions (each bucket requires Tier B approval).`

## Approval Parser

Each closure bucket gets separate Tier B inline prompt. This is cancellation approval (`rq-inlineApproval01.4`), whitelist-only, no LLM fallback.

Prompt format:

```text
{Bucket name} — closure requested for these changes:

1. {change-id} — "{title}" — Reason: {detection-rule summary}
2. {change-id} — "{title}" — Reason: {detection-rule summary}

Reply EXACTLY one of:
- `approve all` — close all listed changes
- `reject all` — keep all changes active
- `keep N` (or `keep N,M`) — close inverse of listed numbers
- `cancel N` (or `cancel N,M`) — close only the listed numbers
- `stop` / `abort` — halt; do not close anything
```

Parse replies after trim + case-fold:

| Regex | Meaning |
|---|---|
| `^approve all$` | close all listed |
| `^reject all$` | skip bucket |
| `^keep ([\d,\s]+)$` | close all except listed numbers |
| `^cancel ([\d,\s]+)$` | close only listed numbers |
| `^(stop\|abort)$` | halt whole run |

Anything else → re-prompt same options. No LLM fallback.

## Apply Rules

- Duplicate bucket uses explicit IDs only; filter-based `reason: "superseded"` is invalid.
- Duplicate requires verified `supersededBy`; missing target skips affected candidates only.
- Stuck and Abandoned may use filter selector with `lastActivityBefore` when all approved entries share safe filter semantics; otherwise explicit IDs are safer.
- Each bucket is atomic. Tool fail-all means no changes closed in that bucket.
- Continue to next bucket after one bucket failure.

Result lines:

- Success: `✓ {Bucket name}: closed {N} change(s) — {reason}`
- Failure: `✗ {Bucket name}: failed — {error message}. No changes closed in this bucket.`

## Anti-Patterns

| × Bad | ✓ Good |
|---|---|
| Bulk-archive ready bucket | Recommend per-change `/adv-archive {id}` |
| LLM fallback on ambiguous reply | Re-prompt exact options |
| Act directly with `--execute` | Per-bucket Tier B prompt first |
| Close parent with unarchived child | Move to blocked sub-bucket |
| Include hot-band changes | Use `excludeRecencyBands: ["hot"]` |

## Constraints

- Read-only guidance only; command owns ADV mutations.
- Default dry-run.
- Tier B closure approval is strict; no fallback.
- No gate completion.
- No sub-agents.
