# Design — fixGateArtifactReadiness

## Validator Result

Validator: `adv-researcher` (`ses_18f64058effepleWL6kYkYAn5Z`)
Verdict: **VALIDATED**

Key sources cited:
- Temporal TypeScript workflow versioning / `wf.patched(...)`
- In-repo `DISCOVERY_CONTRACT_READINESS_PATCH` and `ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH` precedent
- `plugin/src/types/gates.ts:109-118` — `GateArtifactEvidence.content_hash` is optional
- `plugin/src/storage/store-temporal/changes.ts:39, 90-106, 642-646` — tool-side SHA-256 metadata and no disk writes
- `plugin/src/temporal/workflow-start.ts` + `hydrate-documents.ts` — cold-start document hydration
- `plugin/src/temporal/workflow-bundle-boundary.test.ts` — workflow code import boundary

## Contract Amendment Needed

Agreement AC4 currently says workflow state evidence should verify metadata `contentHash` matches state document and block on mismatch.

Validator finding: **do not recompute SHA-256 in workflow code.**

Reasons:
- Existing SHA-256 is computed tool-side in `store-temporal/changes.ts:39` and sent via `updateArtifactMetadataSignal` after the content signal.
- Workflow bundle must not import `node:crypto`.
- Implementing pure-JS SHA-256 inside workflow adds unnecessary risk and scope.
- `GateArtifactEvidenceSchema` makes `content_hash` optional.

Design amendment:
- For proposal/discovery/design state-backed evidence:
  - use `state.artifacts[kind].contentHash` when present (trusted tool-side metadata)
  - omit `content_hash` when metadata hash is absent
  - do not workflow-recompute SHA-256 and do not block on hash mismatch inside workflow
- Keep existing tests/invariants that content signal precedes metadata signal and metadata carries tool-side SHA-256.

This amends AC4 to remove workflow-side hash verification/blocking.

## Key Decisions

### KD-1 — State-backed evidence helper lives in `gate-readiness.ts`

Add a pure workflow-safe helper in `plugin/src/temporal/gate-readiness.ts`:

```ts
export function stateBackedArtifactEvidence(
  state: ChangeWorkflowState,
  gateId: GateId,
  artifactKind: GateArtifactKind,
  checkedAt: string,
): GateReadinessResult
```

Behavior:
- Reads `state.documents[artifactKind]`.
- Missing/blank document → typed blocker (`ARTIFACT_MISSING`).
- Non-whitespace count below minimum → typed blocker (`ARTIFACT_UNDERSIZED`).
- Builds evidence:
  - `kind`
  - `path: state.artifacts[artifactKind]?.path` when present
  - `content_hash: state.artifacts[artifactKind]?.contentHash` when present
  - `non_whitespace_chars`
  - `checked_at`

Why `gate-readiness.ts`:
- Already workflow-reachable and pure.
- Keeps readiness laws near `ARTIFACT_BACKED_GATES` and blockers.
- Usable by workflow tests and future recovery helpers without tool/storage imports.

### KD-2 — Patch-marker branch for replay safety

Add marker:

```ts
const STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH = "state-backed-gate-artifact-proof-v1";
```

In `completeGateWithReadiness`:

```ts
if (
  artifactKind &&
  artifactKind !== "acceptance" &&
  wf.patched(STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH)
) {
  const stateEvidence = stateBackedArtifactEvidence(..., workflowNow());
  if (!stateEvidence.ready) markGateStuckForBlockers(...);
  artifactEvidence = stateEvidence.evidence;
} else {
  // legacy inspectArtifactActivity path for old histories + acceptance
}
```

Rationale:
- Old committed histories may include `inspectArtifactActivity` scheduling.
- Removing that schedule unguarded creates nondeterminism.
- `wf.patched` lets old histories replay the false/legacy branch while new attempts use the true/state-backed branch.

### KD-3 — Relax projection store requirement for proposal/discovery/design

Current `evaluateGateReadiness` blocks all artifact-backed gates when `!state.projectionChangesDir`.

Change:
- only `acceptance` requires projection store, because acceptance intentionally writes generated `acceptance.md` projection and recovery disk artifacts.
- proposal/discovery/design no longer require disk/projection store.

### KD-4 — Acceptance untouched

Keep existing acceptance behavior:
- generated `acceptance.md` projection through `writeArtifactActivity`
- executive summary disk freshness check where acceptance/recovery semantics require it
- release/archive paths unchanged

### KD-5 — Recovery for stuck PokeEdge gates is operational, not manual disk surgery

After this change ships:
1. `pnpm run build`
2. `./scripts/deploy-local.sh --fix`
3. restart OpenCode sessions for affected projects (PokeEdge/PokeEdge-web)
4. re-enter/retry the stuck discovery gate, e.g. `adv_change_reenter fromGate: "discovery"` then complete discovery again
5. do not write `agreement.md` manually

`addPerProjectOcWrapper` in `~/toolbox` is independent. It improves per-project XDG/process isolation and may make the deploy/restart step cleaner, but it does not fix this gate-readiness bug.

## Tests

### RED/GREEN unit tests (`gate-readiness.test.ts`)

Add tests for `stateBackedArtifactEvidence`:
- missing state document → blocker
- undersized state document → blocker
- valid document + metadata → evidence with path/hash/count
- valid document without metadata hash → evidence without `content_hash`
- projectionChangesDir absence does not block proposal/discovery/design but still blocks acceptance

### RED/GREEN workflow test (`workflows.signal-handlers.test.ts`)

Add integration-style test:
- start workflow with `projectionChangesDir`
- signal agreement content + metadata into state only
- do not create disk `agreement.md`
- complete proposal then discovery gate
- assert discovery is `done`
- assert discovery artifact evidence has kind `agreement`, non-whitespace count, and metadata path/hash when supplied
- assert `inspectArtifactActivity` was not needed for discovery on patched path

### Replay tests

- Existing replay fixture must still pass, proving legacy disk-read branch is preserved for old histories.
- `workflow-bundle-boundary.test.ts` must pass, proving helper stays workflow-safe.

## Implementation Steps

1. Add `stateBackedArtifactEvidence` helper and tests.
2. Relax projection-store blocker for proposal/discovery/design in `evaluateGateReadiness`.
3. Add `STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH` and branch workflow artifact-backed gate completion:
   - state-backed path for non-acceptance artifact gates when patch is true
   - existing disk path for legacy false branch and acceptance
4. Add no-disk agreement workflow regression.
5. Add/update recovery docs or command notes for stuck PokeEdge discovery gates.
6. Run targeted tests, replay determinism, bundle boundary, full test/check/build.

## Risks

- **R1 Replay nondeterminism:** mitigated by `wf.patched` marker and replay test.
- **R2 Missing proposal documents in existing workflows:** mitigated by cold-start hydration plus state-backed write path; if missing, deterministic blocker remains.
- **R3 Trusting metadata hash:** accepted because tool-side ordered content+metadata signals own SHA-256; `content_hash` optional in schema; workflow SHA adds more risk than value.
- **R4 Acceptance regression:** mitigated by leaving acceptance disk projection path untouched and running existing acceptance tests.
