# Executive Summary — slimMutationToolSurface

## Outcome

Slimmed the ADV mutation tool surface exposed in agent manifests by routing ~66 low-frequency Tier 3 tools through `adv_tool_invoke` instead of granting them directly. Orchestrator manifest dropped from 83 → 18 ADV tool entries; sub-agent manifests dropped to 11 entries each (Tier 1 only + invoke/catalog/describe). Prompt tool-definition bytes per orchestrator turn reduced by ~78%, exceeding the SC1 >65% target.

## Value / Why It Matters

Every ADV tool definition in an agent manifest is prompt context the model pays for on every turn. With 83 tools granted to the orchestrator, ~66 of those (low-frequency mutations: delta ops, ops runbook, epic moves, worktree ops, etc.) consumed context budget without commensurate per-turn value. Tier 3 tools are still fully callable — they're discovered via `adv_tool_catalog`, described via `adv_tool_describe`, and dispatched through `adv_tool_invoke`, which preserves the exact same wrapped `ToolDefinition.execute` path (validation, authorization, approvals, recovery restrictions, timeouts). The slimming is purely a manifest-exposure change; no tool was removed from `tool-registry.ts`.

## Verification

- **AC1 (adv ≤16 → DDC1 ≤18)**: adv manifest carries exactly 18 entries (T1:11 + T2:7). PASS under design-gate-approved DDC1 correction (catalog+describe promoted to T1 as discovery prerequisites).
- **AC2 (sub-agent ≤9 → DDC1 ≤11)**: All 10 sub-agent/primary manifests carry exactly 11 entries (T1 only) + `adv_*: false` denyWildcard. PASS under DDC1 correction.
- **AC3 (invoke parity)**: `adv_tool_invoke` dispatches through the same wrapped `baseToolMap` as direct calls, forwarding `ToolContext` unchanged. 14 invoke tests + 35 catalog/policy tests green.
- **AC4 (approval gate through invoke)**: Canonical approval schema (`z.literal(true)` for `approvedByUser`) preserved through strict Zod parse; handler-level rejection of missing approval evidence confirmed for `adv_change_close` and all approval-gated Tier 3 tools.
- **AC5 (catalog/describe)**: `adv_tool_catalog` maps all `PUBLIC_TOOL_ENTRIES`; `adv_tool_describe` renders Zod JSON Schema.
- **AC6 (manifests zero drift)**: `pnpm run generate:manifests:check` passes — all 12 agent YAMLs match `AGENT_TOOL_POLICY`.
- **AC7 (full suite)**: 6959 pass / 4 fail. The 4 failures (`human-checkpoints-assets`, `spec-citation-invariant`, 2× `tool-arg-preflight`) pre-exist on `origin/trunk` and are unrelated to this change's scope (verified by running the same suite on trunk).
- `pnpm run check` (schemas/typecheck/manifests/isolation/lockfile/lint/format) green.
- `pnpm run build` green (plugin + Temporal worker + build-identity bundles).
- `bun test bin/` 291 pass.

## Risks / Follow-ups

- **Sibling change `addAdvMcpReadSurface`** (OOS1) will further reduce orchestrator surface for MCP reads — tracked separately.
- **Sibling change `replaceRecoveryToolSprawl`** (OOS2, already archived) retired 8 recovery tools consolidated into `adv_doctor`; the inventory test legitimately references their names in `CONTRACTED_PUBLIC_REMOVALS` and is now in `recovery-surface-parity`'s allowlist.
- **4 pre-existing trunk test failures** are unrelated; they should be addressed by their owning changes (likely `addDependencyAwareResume` for spec-citation, and separate cleanup changes for the others).
- Tier 3 tools remain fully registered in `tool-registry.ts` (constraint C2 / DONT1); only manifest exposure changed. No runtime behavior change for any tool.

## Supporting Evidence

- Commit `65d71bdc` (post-rebase hygiene): cleaned dead `EPIC_TOOLS` lint leftover, prettier drift, added `tool-registry.inventory.test.ts` to recovery-surface-parity allowlist.
- Task checkpoints: `tk-c5d1c1ef89c8` (policy reclassification), `tk-6d192fbfe9a3` (invoke dispatch verification), `tk-4b745da0d6d2` (manifest regeneration + agent prose), `tk-db5b2ffb4d6a` (full suite + asset test remediation).
- Worktree HEAD: `change/slimMutationToolSurface` rebased clean onto `origin/trunk` (0e4aaeed).