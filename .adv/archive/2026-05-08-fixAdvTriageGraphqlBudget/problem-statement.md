## Why

`/adv-triage` currently permits an inefficient GitHub Projects v2 write pattern that can exhaust the user’s GraphQL quota by repeatedly listing all project items inside per-field update loops. The command needs a structurally safe bulk-update protocol: one cached project-state read, local issue→item mapping, write-budget estimation, paced mutations, and idempotent resume behavior so large triage runs complete without rate-limit failures or partial-state confusion.

## Desired Outcome

A corrected `/adv-triage` contract that makes GitHub Projects v2 writes predictable, resumable, and rate-limit-safe while preserving Projects v2 as the canonical store and retaining required user approvals for issue creation, bug Priority, and feature Value.

## Expected Scope

- Update `/adv-triage` command contract.
- Update operator docs for GitHub GraphQL budget behavior.
- Resume the current interrupted triage only after the safer algorithm is documented.

## Auth Model

The command uses local `gh` CLI OAuth authentication as the current machine user. It keeps the existing required scopes (`repo`, `project`, `read:org`, `workflow`) and does not introduce new credentials or fallback tokens. The issue is GraphQL call volume, not auth scope.

## Must Not Happen

1. No `gh project item-list` inside write loops.
2. No blind retry after rate-limit failure.
3. No mutation without budget check.
4. No concurrent Project mutations.
5. No writing fields already populated with desired value.
6. No loss of partial progress.
7. No fallback to issue-body YAML as source of truth.
8. No heuristic-owned correctness.
9. No unapproved issue creation.
10. No unapproved Value/Priority assignment.
11. No silent defer/drop.
12. No hidden schema drift.
13. No rate-limit-cost surprise.
14. No mixing REST/core and GraphQL budgets.
15. No relying on `gh` defaults for large reads.
16. No single-run assumption.
17. No unsafe ROADMAP.md generation from stale local state.
18. No commit/push if roadmap is incomplete due to blocked scoring unless explicitly represented and approved.

## Acceptance Criteria

- Command text requires caching Project item IDs once per phase and forbids full project listing inside update loops.
- Command text requires a GraphQL budget estimate before Project writes.
- Command text requires resume to skip already-completed fields.
- Rate-limit failures stop execution and report reset time.
- Docs explain Projects v2 GraphQL budget and REST/core separation.
- Current triage run can resume safely after rate reset without re-exhausting quota.