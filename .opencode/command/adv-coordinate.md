---
name: adv-coordinate
description: Audit Epic alignment, sequencing, and membership health
---

<!-- manifest: adv-coordinate · requiresChangeId: false · scope: reads[specs, epics, changes] -->

# ADV Coordinate — Epic Alignment and Sequencing Audit

Run a read-first coordination pass across active Epics. Produce an alignment, sequencing, dependency, and membership-health report; apply durable Epic actions only after explicit approval through typed Epic tools.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** Epic coordination report, ownership-boundary findings, narrative accuracy findings, cross-Epic dependency notes, advisory sequencing recommendations, membership-health findings, and approved action results.

**× MUST NOT:** create tasks, complete gates, add CLI mutation verbs, make Epic membership mandatory, auto-enroll changes into Epics, treat Epic order as blocking, add Jira-like assignments/estimates/sprints/boards/ownership workflow, mutate without explicit approval, or access ADV external state through filesystem paths.

**Gate:** None.

## Boundary vs Nearby Commands

| Command | Relationship |
|---|---|
| `/adv-epic` | Creates or updates one Epic after goal-first confirmation. |
| `/adv-coordinate` | Audits active Epics as a set and proposes coordination actions. |
| `/adv-cleanup` | Triages active changes; does not mutate Epic roadmap structure. |
| `bin/adv epic list --json` | Read-only CLI list; no CLI mutation verbs. |

Epic membership remains optional. Epic order is advisory: recommendations may guide display and next-work choices, but must not block gates, tasks, promotion, or change progress.

## Parse Arguments

- Default: all active Epics in the current project.
- Optional future filters may narrow by Epic ID or repo scope, but v1 must not require filters to run safely.
- Reject unknown flags with a short example; do not infer hidden mutation intent from arguments.

---

## Phase 1: Inventory (Read-First)

Use typed tools only:

| Purpose | Tool |
|---|---|
| List active Epics | `adv_epic_list` |
| Inspect each Epic fully | `adv_epic_show view: "full"` |
| Inspect linked changes when needed | `adv_change_show` |
| Check relevant spec law | `adv_spec` |

If no active Epics exist, report `No active Epics. No coordination actions.` and stop.

Record for each Epic:

- Epic ID, title, narrative, version, derived scope label.
- Entries, order, kind (`shell` or `change`), title, success hint, member status.
- Terminal summaries or compact history when available.
- Health signals including `target_unreachable`, `projection_pending`, `projection_stale`, or missing child state.

---

## Phase 2: Alignment Audit

Analyze each Epic and the set of Epics:

| Dimension | Check |
|---|---|
| Ownership boundaries | Entry belongs in the current Epic vs another Epic. |
| Narrative accuracy | Narrative still matches current entries and known terminal work. |
| Cross-Epic dependencies | Prerequisites are explicit in both directions where useful. |
| Evidence grounding | Claims cite typed ADV/spec/code evidence when checkable. |

Heuristics may rank or group likely findings. Typed reads and cited evidence own correctness. Separate evidence-backed facts from judgment calls.

Prefer narrative cross-links over duplicating the same work in multiple Epics.

---

## Phase 3: Sequencing Audit

Build an advisory dependency view from:

- entry success hints;
- existing change titles/proposals when available;
- explicit cross-Epic prerequisite notes;
- terminal summaries.

Flag:

- dependency inversions — dependent entry appears before prerequisite;
- capstone misplacement — acceptance/E2E/capstone entry appears before feeder work;
- stale order — order no longer matches current completed/in-progress/future state.

Order remains advisory. Never block gates, tasks, promotion, or change progress solely because of Epic order.

---

## Phase 4: Membership Health Audit

Report typed health findings and repair paths:

| Signal | Recommendation |
|---|---|
| `target_unreachable` | Surface target path/project context; recommend audited `adv_epic_repair_membership dryRun: true` where appropriate. |
| `projection_pending` | Recommend sync-child projection repair after user approval. |
| `projection_stale` | Recommend stale projection repair with evidence. |
| Missing child workflow | Recommend parent-only stale-entry repair or audited retarget only with explicit evidence. |

Do not silently mutate. Repairs require `evidence`; target-routed repairs follow target-path trust rules.

---

## Phase 5: Present Coordination Report

Emit grouped report:

- Inventory summary: Epics scanned, entries scanned, health counts.
- Alignment findings: clear-cut vs judgment calls.
- Sequencing findings: inversions, capstone placement, proposed `entry_ids` order.
- Health findings: status, evidence, suggested repair mode.
- Proposed durable actions: narrative updates, reorders, membership repairs.
- No-action findings: already aligned, intentionally advisory, or out of scope.

For each durable action include:

- affected Epic ID and current version;
- exact rationale and evidence;
- tool that would apply it (`adv_epic_update`, `adv_epic_reorder`, `adv_epic_repair_membership`);
- required inputs such as `expected_version`, `entry_ids`, `mode`, and `evidence`.

---

## Phase 6: Approval

Durable Epic actions are approval-gated.

For each action group, ask for explicit approval inline. Keep judgment calls separate from clear-cut repairs.

Allowed replies for action groups:

| Reply | Action |
|---|---|
| `approve all` | Apply all listed actions in this group. |
| `reject all` | Apply none in this group. |
| `approve 1,3` | Apply listed numbered actions only. |
| `revise` or free text | Rework report/action proposal; do not mutate. |
| `stop` / `cancel` | Stop; no remaining mutations. |

Anything else → re-prompt same action group. No LLM fallback for mutation approval.

---

## Phase 7: Apply Approved Actions

Use typed tools only:

| Action | Tool |
|---|---|
| Narrative/title update | `adv_epic_update` with current `expected_version` |
| Advisory reorder | `adv_epic_reorder` with full `entry_ids` and current `expected_version` |
| Membership repair | `adv_epic_repair_membership` with `mode`, target entry/change, `evidence`, and `dryRun` first when risk exists |

Before mutation, confirm the Epic version still matches the report's `expected_version`. If stale, re-read with `adv_epic_show`, re-present the changed action, and require fresh approval.

Apply action groups atomically where the tool supports it. If one approved action fails, report exact failure and continue only when later actions are independent.

---

## Final Report

Emit:

- Epics scanned.
- Findings by category.
- Actions approved/applied/skipped/failed.
- Remaining judgment calls.
- Safe retry command or repair recommendation.

## Key Tools

| Purpose | Tool |
|---|---|
| List Epics | `adv_epic_list` |
| Show Epic | `adv_epic_show` |
| Update narrative/title | `adv_epic_update` |
| Reorder entries | `adv_epic_reorder` |
| Repair membership | `adv_epic_repair_membership` |
| Inspect linked change | `adv_change_show` |
| Check spec law | `adv_spec` |
