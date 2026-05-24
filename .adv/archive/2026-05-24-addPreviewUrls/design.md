# Design

## Architecture Overview

Add preview-url acceptance proof to the existing ADV acceptance contract path. The rule lives in four coordinated surfaces:

1. `advance-workflow` spec law defines when preview proof is required and what blocks acceptance.
2. `/adv-discover` records preview applicability in the approved agreement for future changes.
3. `/adv-review` Phase 7 reads the approved agreement/contract and adds preview proof to pre-acceptance checks, acceptance summary, contract review evidence, and executive-summary evidence.
4. Asset tests pin the command/spec contract and the ordering before the Inline Approval prompt.

The design does not add a new MCP tool, dev-server manager, or public deployment requirement. The agent must use available dev-environment evidence during review; applicable visual work without a reachable preview blocks acceptance.

## Key Decisions

### KD1 — Reuse acceptance proof machinery; do not create a separate gate

Preview proof is part of acceptance, not release/archive. `/adv-review` already owns acceptance summary, contract matrix proof, pre-acceptance preflight, and executive-summary persistence. The implementation extends those surfaces instead of adding a new workflow gate.

### KD2 — Record applicability before acceptance

To avoid heuristic-only acceptance gating, `/adv-discover` must capture preview applicability in the approved agreement:

- `visual_surface: true` — work affects front-end/browser-visible or any visual output; preview proof is required.
- `visual_surface: false` — no visual output effect; preview proof is not applicable.
- `visual_surface: unknown` — uncertainty remains; acceptance must treat preview applicability as unresolved/blocking until clarified.

The agreement must include rationale. `/adv-review` may use implementation/task evidence to detect drift (for example, visual files changed despite `visual_surface: false`) and block acceptance for clarification, but file heuristics are advisory rather than the sole authority.

### KD3 — Keep the required user-facing line

The acceptance summary must include a visible `Preview URL` line before the Inline Approval prompt:

- `Preview URL: {url}` plus reachability evidence when applicable and live.
- `Preview URL: not_applicable` when the approved agreement and implementation evidence show no browser-visible or visual-output effect.
- `Preview URL: blocked` with reason when applicable work lacks URL/reachability evidence or applicability is unresolved.

`blocked` prevents acceptance; it is not a caveat.

### KD4 — Back the line with structural contract evidence

The visible summary line is backed by `contract.reviewMatrix` evidence, not a free-floating string:

- Applicable + reachable preview → required contract row passes with evidence containing URL, verification method, result/status, and timestamp/reviewed-at context.
- Non-applicable → row is `not_applicable` with rationale.
- Applicable + missing URL/reachability → row remains `fail`/`unknown`, or preview preflight reports `blocked`; acceptance checkpoint is not shown.

This keeps generated `acceptance.md` authoritative through existing contract projection and avoids hand-editing acceptance proof.

### KD5 — Reachability evidence has a minimal shape

Reachability evidence must include:

- URL.
- Verification method, e.g. HTTP status check, browser-open evidence, or equivalent local preview verification.
- Result/status.
- Timestamp or reviewed-at context.

A bare URL is insufficient.

## ADR Drafts

None. Decisions are local workflow-contract refinements, not hard-to-reverse architecture changes.

## Implementation Strategy

1. Update `.adv/specs/advance-workflow/spec.json`:
   - Add `rq-acceptancePreviewUrl01` with scenarios for applicability declaration, live preview proof, blocked applicable preview, and not-applicable non-visual changes.
   - Tags: `workflow`, `acceptance`, `preview-url`, `front-end`.
2. Update `docs/specs/advance-workflow.md` to mirror the new requirement.
3. Update `.opencode/command/adv-discover.md`:
   - Add preview applicability to the agreement draft/persisted agreement structure.
   - Require `visual_surface: true|false|unknown` plus rationale before discovery completion.
4. Update `.opencode/command/adv-review.md` Phase 7:
   - Add preview proof to Pre-Acceptance Checks / Pre-Acceptance Contract Preflight before the Inline Approval prompt.
   - Add `Preview URL` to Build Acceptance Summary.
   - Require contract review matrix evidence for preview proof when applicable or not applicable.
   - Add preview proof to persisted executive-summary `What Was Verified` template.
   - Specify states: `live`, `not_applicable`, `blocked`.
   - Specify `blocked` requires a concrete reason and stops acceptance.
5. Update `plugin/src/adv-skill-backed-commands-assets.test.ts`:
   - Assert `/adv-discover` includes preview applicability and `visual_surface` agreement language.
   - Assert `/adv-review` contains `Preview URL`, reachability evidence, `contract.reviewMatrix`, `not_applicable`, `blocked`, and `live` state language.
   - Assert preview preflight appears before the Inline Approval prompt using existing index-order pattern.
   - Assert spec/docs contain `rq-acceptancePreviewUrl01` / human-readable title.
6. Run targeted verification:
   - `pnpm test -- src/adv-skill-backed-commands-assets.test.ts`
   - If formatting changes touch markdown/json width, run `pnpm run format:check` or `pnpm run check` as planning/execution determines.

## LBP Analysis

Best long-term approach: spec + command + tests + contract matrix. This follows ADV's existing pattern for workflow laws and command-contract drift prevention. It avoids a fragile memory-only instruction and avoids a new tool/manager that would exceed the requested rule.

Contract-matrix alignment keeps preview proof close to existing acceptance proof. The command still emits a human-visible `Preview URL` line because the user's acceptance decision needs an actionable URL, not only internal matrix state.

## Affected Components

- `.adv/specs/advance-workflow/spec.json` — canonical requirement law.
- `docs/specs/advance-workflow.md` — human-readable spec mirror.
- `.opencode/command/adv-discover.md` — agreement-stage applicability declaration.
- `.opencode/command/adv-review.md` — acceptance-stage runtime workflow contract.
- `plugin/src/adv-skill-backed-commands-assets.test.ts` — drift/asset coverage for command/spec contract.
- Possibly `docs/adv-gates.md` if implementation wants gate docs to mention preview proof in Acceptance Gate overview.

## Risks / Mitigations

- Risk: Agents mark applicable visual work as `not_applicable` to avoid a blocker.
  - Mitigation: agreement must include `visual_surface` rationale; `/adv-review` treats implementation drift or uncertainty as blocking.
- Risk: Bare URLs satisfy text but are dead.
  - Mitigation: require reachability evidence shape.
- Risk: Non-front-end changes get blocked unnecessarily.
  - Mitigation: `visual_surface: false` plus `not_applicable` rationale remains valid.
- Risk: Duplicated authorities between contract matrix and command preflight drift.
  - Mitigation: matrix-backed proof is authoritative; command preflight is the user-facing enforcement wrapper.

## Design Leverage Scout

- Candidates considered: 5.
- Adopted:
  - Matrix-backed proof instead of free-floating summary-only evidence.
  - Deterministic/auditable applicability through agreement-level `visual_surface` declaration.
  - `blocked` requires reason and blocks acceptance.
  - Reachability evidence has a minimal structured shape.
- Rejected/deferred:
  - Dropping standalone `rq-acceptancePreviewUrl01`; rejected because the user requested a new acceptance-stage rule and a dedicated spec law is clearer.

## Validator Result

Validator verdict: CAUTION.

Cautions addressed in this revision:

- Durable carrier now explicit: `contract.reviewMatrix` plus generated acceptance projection; executive summary includes the proof in `What Was Verified`.
- Applicability trigger now explicit: approved agreement records `visual_surface: true|false|unknown` with rationale; uncertainty blocks acceptance.
- Command-side `Preview URL` line remains user-facing, but is backed by matrix evidence rather than separate authority.

Remaining concern: implementation must avoid hand-editing generated `acceptance.md`; use matrix/executive-summary paths only.