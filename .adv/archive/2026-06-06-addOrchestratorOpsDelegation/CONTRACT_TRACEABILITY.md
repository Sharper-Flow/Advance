# Contract Traceability

**Change ID:** addOrchestratorOpsDelegation
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-06T18:36:48-04:00

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-reviewer verdict READY; `adv.md` now says primary adv delegates authority-free ops work before noisy/repeated cycles and resumes inline for synthesis/ADV state mutation. |
| SC2 | success_criterion | pass | review | `rq-orchestratorOpsDelegation01` added separately from existing `rq-contextShed01`/`rq-contextShed02`; `adv-apply.md` Step 4.5 unchanged by diff/static review. |
| SC3 | success_criterion | pass | review | `plugin/src/orchestrator-ops-delegation-assets.test.ts` asserts prose/table placement and GitHub CI/check-run/status routing; targeted test passed 5/5. |
| SC4 | success_criterion | pass | review | Static diff and reviewer report: `.opencode/agents/adv-atc.md` unchanged; test asserts no ops-delegation content in adv-atc. |
| AC1 | acceptance_criterion | pass | test | `rq-orchestratorOpsDelegation01` added to `.adv/specs/advance-meta/spec.json` with scenarios .1-.6; targeted asset test passed. |
| AC2 | acceptance_criterion | pass | test | Targeted asset test extracts `adv.md` Context-Optimal Execution, checks operational tokens, and rejects pipe characters/table rows; test passed. |
| AC3 | acceptance_criterion | pass | test | Targeted asset test requires `ADV_INSTRUCTIONS.md` label `Orchestrator-Session Operational Routing` and `GitHub CI / check-run / status investigation | general`; test passed. |
| AC4 | acceptance_criterion | pass | test | Targeted asset test requires Step 4.5 text in `adv-apply.md` and rejects ops-table label/GitHub row there; reviewer static check says adv-apply unchanged. |
| AC5 | acceptance_criterion | pass | test | RED test failed before implementation on missing adv.md ops prose, ADV_INSTRUCTIONS ops table, and spec requirement; GREEN/VERIFY passed after implementation. |
| AC6 | acceptance_criterion | pass | test | Targeted asset test asserts `adv-atc.md` lacks ops-delegation/table tokens; static diff shows adv-atc unchanged; test passed. |
| AC7 | acceptance_criterion | pass | test | Verification passed: `bin/oc-test targeted -- src/orchestrator-ops-delegation-assets.test.ts` exit 0, `bin/oc-test smoke` exit 0 including schemas:check, typecheck, lint, format:check, and 39 smoke tests. |
| C1 | constraint | respected | static_check | `adv.md` ops guidance is prose bullets; asset test rejects any pipe in Context-Optimal Execution; no ops table pasted into adv.md. |
| C2 | constraint | respected | static_check | Only specs/docs/agent instruction/test files changed; no runtime enforcement code changed. |
| C3 | constraint | respected | static_check | `ADV_INSTRUCTIONS.md` maps audit/CI/status/verify to `general`; code-edit rows map to `adv-engineer` / `adv-designer`; asset test rejects code rows mapped to general. |
| C4 | constraint | respected | static_check | Spec and adv.md prose state primary adv retains gate/task/checkpoint/archive/signoff/drift/contract/release/user synthesis authority. |
| C5 | constraint | respected | static_check | Static diff contains no OMR/model-routing config files; changed files limited to advance-meta spec/docs, adv.md, ADV_INSTRUCTIONS.md, and asset test. |
| C6 | constraint | respected | static_check | Static diff and test confirm `.opencode/agents/adv-atc.md` unchanged. |
| DONT1 | avoidance | respected | review | `adv.md` Context-Optimal Execution contains no table pipes; operational table exists only in `ADV_INSTRUCTIONS.md`. |
| DONT2 | avoidance | respected | review | `adv-apply.md` not modified in final diff; asset test checks Step 4.5 remains and no ops table duplicate appears. |
| DONT3 | avoidance | respected | review | Asset test requires code edits route to `adv-engineer` and frontend/component edits to `adv-designer`, not `general`. |
| DONT4 | avoidance | respected | review | No runtime Temporal/storage/tool code changed; spec states runtime enforcement is not required. |
| DONT5 | avoidance | respected | review | `.opencode/agents/adv-atc.md` unchanged; asset test asserts no operational delegation tokens there. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a6a3b112e3f6 |  | AC1, AC2, AC3, AC4, AC5, AC6, SC1, SC2, SC3, SC4 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-cbbd31f8ee76 | AC1, AC2, AC3, AC4, SC1, SC2, SC3, SC4 | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-081a93bd3d35 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, SC1, SC2, SC3, SC4 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
