# Acceptance

Reviewed at: 2026-05-24T22:28:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `/adv-review` detects applicable front-end/browser-visible work, defined broadly as any visual output. | pass | Spec rq-acceptancePreviewUrl01 + /adv-discover visual_surface language + /adv-review applicability rules; `pnpm test -- src/adv-skill-backed-commands-assets.test.ts` passed. |
| AC2 | acceptance_criterion | If applicable, the acceptance summary includes `Preview URL: {url}` before user acceptance. | pass | /adv-review Build Acceptance Summary includes Preview URL before acceptance prompt; asset test asserts Preview URL precedes Inline Approval prompt. |
| AC3 | acceptance_criterion | Preview URL must include reachability evidence; a bare unverified URL is insufficient. | pass | /adv-review requires reachability evidence and says bare unverified URL is insufficient; spec mirrors this; asset test passed. |
| AC4 | acceptance_criterion | If applicable work lacks URL or reachability evidence, acceptance is blocked before user sign-off. | pass | Spec and /adv-review define blocked state for missing URL/evidence, unknown applicability, and visual-surface drift; asset test passed. |
| AC5 | acceptance_criterion | If not applicable, the acceptance summary may state `Preview URL: not_applicable`. | pass | Spec scenario rq-acceptancePreviewUrl01.5 and /adv-review table define Preview URL: not_applicable with rationale; asset test passed. |
| AC6 | acceptance_criterion | The rule is encoded in durable workflow contract surfaces: spec, `/adv-review` command, and tests. | pass | Touched `.adv/specs/advance-workflow/spec.json`, `.opencode/command/adv-review.md`, `.opencode/command/adv-discover.md`, docs mirror, and asset test; targeted test and `pnpm run check` passed. |
| AC7 | acceptance_criterion | Preview proof is included in durable acceptance or executive-summary evidence when applicable. | pass | /adv-review executive-summary template includes Preview URL evidence; preflight requires matrix evidence for visual_surface true/false; asset test passed. |
| C1 | constraint | Preserve the seven-gate ADV workflow and existing acceptance checkpoint semantics. | respected | No new gate/tool added; /adv-review acceptance checkpoint remains owner; `adv_gate_status` shows seven-gate flow preserved. |
| C2 | constraint | Use structural contract surfaces (spec, command doc, tests) rather than heuristic-only prompting. | respected | Spec law, command docs, contract matrix wording, and asset tests own the rule. No heuristic-only acceptance authority added. |
| C3 | constraint | Do not require public deployment when local or equivalent dev preview is sufficient. | respected | Spec/review wording allows local/equivalent dev preview and does not require public deployment. |
| C4 | constraint | Keep non-front-end changes unblocked by preview URL requirements. | respected | /adv-review and spec include Preview URL: not_applicable with rationale for non-visual changes. |
| DONT1 | avoidance | Do not fabricate URLs from assumptions. | respected | /adv-review says Do not fabricate URLs and requires observed/user/log/browser evidence; asset test passed. |
| DONT2 | avoidance | Do not accept a bare unverified URL for applicable visual work. | respected | /adv-review and spec state a bare unverified URL is insufficient; reachability evidence required. |
| DONT3 | avoidance | Do not move the requirement to archive/release; it must run before user acceptance. | respected | Rule is in /adv-review Phase 7 before acceptance; no archive/release relocation. |
| DONT4 | avoidance | Do not build a new dev server manager as part of this change. | respected | No dev server manager/tool code added; changed only spec/docs/command/test assets. |

