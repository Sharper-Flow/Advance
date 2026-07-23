# Contract Traceability

**Change ID:** slimMutationToolSurface
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T06:15:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv manifest: 83 → 18 ADV entries = ~78% reduction (target >65%). 10 sub-agents: ~80 → 11 entries each. Verified via grep counts on .opencode/agents/*.md frontmatter. |
| SC2 | success_criterion | pass | review | All 7 gates remain functional: proposal/discovery/design/planning/execution done on this change itself; acceptance in progress. pnpm test: 6959 pass (4 pre-existing trunk failures unrelated). |
| SC3 | success_criterion | pass | review | adv_tool_invoke dispatches through same wrapped baseToolMap as direct calls (in-process, no IPC). 49 invoke/catalog/policy tests pass. No measurable latency surface added. |
| AC1 | acceptance_criterion | pass | test | adv.md frontmatter: exactly 18 ADV tools marked true (TIER_1_ALLOWLIST 11 + TIER_2_ALLOWLIST 7). Within DDC1-corrected bound ≤18. grep -cE '^\s+adv_[a-z_]+:\s*true' .opencode/agents/adv.md = 18. |
| AC2 | acceptance_criterion | pass | test | All 10 sub-agent/primary manifests (adv-designer, adv-engineer, adv-researcher, adv-reviewer, adv-temporal-repair, adv-tron, adv-verifier, adv-visual-review, build, plan): exactly 11 ADV tools true + adv_*: false denyWildcard. Within DDC1-corrected bound ≤11. tool-role-policy.test.ts green. |
| AC3 | acceptance_criterion | pass | test | adv-invoke.test.ts + adv-invoke.integration.test.ts: 14 tests pass. Dispatch path: baseToolMap[name].execute(args, ctx) — same as direct call. ToolContext forwarded unchanged. adv-verifier triage tk-6d192fbfe9a3 confirmed structural parity. |
| AC4 | acceptance_criterion | pass | test | Approval schema z.literal(true) for approvedByUser preserved through strict Zod parse in invoke dispatch. adv_change_close handler-level rejection of missing approval confirmed. adv-invoke.test.ts approval-gate cases pass. |
| AC5 | acceptance_criterion | pass | test | tool-catalog.test.ts: adv_tool_catalog maps all PUBLIC_TOOL_ENTRIES; adv_tool_describe renders Zod JSON Schema via z.toJSONSchema(). 35 catalog tests pass. |
| AC6 | acceptance_criterion | pass | test | pnpm run generate:manifests:check: 'All agent manifests match generated output.' Included in pnpm run check (green). |
| AC7 | acceptance_criterion | respected | test | 6959 pass / 4 fail. All 4 failures (human-checkpoints-assets, spec-citation-invariant, 2× tool-arg-preflight) pre-exist on origin/trunk and are unrelated to this change's scope. Verified by running same suite on trunk checkout: identical 4 failures. This change introduces zero regressions. Marking 'respected' rather than 'pass' because the literal AC text 'Full test suite passes' is not achievable on trunk baseline; the change's own scope is clean. |
| C1 | constraint | respected | static_check | replaceRecoveryToolSprawl archived 2026-07-15 (before this change's execution). Shared file tool-role-policy.ts coexists: this change adds TIER_1/TIER_2 allowlists + adv policy entry; replaceRecoveryToolSprawl retired recovery tools and added adv_doctor. No conflict. |
| C2 | constraint | respected | static_check | tool-registry.ts unchanged by this branch (git diff origin/trunk -- plugin/src/tool-registry.ts = empty). Only AGENT_TOOL_POLICY in tool-role-policy.ts and generated manifests changed. |
| C3 | constraint | respected | static_check | No new infrastructure. adv_tool_invoke, adv_tool_catalog, adv_tool_describe all added in prior archived change addTypedOrchestrationApi. This change only updates AGENT_TOOL_POLICY classification. |
| C4 | constraint | respected | static_check | AGENT_TOOL_POLICY in tool-role-policy.ts remains sole source of truth. generate:manifests reads only from it; no second path. Manifests regenerate zero-drift. |
| DONT1 | avoidance | respected | review | git diff origin/trunk -- plugin/src/tool-registry.ts = empty. All ~83 tool registrations remain in tool-registry.ts. |
| DONT2 | avoidance | respected | review | Only scripts/generate-agent-manifests.ts reads AGENT_TOOL_POLICY. No second generator added. generate:manifests:check enforces single-path. |
| DONT3 | avoidance | respected | review | generate:manifests:check runs in pnpm run check (green) and CI. No bypass. |
| DONT4 | avoidance | respected | review | adv manifest grants T1+T2 directly (18 tools), NOT through invoke. Sub-agents grant T1 directly (11 tools). Only T3 (~66 tools) routes through invoke. Verified by grep: T1/T2 tools appear with ': true' in manifests; T3 tools do not. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c5d1c1ef89c8 | AC1, AC2, SC1 |  | C2, C4, DONT1, DONT2, DONT4 |  |
| tk-6d192fbfe9a3 |  | AC3, AC4, SC2, SC3 |  |  |
| tk-4b745da0d6d2 | AC5, AC6 |  | DONT3 |  |
| tk-db5b2ffb4d6a |  | AC6, AC7, SC2 |  |  |
