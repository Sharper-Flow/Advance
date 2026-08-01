# Contract Traceability

**Change ID:** addOptimizationDetection
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-08-01T20:57:23.244Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | 67 opt-scan tests and 76 Tron/plugin tests verify deterministic typed candidates with cited evidence and verification requirements. |
| AC2 | acceptance_criterion | pass | test | Four detector families are present with paired positive/rejection coverage in the 67-test opt-scan suite. |
| AC3 | acceptance_criterion | pass | test | Static/measured guards reject unmeasured runtime claims in scanner and Tron schemas. |
| AC4 | acceptance_criterion | pass | test | Intake tests preserve evidence and reject cache candidates lacking explicit invalidation proof. |
| AC5 | acceptance_criterion | pass | test | Scanner, optimizer intake, and Tron integration remain read-only; no mutation path is present. |
| AC6 | acceptance_criterion | pass | test | All detector classes have positive and rejection fixtures; final 67-test suite passes. |
| AC7 | acceptance_criterion | pass | test | Tron tests and assets retain the explicit slop-scan PERF non-conversion boundary. |
| C1 | constraint | respected | static_check | Eligibility is bounded deterministic scanner logic; final reviewer found no LLM-owned correctness decision. |
| C2 | constraint | respected | static_check | Zero-dependency scanner and Zod schema boundary verified by smoke and review. |
| C3 | constraint | respected | static_check | Candidate consumers are advisory/read-only; no source or ADV-state mutation. |
| C4 | constraint | respected | static_check | Static candidate impact remains unmeasured and requires verification. |
| DONT1 | avoidance | respected | review | Static performance-claim guards prohibit unsupported measured-impact prose. |
| DONT2 | avoidance | respected | review | Detector uses bounded structural evidence; cache requires direct invalidation operation. |
| DONT3 | avoidance | respected | review | Bounded scan and read-only paths verified; no automatic optimization. |
| DONT4 | avoidance | respected | review | Slop PERF remains separated from optimization candidates. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-aaa7058b1384 | AC1, AC3 |  | C1, C2, C4, DONT1, DONT2, DONT3 |  |
| tk-9471f6c95ea7 | AC2, AC6 |  | C1, C2, DONT2, DONT3 |  |
| tk-af83ade8e8a2 | AC4, AC5 | AC4 | C3, DONT1, DONT3 |  |
| tk-f878f8ddb51c | AC1, AC3, AC5 | AC1, AC3 | C3, DONT1 |  |
| tk-f70b8841a8af |  | AC5, AC6, AC7 | C3, DONT1, DONT4 |  |
| tk-9ce2829cd521 |  |  | C1, C2, C3, DONT3 |  |
| tk-3a27ddb19332 |  |  | C2, C3, DONT3 |  |
| tk-9288e2ba9085 |  |  | C2, C3, DONT3 |  |
