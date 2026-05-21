# Design

## Architecture Overview

Refactor ADV runtime prompt assembly around one explicit source of truth for the selectable `adv` runtime agent:

1. `.opencode/agents/adv.md` becomes the complete lean runtime prompt.
2. `ADV_INSTRUCTIONS.md` remains the full developer/reference protocol, but is no longer appended wholesale into global `~/.config/opencode/agents/adv.md`.
3. `scripts/deploy-local.sh` syncs the lean canonical agent atomically and continues to remove stale provider-agent artifacts and stale global `ADV_INSTRUCTIONS.md` instruction registrations.
4. Runtime provider/status/worktree/active-change additions remain dynamic and continue to append to `output.system[0]` through `plugin/src/utils/system-block.ts`.
5. A committed protocol coverage inventory proves every removed or compressed runtime section is retained, code/spec/command-enforced, or reference-only.

The correctness mechanism is structural: specs + asset tests + coverage inventory + generated prompt-size reporting. Prompt-size reduction is an outcome, not the authority for correctness.

## Key Decisions

### D1 — Lean runtime agent is canonical `adv.md`, not generated from `ADV_INSTRUCTIONS.md`

`sync_adv_runtime_agent` should copy/write the repository `.opencode/agents/adv.md` as the runtime prompt. It should not read `ADV_INSTRUCTIONS.md` as a prompt payload and should not concatenate `canonical_text + instructions_text`.

Rationale:
- Avoids duplicate runtime protocol load.
- Keeps one visible source to edit for runtime behavior.
- Preserves `ADV_INSTRUCTIONS.md` as the deeper repo/dev reference.
- Avoids hand-editing installed globals.

Implementation note: keep `ADV_INSTRUCTION_PATH` only for config cleanup/checks that remove stale global `instructions[]` entries, not for runtime prompt assembly.

### D2 — Coverage inventory gates safe deletion/compression

Add a committed inventory such as `docs/adv-runtime-protocol-coverage.md` with rows for each removed or compressed `ADV_INSTRUCTIONS.md` section:

| Field | Meaning |
|---|---|
| Source section | `ADV_INSTRUCTIONS.md` heading or line range |
| Runtime outcome | retained / compressed / command-owned / spec-owned / code-enforced / reference-only |
| Runtime anchor | exact `adv.md` heading, command file, spec requirement, code path, or doc path |
| Must-preserve tokens | exact phrases/invariants that must remain searchable/testable |
| Evidence | test/spec/check that proves coverage |
| Status | planned / implemented / verified |

This inventory is a change artifact and an audit trail. Durable rules belong in `advance-meta` spec requirements and tests, not in an unbounded manually-maintained table after archive.

Clarification: this coverage inventory is separate from `docs/prose-load-inventory.md` / `rq-proseReduction03`. It does not replace the prose-reduction inventory column contract; it records runtime-protocol preservation for this prompt-assembly change.

### D3 — Runtime-critical protocol stays in `adv.md`

Conservatively retain runtime text for agent-owned behavior that is not fully machine-enforced:

- slash-command boundary and inline workflow-contract execution
- gate machine and human checkpoint semantics
- command-as-approval rules
- sign-off/archive boundary
- due-diligence routing for unknown capability questions
- ADV state access policy
- context/delegation/sub-agent policy
- output handoff voice
- worktree isolation routing
- completion/TDD evidence expectations

Where code owns part of a rule, compress to pointer + constraint table instead of long explanation.

### D4 — Spec law changes before implementation is considered complete

Update `advance-meta` JSON and mirrored docs so they no longer require:

- `Global adv.md contains the canonical ADV body and ADV_INSTRUCTIONS.md protocol content`
- `The effective static prompt order is canonical ADV body, then ADV_INSTRUCTIONS.md body`

Replacement law should require:

- one complete lean `adv.md` runtime agent;
- no full `ADV_INSTRUCTIONS.md` wholesale append;
- coverage-controlled protocol preservation;
- provider hints injected only through `output.system[0]`;
- prompt-size metrics that distinguish lean runtime, full reference protocol, dynamic ADV additions, provider hint, and caveman allowance.

Planning must draft explicit replacement `then` clauses for `rq-scopedAdvInstructions01.1`, `rq-providerAdvSkinny01.1`, and `rq-providerAdvMetrics01.1` before implementation begins.

### D5 — Prompt metrics report planes, not pass/fail token caps

Update `scripts/provider-eval.ts` and tests/docs from the current `adv_protocol_instructions` model to coverage-first planes:

- `lean_adv_runtime_prompt`
- `adv_reference_protocol`
- `provider_hint`
- `adv_dynamic_system_block_estimate`
- `caveman_voice_contract_allowance`
- `selected_agent_runtime_prompt`
- `avoided_provider_variant_duplication`

No hard cap gates correctness. Tests should ensure metrics are present and that unsafe full concatenation is not reintroduced.

## ADR Drafts

No ADR required. The decision is important but not hard-to-reverse after this change: `deploy-local.sh` and spec/test contracts can be amended in a follow-up if runtime prompt composition needs another shape.

## Implementation Strategy

1. **Add RED tests for current drift**
   - In `plugin/src/overlay-sync-assets.test.ts`, change the temp-HOME sync test to assert generated global `adv.md` is lean and not a full `ADV_INSTRUCTIONS.md` append.
   - In `plugin/src/deploy-local.test.ts`, assert `sync_adv_runtime_agent` does not use `instructions_text` / concatenated write for `adv.md` assembly.
   - Add tests that required runtime invariants appear in `.opencode/agents/adv.md` and coverage inventory rows exist for removed/compressed sections.
   - Add spec/doc drift assertions for the updated `advance-meta` requirements.

2. **Update spec law and docs**
   - Edit `.adv/specs/advance-meta/spec.json` and `docs/specs/advance-meta.md` for `rq-providerAdvSkinny01`, `rq-scopedAdvInstructions01`, and `rq-providerAdvMetrics01`.
   - Add `rq-runtimeProtocolCoverage01` or fold equivalent scenarios into the provider/prose-reduction requirements.
   - Update `docs/provider-agent-assembly.md`, `docs/provider-adv-smoke-checklist.md`, `AGENTS.md`, and the provider-runtime note in `ADV_INSTRUCTIONS.md`.

3. **Create coverage inventory**
   - Add `docs/adv-runtime-protocol-coverage.md`.
   - Classify all removed/compressed `ADV_INSTRUCTIONS.md` runtime sections.
   - Mark non-duplicated/runtime-critical sections as retained unless replacement enforcement is explicit.

4. **Refactor sync assembly**
   - Change `sync_adv_runtime_agent` to write the canonical lean `adv.md` only.
   - Use temp-file + `mv` for atomic replacement where practical.
   - Keep stale provider cleanup and stale global instruction cleanup unchanged.
   - Ensure `--check` reports deterministic drift and `--fix` is idempotent.

5. **Update prompt metrics**
   - Replace embedded-instructions metric naming with lean/reference/dynamic/caveman planes.
   - Keep provider hint constants independent of static runtime prompt assembly.

6. **Verify**
   - Focused tests: `pnpm test -- src/overlay-sync-assets.test.ts src/deploy-local.test.ts` from `plugin/`.
   - `pnpm run check` from `plugin/`.
   - `pnpm run build` if runtime/tool behavior changed.
   - `scripts/deploy-local.sh --check` from repo root.
   - Optional local deploy dry/fix in temp HOME; restarted OpenCode smoke is not required but restart implications must be documented.

## LBP Analysis

The best long-term design is to separate runtime prompt authority from reference documentation. The runtime agent should carry only the instructions it needs to act safely in-session; full protocol reference stays in `ADV_INSTRUCTIONS.md` and command/spec files. Correctness is then enforced structurally by coverage inventory, spec law, and tests rather than by hoping a large appended reference is read correctly.

This follows existing repo patterns:
- `docs/prose-load-inventory.md` already uses section classification for prose reduction.
- `docs/change-contract-traceability-prep.md` argues for stable IDs and coverage proof to prevent context loss.
- Provider convergence already established single selectable `adv` plus dynamic provider hints.

## Affected Components

- `scripts/deploy-local.sh` — runtime agent assembly and idempotent sync behavior.
- `.opencode/agents/adv.md` — lean self-contained runtime protocol.
- `ADV_INSTRUCTIONS.md` — provider runtime note and reference/runtime boundary wording.
- `AGENTS.md` — developer quick-reference for assembly behavior.
- `docs/provider-agent-assembly.md` and `docs/provider-adv-smoke-checklist.md` — architecture docs/smoke expectations.
- `.adv/specs/advance-meta/spec.json` and `docs/specs/advance-meta.md` — spec law and mirror docs.
- `plugin/src/overlay-sync-assets.test.ts` and `plugin/src/deploy-local.test.ts` — sync/asset drift tests.
- `scripts/provider-eval.ts` and its tests/docs expectations — prompt-size reporting planes.
- New `docs/adv-runtime-protocol-coverage.md` — coverage inventory.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Accidentally removing runtime-critical protocol | Coverage inventory + invariant tests; conservative retention for non-enforced rules |
| Reintroducing full append later | Tests assert no concatenated `ADV_INSTRUCTIONS.md` payload in `sync_adv_runtime_agent` |
| Spec/docs drift | Update JSON spec, mirrored docs, and add drift assertions |
| Prompt-size win becomes correctness proxy | Metrics are reporting-only; coverage and tests own correctness |
| Provider/caveman system-block regression | Keep `plugin/src/utils/system-block.ts` unchanged except tests/docs if needed; verify `output.system[0]` append invariant |
| Installed global `adv.md` invalid during sync | Write temp file then atomic `mv`; keep `--check` deterministic |

## Contract Fit

This design satisfies the approved agreement without compromising constraints:

- No lifecycle redesign.
- No provider-specific selectable agents.
- No global `ADV_INSTRUCTIONS.md` registration.
- No caveman behavior changes.
- No hand-edited global files.
- No hard prompt-size cap that would force unsafe trimming.

## Validator Result

DESIGN_VALIDATION:
  verdict: CAUTION
  findings:
    - dimension: 1
      level: info
      summary: The design correctly identifies the concatenation root cause and proposes a sound fix.
      detail: `scripts/deploy-local.sh` currently concatenates `canonical_text + instructions_text`; D1 directly addresses that root cause.
    - dimension: 1
      level: caution
      summary: Spec-law amendment scope needs explicit replacement then-clauses before planning.
      detail: `rq-scopedAdvInstructions01.1`, `rq-providerAdvSkinny01.1`, and `rq-providerAdvMetrics01.1` contain language tied to whole `ADV_INSTRUCTIONS.md` inclusion / old metrics. Design D4 now records this as a planning requirement.
    - dimension: 2
      level: info
      summary: No materially simpler approach achieves the same safety guarantees.
      detail: Alternatives evaluated by validator—keep concatenation with dedupe, use ADV_INSTRUCTIONS-only, or template-generate adv.md—are weaker or more complex.
    - dimension: 3
      level: caution
      summary: D2 coverage inventory must be kept separate from `rq-proseReduction03` prose-load inventory.
      detail: Design D2 now clarifies this distinction.
    - dimension: 4
      level: info
      summary: No significant viable alternative was overlooked.
      detail: Existing `output.system[0]` dynamic hint path is preserved.
  recommendation: Proceed. Cautions are planning-stage refinements and do not block the design gate.