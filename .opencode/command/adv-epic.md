---
name: adv-epic
description: Gather Epic goals before typed creation
requiresChangeId: false
---

<!-- manifest: adv-epic · requiresChangeId: false · scope: reads[specs, epics, changes, backlog] · creates[epic] · modifies[epic] -->

# ADV Epic — Goal-First Epic Creation

Create/update an ADV Epic through a collaborative goal-first workflow. Epics are initiative containers; membership optional, order advisory.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** confirmed Epic title, `## Ultimate Goal`, narrative context, scope kind, related-work scan, overlap decision, optional initial shell/change entries, and a created or updated Epic using typed Epic tools.

**× MUST NOT:** create implementation tasks, complete gates, add CLI mutation verbs, make Epic membership mandatory, treat Epic order as blocking, add Jira-like assignees/estimates/sprints/boards, read ADV state files directly, use shell entries/agenda/prose as the authoritative record for required operational work, require an ops follow-up for every Epic/change/deployment, or execute deployments from Epic planning.

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
<!-- rq-epicOpsPlanning01 -->
4. Assess required operational work (contextual — only when the initiative's delivery changes need it). Ask whether any planned entry introduces operational delivery work such as first deployment, migration, backfill, deployment configuration, monitoring, cleanup, or teardown. This is a human/agent judgment, not an Epic-metadata heuristic: do not require an ops follow-up for every Epic, change, or deployment.
   - When required operational work is identified, do not track it in shell entries, agenda text, or prose. Plan to represent it through the existing typed path from the relevant delivery change: `adv_followup_promote` creates or links an ops follow-up change with an `ops_followup` profile, and the delivery change records the outbound `ops_followup_links[]` edge. Use `blocks` when release safety requires completion before release; use `follows_release`, `monitors`, or `cleanup_after` for release-first follow-through (non-blocking unless `required_handoff` is recorded).
   - Epic planning never executes deployments. Production execution stays governed by the existing ops runbook and approval requirements on the child ops change. Epic order remains advisory and never blocks release.

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
| update/clarify existing | Use typed Epic tools such as `adv_epic_update`, `adv_epic_add_shell`, `adv_epic_link_change`, `adv_epic_move_change`, or `adv_epic_repair_membership` to refine the existing Epic |
| merge duplicate         | No single merge tool exists; plan conflict-safe consolidation, then execute with existing typed Epic tools such as `adv_epic_move_change`, `adv_epic_unlink_change`, `adv_epic_update`, and `adv_epic_repair_membership` only after explicit conflict dispositions |
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

Initial entries optional; a valid Epic may start with only title, ultimate goal, and narrative.

Ask for explicit final confirmation. `adv_epic_create` may run only after the `## Ultimate Goal` and final confirmation are both present.

## Phase 5: Mutate Through Typed Epic Tools

After confirmation:

1. Create new Epic with `adv_epic_create`, update existing Epic title/narrative with `adv_epic_update`, or refine entries with `adv_epic_add_shell`, `adv_epic_link_change`, `adv_epic_move_change`, and `adv_epic_repair_membership`.
2. Add user-approved future work with `adv_epic_add_shell`.
3. Link user-approved existing changes with `adv_epic_link_change`.
4. Consolidate approved duplicate active Epics by moving/linking/unlinking entries with existing typed Epic tools (`adv_epic_move_change`, `adv_epic_unlink_change`, `adv_epic_update`, and `adv_epic_repair_membership`) after plan review. No single merge tool exists.
5. If follow-on shell/link/merge operations fail after Epic creation, report the created Epic ID, failed operation, and safe retry/repair path.

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
