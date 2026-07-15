# Contract Traceability

**Change ID:** consolidateCommandRepetitions
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T19:19:14.737Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Focused asset suite: adv-review-assets.test.ts 13/13 pass; canonical matrix/reference assertions cover one full matrix, OWASP scope, and explicit-justification reference. |
| AC2 | acceptance_criterion | pass | test | Focused 129-test command asset suite passes; scoped diff shows only the review-matrix dedup and its direct asset test, with no unsafe wrapper rewrite. |
| AC3 | acceptance_criterion | pass | test | Source audit retained live preExecutionRebase and T28 markers; focused command assets pass and branch diff does not touch adv-apply.md or adv-archive.md. |
| AC4 | acceptance_criterion | pass | test | Focused command-asset suites pass; reviewer confirmed Gate Handoff, approval, briefing-packet, embedded-methodology, and scanner contracts remain intact. |
| AC5 | acceptance_criterion | pass | test | Focused command asset suite: 129 tests pass. plugin pnpm run check exits 0. git diff --check exits 0. |
| SC1 | success_criterion | pass | review | Independent reviewer READY: duplicate 12-row Phase 1 matrix removed; canonical same-file source retained without shared includes. |
| SC2 | success_criterion | pass | review | Independent reviewer READY: Phase 1 has a precise same-file reference preserving all-12, OWASP, and explicit-justification behavior. |
| C1 | constraint | respected | static_check | Base-to-HEAD diff contains only .opencode/command/adv-review.md and plugin/src/adv-review-assets.test.ts; no runtime/schema/spec/tool/agent files changed. |
| C2 | constraint | respected | static_check | No token budget enforcement added; existing advisory wording and behavior retained. |
| C3 | constraint | respected | static_check | Diff adds no shared template, loader, include mechanism, or cross-command abstraction. |
| DONT1 | avoidance | respected | review | Reviewer found frozen behavior preserved; implementation deletes duplicate rows and uses a local reference rather than rewording protected tokens. |
| DONT2 | avoidance | respected | review | Reviewer and focused assets confirm no phase-local worker schema, fallback content, or briefing-packet contract was deleted. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No hard token-budget enforcement was requested or changed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No shared command loader/include architecture was introduced. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No stale updateAgentGuide recovery work is included. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f27b1905e422 | AC1, AC2, AC3, AC4, SC1, SC2 |  | C1, C2, C3, DONT1, DONT2 | Command Markdown contract cleanup is proven by deterministic source/anchor checks and targeted asset tests, not runtime logic TDD. |
| tk-fac7da2a307d |  | AC1, AC2, AC3, AC4, AC5, SC1, SC2 | C1, C2, C3, DONT1, DONT2 |  |
