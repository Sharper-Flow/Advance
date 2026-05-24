# Acceptance

Reviewed at: 2026-05-24T23:01:10.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `./scripts/deploy-local.sh --check` treats `adv_subagent_report_submit` as not required for `adv.md` and `adv-atc.md`. | pass | `./scripts/deploy-local.sh --check` passed; adv.md and adv-atc.md report drift-clean with 54 required tools and no `adv_subagent_report_submit` warning. |
| AC2 | acceptance_criterion | The fix does not add `adv_subagent_report_submit` to primary agent allowlists. | pass | `plugin/src/deploy-local.test.ts` asserts primary `adv.md` and `adv-atc.md` do not contain `  adv_subagent_report_submit:`; no primary allowlist files changed. |
| AC3 | acceptance_criterion | Existing subagent assets still require/expose `adv_subagent_report_submit` for `adv-engineer` and `adv-reviewer`. | pass | `pnpm exec vitest run src/adv-engineer-assets.test.ts` passed; `pnpm exec vitest run src/adv-reviewer-asset.test.ts` passed. |
| AC4 | acceptance_criterion | Tests cover the role-aware drift validation behavior. | pass | `pnpm test -- src/deploy-local.test.ts` passed; tests assert `LEAF_ONLY_TOOLS`, `agent_mode == "primary"`, `registered - primary_exemptions - allowed`, and ordinary strictness guards. |
| C1 | constraint | Do not weaken drift validation for ordinary primary-agent ADV tools. | respected | `missing = sorted(registered - primary_exemptions - allowed)` only subtracts named primary exemptions; extras detection remains `allowed - registered`. Tests assert no global disabling. |
| C2 | constraint | Keep validation structural and deterministic, not prose-only. | respected | Validation uses parsed frontmatter `mode` and named `LEAF_ONLY_TOOLS` set, not prose or heuristic inference. |
| DONT1 | avoidance | Do not solve by adding leaf-only submit capability to primary agents. | respected | Primary agent files were not modified; reviewer verdict APPROVE with no findings. |
| DONT2 | avoidance | Do not disable tool drift validation globally. | respected | Tool drift validation still computes and reports missing/extras; reviewer confirmed no weakening; `pnpm run check` passed. |

