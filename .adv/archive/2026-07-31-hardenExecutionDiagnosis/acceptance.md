# Acceptance

Reviewed at: 2026-07-31T15:57:41-04:00

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1 — Attribution guard:** A test-failure ownership decision is accepted only with structured evidence for exact assertion, test locator, branch result, verified base result, changed-path diff, owner/task, and evidence references. Unsupported baseline/unrelated/split claims fail validation. | pass | tk-406bc88846f4; typed attribution schema and focused tests passed; final reviewer and scanner traced evidence fields. |
| AC2 | acceptance_criterion | **AC2 — Classification guard:** `TRANSIENT` or suite-only classifications require recorded comparison evidence and a named causal mechanism. Unsupported classifications are rejected or downgraded to `SEMANTIC`/`UNKNOWN`. | pass | tk-406bc88846f4; classification schema guards and negative tests pass. |
| AC3 | acceptance_criterion | **AC3 — Contract conflict:** Contradictory test contracts for one behavior create `CONTRACT_CONFLICT`, halt repair retries, and require a recorded design/review disposition before relevant code or tests change. | pass | CONTRACT_CONFLICT non-retry invariants validated by task schema tests. |
| AC4 | acceptance_criterion | **AC4 — Routing precedence:** Advance command routing prevents a failing-test or behavioral-authority diagnosis from using delegation as its primary diagnosis/repair path when `/adv-apply` marks it inline-required. | pass | Delegation routing command/spec regressions pass in 307-test command asset suite. |
| AC5 | acceptance_criterion | **AC5 — Worker recovery:** Empty/malformed worker output receives one narrower retry at most; another same-scope delegation is refused until inline diagnosis evidence exists. Empty output does not count as a genuine semantic repair attempt. | pass | Typed state machine and runtime consumer verified by 182 focused tests plus 72 boundary tests; reviewer attempt 5 approved. |
| AC6 | acceptance_criterion | **AC6 — Verifier fidelity:** Failed verification results persist exact assertion, test/production locators, branch/base status, failure mode, and confidence, with validated schemas and consumer rendering. | pass | Verifier attribution schema, consumer rendering, and asset tests passed; independent review approved. |
| AC7 | acceptance_criterion | **AC7 — Compact command:** `/adv-apply` has a short execution-facing decision path and offloads stable detail to canonical references/typed runtime validation. Existing required behavior remains covered by regression tests. | pass | adv-apply conflict-free and within enforced budget; 307 command/asset tests pass. |
| AC8 | acceptance_criterion | **AC8 — Compatibility:** Existing historical state remains readable; existing workflows without new attribution fields are not retroactively invalidated, while new mutation paths enforce the new rules. | pass | New fields remain optional; schema parity, archive-through/change-state compatibility tests pass. |
| C1 | constraint | No trunk writes for branch/base checks; use worktree-safe, immutable-base verification. | respected | All implementation and verification occurred in ADV worktree; no trunk writes. Change has no visual surface, so Preview URL is not applicable. |
| C2 | constraint | Do not weaken assertions, skip tests, or classify uncertainty as pre-existing. | respected | Assertions retained or strengthened; no skipped tests or unsupported baseline classification. |
| C3 | constraint | Preserve current human checkpoints and task retry budget semantics. | respected | Human checkpoints and one-retry semantics preserved; command checkpoint regressions pass. |
| C4 | constraint | Use structural validation over heuristic classification for persisted state and workflow transitions. | respected | Zod schemas and typed task/report mutation paths own persisted authority; no heuristic state transition. |

