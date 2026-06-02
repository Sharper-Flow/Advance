# Acceptance

Reviewed at: 2026-06-02T20:35:58.271Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_change_show include.executiveSummary` returns artifact content for archived changes | pass | Archive fallback tests in change.test.ts cover all 5 include flags for archived changes |
| AC2 | acceptance_criterion | Same archive-fallback applies to all 5 include flags (proposal, problemStatement, agreement, design, executiveSummary) | pass | Same archive-fallback helper (findArchiveBundle) used for all 5 flags |
| AC3 | acceptance_criterion | `auto-release.yml` CHANGELOG step injects executive summary highlights from archived changes | pass | auto-release.yml CHANGELOG step updated with executive summary injection; actionlint clean |
| AC4 | acceptance_criterion | Corded reads sibling `executive-summary.md` and uses it as primary narrative in release-notes prompt | pass | Corded tests pass for sibling exec-summary loading and prompt rendering |
| AC5 | acceptance_criterion | ADV test suite passes; Corded compiles and tests pass | pass | Full verification passed: ADV check/test/build, Corded cargo build/test |
| C1 | constraint | Preserve backward compatibility with archive bundles lacking executive-summary.md | respected | Optional String field with fallback for missing files |
| C2 | constraint | No new tools or schemas — extend existing include-flag surface | respected | No new tools or schemas added — extends existing include flags |
| C3 | constraint | Do not duplicate Corded prompt logic | respected | No duplicated Corded prompt logic |
| DONT1 | avoidance | GitHub issue closure comments | respected | No GitHub issue closure comment changes |
| DONT2 | avoidance | Dedicated changelog/release-notes aggregator tool | respected | No dedicated aggregator tool |
| DONT3 | avoidance | Archive compression / bundle restructuring | respected | No archive compression changes |
| OOS1 | out_of_scope | GitHub issue closure comments | not_applicable | GitHub issue closure comments out of scope |
| OOS2 | out_of_scope | Dedicated changelog/release-notes aggregator tool | not_applicable | Aggregator tool out of scope |
| OOS3 | out_of_scope | Corded's stale gate-name set | not_applicable | Corded gate-name set out of scope |
| OOS4 | out_of_scope | Archive compression / bundle restructuring | not_applicable | Archive compression out of scope |

