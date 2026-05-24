# Contract Traceability

**Change ID:** addPreviewUrls
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-24T22:28:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Spec rq-acceptancePreviewUrl01 + /adv-discover visual_surface language + /adv-review applicability rules; `pnpm test -- src/adv-skill-backed-commands-assets.test.ts` passed. |
| AC2 | acceptance_criterion | pass | test | /adv-review Build Acceptance Summary includes Preview URL before acceptance prompt; asset test asserts Preview URL precedes Inline Approval prompt. |
| AC3 | acceptance_criterion | pass | test | /adv-review requires reachability evidence and says bare unverified URL is insufficient; spec mirrors this; asset test passed. |
| AC4 | acceptance_criterion | pass | test | Spec and /adv-review define blocked state for missing URL/evidence, unknown applicability, and visual-surface drift; asset test passed. |
| AC5 | acceptance_criterion | pass | test | Spec scenario rq-acceptancePreviewUrl01.5 and /adv-review table define Preview URL: not_applicable with rationale; asset test passed. |
| AC6 | acceptance_criterion | pass | test | Touched `.adv/specs/advance-workflow/spec.json`, `.opencode/command/adv-review.md`, `.opencode/command/adv-discover.md`, docs mirror, and asset test; targeted test and `pnpm run check` passed. |
| AC7 | acceptance_criterion | pass | test | /adv-review executive-summary template includes Preview URL evidence; preflight requires matrix evidence for visual_surface true/false; asset test passed. |
| C1 | constraint | respected | static_check | No new gate/tool added; /adv-review acceptance checkpoint remains owner; `adv_gate_status` shows seven-gate flow preserved. |
| C2 | constraint | respected | static_check | Spec law, command docs, contract matrix wording, and asset tests own the rule. No heuristic-only acceptance authority added. |
| C3 | constraint | respected | static_check | Spec/review wording allows local/equivalent dev preview and does not require public deployment. |
| C4 | constraint | respected | static_check | /adv-review and spec include Preview URL: not_applicable with rationale for non-visual changes. |
| DONT1 | avoidance | respected | review | /adv-review says Do not fabricate URLs and requires observed/user/log/browser evidence; asset test passed. |
| DONT2 | avoidance | respected | review | /adv-review and spec state a bare unverified URL is insufficient; reachability evidence required. |
| DONT3 | avoidance | respected | review | Rule is in /adv-review Phase 7 before acceptance; no archive/release relocation. |
| DONT4 | avoidance | respected | review | No dev server manager/tool code added; changed only spec/docs/command/test assets. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-ecce30eead65 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, DONT1, DONT2, DONT3 | C1, C2, C3, C4 |  |
| tk-13ecd65b36f3 | AC1, AC2, AC3, AC4, AC5, AC6 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-5c811e52cf07 | AC1, AC4, AC5, AC6 |  | C1, C2, C4, DONT1, DONT3 |  |
| tk-bb8418e169cf | AC1, AC2, AC3, AC4, AC5, AC6, AC7 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-74497b201380 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |  |
