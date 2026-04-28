---
name: adv-cleanup
description: Triage stale, abandoned, duplicate, and ready-to-archive active changes
---
<!-- manifest: adv-cleanup · requiresChangeId: false -->
# ADV Cleanup — Active State Triage

Scan active ADV changes, categorize each into a bucket (Orphan, Duplicate, Stuck, Abandoned, Ready-to-archive, or Healthy), and act on each bucket with the appropriate tool. Composes existing primitives — no new MCP tools. Default mode is **dry-run**: scan and report without mutation. Runs **inline** — no sub-agents.

> **CHECKLIST**: Default to dry-run. Closures require Tier B per-bucket approval (instance of cancellation approval per `rq-inlineApproval01.4`). Never auto-archive — Ready-to-archive bucket recommends `/adv-archive {id}` per change to preserve per-change Tier B sign-off (`rq-inlineApproval01.3`).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Parse Flags

Extract from `$ARGUMENTS`:

- `--execute` — apply per-bucket actions after Tier B approval (default: dry-run)
- `--bucket <name>` — limit triage to a single bucket (`orphan` / `duplicate` / `stuck` / `abandoned` / `ready-to-archive`)
- `--age-threshold <duration>` — override default `7d` staleness threshold; accepts `7d`, `48h`, `60m`, `7d 12h`

Validate `--bucket <name>` against the canonical list before scanning. Reject malformed `--age-threshold` with example.

---

## Phase 1: Scan (parallel)

Run two tool calls concurrently in one message:

1. `adv_change_list({ sort: "stalest", excludeRecencyBands: ["hot"] })` — enriched entries oldest-first, excluding in-flight changes
2. `adv_orphan_sweep({ dryRun: true })` — disk-backed change workflows missing from Temporal

Merge results: annotate each list entry with `is_orphan: true` if present in `adv_orphan_sweep` orphan list. Record total scanned count and hot-excluded count for the report.

If `adv_change_list` returns 0 active changes → emit `No cleanup candidates. No active changes.` → stop.

---

## Phase 2: Categorize

For each entry from Phase 1, apply detection rules in **precedence order — most-specific wins**:

| # | Bucket | Detection (in order) | Action target |
|---|--------|----------------------|---------------|
| 1 | **Orphan** | `is_orphan == true` | `adv_orphan_sweep dryRun: false` |
| 2 | **Duplicate** | Title (lowercased, whitespace-collapsed) equals another active or archived change's title, OR ID matches `<stem><N>` pattern with N ≥ 2 where `<stem>` is another change's ID and `<stem>` has at least 3 characters | `adv_change_bulk_close reason: superseded supersededBy: {target} selector: { kind: "explicit", changeIds: [...] }` |
| 3 | **Stuck at proposal** | `gates.proposal.status == "pending"` AND `tasks.length == 0` AND `lastActivityAgeMinutes > age-threshold` | `adv_change_bulk_close reason: not_planned selector: { kind: "filter", filter: { lastActivityBefore } }` |
| 4 | **Abandoned mid-flight** | `gates.proposal.status == "done"` AND `tasks.some(t => t.status == "pending" \|\| t.status == "in_progress")` AND `lastActivityAgeMinutes > age-threshold` AND no gate completed within age-threshold | `adv_change_bulk_close reason: cancelled selector: { kind: "filter", filter: { lastActivityBefore } }` |
| 5 | **Ready to archive** | All gates done except `release` AND all tasks `done` AND no unresolved review findings | Emit `/adv-archive {id}` per-change recommendation (no bulk action) |
| 6 | **Healthy** | Anything else | Skip |

Title normalization for duplicate detection: trim, replace every run of Unicode whitespace with a single ASCII space, then lowercase. Draft-only duplicate titles are intentionally not scanned until the draft appears in the active cleanup list; cleanup is for active change triage, not proposal shaping. ID suffix detection is a conservative hint only; if the target cannot be verified before apply, do not close the duplicate candidate.

### Per-change inspection sequence

For each change, walk the precedence list. Inspection cost is minimized:

1. Orphan: check Phase 1 annotation only (no extra tool call)
2. Duplicate: walk title/ID against the full active+archived list (no per-change `adv_change_show` needed)
3. If `lastActivityAgeMinutes <= age-threshold` AND not Orphan/Duplicate → assign **Healthy**, skip
4. Otherwise call `adv_change_show` once for this change (cache the result for buckets 3–5)
5. Apply Stuck → Abandoned → Ready-to-archive in order
6. If none match → **Healthy**

For 17 active changes with ~half stale, expect ~8 `adv_change_show` calls. Acceptable for v1; cap each bucket at 20 entries with a "(N more not shown)" note.

### Sub-bucket: blocked by child lineage

Before assigning a change to any closure bucket (Duplicate / Stuck / Abandoned), check if it has unarchived `fast_follow_of` children: walk the active list for any change whose `parent_change_id` equals this change's id. If found, move it to a "blocked: has unarchived child" sub-bucket and surface in the report. Do not close it.

### Filter to single bucket (`--bucket`)

If `--bucket <name>` was provided, after categorization, retain only entries matching that bucket. All other entries become irrelevant for this run.

---

## Phase 3: Present Findings

Emit a grouped inline report (not a `question` popup). Skip the Healthy bucket entirely.

```
## /adv-cleanup triage report

Mode: {dry-run | execute}
Active changes scanned: {N}
Hot excluded: {M}
Orphans detected: {O}
Age threshold: {7d | --age-threshold value}

### Ready to archive ({count})
- {id} ({tasks done}/{total} tasks, all gates except release done)
  → Run `/adv-archive {id}` to ship.

### Stuck at proposal ({count})
- {id} (0/0 tasks, {age}h stale, proposal gate pending)

### Abandoned mid-flight ({count})
- {id} ({done}/{total} tasks, {age}h stale, last gate: {last-completed-gate})

### Duplicate/superseded ({count})
- {id} → superseded by {target-id} ({matching-rule: title-equality | suffix-pattern})

### Orphan ({count})
- {id} (on disk, missing from Temporal registry)

### Blocked: has unarchived child ({count})
- {id} → child {child-id} still active (close child or archive parent first)

Total candidates: {sum across non-empty closure buckets + Orphan}
{If --bucket was used, prefix with "Filtered to bucket: <name>"}
```

When all buckets are empty:

```
No cleanup candidates. All active changes are healthy or hot.
```

If dry-run:

```
Re-run with `--execute` to apply per-bucket actions (each bucket requires Tier B approval).
```

If `--execute` is set, proceed to Phase 4 for each non-empty closure bucket and the Orphan bucket. **Skip Phase 4 for Ready-to-archive and Blocked sub-buckets** — these are informational only.

---

## Phase 4: Per-Bucket Approval (`--execute` only — Tier B inline)

For each non-empty bucket requiring action (Orphan, Duplicate, Stuck, Abandoned), emit a separate Tier B inline approval prompt. This is an instance of **cancellation approval** (`rq-autonomy01` checkpoint #7) — structured per `rq-inlineApproval01.4` with the per-change variant of the format from `docs/command-voice-standard.md § Inline Approval Voice` (lines 585–601).

### Closure bucket prompt (Duplicate / Stuck / Abandoned)

```
{Bucket name} — closure requested for these changes:

1. {change-id} — "{title}" — Reason: {detection-rule summary}
2. {change-id} — "{title}" — Reason: {detection-rule summary}

Reply EXACTLY one of:
- `approve all` — close all listed changes
- `reject all` — keep all changes active
- `keep N` (or `keep N,M`) — close inverse of listed numbers
- `cancel N` (or `cancel N,M`) — close only the listed numbers
- `stop` / `abort` — halt; do not close anything

Anything else → re-prompt with the same options.
```

**Anchor phrase:** `Reply EXACTLY one of:`

### Reply parsing (Tier B — strict, no LLM fallback)

| Pattern (regex, case-insensitive, trimmed) | Action |
|---|---|
| `^approve all$` | Close all listed changes via `adv_change_bulk_close` with `selector` and `reason` per the bucket |
| `^reject all$` | Skip this bucket entirely |
| `^keep ([\d,\s]+)$` | Close all entries except the listed numbers (selector: explicit IDs of inverse) |
| `^cancel ([\d,\s]+)$` | Close only the listed numbers (selector: explicit IDs) |
| `^(stop\|abort)$` | Halt the entire `/adv-cleanup --execute` run; do not act on remaining buckets |
| Anything else | Re-prompt with same options. **× Do NOT** invoke LLM fallback. **× Do NOT** advance |

### Orphan bucket prompt

Orphans use the existing `adv_orphan_sweep` Tier B contract (separate from the closure prompt):

```
Orphan — re-seed requested for these changes:

1. {change-id} — on disk, missing from Temporal registry
2. {change-id} — on disk, missing from Temporal registry

Reply EXACTLY one of:
- `approve all` — re-seed all listed changes via `adv_orphan_sweep dryRun: false`
- `reject all` — leave all orphans untouched
- `stop` / `abort` — halt; do not re-seed anything

Anything else → re-prompt with the same options.
```

Reply parsing follows the same regex-only rules. On `approve all`, call `adv_orphan_sweep({ dryRun: false, approvedByUser: true, approvalEvidence: "<user reply text>" })`.

---

## Phase 5: Apply

For each approved bucket, invoke the corresponding tool with required approval evidence. Each bucket is **atomic** — `adv_change_bulk_close` fails-all if any target is protected (e.g. has unarchived child surfaced via lineage check we already filtered).

### Closure path

```
adv_change_bulk_close({
  selector: {
    kind: "explicit",
    changeIds: [<approved IDs>]
  } | {
    kind: "filter",
    filter: { lastActivityBefore: <ISO timestamp from age-threshold> }
  },
  reason: "superseded" | "not_planned" | "cancelled",
  supersededBy: <target-id>,  // only for Duplicate bucket; required by tool contract
  approvedByUser: true,
  approvalEvidence: "<user reply text>"
})
```

× Filter-based bulk close with `reason: "superseded"` is **rejected** by the tool contract. Duplicate bucket MUST use explicit IDs.

### Duplicate target recheck

Before applying the Duplicate bucket, call `adv_change_show` for each `supersededBy` target. If any target is missing, skip only candidates pointing at that target, list them as `skipped: missing supersededBy target`, and continue with remaining approved duplicate candidates.

### Orphan path

```
adv_orphan_sweep({
  dryRun: false,
  approvedByUser: true,
  approvalEvidence: "<user reply text>"
})
```

### Per-bucket result reporting

After each bucket completes, emit a one-line summary:

```
✓ {Bucket name}: closed {N} change(s) — {reason}
```

If a bucket fails (e.g. atomic fail-all because one target became protected mid-run):

```
✗ {Bucket name}: failed — {error message}. No changes closed in this bucket.
```

Continue to the next bucket. Do not abort the whole run on a single bucket failure.

---

## Final Report

After all buckets are processed (or skipped in dry-run), emit a closing summary:

```
/adv-cleanup COMPLETE
Mode: {dry-run | execute}
Buckets acted on: {count}
Total changes affected: {N}
Recommended next: {/adv-archive {id} for ready-to-archive entries, if any}
```

Use the Gate Handoff Voice spine for the closing block (cleanup does not own a gate, so omit gate footer). Cleanup is a utility command — no sub-agent spawn, no gate completion.

---

## Coexistence

| Command | Role | Relationship |
|---------|------|--------------|
| `/adv-status` | Read-only project overview | Cleanup is the actionable counterpart |
| `/adv-refactor` | Refresh stale proposal *content* | Cleanup detects abandoned/dead proposals (closes them) |
| `/adv-coordinate` | Cross-change conflict detection | Different lens (per-change health vs cross-change overlaps) |
| `/adv-archive` | Single-change archive (Tier B sign-off) | Cleanup recommends, does not invoke |

---

## Anti-Patterns

| × Bad | ✓ Good |
|-------|--------|
| Bulk-archive ready-to-archive bucket | Recommend per-change `/adv-archive {id}` to preserve Tier B sign-off |
| LLM fallback on ambiguous reply | Re-prompt with same options; whitelist + regex only |
| Skip Phase 4 approval and act directly with `--execute` | Each non-empty closure bucket emits its own Tier B prompt |
| Close a change with unarchived `fast_follow_of` children | Surface in "blocked" sub-bucket; do not include in closure prompt |
| Include hot-band changes in closure candidates | Default `excludeRecencyBands: ["hot"]` in Phase 1 |

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Scan active changes (with recency) | `adv_change_list` |
| Detect orphans | `adv_orphan_sweep` (dryRun: true) |
| Inspect per-change (gates + tasks) | `adv_change_show` |
| Close changes (bulk) | `adv_change_bulk_close` |
| Re-seed orphans | `adv_orphan_sweep` (dryRun: false) |
