# Design

## Architecture Overview

Acceptance proof becomes structural workflow state, not a prompt-only convention.

Required acceptance proof for new contract-era changes:

1. `contract.reviewMatrix` — typed contract review state persisted through `contractReviewMatrixSetSignal`.
2. `acceptance.md` — generated from `ChangeContract` + `contract.reviewMatrix` at acceptance completion.
3. `executive-summary.md` — workflow-known required acceptance proof persisted before acceptance prompt and verified at gate completion.

Healthy path:

1. `/adv-review` builds and persists `contract.reviewMatrix`.
2. `/adv-review` composes and persists `executive-summary.md` through `adv_change_update executiveSummary`.
3. `adv_change_update` writes the artifact, computes server/tool-side content hash, then signals `updateArtifactMetadataSignal` with path, `updatedAt`, and `contentHash`.
4. `/adv-review` verifies executive summary content and workflow-visible metadata before asking for acceptance.
5. `adv_gate_complete acceptance` fires `gateCompletedSignal`.
6. Workflow readiness validates contract/matrix/executive-summary metadata, writes generated `acceptance.md`, inspects both `acceptance.md` and `executive-summary.md`, then marks acceptance done.

Recovery path:

- Completed/poisoned workflow repair requires recovery evidence, recovery rationale, and prior user approval evidence.
- Recovery reconstructs readiness from disk projection and typed contract state.
- Recovery validates matrix rows, executive summary freshness, and generated acceptance projection before disk-projecting repaired metadata/gate state.
- Chat approval alone is never durable acceptance when required proof failed to persist.

## Key Decisions

### Executive summary is acceptance proof

`executive-summary.md` becomes workflow-known required acceptance proof.

Rationale:

- User chose `Acceptance proof` during discovery.
- `/adv-review` already requires executive summary before acceptance prompt.
- Current workflow readiness does not know about it; this mismatch creates late-homework failure.

### Freshness is hash-based

`executive-summary.md` is workflow-visible only when workflow artifact metadata exists and inspected file hash matches metadata.

Rationale:

- `updateArtifactMetadataSignal` is the workflow visibility boundary.
- Disk-only writes after workflow closure are not authoritative unless explicitly recovered.
- Hash comparison prevents caller-forged artifact metadata.

### Recovery reuses existing authorization pattern

Add `saveRecoveredArtifactMetadata` using the same reason+evidence guard as `saveRecoveredGateCompletion` and `saveRecoveredChangeStatus`.

Rationale:

- `_recovery-writers.ts` already owns disk-projection recovery shape.
- Completed/poisoned classifiers already exist.
- Artifact metadata is the missing peer recovery writer.

### Gate recovery validates readiness

Acceptance recovery must validate proof before marking acceptance done. Compatibility rationale cannot bypass new contract-era required proof.

### `/adv-review` owns no-late-homework sequencing

Order is mandatory:

1. persist review matrix,
2. persist executive summary,
3. verify workflow visibility/freshness,
4. present acceptance prompt,
5. complete acceptance gate.

## ADR Drafts

None. Design composes existing ADV primitives; no separate ADR needed.

## Implementation Strategy

1. **Spec first**
   - Add `rq-acceptanceEvidenceTiming01`.
   - Add `rq-acceptanceRecovery01`.
   - Amend `rq-acceptanceProjection01`, `rq-gateArtifactEnforcement01`, and `rq-gateArtifactAudit01`.

2. **Artifact metadata plumbing**
   - Compute content hash for narrative artifact metadata, at least for `executiveSummary`.
   - Make `contentHash` required for `executiveSummary` metadata on new contract-era acceptance flows.
   - Reconcile artifact kind naming across `contracts.ts` (`executiveSummary`) and `activities.ts` (`executive-summary.md`) so `inspectArtifactActivity` or an equivalent storage-boundary inspector can hash executive summaries.

3. **Readiness enforcement**
   - Extend acceptance readiness to require `state.artifacts.executiveSummary`.
   - Add blockers for missing metadata, unreadable file, undersized content, and stale hash.
   - Keep existing contract/matrix row blockers.

4. **Healthy gate completion**
   - Validate matrix rows.
   - Inspect `executive-summary.md` and compare hash to workflow metadata.
   - Write and inspect generated `acceptance.md`.
   - Mark acceptance done only after both artifacts pass.
   - Store proof so audit consumers can see both `acceptance.md` and executive-summary proof. Prefer storing executive-summary proof under `change.artifacts` metadata rather than breaking the one-artifact gate evidence shape.

5. **Recovery support**
   - Add `saveRecoveredArtifactMetadata` to `_recovery-writers.ts`.
   - Extend `adv_change_update executiveSummary` with explicit recovery handling for completed/poisoned metadata signal failures after disk write.
   - Strengthen `adv_contract_review_matrix_set` terminal recovery so completed-workflow disk projection does not re-invoke workflow mutation paths.
   - Strengthen `adv_gate_complete acceptance` recovery to validate/recreate required evidence before disk-projecting gate done.

6. **Command contract update**
   - Update `/adv-review` to persist → verify → prompt → complete.
   - State that chat approval is not durable acceptance when required proof failed to persist.

7. **Tests**
   - Metadata hash signaling.
   - Missing/stale executive summary readiness blockers.
   - Healthy two-artifact acceptance proof.
   - Completed workflow recovery.
   - Poisoned workflow recovery.
   - Rejection without recovery evidence / approval evidence / rationale.
   - Workflow bundle guard remains free of `defineUpdate`.

## LBP Analysis

Preferred long-term approach:

- Structural correctness: typed contract, workflow state, hashes, deterministic blockers, recovery authorization.
- Existing architecture: signal/query workflow surface, artifact metadata signal, artifact inspection activity, readiness evaluator, recovery writers.
- Temporal-compatible: closed workflows cannot accept signals, so terminal repair must be explicit disk projection with audit.
- Minimal blast radius: acceptance proof semantics only; release/archive ordering stays out of scope.

## Affected Components

- `.adv/specs/advance-workflow/spec.json`
- `docs/specs/advance-workflow.md`
- `.opencode/command/adv-review.md`
- `plugin/src/storage/store-temporal/changes.ts`
- `plugin/src/tools/change.ts`
- `plugin/src/tools/contract.ts`
- `plugin/src/tools/gate.ts`
- `plugin/src/tools/_recovery-writers.ts`
- `plugin/src/temporal/activities.ts`
- `plugin/src/temporal/contracts.ts`
- `plugin/src/temporal/change-state.ts`
- `plugin/src/temporal/gate-readiness.ts`
- `plugin/src/temporal/workflows.ts`
- `plugin/src/types/gates.ts` or related evidence schemas if proof shape expands
- Adjacent tests

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Executive summary blocks too much | User explicitly chose acceptance-proof semantics; keep content checks deterministic, not subjective. |
| Recovery bypasses readiness | Reconstruct readiness and validate proof before disk projection. |
| Hash metadata absent on legacy changes | Block new contract-era flows; allow explicit compatibility only with rationale/evidence. |
| Gate evidence stores one artifact | Prefer storing executive-summary proof in `change.artifacts` metadata and keep gate evidence backward-compatible. |
| Recovery args broaden `adv_change_update` too much | Scope recovery to explicit executive-summary metadata repair unless separately justified. |

## Design Leverage Scout

- Candidates considered: 5.
- Auto-adopted: 5.
  - Hash freshness as deterministic blocker.
  - Atomic acceptance inspection for `acceptance.md` and `executive-summary.md`.
  - Matrix terminal recovery writer/path.
  - Executive-summary metadata recovery writer.
  - `/adv-review` persist → verify → prompt → complete ordering.
- Surfaced to user: 0 after discovery decisions resolved executive-summary semantics.
- Inconclusive/skipped: none.

## Validator Result

Validator: `VALIDATED`.

Cautions to carry into planning:

1. `ArtifactMetadata.contentHash` is optional today and metadata signal currently sends only `{ path, updatedAt }`; implementation must make hash server/tool-computed and required for `executiveSummary` on new contract-era acceptance.
2. Artifact kind enums diverge: `activities.ts` lacks executive-summary inspection while `contracts.ts` has `executiveSummary`; planning must reconcile this explicitly.
3. Gate evidence stores one artifact per gate; planning should prefer storing executive-summary proof under `change.artifacts` metadata over a breaking gate-evidence shape change.

No unresolved conflicts. No contract-compromise risk.