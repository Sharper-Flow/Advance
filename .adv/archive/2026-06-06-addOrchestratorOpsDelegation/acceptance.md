# Acceptance

Reviewed at: 2026-06-06T18:36:48-04:00

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Primary `adv` guidance preserves orchestration authority while shedding operational work before repeated expensive primary cycles. | pass | adv-reviewer verdict READY; `adv.md` now says primary adv delegates authority-free ops work before noisy/repeated cycles and resumes inline for synthesis/ADV state mutation. |
| SC2 | success_criterion | New spec law distinguishes orchestrator-session operational delegation from task-level Step 4.5 delegation. | pass | `rq-orchestratorOpsDelegation01` added separately from existing `rq-contextShed01`/`rq-contextShed02`; `adv-apply.md` Step 4.5 unchanged by diff/static review. |
| SC3 | success_criterion | Drift tests catch prose/table placement regressions and missing GitHub CI/check-run routing. | pass | `plugin/src/orchestrator-ops-delegation-assets.test.ts` asserts prose/table placement and GitHub CI/check-run/status routing; targeted test passed 5/5. |
| SC4 | success_criterion | `adv-atc` remains out of scope for this change. | pass | Static diff and reviewer report: `.opencode/agents/adv-atc.md` unchanged; test asserts no ops-delegation content in adv-atc. |
| AC1 | acceptance_criterion | `advance-meta` includes `rq-orchestratorOpsDelegation01` with scenarios for authority boundary, shed triggers, no-second-cycle rule, and prose/table placement. | pass | `rq-orchestratorOpsDelegation01` added to `.adv/specs/advance-meta/spec.json` with scenarios .1-.6; targeted asset test passed. |
| AC2 | acceptance_criterion | `.opencode/agents/adv.md` Context-Optimal Execution includes prose-only ops delegation guidance; no table pipes appear in that section. | pass | Targeted asset test extracts `adv.md` Context-Optimal Execution, checks operational tokens, and rejects pipe characters/table rows; test passed. |
| AC3 | acceptance_criterion | `ADV_INSTRUCTIONS.md` includes one clearly labeled orchestrator-session operational routing table with GitHub CI/check-run/status investigation mapped to `general`. | pass | Targeted asset test requires `ADV_INSTRUCTIONS.md` label `Orchestrator-Session Operational Routing` and `GitHub CI / check-run / status investigation | general`; test passed. |
| AC4 | acceptance_criterion | `.opencode/command/adv-apply.md` task-level Step 4.5 semantics remain unchanged and do not duplicate the ops table. | pass | Targeted asset test requires Step 4.5 text in `adv-apply.md` and rejects ops-table label/GitHub row there; reviewer static check says adv-apply unchanged. |
| AC5 | acceptance_criterion | Tests fail if `adv.md` ops guidance becomes table-form, if `ADV_INSTRUCTIONS.md` lacks the ops table/GitHub CI token, or if task-level Step 4.5 wording is weakened. | pass | RED test failed before implementation on missing adv.md ops prose, ADV_INSTRUCTIONS ops table, and spec requirement; GREEN/VERIFY passed after implementation. |
| AC6 | acceptance_criterion | No `adv-atc.md` behavior/prose change ships in this change. | pass | Targeted asset test asserts `adv-atc.md` lacks ops-delegation/table tokens; static diff shows adv-atc unchanged; test passed. |
| AC7 | acceptance_criterion | Verification includes targeted asset/drift tests plus relevant schema/spec checks. | pass | Verification passed: `bin/oc-test targeted -- src/orchestrator-ops-delegation-assets.test.ts` exit 0, `bin/oc-test smoke` exit 0 including schemas:check, typecheck, lint, format:check, and 39 smoke tests. |
| C1 | constraint | `rq-contextShed02` remains intact: `adv.md` Context-Optimal Execution uses prose bullets, not routing tables. | respected | `adv.md` ops guidance is prose bullets; asset test rejects any pipe in Context-Optimal Execution; no ops table pasted into adv.md. |
| C2 | constraint | Operational delegation is instruction/spec/test-level only; no runtime enforcement is in scope. | respected | Only specs/docs/agent instruction/test files changed; no runtime enforcement code changed. |
| C3 | constraint | Worker mapping remains specialist-bounded; `general` is for operational audits, CI/status investigation, and verify bursts, not ADV code-writing. | respected | `ADV_INSTRUCTIONS.md` maps audit/CI/status/verify to `general`; code-edit rows map to `adv-engineer` / `adv-designer`; asset test rejects code rows mapped to general. |
| C4 | constraint | Primary `adv` keeps all ADV state authority and user-facing synthesis. | respected | Spec and adv.md prose state primary adv retains gate/task/checkpoint/archive/signoff/drift/contract/release/user synthesis authority. |
| C5 | constraint | No changes to OMR/model-routing config. | respected | Static diff contains no OMR/model-routing config files; changed files limited to advance-meta spec/docs, adv.md, ADV_INSTRUCTIONS.md, and asset test. |
| C6 | constraint | No changes to `adv-atc.md` in this change. | respected | Static diff and test confirm `.opencode/agents/adv-atc.md` unchanged. |
| DONT1 | avoidance | Do not paste the operational routing table into `.opencode/agents/adv.md`. | respected | `adv.md` Context-Optimal Execution contains no table pipes; operational table exists only in `ADV_INSTRUCTIONS.md`. |
| DONT2 | avoidance | Do not alter task-level Step 4.5 Context-Shed semantics. | respected | `adv-apply.md` not modified in final diff; asset test checks Step 4.5 remains and no ops table duplicate appears. |
| DONT3 | avoidance | Do not make `general` the default code-writing worker. | respected | Asset test requires code edits route to `adv-engineer` and frontend/component edits to `adv-designer`, not `general`. |
| DONT4 | avoidance | Do not add runtime delegation enforcement. | respected | No runtime Temporal/storage/tool code changed; spec states runtime enforcement is not required. |
| DONT5 | avoidance | Do not modify `adv-atc.md`; defer ATC handling to a follow-up if needed. | respected | `.opencode/agents/adv-atc.md` unchanged; asset test asserts no operational delegation tokens there. |

