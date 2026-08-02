# Acceptance

Reviewed at: 2026-08-01T20:57:23.244Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Tron emits an `optimization_candidate` only when a named deterministic detector fires, and every emitted candidate includes a detector ID, source file and line evidence, signal class, expected cost shape, confidence, false-positive caveat, and verification-needed field. | pass | 67 opt-scan tests and 76 Tron/plugin tests verify deterministic typed candidates with cited evidence and verification requirements. |
| AC2 | acceptance_criterion | The supported version-1 catalog includes all four agreed classes: repeated boundary work, avoidable collection work, worker/startup pressure, and cache opportunities with explicit invalidation ownership. | pass | Four detector families are present with paired positive/rejection coverage in the 67-test opt-scan suite. |
| AC3 | acceptance_criterion | A `static` candidate is explicitly advisory and cannot claim a speedup, latency reduction, or runtime impact without attached measurement evidence; tests cover this boundary. | pass | Static/measured guards reject unmeasured runtime claims in scanner and Tron schemas. |
| AC4 | acceptance_criterion | Optimizer accepts the typed candidate contract, preserves its evidence, and produces a minimal recommendation plus a verification route; it rejects candidates whose correctness ownership or cache invalidation is unclear. | pass | Intake tests preserve evidence and reject cache candidates lacking explicit invalidation proof. |
| AC5 | acceptance_criterion | Candidate detection remains read-only: neither Tron nor optimizer automatically edits source, adds caching, or creates ADV state. | pass | Scanner, optimizer intake, and Tron integration remain read-only; no mutation path is present. |
| AC6 | acceptance_criterion | Tests cover at least one positive and one rejection/false-positive case for each supported candidate class. | pass | All detector classes have positive and rejection fixtures; final 67-test suite passes. |
| AC7 | acceptance_criterion | The implementation documents and tests the boundary with existing `slop-scan` PERF findings: smell reporting remains separate from verification-bound optimization candidates. | pass | Tron tests and assets retain the explicit slop-scan PERF non-conversion boundary. |
| C1 | constraint | Use deterministic parsing/rules/structured analysis for candidate eligibility; LLM reasoning may rank or explain only. | respected | Eligibility is bounded deterministic scanner logic; final reviewer found no LLM-owned correctness decision. |
| C2 | constraint | Follow the established zero-dependency typed scanner pattern in `bin/lib/`; reserve Zod for plugin public schemas. | respected | Zero-dependency scanner and Zod schema boundary verified by smoke and review. |
| C3 | constraint | Retain Tron's and optimizer's existing read-only/advisory boundaries. | respected | Candidate consumers are advisory/read-only; no source or ADV-state mutation. |
| C4 | constraint | Treat runtime profiling as required verification for performance claims, not as a prerequisite for reporting static candidates. | respected | Static candidate impact remains unmeasured and requires verification. |
| DONT1 | avoidance | No prompt-only performance claims. | respected | Static performance-claim guards prohibit unsupported measured-impact prose. |
| DONT2 | avoidance | No generic regex heuristics as the sole correctness authority. | respected | Detector uses bounded structural evidence; cache requires direct invalidation operation. |
| DONT3 | avoidance | No unbounded repository scans or automatic optimizations. | respected | Bounded scan and read-only paths verified; no automatic optimization. |
| DONT4 | avoidance | No overlap that lets `slop-scan` PERF smells silently become optimization candidates. | respected | Slop PERF remains separated from optimization candidates. |

