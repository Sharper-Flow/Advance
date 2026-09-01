# Design

## Chosen Direction
Restore the existing `followupTools` group through the canonical derived registry. Keep the current handler authoritative for child creation, profile seeding, target trust, idempotency, and parent linking.

## Implementation
1. Import `followupTools` in `plugin/src/tool-registry.ts`.
2. Bind the group beside ops evidence tools in `createToolMap`.
3. Add the group to `PUBLIC_TOOL_GROUPS` so catalog, invoke, degraded registration, and surface lookup derive it automatically.
4. Restore the orchestrator role entry in `plugin/src/tool-role-policy.ts`.
5. Restore the `TITLE_BUILDERS` entry for `adv_followup_promote`.
6. Add `REALM_OVERRIDES.adv_followup_promote = "followup"` so catalog metadata uses the live follow-up realm.
7. Update the contracted public inventory count from 35 to 36 with a restore rationale.
8. Add regression assertions to inventory, role-policy, catalog, and invoke integration tests. Reuse existing handler tests for promotion semantics.
9. Run manifest generation checks and regenerate only if generated files drift.

## Independent Validation
The validator returned **CONFIRMED**, high confidence, low risk. It verified that commit `dc461d3a` removed the tool as collateral during Epic/backlog retirement while the handler, docs, tests, and durable law remained. It also identified the title builder, realm override, and contracted inventory count as required integration surfaces.

## Least-Bad-Path Decisions
- Restore the independent capability instead of weakening `adv_ops_run_upsert`. This keeps profile provenance structural.
- Use `PUBLIC_TOOL_GROUPS` derivation instead of an invoke-only exception.
- Keep retired Epic and backlog groups absent.
- Make no spec-law change because the existing law already requires this tool.

## Failure Handling
- Registry parity tests fail if runtime binding and public inventory diverge.
- Role-policy tests fail if the restored tool lacks explicit authority.
- Invoke integration fails if catalog lookup cannot reach the handler.
- If deploy or runtime verification fails, keep the originating production ops task in progress and do not publish R2 assets.

## Rollback
Remove the restored group, role, title, realm, and count changes together only if the tool causes a verified runtime regression. The originating production operation remains blocked until another typed profile-seeding path exists.

## Verification
- Targeted registry inventory, role-policy, follow-up, catalog, title, and invoke tests.
- Typecheck, format, lint, and manifest generation check.
- Runtime catalog and dry-run invoke verification after merge, deploy from default branch, and OpenCode restart.