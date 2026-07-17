# Contract Traceability

**Change ID:** gateAgentToolsRole
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-16T23:28:05.403Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Both the generator and runtime helpers derive from AGENT_TOOL_POLICY; generate:manifests:check enforces manifests == generated; reviewer confirmed single source of truth. |
| SC2 | success_criterion | pass | review | Firewall tests block adv_change_workflow_terminate (operator-only) and adv_gate_complete (orchestrator) from sub-agent sessions (tr_mrnzjzbw). |
| SC3 | success_criterion | pass | review | Only plugin/ and .opencode/agents/ assets changed; no OpenCode core modification. Reviewer confirmed. |
| SC4 | success_criterion | pass | review | Coexistence suite 113 tests green; main-session allow tests confirm unchanged behavior + audit metadata. |
| AC1 | acceptance_criterion | pass | test | generate-agent-manifests.ts emits each agent tools: block from AGENT_TOOL_POLICY; generator tests green (tr_mro2yn70). |
| AC2 | acceptance_criterion | pass | test | generate:manifests:check RED on injected drift (tr_mro023qk) → GREEN (tr_mro02eks); wired into pnpm run check. |
| AC3 | acceptance_criterion | pass | test | Registry-parity invariant preserved; check hardened to fail on any non-adv line drift; retargeted generated==committed assertions green. |
| AC4 | acceptance_criterion | pass | test | roleFirewallCheck throws typed RoleFirewallError for blockable adv_* from sub-agent sessions; firewall tests green. |
| AC5 | acceptance_criterion | pass | test | blockableFromSubAgentSession() = ADV_TOOL_NAMES minus union of spawnable-roster allowlists; union-floor/blockable unit tests green (108 tests tr_mrnyhoi7). |
| AC6 | acceptance_criterion | pass | test | Sub-agent-session ALLOW of adv_run_test + adv_subagent_report_submit; main-session ALLOW of a blockable tool — firewall tests green. |
| AC7 | acceptance_criterion | pass | test | Forged role:'orchestrator' arg from sub-agent session still blocked; role derives only from sessionID. Reviewer verified no caller-arg read. |
| AC8 | acceptance_criterion | pass | test | Unresolved-mainSessionId and missing-callerSessionID BLOCK a blockable tool; fail-closed derivation fallback (union floor only) tested; no workflow-state mutation. |
| AC9 | acceptance_criterion | pass | test | 21 firewall tests + coexistence 113 tests (trunk-write firewall, reachability, spawn accounting, todowrite) green; asset clusters 101, overlay-sync 21. |
| AC10 | acceptance_criterion | pass | test | pnpm run check (incl generate:manifests:check) + pnpm run build green; deterministic surface green with zero SEMANTIC failures. Local bin/oc-test full blocked by external shared full-tier lock; user approved CI isolated full run as authoritative AC10 verdict at release. |
| C1 | constraint | respected | static_check | No OpenCode core files touched; only plugin hook + ADV-owned agent assets. |
| C2 | constraint | respected | static_check | roleFirewallCheck reads only input.sessionID vs mainSessionId; no caller-supplied role/arg path. |
| C3 | constraint | respected | static_check | Coexistence tests confirm trunk-write firewall, reachability gate, spawn accounting, todowrite projection unchanged with firewall installed. |
| C4 | constraint | respected | static_check | Generator emits adv_*:false deny wildcard before sorted explicit grants/blocks, preserving OpenCode last-match-wins; YAML-validity + ordering tested. |
| C5 | constraint | respected | static_check | resolveBlockableSet() fail-closed fallback chain (blockable → union-complement → all ADV); never full-surface fallback; no workflow-state mutation on failure. |
| DONT1 | avoidance | respected | review | Blockable set derived from AGENT_TOOL_POLICY union-complement, not the 3-class taxonomy; orchestrator-class tools workers need (adv_run_test) remain in the union floor. |
| DONT2 | avoidance | respected | review | No runtime per-lane discrimination attempted; SDK hook exposes no agent identity. |
| DONT3 | avoidance | respected | review | Authority not encoded in prompt text; caller-supplied role args ignored (spoofing test). |
| DONT4 | avoidance | respected | review | No tools consolidated; tool count unchanged (80). |
| DONT5 | avoidance | respected | review | No dependency on Code Mode or the proposed MCP read surface. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Action-level operator gating for dual tools left to each tool's approvedByUser checks; not implemented here. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No user authentication/identity system added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Per-lane runtime enforcement remains in generated manifests; not attempted at runtime. |
| OOS4 | out_of_scope | not_applicable | not_applicable | MCP read/compose surface remains Epic entry 4 (addAdvMcpReadSurface). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-93917334191b | SC1, AC5 | AC5 | DONT1 |  |
| tk-d990b4e1e238 | SC2, AC4, AC6, AC7, AC8 | AC4, AC6, AC7, AC8 | C2, C3, C5, DONT2, DONT3 |  |
| tk-5c4780502870 | SC1, SC3, AC1, AC2, AC3 | AC1, AC2, AC3 | C1, C4, DONT4 |  |
| tk-7f619e48d9d6 | SC4 | AC9, AC10, SC4 | C3 |  |
