---
name: adv-status
description: Show operational health: in-flight changes, Temporal, worktrees, session debt
---
<!-- manifest: adv-status · requiresChangeId: false -->
# ADV Status

Show **operational health**: what's mid-flight in ADV state right now. Answers "is the system OK?" and "what am I working on?". The strategic-planning view (ranked backlog, what's next) lives in `/adv-roadmap`; the two are deliberately disjoint.

## Execution

Call `adv_status` for the operational overview. Format defined by `plugin/src/utils/tool-formatters.ts` `formatStatusOutput`. Use `_contextSnapshot.workdir` when provided.

### Display Format

| Section | Content |
|---|---|
| **SPECS** | total capabilities; per-spec requirement count |
| **ACTIVE CHANGES** | sorted by recency; per-change: id, title, status, tasks (done/total), last activity, gate progress, workdir |
| **WORKTREES** | active worktree count; stale worktrees (>7d inactive) with branch + last activity |
| **ARCHIVED CHANGES** | total count + last 5 (date/id/title) |
| **CROSS-CHANGE HEALTH** | hot files (2+ changes), stale worktrees, merge-queue blockers (auto-emerges when ≥2 active changes) |
| **ROADMAP FRESHNESS** | mtime of `.adv/roadmap-snapshot.json` (or "never generated"); recommends `/adv-triage --execute` if stale >7 days |
| **TEMPORAL HEALTH** | server liveness, worker process health, queue serviceability |
| **SESSION DEBT** | OpenCode blank-row counts (informational; see `/adv-doctor` for cleanup) |
| **PEER SESSIONS** | other ADV sessions in the same project (privacy-defensive: opaque session_id only) |
| **RECOMMENDATIONS** | gate-based, from workflow manifest (table below) |

`/adv-status` does NOT echo the roadmap. For ranked-backlog questions ("what's next?", "top features", "open critical bugs"), invoke `/adv-roadmap` directly.

| Recency band | Window | Meaning |
|---|---|---|
| 🔥 hot | <60min | likely in-flight |
| ⏳ warm | 1-3h | recent |
| ⏰ stale | 3h+ | resume candidate |

**Recommendations:**
| Incomplete Gate | Recommendation |
|----------------|----------------|
| proposal | `/adv-proposal <change-id>` |
| discovery | `/adv-discover <change-id>` |
| design | `/adv-design <change-id>` |
| planning | `/adv-prep <change-id>` |
| execution | `/adv-apply <change-id>` |
| acceptance | `/adv-review <change-id>` |
| release | `/adv-harden <change-id>` then `/adv-archive <change-id>` |

### Cross-Change Health Section

Auto-emerges when `adv_change_list` returns ≥2 active changes. Build from `adv_change_show` on each active change:

1. **Hot files** — files touched by 2+ active changes. List file + change IDs.
2. **Stale worktrees** — worktrees with no activity >7d (already in WORKTREES section; cross-reference here)
3. **Merge-queue blockers** — if any archived changes are unmerged, show `computeMergeOrder` queue position and dependencies

If <2 active changes, emit "Cross-change health: N/A (single change in flight)".

### Roadmap Freshness Section

Read mtime of `<repo-root>/.adv/roadmap-snapshot.json`. If file is missing, emit `Roadmap snapshot: never generated. Run /adv-triage --execute to bootstrap.` If file mtime is >7 days old, emit `Roadmap snapshot: <N> days old (last regenerated <ISO-date>). Consider /adv-triage --execute.` Otherwise emit `Roadmap snapshot: <N>h old (current).` This section is **informational only** — `/adv-status` does NOT regenerate or echo the roadmap.

---

## Quick Actions
| State | Action |
|-------|--------|
| No specs/changes | `/adv-proposal "initial feature"` |
| Specs, no changes | `/adv-roadmap` to see the prioritized backlog |
| Draft change | `/adv-validate <change-id>` |
| Active, tasks pending | `/adv-apply <change-id>` |
| Active, all tasks done | Follow RECOMMENDATIONS table for next incomplete gate |
| Multiple active | Show selection |
| User asks "what's next?" | `/adv-roadmap` (NOT `/adv-status`) |
