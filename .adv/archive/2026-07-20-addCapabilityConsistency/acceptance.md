# Acceptance

Reviewed at: 2026-07-20T19:23:13.976Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| C1 | constraint | **P34**: every finding must be evidence-backed (file:line cross-reference). No generic checklist items. | pass | schema.ts CapabilityEvidence type requires file path + line; evaluator.ts populates evidence.matchedSignal with file:line per trigger hit |
| C2 | constraint | **P33**: prefer structural/deterministic detection over heuristic inference. Heuristic may assist discovery/ranking but never own correctness. | pass | Phase 1 deterministic; Phase 3 intent gate structural; confidence levels labeled |
| C3 | constraint | **Don't break existing arch-detection**: new rules additive; existing stack packs and finding taxonomy continue to work. | pass | Additive only; existing arch-detection untouched; 95/95 tests pass |
| C4 | constraint | **Don't compete with `adv-audit`**: spec-anchored drift stays in audit. | respected | No spec drift detection — capability consistency is config↔code↔deps |
| C5 | constraint | **Don't compete with `adv-slop-scan`**: AI-quality smells stay in slop-scan. | respected | No AI-quality smell detection |
| C6 | constraint | **Don't compete with `adv-improve`**: current-state/LBP stays in improve. | respected | No current-state/LBP analysis |
| C7 | constraint | **No new top-level command or skill**: extends existing `adv-arch-detection`. | respected | bin/arch-scan.ts CLI under existing bin/; extends adv-arch-detection |
| C8 | constraint | **4-file sync**: any new requirement IDs must update spec.json + command.md + SKILL.md + docs/specs/arch-scan.md (enforced by asset test). | pass | f0f6d7bb: 4-surface rq-archcap01 sync structurally enforced |
| C9 | constraint | **All-or-nothing per command** (discovery finding): typed implementation requires new `bin/lib/arch-scan/` tree; partial-typing has no precedent. | pass | Entire bin/lib/arch-scan/ typed tree implemented |
| C10 | constraint | **Architecture decision deferred to design**: markdown-only (Option A) vs typed (Option B) vs hybrid (Option C) — design phase resolves with user input. | pass | Design artifact records Option B (typed), user-approved |
| DONT1 | avoidance | Generic "best practices" checklists (auth/SEO/a11y presence) — `adv-improve` territory. | respected | Specific rules, not generic checklists |
| DONT2 | avoidance | Spec-vs-implementation drift — `adv-audit` territory. | respected | No spec drift; see C4 |
| DONT3 | avoidance | AI code quality smells — `adv-slop-scan` territory. | respected | No AI smell detection; see C5 |
| DONT4 | avoidance | Universal invariants unsupported by platform semantics (e.g., "manifest requires service worker" is no longer universal per Lighthouse 12 / Chrome installability changes). | respected | Manifest rule requires intent per Lighthouse 12; scaffold requires declared capability |
| DONT5 | avoidance | Findings without specific file:line evidence (P34 violation). | respected | Schema enforces file:line; see C1 |
| DONT6 | avoidance | Heuristic-only rules dressed as deterministic (must label `detectionMethod` and `confidence` honestly per existing arch-scan convention). | respected | Confidence levels labeled honestly; deferred Tier 2 documented |
| DONT7 | avoidance | Hardcoding vendor-specific rules without verification of platform conventions. | respected | Vendor rules sourced from discovery evidence |
| DONT8 | avoidance | Breaking existing asset test by updating only 3 of 4 required files. | respected | Asset test enforces 4-of-4 surfaces |
| DONT9 | avoidance | PWA-manifest rule firing without intent evidence (Workbox dep, offline claim, declared PWA policy). | respected | Registry entry 4 has intent_required; evaluator Phase 3 gate enforces |
| DONT10 | avoidance | Scaffold-vs-test rule firing on directory presence alone (must require declared capability: script entry, CI job, or package.json field). | respected | Registry entry 5 has intent_required; evaluator Phase 3 gate enforces |
| OOS1 | out_of_scope | Remediation of identified gaps in pokeedge-web (tracked separately as Epic `capabilityConsistencyGaps` in pokeedge-web project). | missing |  |
| OOS2 | out_of_scope | New top-level command or skill. | missing |  |
| OOS3 | out_of_scope | Heuristic-only rules without deterministic backing. | missing |  |
| OOS4 | out_of_scope | Generic web-app capability checklists. | missing |  |

