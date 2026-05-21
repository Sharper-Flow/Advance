# Archive: Refactor ADV prompt

**Change ID:** refactorAdvPrompt
**Archived:** 2026-05-21T03:03:42.450Z
**Created:** 2026-05-20T02:56:25.457Z

## Tasks Completed

- ✅ Update advance-meta spec law for lean ADV runtime prompt
  > Changed `.adv/specs/advance-meta/spec.json` and `docs/specs/advance-meta.md` to remove whole-ADV_INSTRUCTIONS static-order requirements and add lean runtime prompt / coverage inventory / updated metric-plane requirements. Added a deploy-local asset test to prevent reintroducing full ADV_INSTRUCTIONS runtime append in spec law. Verification: `pnpm test -- src/deploy-local.test.ts` exit 0.
- ✅ Create runtime protocol coverage inventory and invariant tests
  > Added `docs/adv-runtime-protocol-coverage.md` mapping critical runtime invariants to retained/enforced anchors and explicitly distinguishing it from `docs/prose-load-inventory.md`. Added `### Worktree Isolation Routing` to `.opencode/agents/adv.md` so the lean runtime prompt retains worktree-isolation guidance. Added deploy-local asset assertions for coverage rows and core runtime anchors. Verification: `pnpm test -- src/deploy-local.test.ts` exit 0.
- ✅ Refactor deploy-local ADV runtime agent assembly
  > Updated `scripts/deploy-local.sh` so `sync_adv_runtime_agent` reads only `.opencode/agents/adv.md`, writes it through a temp file and atomic replace, and no longer requires/concatenates `ADV_INSTRUCTIONS.md` as runtime payload. Updated overlay/deploy tests to assert lean global adv.md and no full ADV_INSTRUCTIONS markers. Verification: `pnpm test -- src/overlay-sync-assets.test.ts src/deploy-local.test.ts` exit 0.
- ✅ Update runtime prompt docs and reference-boundary wording
  > Updated `docs/provider-agent-assembly.md`, `docs/provider-adv-smoke-checklist.md`, `AGENTS.md`, and `ADV_INSTRUCTIONS.md` so they no longer describe global adv.md as canonical body plus full ADV_INSTRUCTIONS append. Documented lean canonical runtime prompt, reference-only ADV_INSTRUCTIONS boundary, coverage inventory, provider hint injection, and restart/deploy implications. Added docs assertion to deploy-local tests. Verification: `pnpm test -- src/deploy-local.test.ts src/overlay-sync-assets.test.ts` exit 0.
- ✅ Update provider prompt-size metrics to coverage-first planes
  > Changed `scripts/provider-eval.ts` to compose lean runtime prompts without embedding `ADV_INSTRUCTIONS.md`, while still reporting the full reference protocol as `adv_reference_protocol`. Replaced old `canonical_adv_prompt`/`adv_protocol_instructions` model with `lean_adv_runtime_prompt`, `adv_reference_protocol`, `adv_dynamic_system_block_estimate`, `caveman_voice_contract_allowance`, `provider_hint`, `selected_agent_runtime_prompt`, and `avoided_provider_variant_duplication`. Updated provider docs, smoke checklist, and deploy-local tests. Verification: `pnpm test -- src/deploy-local.test.ts` exit 0.
- ✅ Run integrated verification and deploy checks
  > Ran final verification and review remediation. Evidence: `pnpm test -- src/deploy-local.test.ts src/overlay-sync-assets.test.ts` exit 0; `pnpm run check` exit 0; `bash -n scripts/deploy-local.sh` exit 0; `pnpm run build` exit 0; `scripts/deploy-local.sh --check` exit 0 after build. Independent reviewer initially found two issues (coverage statuses still planned; AGENTS overlay wording contradiction) and two stale comments. Fixed all, reran focused tests/check/deploy check, and targeted reviewer returned APPROVED with no findings. No restarted OpenCode smoke was performed per agreement; docs note restart implications.

## Specs Modified

