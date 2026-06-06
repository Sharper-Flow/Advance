## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Proposal: Read CLI status from Visibility search attributes

## Problem

`adv status` per-workflow query path requires a live worker for the selected project. Browsing projects from the launcher (no session) → query timeout → fail-closed → no ADV rows. Confirmed with ~/dev/pokeedge: `adv status --json` returns `live:false`, error `Temporal query hardenMigrationSafety timed out after 5000ms`, while the change workflows are Running and their Visibility search attributes are fully populated.

## Proposal

Replace the CLI live-status read with a Visibility-search-attribute read:

- Enumerate the project's change workflows via `client.workflow.list` (already used by `listChangeWorkflowIds`).
- Build each `ChangeSummary` from the workflow's Visibility search attributes (`AdvChangeId`, `AdvChangeTitle`, `AdvChangeStatus`, `AdvCurrentGate`, `AdvLastSignalAt`, `AdvCreatedAt`), synthesizing `gateProgressStr`/`firstIncompleteGate` from `AdvCurrentGate` and the canonical `GATE_ORDER`.
- Keep `source:"temporal"`, `live:true` on success; fail closed (`live:false`) only when the Temporal connection or Visibility list fails.
- No per-workflow query → no per-project worker dependency.

## Scope

- `bin/lib/live-status.ts` — new Visibility-summary read path; CLI uses it.
- `bin/adv` — `runStatus` consumes the new path.
- Tests — CLI bridge contract + new live-status unit coverage.
- Spec/docs — note the worker-free Visibility read in advance-meta.

## Success criteria

- `adv status --json` for a project with no open session returns `live:true` with active change rows built from Visibility.
- `warp-project-launcher --adv-changes <project>` renders ADV rows for inactive projects (pokeedge).
- Temporal down still fails closed (`live:false`, no disk active rows).
- No new CLI mutation authority.

## Out of scope

- Task counts in rows (search attributes do not carry counts; default 0/0 acceptable, follow-up may enrich).
- MCP `adv_status` tool internal path.