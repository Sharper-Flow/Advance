---
name: adv-epic
description: Gather Epic goals before typed creation
requiresChangeId: false
---

<!-- manifest: adv-epic · requiresChangeId: false · scope: reads[specs, epics, changes, backlog] · creates[epic] · modifies[epic] -->

# ADV Epic — Goal-First Epic Creation

Create or update an ADV Epic through a collaborative, goal-first workflow. Epics are initiative containers; membership remains optional and order remains advisory.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** confirmed Epic title, `## Ultimate Goal`, narrative context, scope kind, related-work scan, overlap decision, optional initial shell/change entries, and a created or updated Epic using typed Epic tools.

**× MUST NOT:** create implementation tasks, complete gates, add CLI mutation verbs, make Epic membership mandatory, treat Epic order as blocking, add Jira-like assignees/estimates/sprints/boards, or read ADV state files directly.

**Gate:** None.

## Boundary vs Nearby Commands

- `/adv-epic` — create or update an Epic initiative container.
- `/adv-proposal` — create a normal ADV change for one work item.
- `/adv-roadmap` — inspect backlog-ranked work; does not create Epic state.
- `bin/adv epic list --json` — read-only CLI list; no CLI create/update/delete/archive verbs.

## Phase 1: Frame Epic Intent

1. Restate the requested initiative in one sentence.
2. Elicit and confirm:
   - Epic title
   - `## Ultimate Goal` — one durable end-state the Epic exists to achieve
   - narrative context / why this is bigger than one change
   - scope kind: repo or product
   - constraints and explicit non-goals
   - optional initial roadmap entries
3. If the request is clearly one change rather than an initiative, recommend `/adv-proposal` instead of forcing an Epic.

## Phase 2: Related-Work Scan

Use typed tools only:

| Purpose                                 | Tool                |
| --------------------------------------- | ------------------- |
| List active Epics                       | `adv_epic_list`     |
| Inspect plausible overlapping Epics     | `adv_epic_show`     |
| Inspect active changes for related work | `adv_change_list`   |
| Inspect backlog/roadmap when relevant   | `adv_backlog_state` |

Rules:

- Heuristics may rank likely overlap, but typed reads plus user choice own the decision.
- Surface evidence neutrally; do not hide a default recommendation.
- If the scan fails, stop before mutation and surface the tool error/remediation.

## Phase 3: Overlap Decision

If no plausible overlap exists, proceed to final confirmation.

If plausible overlap exists, present the evidence and ask the user to choose exactly one:

| Option                  | Meaning                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| update/clarify existing | Use `adv_epic_update`, `adv_epic_update_scope`, `adv_epic_add_shell`, or `adv_epic_link_change` to refine the existing Epic  |
| merge duplicate         | Use `adv_epic_merge dryRun:true` to plan conflict-safe consolidation, then execute only after explicit conflict dispositions |
| create new              | Create a distinct Epic because the ultimate goal or scope is different                                                       |
| stop                    | Do not mutate Epic state                                                                                                     |

× MUST NOT call `adv_epic_create` for a plausible duplicate until the user chooses `create new`.

## Phase 4: Final Plan + Confirmation

Present:

- title
- `## Ultimate Goal`
- narrative context to pass in `adv_epic_create.narrative`
- scope kind and product/repo metadata
- related-work scan summary
- overlap decision
- initial entries, if any

Initial entries are optional. A valid Epic may start with only title, ultimate goal, and narrative.

Ask for explicit final confirmation. `adv_epic_create` may run only after the `## Ultimate Goal` and final confirmation are both present.

## Phase 5: Mutate Through Typed Epic Tools

After confirmation:

1. Create new Epic with `adv_epic_create`, update existing Epic with `adv_epic_update`, or update scope with `adv_epic_update_scope`.
2. Add user-approved future work with `adv_epic_add_shell`.
3. Link user-approved existing changes with `adv_epic_link_change`.
4. Merge approved duplicate active Epics with `adv_epic_merge` after dry-run plan review.
5. If follow-on shell/link/merge operations fail after Epic creation, report the created Epic ID, failed operation, and safe retry/repair path.

× MUST NOT directly edit ADV state files.

## Output

Emit a compact final report:

- Epic ID and title
- Ultimate Goal
- Created/updated status
- Entries added/linked/skipped
- Remaining follow-up actions, or `None`
