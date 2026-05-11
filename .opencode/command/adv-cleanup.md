---
name: adv-cleanup
description: Triage stale, abandoned, duplicate, and ready-to-archive active changes
---
<!-- manifest: adv-cleanup · requiresChangeId: false -->
# ADV Cleanup — Active State Triage

Dry-run by default. Scan active ADV changes, bucket candidates, report actions. `--execute` applies only after per-bucket Tier B approval. Runs inline; no sub-agents.

> **CHECKLIST**: Default dry-run. Closures require Tier B per-bucket approval (`rq-inlineApproval01.4`). Never auto-archive; recommend `/adv-archive {id}` to preserve per-change Tier B sign-off (`rq-inlineApproval01.3`).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-cleanup")` → bucket rules, staleness heuristics, duplicate checks, approval parser, bulk-close procedure. If unavailable, use fallback below.

Fallback: use phases in this file; apply bucket precedence exactly; never mutate before strict approval.

## Parse Flags

- `--execute` — apply approved bucket actions; default dry-run.
- `--bucket <name>` — one bucket: `duplicate` / `stuck` / `abandoned` / `ready-to-archive`.
- `--age-threshold <duration>` — default `7d`; accepts `7d`, `48h`, `60m`, `7d 12h`.

Validate bucket and duration before scan; reject malformed values with example.

---

## Phase 1: Scan

Call `adv_change_list({ sort: "stalest", excludeRecencyBands: ["hot"] })`. Record scanned count + hot-excluded count.

If 0 active changes → `No cleanup candidates. No active changes.` → stop.

---

## Phase 2: Categorize

Use skill bucket precedence; most-specific wins:

1. **Duplicate** — normalized title match or conservative ID suffix match → explicit `adv_change_bulk_close reason: superseded`.
2. **Stuck at proposal** — proposal pending, no tasks, stale → filter close `reason: not_planned`.
3. **Abandoned mid-flight** — proposal done, pending/in-progress tasks, stale, no recent gate → filter close `reason: cancelled`.
4. **Ready to archive** — all gates except release done, all tasks done, no unresolved review findings → recommend `/adv-archive {id}`.
5. **Healthy** — skip.

Inspect cheaply: duplicate pass over active+archived list; if hot/non-stale and not duplicate → Healthy; otherwise one `adv_change_show` per stale change. Before closure buckets, check unarchived `fast_follow_of` children; move matches to blocked sub-bucket. If `--bucket`, retain only that bucket.

---

## Phase 3: Present Findings

Emit grouped inline report; skip Healthy. Include mode, scanned, hot excluded, age threshold, bucket counts, reasons, total candidates, and filtered bucket note when applicable.

Required snippets:

- Ready → `→ Run /adv-archive {id} to ship.`
- Dry-run → `Re-run with --execute to apply per-bucket actions (each bucket requires Tier B approval).`
- Empty → `No cleanup candidates. All active changes are healthy or hot.`

If `--execute`, continue to Phase 4 for Duplicate, Stuck, Abandoned only. Skip Ready-to-archive and Blocked.

---

## Phase 4: Per-Bucket Approval (`--execute` only — Tier B inline)

For each non-empty closure bucket, emit separate Tier B inline prompt (cancellation approval, `rq-autonomy01` checkpoint #7, `rq-inlineApproval01.4`).

Prompt MUST include numbered candidates with reason and anchor phrase:

`Reply EXACTLY one of:`

Allowed replies (trimmed, case-insensitive regex; no LLM fallback):

| Pattern | Action |
|---|---|
| `^approve all$` | close all listed |
| `^reject all$` | skip bucket |
| `^keep ([\d,\s]+)$` | close inverse |
| `^cancel ([\d,\s]+)$` | close listed |
| `^(stop\|abort)$` | halt cleanup; close nothing else |

Anything else → re-prompt same options. **× Do NOT** invoke LLM fallback. **× Do NOT** advance.

---

## Phase 5: Apply

For each approved bucket, call `adv_change_bulk_close` with `approvedByUser: true`, `approvalEvidence`, selector, reason, and `supersededBy` for Duplicate. Duplicate bucket MUST use explicit IDs; filter-based `reason: "superseded"` is rejected.

Before Duplicate apply, `adv_change_show` each `supersededBy` target. Missing target → skip only those candidates and report `skipped: missing supersededBy target`.

Each bucket atomic. Success: `✓ {Bucket name}: closed {N} change(s) — {reason}`. Failure: `✗ {Bucket name}: failed — {error message}. No changes closed in this bucket.` Continue next bucket.

---

## Final Report

Emit closing summary. Use Gate Handoff Voice spine but omit gate footer; cleanup owns no gate.

---

## Coexistence

| Command | Relationship |
|---|---|
| `/adv-status` | Read-only overview; cleanup is actionable counterpart |
| `/adv-refactor` | Refreshes stale proposal content; cleanup closes abandoned/dead proposals |
| `/adv-archive` | Cleanup recommends only; archive owns Tier B sign-off |

## Key Tools

| Purpose | Tool |
|---|---|
| Scan active changes | `adv_change_list` |
| Inspect gates/tasks | `adv_change_show` |
| Close bulk candidates | `adv_change_bulk_close` |
