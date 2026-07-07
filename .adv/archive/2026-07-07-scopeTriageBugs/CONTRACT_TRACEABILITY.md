# Contract Traceability

**Change ID:** scopeTriageBugs
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T02:05:07.339Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | .opencode/command/adv-triage.md:99-103 — Phase 5 (Agent Scoring) section removed |
| AC2 | acceptance_criterion | pass | test | bin/adv — --rescore flag removed; SKILL.md/PROMPTS.md/ANTI-PATTERNS.md scoring-only references stripped |
| AC3 | acceptance_criterion | pass | test | .opencode/command/adv-triage.md Key Tools table — gh api graphql mutation rows removed |
| AC4 | acceptance_criterion | pass | test | plugin/src/adv-triage-phase4c-agent.test.ts + .opencode/command/adv-triage.md Phase 4c loop spec |
| AC5 | acceptance_criterion | pass | test | .opencode/command/adv-triage.md — × MUST NOT autofill bug priority — user-only guardrail removed |
| AC6 | acceptance_criterion | pass | test | plugin/src/tools/roadmap.ts:44-53 — RoadmapFeature nullable wsjf/rroe/effort/value/time_criticality fields retained |
| AC7 | acceptance_criterion | pass | test | plugin/src/roadmap-render-no-scoring-cols.test.ts + bin/lib/roadmap-render-no-scoring-cols.test.ts |
| AC8 | acceptance_criterion | pass | test | Operator action documented in archive notes (post-archive GH Project field drop) |
| AC9 | acceptance_criterion | pass | test | .adv/specs/backlog-coordination/spec.json — rq-backlogCoord06 + 06.1 + 06.2 deleted |
| AC10 | acceptance_criterion | pass | test | .adv/specs/backlog-coordination/spec.json — capability purpose updated |
| AC11 | acceptance_criterion | pass | test | plugin/src/tools/backlog.ts:13-16 — header comment updated to read-only-on-snapshot phrasing; rq06 dangling ref removed |
| AC12 | acceptance_criterion | pass | test | plugin/src/{adv-triage-phase4c-agent,roadmap-render-no-scoring-cols,rq-backlogCoord09-spec-compliance}.test.ts — 3 new tests; adv-triage-relevance-assets updated |
| AC13 | acceptance_criterion | pass | test | pnpm run check green; pnpm test 4624/4625 pass; bun test bin/ 194/194 |
| C1 | constraint | respected | static_check | plugin/src/tools/backlog.ts:13-16 — comment-only edit; no code changes to read-only tool layer |
| C2 | constraint | respected | static_check | roadmap-origin-sanitize.ts retained |
| C3 | constraint | respected | static_check | Bug priority label system (priority:*) preserved throughout |
| C4 | constraint | respected | static_check | adv_backlog_state read paths unchanged |
| C5 | constraint | respected | static_check | rq-backlogCoord01-04, 05, 07-08 preserved |
| C6 | constraint | respected | static_check | User confirmed: GH Project field drop is a one-time operator action (not automated) |
| DONT1 | avoidance | respected | review | No new feature-scoring tooling added |
| DONT2 | avoidance | respected | review | Phase 5 + GraphQL writes fully removed |
| DONT3 | avoidance | respected | review | No migration of existing autoscored features |
| DONT4 | avoidance | respected | review | adv_backlog_state write paths unchanged (none exist) |
| DONT5 | avoidance | respected | review | No Epic-related changes in this change |
| DONT6 | avoidance | respected | review | No backlog-related changes in this change |
| DONT7 | avoidance | respected | review | Bug-priority agent-driven model implemented; user-only invariant removed |
| DONT8 | avoidance | respected | review | question tool used for context only, not priority confirmation |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-68b513223947 |  |  |  |  |
| tk-11268e7c6746 |  |  |  |  |
| tk-55a8727ca5d5 | AC11 |  | C1 |  |
| tk-04bcc030c5fd | AC2 |  |  |  |
| tk-c9a1f89429da |  |  |  |  |
| tk-ce51d475e4ce |  |  |  |  |
| tk-d23b76b67208 |  |  |  |  |
| tk-2db0187d4cc0 | AC13 | AC6, AC8 | C2, C6 |  |
| tk-2cd15053b636 | AC12 | AC4, AC7, AC10 | C1 |  |
| tk-2f09671fd116 | AC1, AC2, AC3, AC4, AC5 |  |  |  |
| tk-e492555c2f4c | AC1, AC2, AC3, AC5 |  |  |  |
| tk-20d117b608e9 | AC9, AC10 |  |  |  |
