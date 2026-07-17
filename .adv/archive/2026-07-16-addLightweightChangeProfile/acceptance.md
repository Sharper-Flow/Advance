# Acceptance

Reviewed at: 2026-07-16T21:40:27.415Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | An eligible change completes proposal, discovery, design, planning, execution, acceptance, and release through the existing ordered gate model while using the lightweight profile only when all six eligibility criteria are satisfied. | pass | Acceptance re-review READY; typed profile preserves gate authority. |
| SC2 | success_criterion | Every classification, execution-boundary revalidation, and acceptance-boundary revalidation records one typed outcome per criterion with evidence provenance, evaluation time, and any downgrade reason. | pass | Typed evaluation history, boundary revalidation, and stable keys reviewed. |
| SC3 | success_criterion | A non-qualified or downgraded change follows standard workflow requirements from its current gate and cannot bypass an existing gate, verification, review, approval, worktree, or release blocker. | pass | Downgrade tests and review confirm standard routing/no bypass. |
| AC1 | acceptance_criterion | Given a change requests the lightweight profile, when profile evaluation runs, then it records exactly six criterion outcomes: implementation-task count, changed-file count, spec delta, dependency change, API compatibility, and repository scope. | pass | Focused profile suites pass; six criteria schema asserted. |
| AC2 | acceptance_criterion | Given a requested profile, when all six criterion outcomes are explicitly satisfied, then the change is qualified; when any outcome is failed, missing, stale, or contradictory, then the change is ineligible and standard workflow requirements apply. | pass | Fail-closed unknown/malformed/incomplete-range tests pass. |
| AC3 | acceptance_criterion | Given changed-file evaluation, when a change contains multiple commits, renames, or deletions, then the count covers the complete change range and a count greater than two is ineligible. | pass | Collector tests cover multi-commit, rename, delete, untracked paths. |
| AC4 | acceptance_criterion | Given a qualified change, when it reaches the execution boundary or acceptance boundary, then all six criteria are re-evaluated before lightweight routing applies at that boundary. | pass | Boundary policy and failure-downgrade tests pass. |
| AC5 | acceptance_criterion | Given an eligible change, when lightweight workflow work is selected, then it may omit only optional deep codebase scans, generic external research, opportunity scouting, and specialist delegation. | pass | Exact four-category omission policy tests pass. |
| AC6 | acceptance_criterion | Given an eligible change, when workflow work is selected, then spec and conflict checks, targeted verification, review, human approvals, worktree isolation, and release checks remain required. | pass | Required-control and explicit-delegation precedence tests pass. |
| AC7 | acceptance_criterion | Given a qualified change later fails revalidation without changing approved user scope, when it is downgraded, then the downgrade reason is recorded and the change continues from its current gate under standard requirements; normal scope-reentry behavior remains unchanged when scope does change. | pass | No-reset downgrade behavior is tested and reviewed. |
| AC8 | acceptance_criterion | Automated coverage includes at least six cases spanning qualification, each failure class, unknown/stale evidence, multi-commit file count, rename/deletion handling, and boundary downgrade. | pass | 94 focused acceptance re-review tests pass. |
| C1 | constraint | Eligibility and routing must use typed schemas/validators and durable workflow state; agent prose, task titles, and heuristics cannot determine qualification. | respected | Zod schemas and durable state own eligibility. |
| C2 | constraint | The profile must reuse central gate/readiness authority and must not persist a competing workflow state machine. | respected | Reviewer found no competing workflow state machine. |
| C3 | constraint | Missing, stale, contradictory, or unavailable evidence is ineligible; it cannot be downgraded to a warning-only qualification. | respected | Unknown, policy, Git, and boundary failures fail closed. |
| C4 | constraint | Worktree isolation, targeted proof, review, human checkpoints, existing verification blockers, and release safety remain unchanged for eligible and standard changes. | respected | Review confirms required controls remain intact. |
| C5 | constraint | Changed-file evidence must represent the complete change range, not only a last-checkpoint or last-commit summary. | respected | Complete-range evidence covers Git and worktree states. |
| DONT1 | avoidance | Do not create a broad lightweight boolean that disables categories of research, verification, review, or release work. | respected | Only immutable four-item omission policy exists. |
| DONT2 | avoidance | Do not auto-dispose verification or review blockers for lightweight changes. | respected | No review or verification blocker disposal added. |
| DONT3 | avoidance | Do not create command-local eligibility logic that can drift from gate/readiness authority. | respected | Central evaluator and gate routing own decisions. |
| DONT4 | avoidance | Do not treat a degraded Temporal/read result as evidence that a change is eligible. | respected | Read/evaluation failures cause non-qualification, never authorization. |
| OOS1 | out_of_scope | Removing, skipping, or reordering any gate. | not_applicable | No gate removal or reordering. |
| OOS2 | out_of_scope | Changing standard-workflow requirements for non-qualified changes. | not_applicable | Standard workflow unchanged for ineligible changes. |
| OOS3 | out_of_scope | Cross-project or cross-repository lightweight behavior. | not_applicable | No cross-project profile behavior. |
| OOS4 | out_of_scope | General status/read latency optimization unrelated to deterministic lightweight-profile selection. | not_applicable | No general status/read latency optimization. |

