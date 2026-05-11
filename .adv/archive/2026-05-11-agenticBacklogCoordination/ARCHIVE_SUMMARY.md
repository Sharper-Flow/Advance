# Archive: Agentic backlog coordination model

**Change ID:** agenticBacklogCoordination
**Archived:** 2026-05-11T05:46:45.444Z
**Created:** 2026-05-11T02:21:19.747Z

## Tasks Completed

- ✅ Extend `ChangeWorkflowState` and `ChangeWorkflowInput.seedState` with optional `origin?: ChangeOrigin` field.
  > Task checkpoint completed
- ✅ Extend `.adv/roadmap-snapshot.json` schema with TTL freshness metadata.
  > Task checkpoint completed
- ✅ Author `.adv/specs/backlog-coordination.md` capability spec.
  > Task checkpoint completed
- ✅ Add `adv_wip_state` tool — single-call aggregator over active changes + worktrees + peer sessions.
  > Task checkpoint completed
- ✅ Add `AdvBacklogIssueNumber: "Keyword"` to `ADV_SEARCH_ATTRIBUTES` and populate from `state.origin?.issue_number` in `buildChangeSearchAttributes`. Includes registration verification.
  > Task checkpoint completed
- ✅ Implement `queryClaimsByIssueNumber(client, projectId, issueNumber)` Visibility helper.
  > Task checkpoint completed
- ✅ Implement `queryActiveChangesByIssueNumbers(client, projectId, issueNumbers[])` bulk Visibility helper.
  > Task checkpoint completed
- ✅ Add `adv_backlog_state` tool — ranked backlog + claim annotations + freshness metadata in one call.
  > Task checkpoint completed
- ✅ Modify `adv_change_create` — pre-create + post-create claim checks for `origin.kind === 'roadmap'`; pass `origin` through `seedState`.
  > Task checkpoint completed
- ✅ Modify `adv_roadmap` — delegate to `adv_backlog_state` when Visibility reachable; remove `buildActiveChangeIndex`.
  > Task checkpoint completed
- ✅ Register new tools + update command docs.
  > Task checkpoint completed
- ✅ Regression test coverage for RL-1 through RL-7 + `rq-aw-backlog01` extension to `advance-workflow` spec.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Temporal antipattern: long-lived project-level workflows holding cross-cutting shared state fight Temporal's per-entity-workflow design model. Symptoms: unbounded state growth, constant continue-as-new overhead, fragile replay determinism under code changes, queue throughput bottleneck (all mutations serialized), no natural cancellation semantics, search attributes lose meaning. The Temporal-native alternative for "multi-agent shared coordination" is structurally different: per-entity short-lived workflows (lease as workflow lifecycle), search attributes for cross-entity visibility, activities with idempotency keys for external sync, file-locked JSON or SQLite for read-mostly cached projections. Reuse-the-retired-workflow-under-a-different-name is the same antipattern with a fresh coat of paint. D3 retirement of `projectWorkflow` (with denylist test in `plugin/src/__tests__/no-psw-references.test.ts`) is the project's defense against this antipattern. Validate with research before introducing any new long-lived shared workflow.
- **[failure]** Design built on stale lgrep semantic-search results — central decision (D1: reuse existing `projectWorkflow`) was wrong because lgrep returned pre-D3 code that no longer exists in `plugin/src/temporal/workflows.ts`. Lesson: for architectural facts that gate a whole design (does X exist? is Y retired? is Z denylisted?), semantic search is not authoritative. Verify via direct `Read` or `Bash rg` on the actual current source before committing the design. Semantic indices can lag behind file state, especially after major migrations or retirements. The Phase 3.5 independent validator caught this — confirming the validator's value as a structural correctness check, not just a stylistic review.
