---
name: adv-cleanup
description: "Active ADV cleanup triage: stale changes, worktree drift, merged archived branches, and state leaks"
keywords:
  [
    "adv",
    "cleanup",
    "stale",
    "abandoned",
    "duplicate",
    "archive",
    "triage",
    "worktree",
    "branch",
    "hygiene",
  ]
metadata:
  priority: medium
  source: adv-cleanup-command
---

# ADV Cleanup Skill

## Purpose

Methodology for `/adv-cleanup`: triage all four ADV hygiene surfaces, bucket candidates by reversibility, report them, and guide command-owned application after strict approval. Skill is read-only guidance; command owns ADV tool calls, state mutation, and approval enforcement.

## Defaults

- Mode: dry-run.
- Scope: all four hygiene surfaces — active changes, worktree drift, merged archived `change/*` branches, archived/closed state leaks.
- Change scope: active changes, oldest-first, hot recency band excluded.
- Staleness threshold: `7d` unless `--age-threshold` overrides.
- Bucket filter: optional `duplicate` / `stuck` / `abandoned` / `ready-to-archive`.
- No sub-agents.
- Never auto-archive; recommend `/adv-archive {id}`.
- Never purge state leaks; recommend `adv_archive_purge`, which owns its own operator approval.

## Bucket Precedence

Most-specific wins. First match owns classification. This precedence orders **changes only** — worktree, branch, and leak candidates are different entity kinds, classified independently. A change and its worktree may legitimately appear in two sections at once; state the relationship, never suppress either.

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

Surfaces 2–4 run regardless of surface-1 results — worktree, branch, and leak debt outlive their changes.

> **DESTRUCTIVE DEFAULT WARNING:** During Phase 1 discovery, omitting `dryRun: true` from `adv_worktree_cleanup` **DELETES branches instead of listing them**; the tool has no safe default. `dryRun: true` is mandatory for discovery. Apply deletion only in Phase 5 after typed confirmation.

## Child-Lineage Guard

Before any closure bucket, check unarchived fast-follow children: any active change whose `parent_change_id` equals candidate ID.

If found, move candidate to `Blocked: has unarchived child`; do not include in approval prompt or close set.

## Hygiene Surfaces

Four surfaces, two reversibility classes (`rq-cleanupHygieneScope01`):

| # | Surface | Discovery | Class | Executable |
|---|---|---|---|---|
| 1 | Active-change debt | `adv_change_list` + `adv_change_show` | reversible | yes |
| 2 | Worktree drift | `adv_worktree_triage` | **irreversible** | yes |
| 3 | Merged archived `change/*` branches | `adv_worktree_cleanup mode: "archived_branches"` | **irreversible** | yes |
| 4 | Archived/closed state leaks | `adv_status view: "hygiene"` | report-only | no |

Surface 4 stays report-only: leak remediation routes to `adv_archive_purge`, an operator-only recovery tool with its own approval contract.

A surface with no candidates renders an explicit empty state rather than being omitted — silence is indistinguishable from a failed scan. A failing surface degrades that section only; report `unavailable: {reason}` and continue.

### Surface 2 — worktree drift groups

| Group | Meaning |
|---|---|
| **safe** | No active sessions, not the current process CWD, eligible for cleanup |
| **blocked** | Has active sessions or is the current process CWD; skip deletion |
| **dirty/in-use** | Uncommitted changes or running processes detected; defer to user |
| **needs-investigation** | Classification ambiguous (missing registry entry, stale head, etc.) |

Only the **safe** group is ever offered for deletion.
The `adv_worktree_triage` classes map to these groups as follows:

| `adv_worktree_triage` class | Drift group | Deletion eligible |
|---|---|---|
| `archived_not_cleaned` | safe | yes — owning change archived; delete tool enforces archived+merged+clean |
| `missing_from_disk` | safe | yes — registry-only record, nothing on disk to lose |
| `dirty_uncommitted_work` | dirty/in-use | **no** — force-deleting discards staged/modified/untracked work |
| `stale_head_unmerged` | dirty/in-use | **no** — has commits ahead of the default branch |
| `stale_head` | needs-investigation | no — may still be active; resume or inspect first |
| `registry_missing_change_id` | needs-investigation | no — repair registry metadata first |
| `stale_head` | needs-investigation | no — classification ambiguous |
| `terminal_cleanup_retained` | blocked | no — cleanup already attempted and blocked; resolve the blocker first |

Any unrecognized or new `adv_worktree_triage` class MUST default to `needs-investigation` and is never eligible for deletion (fail-closed for unknown input).

Required snippet:

- Worktree drift → `Worktree drift: {safe} safe, {blocked} blocked, {dirty/in-use} dirty/in-use, {needs-investigation} needs-investigation.`

### Reversibility and recovery

| Bucket | Marker | Recovery |
|---|---|---|
| Duplicate / Stuck / Abandoned | reversible | Re-open the change; full history retained |
| Worktree deletion | irreversible | `git worktree add {path} {branch}` — branch and commits survive |
| Branch deletion | irreversible | `git reflog` → `git branch {name} {sha}` — **time-bounded ~30–90d** (`gc.reflogExpireUnreachable` 30d, `gc.reflogExpire` 90d) |

### Deletion authority

`adv_worktree_triage` output is advisory discovery and selection data — **never deletion authority** (`rq-terminalCleanupSafety01`). Every approved deletion is executed by `adv_worktree_delete` or `adv_worktree_cleanup`, which independently re-verify terminal owning-change status, branch integration, clean worktree state, no live process CWD, and squash-merge-safe tree-SHA equivalence. Surface each refusal verbatim; never retry around it.

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

### Stuck at proposal ({count})  [reversible]
- {id} (0/0 tasks, {age}h stale, proposal gate pending)

### Abandoned mid-flight ({count})  [reversible]
- {id} ({done}/{total} tasks, {age}h stale, last gate: {last-completed-gate})

### Duplicate/superseded ({count})  [reversible]
- {id} → superseded by {target-id} ({matching-rule: title-equality | suffix-pattern})

### Blocked: has unarchived child ({count})
- {id} → child {child-id} still active (close child or archive parent first)

### Worktree drift ({count})  [irreversible — recover via git worktree add]
- {exact worktree path} — branch {branch}, group {safe|blocked|dirty/in-use|needs-investigation}
  Worktree drift: {safe} safe, {blocked} blocked, {dirty/in-use} dirty/in-use, {needs-investigation} needs-investigation.

### Merged archived branches ({count})  [irreversible — reflog recovery ~30–90d]
- {exact branch name} — archived change {id}, merge-detection {tree-sha|git-cherry}

### State leaks ({count})  [report-only]
- {id} — {leak class}
  → Run `adv_archive_purge` for {id} (operator-only; owns its own approval).

Total candidates: {sum non-empty actionable buckets}
```

If `--bucket` was used, prefix report with `Filtered to bucket: <name>`.

Empty states: `Active-change debt: none.` / `Worktree drift: none.` / `Merged archived branches: none.` / `State leaks: none.`

If all surfaces empty: `No cleanup candidates. All hygiene surfaces are clean.`

Dry-run footer: `Re-run with --execute to apply per-bucket actions (reversible buckets need Tier B approval; irreversible buckets need typed confirmation).`

## Approval Parser

Two distinct parsers. They never merge, and the reversible parser is never weakened to accommodate the irreversible one.

### Reversible buckets

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

### Irreversible buckets

Worktree deletion and branch deletion use a **stronger typed confirmation** (`rq-cleanupHygieneScope01`).

Prompt MUST list every candidate numbered with its **exact worktree path or branch name** — never a count-only summary, never an abbreviated path. The user cannot consent to something they cannot see.

Prompt MUST state the irreversible marker and the recovery path, including the reflog time bound for branch deletion.

```text
{Bucket name} — IRREVERSIBLE deletion requested for these {N} item(s):

1. {exact worktree path or branch name} — {reason}
2. {exact worktree path or branch name} — {reason}

Recovery: {recovery path, incl. reflog window for branches}

Reply EXACTLY one of:
- `delete all {N}` — delete all listed (count must match)
- `delete N` (or `delete N,M`) — delete only the listed numbers
- `skip` — skip this bucket; delete nothing
- `stop` / `abort` — halt; delete nothing
```

Parse replies after trim + case-fold:

| Regex | Meaning |
|---|---|
| `^delete all (\d+)$` | delete all listed — **only if `\d+` equals the exact listed count** |
| `^delete ([\d,\s]+)$` | delete only listed numbers |
| `^skip$` | skip bucket; delete nothing |
| `^(stop\|abort)$` | halt whole run |

`approve all` is **rejected** here → re-prompt. It is the reversible-bucket token and MUST NOT carry destructive authority.

Count mismatch on `delete all N` → re-prompt with the same options and the correct count. Never infer intent from a near-miss.

Anything else → re-prompt same options. No LLM fallback.

> Rationale: the count-match is the `terraform destroy` property — the confirmation cannot be produced from muscle memory, because the user must read the report to type it.

## Apply Rules

### Reversible buckets

- Duplicate bucket uses explicit IDs only; filter-based `reason: "superseded"` is invalid.
- Duplicate requires verified `supersededBy`; missing target skips affected candidates only.
- Stuck and Abandoned may use filter selector with `lastActivityBefore` when all approved entries share safe filter semantics; otherwise explicit IDs are safer.

### Irreversible buckets

- Worktree deletion → `adv_worktree_delete` per approved branch.
- Branch deletion → `adv_worktree_cleanup mode: "archived_branches" changeId: <approved candidate change ID>` without `dryRun`, once per approved candidate. Never issue an unscoped merged-branch cleanup apply: it would delete every currently eligible branch and bypass a subset approval.
- Never call `git worktree remove` or `git branch -d` directly (`rq-terminalCleanupSafety01`).
- A tool refusal is evidence the candidate was misclassified, not an obstacle to route around. Report it verbatim and move on.

### Both

- Each bucket is atomic. Tool fail-all means nothing applied in that bucket.
- Continue to next bucket after one bucket failure.

Result lines:

- Reversible success: `✓ {Bucket name}: closed {N} change(s) — {reason}`
- Irreversible success: `✓ {Bucket name}: deleted {N} of {M} — {name}@{sha}`
- Refusal: `⊘ {Bucket name}: {name} refused by {tool} — {verbatim refusal}`
- Failure: `✗ {Bucket name}: failed — {error message}. No changes applied in this bucket.`

Record each deleted branch SHA in the result line so the documented reflog recovery path is actually executable.

## Anti-Patterns

| × Bad | ✓ Good |
|---|---|
| Bulk-archive ready bucket | Recommend per-change `/adv-archive {id}` |
| LLM fallback on ambiguous reply | Re-prompt exact options |
| Act directly with `--execute` | Per-bucket approval prompt first |
| Close parent with unarchived child | Move to blocked sub-bucket |
| Include hot-band changes | Use `excludeRecencyBands: ["hot"]` |
| Treat `adv_worktree_triage` safe group as deletion authority | Delegate to `adv_worktree_delete` and let it re-verify |
| Accept `approve all` for a worktree or branch bucket | Require count-matched `delete all N` |
| Summarize destructive candidates by count | List every path and branch name |
| Call adv_worktree_cleanup without dryRun during discovery | `dryRun: true` is mandatory in Phase 1; the tool has no safe default |
| Omit an empty surface from the report | Render an explicit empty state |
| Purge state leaks from cleanup | Recommend `adv_archive_purge`, which owns its own approval |
| Retry around a deletion-tool refusal | Report the refusal verbatim and move on |

## Constraints

- Read-only guidance only; command owns ADV mutations.
- Default dry-run.
- Reversible closure approval is Tier B strict; no fallback.
- Irreversible deletion requires count-matched typed confirmation; `approve all` is rejected.
- Deletion authority belongs to `adv_worktree_delete` / `adv_worktree_cleanup` alone.
- Operator-explicit only; no background sweeps, daemons, or session-start auto-cleanup.
- No gate completion.
- No sub-agents.
