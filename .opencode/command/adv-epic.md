---
name: adv-epic
description: Gather Epic goals before typed creation
requiresChangeId: false
---

# ADV Epic — Goal-First Epic Creation

Create/update an ADV Epic through a collaborative goal-first workflow. Epics are initiative containers; membership optional, order advisory. Epics are changes with `kind:"epic"` — they use the same `adv_change_*` tools as regular changes, with epic-specific params.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** confirmed Epic title, `## Ultimate Goal`, narrative context, scope kind, related-work scan, overlap decision, optional initial shell/change entries, and a created or updated Epic using change tools with `kind:"epic"`.

**× MUST NOT:** create implementation tasks, complete gates, add CLI mutation verbs, make Epic membership mandatory, treat Epic order as blocking, add Jira-like assignees/estimates/sprints/boards, read ADV state files directly, use shell entries/agenda/prose as the authoritative record for required operational work, require an ops follow-up for every Epic/change/deployment, or execute deployments from Epic planning.

**Gate:** None.

## Boundary vs Nearby Commands

- `/adv-epic` — create or update an Epic initiative container (a change with `kind:"epic"`).
- `/adv-proposal` — create a normal ADV change for one work item.
- `/adv-triage` — coalesce overlapped changes↔issues and surface portfolio balance; does not create Epic state.
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
4. Assess required operational work (contextual — only when the initiative's delivery changes need it). Ask whether any planned entry introduces operational delivery work such as first deployment, migration, backfill, deployment configuration, monitoring, cleanup, or teardown. This is a human/agent judgment, not an Epic-metadata heuristic: do not require an ops follow-up for every Epic, change, or deployment.
   - When required operational work is identified, do not track it in shell entries, agenda text, or prose. Plan to represent it through the existing typed path from the relevant delivery change: `adv_task_add` with cross-change `blockedBy` refs creates dependency links, and the delivery change records the outbound `ops_followup_links[]` edge. Use `blocks` when release safety requires completion before release; use `follows_release`, `monitors`, or `cleanup_after` for release-first follow-through (non-blocking unless `required_handoff` is recorded).
   - Epic planning never executes deployments. Production execution stays governed by the existing ops runbook and approval requirements on the child ops change. Epic order remains advisory and never blocks release.

## Phase 2: Related-Work Scan

Use typed tools only:

| Purpose                                 | Tool                |
| --------------------------------------- | ------------------- |
| List active Epics                       | `adv_change_list` with `filter:{kind:"epic"}` |
| Inspect plausible overlapping Epics     | `adv_change_show` (includes entries for epics) |
| Inspect active changes for related work | `adv_change_list`   |
| Inspect portfolio balance when relevant | `adv_change_list` + `adv_change_show` |

Rules:

- Heuristics may rank likely overlap, but typed reads plus user choice own the decision.
- Surface evidence neutrally; do not hide a default recommendation.
- If the scan fails, stop before mutation and surface the tool error/remediation.

## Phase 3: Overlap Decision

If no plausible overlap exists, proceed to final confirmation.

If plausible overlap exists, present the evidence and ask the user to choose exactly one:

| Option                  | Meaning                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| update/clarify existing | Use `adv_change_update` (with `link_change`/`unlink_change`/`reorder_entries` for entry ops) or `adv_change_create` with `parent_epic_id` + `shell:true` to refine the existing Epic; run `adv_change_show` to inspect entry convergence |
| merge duplicate         | No single merge tool exists; plan conflict-safe consolidation, then execute with `adv_change_update` (`link_change` + `unlink_change`) only after explicit conflict dispositions |
| create new              | Create a distinct Epic because the ultimate goal or scope is different                                                       |
| stop                    | Do not mutate Epic state                                                                                                     |

× MUST NOT call `adv_change_create` with `kind:"epic"` for a plausible duplicate until the user chooses `create new`.

## Phase 4: Final Plan + Confirmation

Present:

- title
- `## Ultimate Goal`
- narrative context to pass in `adv_change_create` with `kind:"epic"`
- scope kind and product/repo metadata
- related-work scan summary
- overlap decision
- initial entries, if any

Initial entries are optional; a valid Epic may start with only title, ultimate goal, and narrative.

Ask for explicit final confirmation. `adv_change_create` with `kind:"epic"` may run only after the `## Ultimate Goal` and final confirmation are both present.

## Phase 5: Mutate Through Change Tools

After confirmation:

1. Create new Epic with `adv_change_create` (`kind:"epic"`), update existing Epic title/narrative with `adv_change_update`, or refine entries with `adv_change_create` (`parent_epic_id` + `shell:true`) and `adv_change_update` (`link_change`). Run `adv_change_show` to inspect entry convergence before escalating to mutating tools.
2. Add user-approved future work with `adv_change_create` (`parent_epic_id` + `shell:true`).
3. Link user-approved existing changes with `adv_change_update` (`link_change:"<changeId>"`).
4. Consolidate approved duplicate active Epics by moving/linking/unlinking entries with `adv_change_update` (`link_change` + `unlink_change`) after plan review. No single merge tool exists.
5. Reorder entries with `adv_change_update` (`reorder_entries:["id1","id2",...]`).
6. If follow-on shell/link/merge operations fail after Epic creation, report the created Epic ID, failed operation, and safe retry/repair path.

### Cross-project membership routing

When linking or moving changes into an Epic that spans projects:

- `target_path` routes the **child change project**.
- `epic_owner_target_path` routes the **Epic owner project** when the Epic lives in another ADV-enabled project.
- Supported shapes: owner local + child local; owner local + child remote (`target_path`); owner remote + child same remote (`epic_owner_target_path`); owner remote + child different remote (`epic_owner_target_path` + `target_path`).
- Ambiguous/partial shapes (e.g. child-only `target_path` when the Epic is not local) MUST fail before mutation. Require explicit user confirmation for each untrusted remote project.

× MUST NOT infer the owner project from a child-only `target_path`.

× MUST NOT directly edit ADV state files.

## Output

Emit a compact final report:

- Epic ID and title
- Ultimate Goal
- Created/updated status
- Entries added/linked/skipped
- Remaining follow-up actions, or `None`
