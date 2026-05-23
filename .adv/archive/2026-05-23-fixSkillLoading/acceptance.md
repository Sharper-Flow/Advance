# Acceptance

Reviewed at: 2026-05-23T04:07:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Define a command/skill loading taxonomy that distinguishes orchestrator-only, worker-only, split, and inlined-agent-methodology patterns. | pass | ADV_INSTRUCTIONS.md documents load-site taxonomy; skill-loading asset test asserts taxonomy values. |
| SC2 | success_criterion | Inventory and classify every command `skill(...)` reference, including dynamic skill discovery and missing/external skill references. | pass | plugin/src/skill-loading-policy-assets.test.ts inventories literal .opencode/command/*.md skill(...) refs and compares scanned refs to SKILL_REF_INVENTORY. |
| SC3 | success_criterion | Preserve orchestrator-owned authority for ADV state, gates, user checkpoints, adoption/routing, and mutation. | pass | adv-discover.md/adv-design.md split-load wording keeps schema, routing, fallback/degradation, adoption, and ADV mutations with orchestrator. |
| SC4 | success_criterion | Move or route worker-only methodology to worker context only when skill-tool availability and fallback behavior are machine-checkable. | pass | skill-loading-policy-assets.test.ts checks worker targets have no explicit skill:false and commands include fallback/degradation; scout commands define worker skill-load unavailable as inconclusive. |
| SC5 | success_criterion | Add asset/spec tests for taxonomy compliance, phantom skill references, fallback/degradation requirements, and worker skill-availability assumptions. | pass | pnpm exec vitest run src/skill-loading-policy-assets.test.ts src/adv-autonomy-quality-assets.test.ts src/adv-skill-backed-commands-assets.test.ts passed (89 tests). |
| SC6 | success_criterion | Preserve existing opportunity-scout semantics while reducing main-context load for worker-only prompt content. | pass | adv-opportunity-scout skill and scout command/spec wording preserve ≤5 candidates, evidence, strict schema, narrow auto-adopt, and INCONCLUSIVE degradation. |
| AC1 | acceptance_criterion | `ADV_INSTRUCTIONS.md` documents taxonomy: main-only, worker-only, split, and `inlined-agent-methodology` when optimal. | pass | skill-loading-policy-assets.test.ts asserts ADV_INSTRUCTIONS contains Load site plus all four taxonomy values. |
| AC2 | acceptance_criterion | All `.opencode/command/*.md` `skill(...)` references are inventoried and classified. | pass | skill-loading-policy-assets.test.ts scans command files and requires scanned literal refs equal SKILL_REF_INVENTORY. |
| AC3 | acceptance_criterion | Stale or missing skill refs are removed if unused; otherwise they are fixed or explicitly allowlisted with rationale. | pass | skill-loading-policy-assets.test.ts verifies literal command skill refs resolve to shipped repo skills; grep found no command refs to skill("prioritizer") or skill("global-verify"). |
| AC4 | acceptance_criterion | Worker self-load is allowed only when tests verify no explicit deny and fallback behavior exists. | pass | worker load-site asset test rejects explicit skill:false for worker agents and fallback/degradation tests pass; scout commands include worker skill-load unavailable degradation. |
| AC5 | acceptance_criterion | Orchestrator retains state, gate, user-checkpoint, adoption/routing, and mutation authority. | pass | Review confirmed no skill/worker wording owns ADV gates, state mutation, user checkpoints, or adoption routing. |
| AC6 | acceptance_criterion | Existing scout semantics remain: ≤5 candidates, evidence required, strict schema, narrow auto-adopt only, and INCONCLUSIVE degradation. | pass | adv-autonomy-quality-assets.test.ts and skill-loading tests pass; skill docs retain ≤5, evidence, ScoutCandidate schema, narrow auto-adopt, INCONCLUSIVE. |
| AC7 | acceptance_criterion | Asset/spec tests fail on taxonomy violations, phantom skill refs, missing fallback, or unsafe worker-load assumptions. | pass | New asset tests fail on missing taxonomy values, inventory drift, phantom shipped-skill mismatch, missing nearby fallback, explicit worker skill denial, and missing scout split-load wording. |
| C1 | constraint | Do not change the seven-gate lifecycle. | respected | No gate lifecycle code or command sequence changed; only docs/spec/test/skill command wording changed. |
| C2 | constraint | Do not replace or rename existing ADV sub-agents. | respected | No sub-agent files renamed/replaced; scout continues to use adv-researcher and adv-tron remains existing agent. |
| C3 | constraint | Do not weaken structured output or report requirements. | respected | ScoutCandidate 8-field schema and REVIEWER_REPORT expectations preserved; tests assert schema wording remains. |
| C4 | constraint | Do not remove fallback or degradation paths for skill-backed commands. | respected | Fallback/degradation tests pass; reviewer strengthened fallback checks to be near each skill ref. |
| C5 | constraint | Do not allow nested sub-agent delegation. | respected | No command or skill adds nested sub-agent delegation; scout remains one adv-researcher spawn under orchestrator. |
| C6 | constraint | Keep skills read-only guidance; skills do not own ADV mutations. | respected | Skills remain read-only guidance; adv-opportunity-scout explicitly says commands own mutations. |
| DONT1 | avoidance | Do not let sub-agents own ADV gate completion, state mutation, or user checkpoint routing. | respected | Split-load wording explicitly keeps gates/state/checkpoints/adoption/mutations with orchestrator. |
| DONT2 | avoidance | Do not auto-adopt sub-agent recommendations without orchestrator-owned routing rules. | respected | Scout routing still auto-adopts only narrow low-risk contract-tied candidates; all other candidates surface to user. |
| DONT3 | avoidance | Do not rely on prose-only policy without asset/spec tests where machine checks are possible. | respected | Structural asset tests enforce taxonomy, phantom refs, fallback/degradation, worker-deny, and scout split-load. |
| DONT4 | avoidance | Do not leave stale or missing skill references unclassified. | respected | Inventory plus shipped-skill test fails stale/missing literal command skill refs; prioritizer/global-verify command refs removed. |
| DONT5 | avoidance | Do not preserve duplicate skill-vs-agent-prompt methodology without a classification or drift-control decision. | respected | adv-tron classified as inlined-agent-methodology; scout classified split; embedded methodology rows documented. |
| OOS1 | out_of_scope | Replacing or renaming existing ADV sub-agents. | not_applicable | Not in scope; no sub-agent replacement/rename performed. |
| OOS2 | out_of_scope | Changing the seven-gate lifecycle. | not_applicable | Not in scope; seven-gate lifecycle unchanged. |
| OOS3 | out_of_scope | Global prompt optimization unrelated to command/skill loading boundaries. | not_applicable | Not in scope; changes limited to command/skill boundaries and tests. |
| OOS4 | out_of_scope | Runtime token accounting or context-window measurement. | not_applicable | Not in scope; no runtime token accounting added. |

