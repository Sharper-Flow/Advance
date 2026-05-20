## Problem

ADV gate completion is not structurally enforced for artifact-backed gates. Agents can mark discovery, design, or acceptance complete without durable agreement/design/acceptance evidence because gate checks currently rely on tool/orchestrator convention more than the Temporal workflow gate state machine.

## Why Now

Gate completion is the trust boundary for downstream autonomous work. Structural enforcement belongs in the workflow that owns gate state, not only in agent instructions.

## Scope

### In Scope

- Enforce gate transition preconditions in the Temporal change workflow before applying `gateCompletedSignal`.
- Require gate artifacts: proposal → `proposal.md`, discovery → `agreement.md`, design → `design.md`, acceptance → generated `acceptance.md` projection from typed contract/review state.
- Use Temporal-safe activity/tool boundaries for artifact reads and metadata checks.
- Add structured readiness blockers for prior gates and required artifacts.
- Extend gate completion audit with artifact metadata or explicit compatibility rationale.
- Update command/docs contracts so planning and acceptance checkpoints surface relevant artifact excerpts.
- Add tests for missing, undersized, valid, compatibility, and sequence cases.
- Apply strict enforcement for new behavior; compatibility only where needed for replay/migration safety.

### Out of Scope

- Session-to-workflow binding.
- Compensation or rollback workflows for already-completed gates.
- LLM quality scoring for artifact content.
- Changing the seven-gate model or human checkpoint taxonomy.
- Phantom sub-agent cleanup itself.
- Replacing unrelated tool-layer validation unless directly needed for artifact enforcement.

### Must Not

- Must not rely on agent prose or command docs as the sole authority for gate correctness.
- Must not perform filesystem I/O directly inside Temporal workflow code.
- Must not reintroduce `defineUpdate` on the change workflow surface.
- Must not bypass planning HITL enforcement.
- Must not allow old/mid-flight bypasses without explicit compatibility rationale.

## Success Criteria

1. Missing required gate artifacts block gate completion at workflow level.
2. Enforcement is strict for new behavior, with explicit compatibility only where needed for replay/migration safety.
3. Artifact checks use activities/tooling, not direct workflow filesystem I/O.
4. Acceptance proof uses typed contract/review state as source, with generated `acceptance.md` as durable artifact projection.
5. Readiness blockers are deterministic and expose missing prior gates/artifacts.
6. Tests cover missing, undersized, valid, compatibility, and sequence cases.

## Affected Code

- `plugin/src/tools/gate.ts`
- `plugin/src/temporal/workflows.ts`
- `plugin/src/temporal/change-state.ts`
- `plugin/src/types/signals.ts`
- `plugin/src/temporal/activities.ts`
- `plugin/src/temporal/contracts.ts`
- `plugin/src/types/gates.ts`
- `plugin/src/storage/store-temporal/gates.ts`
- `.opencode/command/adv-prep.md`
- `.opencode/command/adv-review.md`
- `ADV_INSTRUCTIONS.md`
- `docs/adv-gates.md`
- `.adv/specs/advance-workflow`, `.adv/specs/adv-prep`, possibly `.adv/specs/adv-discover`

## Discovery Findings

### Current State

- `plugin/src/tools/gate.ts` performs tool-side checks, then fires `gateCompletedSignal`.
- `plugin/src/temporal/workflows.ts` handles `gateCompletedSignal` by calling `applyGateCompletedToState` with no artifact preconditions.
- `plugin/src/temporal/change-state.ts` marks the gate `done` directly from payload fields.
- `plugin/src/temporal/activities.ts` already has side-effecting artifact read/write activities for proposal, problem-statement, agreement, and design.
- `plugin/src/temporal/contracts.ts` tracks artifact metadata and typed `ChangeContract`, but current artifact/gate audit does not cover acceptance projection proof.

### Edge Cases

| Gap | Edge cases / failure modes |
|---|---|
| Missing required artifact | Direct signal fired; artifact never written. Artifact metadata exists but file was deleted or unreadable. |
| Weak artifact | Placeholder scaffold exists. Blank or whitespace-only markdown exists. |
| Sequence/readiness | Prior gate incomplete but direct signal arrives. Tool cache was stale when completion was attempted. |
| Acceptance projection | Review matrix exists but no `acceptance.md`. Projection exists but matrix changed after generation. |
| Replay/migration | Older histories already completed gates without metadata. Legacy fixtures lack artifact directories. |

### Open Design Questions Resolved

| Question | Decision |
|---|---|
| Authoritative check | Workflow owns invariant; tools provide UX preflight only. |
| Artifact inspection | Use activities; no workflow filesystem I/O. |
| Artifact validity | Deterministic existence/readability/min-content/schema checks; no LLM scoring. |
| Old/in-flight changes | Strict for new completions; compatibility only with auditable typed rationale. |
| Acceptance artifact | Generate `acceptance.md` from typed contract/review state. |

### Draft Spec Deltas

- `advance-workflow/rq-gateArtifactEnforcement01` — artifact-backed gate completion is blocked when required evidence is missing/unreadable/blank/undersized.
- `advance-workflow/rq-gateReadiness01` — readiness reports deterministic blockers for missing prior gates/artifacts.
- `advance-workflow/rq-gateArtifactAudit01` — gate completion audit records artifact evidence or compatibility rationale.
- `advance-workflow/rq-acceptanceProjection01` — acceptance generates durable `acceptance.md` from typed contract/review state.
- `adv-prep/rq-prepArtifactExcerpt01` — prep approval surfaces proposal/agreement/design excerpts relevant to task synthesis.

### Conflict Scan

No blocking conflict found. Related archived change `addStructuralChangeContract` introduced typed contracts/review matrices; this change builds on those seams. Active `removePhantomSubAgent` was historical trigger only and is not authoritative context.

### LBP Check

Direction matches ADV and Temporal best practice: workflow-owned state transitions enforce invariants; side effects stay in activities; typed contract/review state remains source of truth.

### AMBIGUITY ANALYSIS

No blocking ambiguity findings.

Coverage: B:C F:C S:C M:C

## Agreement Summary

Agreement approved by user reply `approve` on 2026-05-20 and persisted in `agreement.md`. Acceptance criteria AC1–AC6 match the success criteria above. No deferred questions.