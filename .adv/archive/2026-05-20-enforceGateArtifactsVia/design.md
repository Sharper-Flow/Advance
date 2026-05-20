# Design

## Architecture Overview

Move artifact-backed gate correctness into the Temporal change workflow. Tools keep friendly preflight checks, but the workflow becomes the structural authority: `gateCompletedSignal` is handled by a guarded workflow path that verifies gate sequence, required artifacts, and acceptance proof before `applyGateCompletedToState` can mark a gate `done`.

Side effects stay outside workflow code. Artifact reads, hashes, and `acceptance.md` writes happen through Temporal activities. The workflow uses only deterministic state, activity results, schemas, and pure helper functions to decide whether a gate may advance.

Required artifact map:

| Gate | Required artifact/proof | Source of truth |
|---|---|---|
| proposal | `proposal.md` | approved proposal artifact; update `docs/adv-gates.md` to stop listing only `problem-statement.md` |
| discovery | `agreement.md` | approved agreement plus typed contract projection when present |
| design | `design.md` | design artifact |
| acceptance | generated `acceptance.md` | `ChangeContract.items` + `contract.reviewMatrix` |

Planning, execution, and release keep their existing structural checks. This change does not add markdown requirements to those gates.

## Key Decisions

### KD1 — Workflow owns gate readiness invariants

Add workflow-safe readiness helpers under `plugin/src/temporal/` that derive `GateReadinessBlocker[]` from `ChangeWorkflowState` plus activity inspection results. The signal handler must not call `applyGateCompletedToState` until blockers are empty.

Blocker classes:

- prior gates incomplete;
- artifact store unavailable for artifact-backed gate;
- required artifact missing, unreadable, blank, or below deterministic minimum content rules;
- discovery contract projection missing/drifting when agreement approval requires it;
- acceptance contract missing or review matrix incomplete for new contract-era changes;
- explicit compatibility branch used without a typed `compatibility_reason`.

### KD2 — Activities inspect artifacts; workflow decides

Extend `plugin/src/temporal/activities.ts` with `inspectArtifactActivity` and `acceptance` artifact support. The activity owns filesystem/path/hash work. The workflow owns policy: required kind per gate and deterministic minimum-size/coverage checks.

### KD3 — Gate completion audit records evidence

Extend gate completion records with optional artifact evidence: kind, path, content hash, content size, checked timestamp, and optional compatibility reason. Signal payload proof is never authoritative.

### KD4 — Acceptance projection is generated from typed proof

For acceptance gate completion, require `state.contract` and `state.contract.reviewMatrix` for new contract-era changes, require rows for verification-required contract items, render deterministic markdown, write `acceptance.md` via activity, record evidence, then mark acceptance done. Legacy/migration path requires explicit compatibility reason.

### KD5 — Strict new behavior; compatibility is explicit

Strict enforcement applies to all new gate-completion attempts. Already-completed gates are not reopened just because old artifact metadata is absent. Workflows without artifact storage or contract-era data may use compatibility only when a typed reason is recorded and tested.

### KD6 — Readiness blockers are deterministic and reusable

Expose the same readiness logic through tooling. `adv_gate_status` and failed `adv_gate_complete` should include stable blocker codes and remediation text.

## Alternatives Rejected

| Alternative | Why rejected |
|---|---|
| Tool-only artifact checks before firing `gateCompletedSignal` | Query/signal is not atomic and direct signals still bypass the tool. Useful for UX only, not correctness. |
| Validate artifacts only when artifact-update signals run | Artifacts may be edited multiple times before gate completion; completion-time validation proves current evidence. |
| Markdown `acceptance.md` as source of truth | It can drift from typed review proof. Typed contract/review state remains source; markdown is generated projection. |
| Reintroduce `defineUpdate` | Violates signal/query-only workflow surface and replay-safety constraints. |

## Implementation Strategy

1. Add core types/schemas for artifact evidence, readiness blockers, and acceptance artifact metadata.
2. Add artifact inspection/write activity support, including `acceptance.md`.
3. Add pure workflow readiness helpers under `plugin/src/temporal/`.
4. Replace direct `gateCompletedSignal` mutation with guarded async completion, async-safe error wrapping, serialized attempts, and state re-checks after awaits.
5. Generate `acceptance.md` from `ChangeContract` + `ContractReviewMatrix` immediately before acceptance completion.
6. Surface workflow blockers through gate tools and update command/docs contracts.
7. Add tests for missing, unreadable, undersized, valid, compatibility, sequence, missing contract/row, failing row, and generated projection cases.

## LBP Analysis

This is the long-term fit because Temporal owns gate state. A tool-only fix is not atomic and remains bypassable. A markdown-only fix makes artifacts authoritative even when typed workflow proof exists. The chosen design uses Temporal for invariants, activities for I/O, and typed contract/review state for acceptance proof.

Temporal TypeScript documentation supports async message handlers that execute activities and recommends `wf.allHandlersFinished` before workflow completion. This workflow already waits for `wf.allHandlersFinished`; implementation must add async-safe error normalization and serialized gate-completion handling.

## Affected Components

- `plugin/src/types/gates.ts`
- `plugin/src/types/signals.ts`
- `plugin/src/temporal/contracts.ts`
- `plugin/src/temporal/activities.ts`
- `plugin/src/temporal/workflows.ts`
- `plugin/src/temporal/change-state.ts`
- `plugin/src/tools/gate.ts`
- `plugin/src/storage/store-temporal/gates.ts`
- `.opencode/command/adv-prep.md`
- `.opencode/command/adv-review.md`
- `ADV_INSTRUCTIONS.md`
- `docs/adv-gates.md`
- `.adv/specs/advance-workflow`, `.adv/specs/adv-prep`, possibly `.adv/specs/adv-discover`

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Async signal handler errors poison workflow tasks | Async-safe wrapper + rejected-activity tests. |
| Concurrent gate signals interleave after activity awaits | Serialize attempts and re-check state after awaits. |
| Proposal artifact mismatch with existing docs | Design chooses `proposal.md`; docs update must mention `problem-statement.md` as supporting artifact, not sole gate artifact. |
| Missing contract blocks legacy acceptance unexpectedly | New changes block; compatibility branch requires typed reason and tests. |
| Workflow bundle imports unsafe modules | Keep helpers in `temporal/` or `types.ts`; run boundary tests. |
| Artifact validation becomes LLM scoring | Deterministic existence/readability/min-size/schema checks only. |
| Acceptance markdown drifts | Generate from typed state at acceptance completion. |

## Validator Result

Verdict: CAUTION.

Recorded cautions and resolutions:

1. Proposal artifact mismatch resolved by keeping `proposal.md` as required evidence and updating docs during implementation.
2. Missing contract for acceptance resolved by blocking new contract-era changes and requiring explicit compatibility for legacy/migration.
3. Tool-only/query-only alternative explicitly rejected because it is non-atomic and bypassable.
4. Implementation is ordered inside this change from core enforcement to projection/tool/docs/tests; no scope split is introduced because acceptance projection and blockers are approved AC.

No unresolved validator conflicts.