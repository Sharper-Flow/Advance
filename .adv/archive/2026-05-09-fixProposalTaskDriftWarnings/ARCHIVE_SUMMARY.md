# Archive: Fix proposal-task drift warnings for narrative proposal sections

**Change ID:** fixProposalTaskDriftWarnings
**Archived:** 2026-05-09T21:31:24.307Z
**Created:** 2026-05-09T02:46:27.499Z

## Tasks Completed

- ✅ Add failing regression tests for narrative proposal sections not emitting PROPOSAL_TASK_DRIFT and explicit task-bearing sections still detecting drift.
  > Extended contract.test.ts with validateProposalDrift helper and two regression cases: narrative sections ignored, explicit task-bearing section warns when unmatched.
- ✅ Implement structural task-bearing section detection for proposal drift validation.
  > Updated runProposalDriftCheck to gate checks on explicit task-bearing headers only and clarified function documentation.
- ✅ Run focused validator tests and plugin check; document verification evidence.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Proposal-task drift validation should be opt-in to structurally task-bearing sections (Tasks, Planned Tasks, Implementation Tasks, Work Items, Work Plan), not opt-out from narrative headers. Header keyword matching over arbitrary proposal sections creates false positives on Intent/Scope/coordination prose.
