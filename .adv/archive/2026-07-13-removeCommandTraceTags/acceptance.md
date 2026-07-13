# Acceptance

Reviewed at: 2026-07-13T12:53:13.188Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1 — Comment removal:** A search of `.opencode/command/adv-*.md` returns zero matches for `<!-- rq-` and `<!-- manifest:`. | pass | Acceptance reviewer: deterministic scan found zero `<!-- rq-` and `<!-- manifest:` matches across `.opencode/command/adv-*.md`. |
| AC2 | acceptance_criterion | **AC2 — Behavioral anchors:** The directly affected slop-scan and architecture-scan asset tests assert substantive headings or rules rather than `<!-- rq-… -->` literals and pass. | pass | Acceptance reviewer: targeted citation and six command-asset suites passed; substantive anchors replaced command tag assertions. |
| AC3 | acceptance_criterion | **AC3 — In-command consolidation:** Confirmed repeated operational guidance in affected commands is represented once per command or replaced by a precise local reference; gate ownership, tool calls, retry budgets, and task semantics remain unchanged. | pass | Acceptance reviewer inspected adv-apply consolidation: five categories retain one canonical detailed block with local pointers. |
| AC4 | acceptance_criterion | **AC4 — Verification:** Targeted affected tests and `pnpm run check` exit 0. | pass | Acceptance reviewer ran `pnpm run check` successfully after the user-approved whitespace-only Prettier fix. |
| SC1 | success_criterion | **SC1:** ADV command prompts expose no internal requirement-trace or manifest HTML comments. | pass | Reviewer confirmed command trace and manifest HTML comments are absent from all target ADV commands. |
| SC2 | success_criterion | **SC2:** Command-asset regression tests fail when substantive protected behavior is removed. | pass | Reviewer confirmed asset tests now assert substantive command behavior; skill-file citation assertions remain intact. |
| SC3 | success_criterion | **SC3:** `adv-apply.md` no longer has separate duplicate blocks for retry policy, cross-repo execution, TDD lifecycle, incremental verification, or trivial-task handling. | pass | Reviewer confirmed retry, cross-repo, TDD lifecycle, incremental verification, and trivial-task guidance each have a canonical location in adv-apply. |
| C1 | constraint | Retain spec laws, tool schemas, runtime behavior, and gate ownership unchanged. | respected | Diff review and passing checks show no spec, schema, runtime, tool, or gate changes. |
| C2 | constraint | Do not introduce cross-command template abstraction. | respected | Diff review confirms no cross-command abstraction was introduced. |
| C3 | constraint | Limit edits to ADV command files and directly affected tests. | respected | Changes are command contracts, directly affected test/citation coverage, plus explicitly user-approved whitespace-only formatter remediation. |
| DONT1 | avoidance | Do not replace trace labels with different internal bookkeeping prose. | respected | Removed command bookkeeping comments rather than substituting new prompt labels. |
| DONT2 | avoidance | Do not weaken test coverage by merely deleting tag assertions. | respected | Tag-literal assertions were replaced with substantive behavior anchors; coverage was retained. |
| DONT3 | avoidance | Do not remove standalone command guidance solely because a similar rule exists in another command. | respected | Only intra-command repetition was consolidated; each command remains self-contained. |
| OOS1 | out_of_scope | Changes to `.adv/specs/`, Temporal workflows, tool schemas, or gate contracts. | not_applicable | No spec, Temporal workflow, schema, tool, or gate-contract changes. |
| OOS2 | out_of_scope | Non-command instruction surfaces, agents, skills, and deployment behavior. | not_applicable | No agent, skill, deployment, or other non-command instruction-surface changes. |

