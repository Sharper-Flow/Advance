# Contract Traceability

**Change ID:** fixToolDrift
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-24T23:01:10.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `./scripts/deploy-local.sh --check` passed; adv.md and adv-atc.md report drift-clean with 54 required tools and no `adv_subagent_report_submit` warning. |
| AC2 | acceptance_criterion | pass | test | `plugin/src/deploy-local.test.ts` asserts primary `adv.md` and `adv-atc.md` do not contain `  adv_subagent_report_submit:`; no primary allowlist files changed. |
| AC3 | acceptance_criterion | pass | test | `pnpm exec vitest run src/adv-engineer-assets.test.ts` passed; `pnpm exec vitest run src/adv-reviewer-asset.test.ts` passed. |
| AC4 | acceptance_criterion | pass | test | `pnpm test -- src/deploy-local.test.ts` passed; tests assert `LEAF_ONLY_TOOLS`, `agent_mode == "primary"`, `registered - primary_exemptions - allowed`, and ordinary strictness guards. |
| C1 | constraint | respected | static_check | `missing = sorted(registered - primary_exemptions - allowed)` only subtracts named primary exemptions; extras detection remains `allowed - registered`. Tests assert no global disabling. |
| C2 | constraint | respected | static_check | Validation uses parsed frontmatter `mode` and named `LEAF_ONLY_TOOLS` set, not prose or heuristic inference. |
| DONT1 | avoidance | respected | review | Primary agent files were not modified; reviewer verdict APPROVE with no findings. |
| DONT2 | avoidance | respected | review | Tool drift validation still computes and reports missing/extras; reviewer confirmed no weakening; `pnpm run check` passed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d415ea14001a |  | AC1, AC2, AC4, C1, C2, DONT1, DONT2 |  |  |
| tk-b1b10675afd2 | AC1, AC2, AC4, C1, C2, DONT1, DONT2 | AC3 |  |  |
