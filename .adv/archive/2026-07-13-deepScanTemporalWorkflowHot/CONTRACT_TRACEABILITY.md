# Contract Traceability

**Change ID:** deepScanTemporalWorkflowHot
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T01:05:47.287Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Executive summary classifies every assessed hot path with file/symbol evidence; independent reviewer confirmed all seven categories. |
| AC2 | acceptance_criterion | pass | test | Assessment explicitly covers signal fan-out, snapshots, search attributes, ready tasks, gate readiness, CAN seed growth, and replay coverage. |
| AC3 | acceptance_criterion | pass | test | Executive summary cites official Temporal TypeScript workflow, standard API usage, handler-drain, and replay-history sources; reviewer validated all four citations. |
| AC4 | acceptance_criterion | pass | test | Every follow-up now names precise files/symbols or line-bounded regions, verification method, and explicit measurement-required Yes/No. Release hardening evidence-gap remediation. |
| AC5 | acceptance_criterion | pass | test | Boundary statement and clean worktree review prove no workflow/product optimization or invariant weakening was implemented. |
| C1 | constraint | respected | static_check | Replay-safe recommendations; no patch removal or workflow behavior change. |
| C2 | constraint | respected | static_check | Assessment requires benchmark and workflow-isolate verification before clone replacement. |
| C3 | constraint | respected | static_check | Assessment preserves continue-as-new threshold/drain and payload-size caps; no code changes. |
| C4 | constraint | respected | static_check | Worktree clean; no telemetry, global configuration, or workflow code changed. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No direct workflow/state/readiness/search-attribute refactor performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No cap, threshold, signal/query, or patch-marker behavior changed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No platform redesign or status/dashboard work performed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8a0ac638ed20 | AC1, AC2, AC3, AC4 |  | C1, C2, C3, C4 |  |
| tk-371516b7f50c |  | AC5 | C1, C2, C3, C4 |  |
