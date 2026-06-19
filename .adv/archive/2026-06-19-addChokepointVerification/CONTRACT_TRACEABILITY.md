# Contract Traceability

**Change ID:** addChokepointVerification
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-19T04:36:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Phase 1.8 problem-completeness check (adv-discover.md) + rq-disc13 require explicit rationale before a symptom is treated as the full problem. |
| SC2 | success_criterion | pass | review | rq-disc14.2 + Phase 1.8 sole-entry blocking (B-CRITICAL via rq-disc-tax2) surfaces unverified chokepoint claims before design/prep. |
| SC3 | success_criterion | pass | review | Phase 1.8 target-operation surface scan evidence shape (searched terms/symbols, found/excluded surfaces, disposition) gives design/review an auditable record. |
| AC1 | acceptance_criterion | pass | test | workflow-noise-reduction-assets.test.ts asserts command contains 'problem-completeness'; Phase 1.8 step in adv-discover.md. 67/67 tests pass. |
| AC2 | acceptance_criterion | pass | test | workflow-noise-reduction-assets.test.ts asserts command contains 'solution-scope'; Phase 1.8 solution-scope check present. |
| AC3 | acceptance_criterion | pass | test | workflow-noise-reduction-assets.test.ts asserts B-CRITICAL/Boundaries CRITICAL; rq-disc14.2 + Phase 1.8 sole-entry blocking reuse rq-disc-tax2 halt. |
| AC4 | acceptance_criterion | pass | test | Phase 1.8 secondary-surface disposition (in/out/unsolved) in command + checklist edge-case rows; discover-checklist.md requires classification before agreement. |
| AC5 | acceptance_criterion | pass | test | rq-disc13/14/15 in spec.json + docs mirror; Phase 1.8 in command + checklist; ADV_INSTRUCTIONS pointer; asset anchors in 2 test files. workflow-noise-reduction-assets.test.ts asserts spec IDs + command + checklist + docs mirror co-presence. |
| AC6 | acceptance_criterion | pass | test | workflow-noise-reduction-assets.test.ts asserts 'scan depth scales'; Phase 1.8 scan-depth-scaling section + rq-disc13.2. |
| C1 | constraint | respected | static_check | Phase 1.8 is always-on (not trigger-gated); scan-depth-scaling section in adv-discover.md + checklist edge row. |
| C2 | constraint | respected | static_check | Spec law (rq-disc13/14/15) + command + checklist + asset-test anchors own the obligation; no heuristic-only prose. |
| C3 | constraint | respected | static_check | Primary home adv-discover; advance-workflow spec untouched (only stale test assertion campsite-fixed 1.17→1.18). |
| C4 | constraint | respected | static_check | ADV_INSTRUCTIONS.md edit is a one-line pointer only (single-source-per-surface); sibling change touches prep/review. |
| C5 | constraint | respected | static_check | Discovery still firms design-independent objectives/AC; completeness check does not move criteria firming out of discovery. |
| C6 | constraint | respected | static_check | No new Temporal signal/query/defineUpdate; enforcement is spec/command/checklist/test only. workflow-bundle-boundary untouched. |
| DONT1 | avoidance | respected | review | Phase 1.8 explicitly requires verifying sole-entry claims; rq-disc14.2 blocks unverified claims. |
| DONT2 | avoidance | respected | review | Obligation owned by spec rq-* + asset tests, not prose alone. |
| DONT3 | avoidance | respected | review | Phase 1.8 runs always-on; only scan depth is conditional. |
| DONT4 | avoidance | respected | review | Phase 1.8 + checklist forbid silently deferring secondary surfaces; require explicit disposition. |
| DONT5 | avoidance | respected | review | Scan-depth-scaling section + rq-disc13.2 record lightweight rationale for narrow changes; no forced broad scan. |
| DONT6 | avoidance | respected | review | Phase 1.8 is separate from P25 (rq-disc08); documented as complementary, not merged. |
| OOS1 | out_of_scope | not_applicable | not_applicable | pokeedge not edited; only ADV repo surfaces touched. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No language-specific static analyzer built. |
| OOS3 | out_of_scope | not_applicable | not_applicable | P25 (rq-disc08) preserved; Phase 1.8 is additive. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Seven-gate lifecycle unchanged; discovery still owns agreement. |
| OOS5 | out_of_scope | not_applicable | not_applicable | No target-codebase-aware validator; enforcement is spec/command/checklist/test anchors only. |
| OOS6 | out_of_scope | not_applicable | not_applicable | No new Temporal surface added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-3effbcb14c80 | AC5, SC3 |  | C3, C6, DONT6 |  |
| tk-930adb28b40a | AC1, AC2, AC3, AC4, AC6, SC1, SC2 |  | C1, C2, DONT1, DONT3, DONT4, DONT5, DONT6 |  |
| tk-3a9481044461 | AC5 |  | C2, C6 | verify-only gate; implements durability (AC5) by confirming the check suite passes. Respects structural-correctness (C2) and no-new-Temporal-surface (C6) — DDC3 derives from C6. No code contract item to verify directly. |
