---
name: adv-status
description: Show project overview: specs, active changes, and next-step recommendations
---
<!-- manifest: adv-status · requiresChangeId: false -->
# ADV Status
Show current ADV project state: specs, active changes, recommendations.
## Execution
Call `adv_status` for project overview. Format defined by `plugin/src/utils/tool-formatters.ts` `formatStatusOutput`. Use `_contextSnapshot.workdir` when provided.

### Display Format

| Section | Content |
|---|---|
| **SPECS** | total capabilities; per-spec requirement count |
| **ACTIVE CHANGES** | sorted by recency; per-change: id, title, status, tasks (done/total), last activity, gate progress, workdir |
| **ARCHIVED CHANGES** | total count + last 5 (date/id/title) |
| **RECOMMENDATIONS** | gate-based, from workflow manifest (table below) |

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
## Quick Actions
| State | Action |
|-------|--------|
| No specs/changes | `/adv-proposal "initial feature"` |
| Specs, no changes | `/adv-proposal "next feature"` |
| Draft change | `/adv-validate <change-id>` |
| Active, tasks pending | `/adv-apply <change-id>` |
| Active, all tasks done | Follow RECOMMENDATIONS table for next incomplete gate |
| Multiple active | Show selection |
