# Contract Traceability

**Change ID:** fixSkillLoading
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-23T04:07:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | ADV_INSTRUCTIONS.md documents load-site taxonomy; skill-loading asset test asserts taxonomy values. |
| SC2 | success_criterion | pass | review | plugin/src/skill-loading-policy-assets.test.ts inventories literal .opencode/command/*.md skill(...) refs and compares scanned refs to SKILL_REF_INVENTORY. |
| SC3 | success_criterion | pass | review | adv-discover.md/adv-design.md split-load wording keeps schema, routing, fallback/degradation, adoption, and ADV mutations with orchestrator. |
| SC4 | success_criterion | pass | review | skill-loading-policy-assets.test.ts checks worker targets have no explicit skill:false and commands include fallback/degradation; scout commands define worker skill-load unavailable as inconclusive. |
| SC5 | success_criterion | pass | review | pnpm exec vitest run src/skill-loading-policy-assets.test.ts src/adv-autonomy-quality-assets.test.ts src/adv-skill-backed-commands-assets.test.ts passed (89 tests). |
| SC6 | success_criterion | pass | review | adv-opportunity-scout skill and scout command/spec wording preserve ≤5 candidates, evidence, strict schema, narrow auto-adopt, and INCONCLUSIVE degradation. |
| AC1 | acceptance_criterion | pass | test | skill-loading-policy-assets.test.ts asserts ADV_INSTRUCTIONS contains Load site plus all four taxonomy values. |
| AC2 | acceptance_criterion | pass | test | skill-loading-policy-assets.test.ts scans command files and requires scanned literal refs equal SKILL_REF_INVENTORY. |
| AC3 | acceptance_criterion | pass | test | skill-loading-policy-assets.test.ts verifies literal command skill refs resolve to shipped repo skills; grep found no command refs to skill("prioritizer") or skill("global-verify"). |
| AC4 | acceptance_criterion | pass | test | worker load-site asset test rejects explicit skill:false for worker agents and fallback/degradation tests pass; scout commands include worker skill-load unavailable degradation. |
| AC5 | acceptance_criterion | pass | test | Review confirmed no skill/worker wording owns ADV gates, state mutation, user checkpoints, or adoption routing. |
| AC6 | acceptance_criterion | pass | test | adv-autonomy-quality-assets.test.ts and skill-loading tests pass; skill docs retain ≤5, evidence, ScoutCandidate schema, narrow auto-adopt, INCONCLUSIVE. |
| AC7 | acceptance_criterion | pass | test | New asset tests fail on missing taxonomy values, inventory drift, phantom shipped-skill mismatch, missing nearby fallback, explicit worker skill denial, and missing scout split-load wording. |
| C1 | constraint | respected | static_check | No gate lifecycle code or command sequence changed; only docs/spec/test/skill command wording changed. |
| C2 | constraint | respected | static_check | No sub-agent files renamed/replaced; scout continues to use adv-researcher and adv-tron remains existing agent. |
| C3 | constraint | respected | static_check | ScoutCandidate 8-field schema and REVIEWER_REPORT expectations preserved; tests assert schema wording remains. |
| C4 | constraint | respected | static_check | Fallback/degradation tests pass; reviewer strengthened fallback checks to be near each skill ref. |
| C5 | constraint | respected | static_check | No command or skill adds nested sub-agent delegation; scout remains one adv-researcher spawn under orchestrator. |
| C6 | constraint | respected | static_check | Skills remain read-only guidance; adv-opportunity-scout explicitly says commands own mutations. |
| DONT1 | avoidance | respected | review | Split-load wording explicitly keeps gates/state/checkpoints/adoption/mutations with orchestrator. |
| DONT2 | avoidance | respected | review | Scout routing still auto-adopts only narrow low-risk contract-tied candidates; all other candidates surface to user. |
| DONT3 | avoidance | respected | review | Structural asset tests enforce taxonomy, phantom refs, fallback/degradation, worker-deny, and scout split-load. |
| DONT4 | avoidance | respected | review | Inventory plus shipped-skill test fails stale/missing literal command skill refs; prioritizer/global-verify command refs removed. |
| DONT5 | avoidance | respected | review | adv-tron classified as inlined-agent-methodology; scout classified split; embedded methodology rows documented. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Not in scope; no sub-agent replacement/rename performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Not in scope; seven-gate lifecycle unchanged. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Not in scope; changes limited to command/skill boundaries and tests. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Not in scope; no runtime token accounting added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-0117cd2a5afa | SC1, SC2, SC5 | AC1, AC2, AC7 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4 |  |
| tk-cf07ca437bfe | SC1, SC2, SC3 | AC1, AC2, AC5 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-5e61989b1d6c | SC2, SC5 | AC2, AC3, AC7 | C1, C2, C3, C4, C5, C6, DONT3, DONT4 |  |
| tk-2868e6aee43f | SC3, SC4, SC6 | AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3 |  |
| tk-e4576c8aaf77 | SC3, SC4, SC5 | AC4, AC5, AC7 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3 |  |
| tk-867de654b848 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
