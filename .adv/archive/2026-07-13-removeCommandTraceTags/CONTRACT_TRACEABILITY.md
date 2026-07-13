# Contract Traceability

**Change ID:** removeCommandTraceTags
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T12:53:13.188Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Acceptance reviewer: deterministic scan found zero `<!-- rq-` and `<!-- manifest:` matches across `.opencode/command/adv-*.md`. |
| AC2 | acceptance_criterion | pass | test | Acceptance reviewer: targeted citation and six command-asset suites passed; substantive anchors replaced command tag assertions. |
| AC3 | acceptance_criterion | pass | test | Acceptance reviewer inspected adv-apply consolidation: five categories retain one canonical detailed block with local pointers. |
| AC4 | acceptance_criterion | pass | test | Acceptance reviewer ran `pnpm run check` successfully after the user-approved whitespace-only Prettier fix. |
| SC1 | success_criterion | pass | review | Reviewer confirmed command trace and manifest HTML comments are absent from all target ADV commands. |
| SC2 | success_criterion | pass | review | Reviewer confirmed asset tests now assert substantive command behavior; skill-file citation assertions remain intact. |
| SC3 | success_criterion | pass | review | Reviewer confirmed retry, cross-repo, TDD lifecycle, incremental verification, and trivial-task guidance each have a canonical location in adv-apply. |
| C1 | constraint | respected | static_check | Diff review and passing checks show no spec, schema, runtime, tool, or gate changes. |
| C2 | constraint | respected | static_check | Diff review confirms no cross-command abstraction was introduced. |
| C3 | constraint | respected | static_check | Changes are command contracts, directly affected test/citation coverage, plus explicitly user-approved whitespace-only formatter remediation. |
| DONT1 | avoidance | respected | review | Removed command bookkeeping comments rather than substituting new prompt labels. |
| DONT2 | avoidance | respected | review | Tag-literal assertions were replaced with substantive behavior anchors; coverage was retained. |
| DONT3 | avoidance | respected | review | Only intra-command repetition was consolidated; each command remains self-contained. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No spec, Temporal workflow, schema, tool, or gate-contract changes. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No agent, skill, deployment, or other non-command instruction-surface changes. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-3e6ea446b6fa | AC1 |  | C1, C3 | Adds or relocates deterministic requirement-citation comments; no runtime logic changes require Red/Green. |
| tk-efd4b1712e3a | AC2 | SC2 | C1, C3 |  |
| tk-8d329e96a86a | AC1, AC3, SC1, SC3 |  | C1, C2, C3, DONT1, DONT3 | Edits command Markdown contracts only; correctness is proven by deterministic absence checks and asset tests. |
| tk-8952d6e7ce72 |  | AC1, AC2, AC3, AC4, SC1, SC2, SC3 | C1, C2, C3, DONT1, DONT2, DONT3 |  |
