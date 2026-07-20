# Contract Traceability

**Change ID:** addCapabilityConsistency
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-20T19:23:13.976Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| C1 | constraint | pass | static_check | schema.ts CapabilityEvidence type requires file path + line; evaluator.ts populates evidence.matchedSignal with file:line per trigger hit |
| C2 | constraint | pass | static_check | Phase 1 deterministic; Phase 3 intent gate structural; confidence levels labeled |
| C3 | constraint | pass | static_check | Additive only; existing arch-detection untouched; 95/95 tests pass |
| C4 | constraint | respected | static_check | No spec drift detection — capability consistency is config↔code↔deps |
| C5 | constraint | respected | static_check | No AI-quality smell detection |
| C6 | constraint | respected | static_check | No current-state/LBP analysis |
| C7 | constraint | respected | static_check | bin/arch-scan.ts CLI under existing bin/; extends adv-arch-detection |
| C8 | constraint | pass | static_check | f0f6d7bb: 4-surface rq-archcap01 sync structurally enforced |
| C9 | constraint | pass | static_check | Entire bin/lib/arch-scan/ typed tree implemented |
| C10 | constraint | pass | static_check | Design artifact records Option B (typed), user-approved |
| DONT1 | avoidance | respected | review | Specific rules, not generic checklists |
| DONT2 | avoidance | respected | review | No spec drift; see C4 |
| DONT3 | avoidance | respected | review | No AI smell detection; see C5 |
| DONT4 | avoidance | respected | review | Manifest rule requires intent per Lighthouse 12; scaffold requires declared capability |
| DONT5 | avoidance | respected | review | Schema enforces file:line; see C1 |
| DONT6 | avoidance | respected | review | Confidence levels labeled honestly; deferred Tier 2 documented |
| DONT7 | avoidance | respected | review | Vendor rules sourced from discovery evidence |
| DONT8 | avoidance | respected | review | Asset test enforces 4-of-4 surfaces |
| DONT9 | avoidance | respected | review | Registry entry 4 has intent_required; evaluator Phase 3 gate enforces |
| DONT10 | avoidance | respected | review | Registry entry 5 has intent_required; evaluator Phase 3 gate enforces |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4d116d975b24 |  |  | C1, C2, DONT5 | Helper module; no direct AC/SC items in contract (contract is constraints + avoidances only). Respects C1 (P34 evidence via scanDebtMarkers output shape), C2 (P33 deterministic regex), DONT5 (no findings without file:line). |
| tk-5d489ac19151 |  |  | C1, C2, C8, C9, DONT6, DONT9, DONT10 | Foundation types; no direct AC/SC items in contract. Respects C1 (CapabilityEvidence type requires file:line), C2 (deterministic typed schema), C8 (4-file sync targets), C9 (all-or-nothing typed tree), DONT6 (honest confidence labels), DONT9/DONT10 (intent_required field on manifest+scaffold entries). |
| tk-cf5ea29d29ad |  |  | C1, C2, C9, DONT5, DONT6 | Engine module; no direct AC/SC items in contract. Respects C1 (evidence.matchedSignal carries file:line), C2 (Phase 1 deterministic + Phase 3 structural intent gate), C9 (typed engine in bin/lib/arch-scan/), DONT5 (no finding without evidence), DONT6 (deferred Tier 2 labeled honestly). |
| tk-970cacb8a8e7 |  |  | C1, C3, C7, C9 | Bridge + CLI; no direct AC/SC items in contract. Respects C1 (CLI emits file:line evidence), C3 (additive — new entrypoint, no modification of existing arch-scan), C7 (extends adv-arch-detection, no new top-level command/skill), C9 (typed bridge in bin/lib/arch-scan/). |
| tk-d63b9b87d0c5 |  |  | C1, C2, DONT5 | Rule 2 implementation; contract has no AC items (only constraints/avoidances). Respects C1 (file:line trigger evidence), C2 (Phase 1 deterministic regex), DONT5 (every finding cites file:line). Implements AC2 conceptually but AC items are agreement-level, not contract items. |
| tk-17879dc0ad5c |  |  | C1, C2, DONT5 | Rule 1 implementation; contract has no AC items. Respects C1 (file:line trigger evidence), C2 (Phase 1 deterministic), DONT5 (evidence required). Implements AC1 conceptually. |
| tk-30ccf9e038d4 |  |  | C1, C2, DONT4, DONT6, DONT10 | Rule 5 implementation; contract has no AC items. Respects C1/C2 (file:line + deterministic), DONT4 (requires declared capability not directory presence — platform semantics), DONT6 (honest confidence labeling), DONT10 (intent_required gate). |
| tk-bf8d780ca812 |  |  | C1, C2, DONT6 | Rule 3 implementation; contract has no AC items. Respects C1/C2 (file:line + deterministic regex), DONT6 (medium-confidence explicitly labeled per Rev 9). Implements AC3 conceptually. |
| tk-d60170bae253 |  |  | C1, C2, DONT4, DONT6, DONT9 | Rule 4 implementation; contract has no AC items. Respects C1/C2 (file:line + deterministic), DONT4 (requires intent per Lighthouse 12 — not universal SW), DONT6 (advisory labeled honestly), DONT9 (intent_required gate: workbox/service-worker/pwa). |
| tk-f7bd0b05be75 |  |  | C8, DONT8 | Asset test extension; contract has no AC items. Respects C8 (4-file sync spec.json + command.md + SKILL.md + docs/specs/arch-scan.md enforced structurally), DONT8 (test enforces 4-of-4 not 3-of-4). |
| tk-c57c6d8fe098 |  |  | C3, C8 | Integration tests; contract has no AC items. Respects C3 (verifies no regression on existing arch-scan — additive), C8 (4-file sync covered end-to-end). Implements AC5 conceptually (no regression). |
