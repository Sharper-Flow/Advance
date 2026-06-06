# Executive Summary

## Outcome
Cross-project change creation now uses target Temporal workflow state instead of disk-only target scaffolds. Active disk-only target records are recoverable through the normal list/read reseed path, while archived/closed records remain terminal projections.

## Verdict
APPROVED

## What Was Built
1. Threaded `cross_project_origin`, `cross_project_links`, and `external_dependencies` through Temporal workflow state, seed, continue-as-new, read mapping, and coordination update signals.
2. Routed `adv_change_create target_path` through `withTargetPathStore({ stateRequirement: "temporal-required" })` with target confirmation evidence and target-context project IDs.
3. Removed post-create target get/save patching; target create seeds provenance before workflow start and failure returns an error without writing source links.
4. Added bounded tests for target routing, no target getState query, failure semantics, active disk-only reseed, terminal skip behavior, preflight policy, and spec law.
5. Updated `advance-workflow` spec law for cross-project Temporal create and active-only reconciliation.

## What Was Verified
- Verdict: READY from `adv-reviewer`; review remediation applied for cross-project link/dependency metadata preservation.
- Tests: `pnpm run check` passed; targeted Vitest suite passed (184 tests) after review remediation.
- Preview URL: not_applicable — backend/tooling workflow change; no browser-visible or visual output surface.
- Contract matrix: 23 required rows passed/respected; 0 failed/violated/unknown.

## Remaining Concerns
Live ADV tool behavior requires build/deploy/restart before in-session MCP calls use the new source, because OpenCode loads deployed `dist` at session startup. No product-scope concerns remain.