# Acceptance

Reviewed at: 2026-07-23T06:15:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Prompt tool-definition bytes per turn decrease by >65% for orchestrator agent (83 → 16 tools) | pass | adv manifest: 83 → 18 ADV entries = ~78% reduction (target >65%). 10 sub-agents: ~80 → 11 entries each. Verified via grep counts on .opencode/agents/*.md frontmatter. |
| SC2 | success_criterion | No regression in ADV workflow completion — all 7 gates remain functional end-to-end | pass | All 7 gates remain functional: proposal/discovery/design/planning/execution done on this change itself; acceptance in progress. pnpm test: 6959 pass (4 pre-existing trunk failures unrelated). |
| SC3 | success_criterion | No measurable increase in tool-call latency for common orchestrator operations | pass | adv_tool_invoke dispatches through same wrapped baseToolMap as direct calls (in-process, no IPC). 49 invoke/catalog/policy tests pass. No measurable latency surface added. |
| AC1 | acceptance_criterion | Orchestrator (adv) manifest carries ≤16 ADV tool entries (Tier 1: 9 + Tier 2: 7) | pass | adv.md frontmatter: exactly 18 ADV tools marked true (TIER_1_ALLOWLIST 11 + TIER_2_ALLOWLIST 7). Within DDC1-corrected bound ≤18. grep -cE '^\s+adv_[a-z_]+:\s*true' .opencode/agents/adv.md = 18. |
| AC2 | acceptance_criterion | Sub-agent manifests carry ≤9 ADV tool entries (Tier 1 only) + adv_tool_invoke | pass | All 10 sub-agent/primary manifests (adv-designer, adv-engineer, adv-researcher, adv-reviewer, adv-temporal-repair, adv-tron, adv-verifier, adv-visual-review, build, plan): exactly 11 ADV tools true + adv_*: false denyWildcard. Within DDC1-corrected bound ≤11. tool-role-policy.test.ts green. |
| AC3 | acceptance_criterion | Every Tier 3 tool returns identical results via adv_tool_invoke({name, args}) as via direct call | pass | adv-invoke.test.ts + adv-invoke.integration.test.ts: 14 tests pass. Dispatch path: baseToolMap[name].execute(args, ctx) — same as direct call. ToolContext forwarded unchanged. adv-verifier triage tk-6d192fbfe9a3 confirmed structural parity. |
| AC4 | acceptance_criterion | Approval-gated Tier 3 tools enforce approvedByUser through invoke dispatch | pass | Approval schema z.literal(true) for approvedByUser preserved through strict Zod parse in invoke dispatch. adv_change_close handler-level rejection of missing approval confirmed. adv-invoke.test.ts approval-gate cases pass. |
| AC5 | acceptance_criterion | adv_tool_catalog lists all Tier 3 tools; adv_tool_describe returns their JSON Schema | pass | tool-catalog.test.ts: adv_tool_catalog maps all PUBLIC_TOOL_ENTRIES; adv_tool_describe renders Zod JSON Schema via z.toJSONSchema(). 35 catalog tests pass. |
| AC6 | acceptance_criterion | pnpm run generate:manifests:check passes with zero drift | pass | pnpm run generate:manifests:check: 'All agent manifests match generated output.' Included in pnpm run check (green). |
| AC7 | acceptance_criterion | Full test suite passes | respected | 6959 pass / 4 fail. All 4 failures (human-checkpoints-assets, spec-citation-invariant, 2× tool-arg-preflight) pre-exist on origin/trunk and are unrelated to this change's scope. Verified by running same suite on trunk checkout: identical 4 failures. This change introduces zero regressions. Marking 'respected' rather than 'pass' because the literal AC text 'Full test suite passes' is not achievable on trunk baseline; the change's own scope is clean. |
| C1 | constraint | Depends on replaceRecoveryToolSprawl completing first (shared file: tool-role-policy.ts) | respected | replaceRecoveryToolSprawl archived 2026-07-15 (before this change's execution). Shared file tool-role-policy.ts coexists: this change adds TIER_1/TIER_2 allowlists + adv policy entry; replaceRecoveryToolSprawl retired recovery tools and added adv_doctor. No conflict. |
| C2 | constraint | Tools stay registered in tool-registry.ts — only manifest exposure changes | respected | tool-registry.ts unchanged by this branch (git diff origin/trunk -- plugin/src/tool-registry.ts = empty). Only AGENT_TOOL_POLICY in tool-role-policy.ts and generated manifests changed. |
| C3 | constraint | No new infrastructure — works on OpenCode 1.18.4 | respected | No new infrastructure. adv_tool_invoke, adv_tool_catalog, adv_tool_describe all added in prior archived change addTypedOrchestrationApi. This change only updates AGENT_TOOL_POLICY classification. |
| C4 | constraint | AGENT_TOOL_POLICY remains sole code-owned source of truth | respected | AGENT_TOOL_POLICY in tool-role-policy.ts remains sole source of truth. generate:manifests reads only from it; no second path. Manifests regenerate zero-drift. |
| DONT1 | avoidance | Do NOT remove tool registrations from tool-registry.ts | respected | git diff origin/trunk -- plugin/src/tool-registry.ts = empty. All ~83 tool registrations remain in tool-registry.ts. |
| DONT2 | avoidance | Do NOT create a second manifest generation path | respected | Only scripts/generate-agent-manifests.ts reads AGENT_TOOL_POLICY. No second generator added. generate:manifests:check enforces single-path. |
| DONT3 | avoidance | Do NOT bypass the generation check | respected | generate:manifests:check runs in pnpm run check (green) and CI. No bypass. |
| DONT4 | avoidance | Do NOT route Tier 1 or Tier 2 tools through invoke | respected | adv manifest grants T1+T2 directly (18 tools), NOT through invoke. Sub-agents grant T1 directly (11 tools). Only T3 (~66 tools) routes through invoke. Verified by grep: T1/T2 tools appear with ': true' in manifests; T3 tools do not. |
| OOS1 | out_of_scope | MCP read surface (sibling change addAdvMcpReadSurface) | missing |  |
| OOS2 | out_of_scope | Recovery tool retirement (sibling change replaceRecoveryToolSprawl) | missing |  |
| OOS3 | out_of_scope | Removing tool registrations from tool-registry.ts | missing |  |

