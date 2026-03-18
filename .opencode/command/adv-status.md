---
name: adv-status
description: Show project overview: specs, active changes, and next-step recommendations
agent: build
---

# ADV Status

Show current ADV project state: specs, active changes, recommendations.

## Execution

Call `adv_status` for project overview.

**Context Snapshot:** `adv_change_show` includes `_contextSnapshot` — use for gate progress in ACTIVE CHANGES section.

**Workdir display:** use `_contextSnapshot.workdir` when the status implementation provides it. Don't assume git worktree detection is available here.

### Display Format

Emit ADV PROJECT STATUS:

**SPECS** — total capabilities, each with requirement count.

**ACTIVE CHANGES** — sorted by recency. Each shows: change-id, title, status, tasks (done/total), last activity, gate progress, workdir (when available).

Recency bands: 🔥 hot (<60min, likely in-flight), ⏳ warm (1-3h), ⏰ stale (3h+, resume candidate).

**ARCHIVED CHANGES** — total count, last 5 with date/id/title.

**RECOMMENDATIONS** — gate-based from workflow manifest:

| Incomplete Gate | Recommendation |
|----------------|----------------|
| research | `/adv-research <change-id>` |
| prep | `/adv-prep <change-id>` |
| implementation | `/adv-apply <change-id>` |
| review | `/adv-review <change-id>` |
| harden | `/adv-harden <change-id>` |
| signoff | User confirmation required |

## Quick Actions

| State | Action |
|-------|--------|
| No specs/changes | `/adv-proposal "initial feature"` |
| Specs, no changes | `/adv-proposal "next feature"` |
| Draft change | `/adv-validate <change-id>` |
| Active, tasks pending | `/adv-apply <change-id>` |
| Active, all tasks done | Follow RECOMMENDATIONS table for next incomplete gate |
| Multiple active | Show selection |

```
/adv-status COMPLETE
```
