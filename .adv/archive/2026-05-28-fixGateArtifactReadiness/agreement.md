# Agreement — fixGateArtifactReadiness

## Objectives

1. Fix artifact-backed gate readiness so it validates the canonical Temporal state (`state.documents[kind]` + `state.artifacts[kind]`) instead of requiring active-disk artifact markdown files.
2. Preserve the no-disk-write invariant in `store-temporal/changes.ts` for artifact content.
3. Preserve existing disk-backed behavior where disk is still intentionally part of the contract (acceptance projection, archive bundle, recovery-only disk artifacts).
4. Provide a safe recovery/retry path for existing stuck discovery gates after the code fix is deployed.

## Acceptance Criteria

1. **AC1.** Proposal/discovery/design artifact-backed gate completion uses workflow state as source of truth: `state.documents[kind]` supplies content; `state.artifacts[kind]` supplies path/metadata when present. The patched path no longer calls `inspectArtifactActivity` for these gates.
2. **AC2.** Missing `state.documents[kind]` still blocks deterministically with `ARTIFACT_MISSING` or equivalent typed blocker and actionable remediation.
3. **AC3.** Undersized `state.documents[kind]` blocks deterministically with `ARTIFACT_UNDERSIZED` or equivalent typed blocker.
4. **AC4.** Gate artifact evidence is built from workflow-state content and metadata: `{ kind, path, content_hash, non_whitespace_chars, checked_at }`. `path` and `content_hash` are populated from `state.artifacts[kind]` when present. If metadata `contentHash` is absent, `content_hash` is omitted (schema-valid). The workflow does NOT recompute SHA-256 or block on workflow-side hash mismatch; tool-side ordered content+metadata signals own SHA-256 computation.
5. **AC5.** Regression test proves an agreement signaled only into workflow state (no disk `agreement.md`) allows discovery gate completion and stores artifact evidence.
6. **AC6.** Regression tests prove missing and undersized state documents still block gate completion.
7. **AC7.** No artifact-content disk writes are reintroduced into `plugin/src/storage/store-temporal/changes.ts`; existing no-disk-write tests/invariants continue passing.
8. **AC8.** Existing acceptance behavior remains compatible: generated `acceptance.md` projection and executive-summary freshness checks continue to work, and acceptance/release recovery semantics are not weakened.
9. **AC9.** Recovery guidance exists for already-stuck discovery gates (e.g. PokeEdge-web `fixSubDollarLabels`): after local deploy + OpenCode restart, re-enter/retry discovery without manually writing disk artifacts.
10. **AC10.** `pnpm test`, `pnpm run check`, and `pnpm run build` pass.

## Constraints

1. **C1. No disk write rollback.** Do not call or reintroduce legacy artifact-content disk writes from `store-temporal/changes.ts`. Lines 642-646 are intentional and must remain true.
2. **C2. Workflow bundle safety.** New readiness helper must live in workflow-safe code only (`plugin/src/temporal/**` or inline in `workflows.ts`) and must not import `node:*`, storage, tools, filesystem, or activity-only modules.
3. **C3. Replay safety.** Changes must be deterministic over existing workflow state. Use a Temporal patch marker for command-sequence changes so old histories replay the legacy disk-read branch while new attempts use the state-backed branch. Replay-determinism tests must pass.
4. **C4. Narrow recovery.** Recovery guidance should unblock existing stuck discovery gates by retrying/re-entering gate state after deployment; it must not introduce broad manual disk surgery or poisoned-history bypasses for proposal/discovery/design gates.
5. **C5. Scope discipline.** Do not fix unrelated PokeEdge application code, stale active changes, worktree cleanup, or other agenda items in this change.

## Avoidances

1. **A1.** Do not treat disk artifact files as canonical for proposal/discovery/design gate readiness on the patched path.
2. **A2.** Do not weaken artifact readiness by accepting blank/missing/undersized state documents.
3. **A3.** Do not store raw duplicate artifact content in new metadata fields; use existing `state.documents` content and `state.artifacts` metadata.
4. **A4.** Do not move readiness logic into tool-layer code; gate completion must remain workflow-owned and queryable.
5. **A5.** Do not make `inspectArtifactActivity` unused globally if acceptance/recovery paths still require it.

## Out of Scope

1. Rewriting artifact update APIs or archive bundle materialization.
2. Migrating project-level state (agenda, wisdom, conformance, roadmap) to Temporal.
3. PokeEdge/PokeEdge-web app repository changes.
4. Manually editing stuck change state outside ADV tools.

## Evidence Already Collected

- `store-temporal/changes.ts:642-646`: disk content writes intentionally forbidden.
- `store-temporal/changes.ts:90-106`: content signal then metadata signal populate Temporal state.
- `change-state.ts:372-384`: content applied into `state.documents[kind]`; metadata lives in `state.artifacts[kind]`.
- `workflows.ts:862-902`: current gate completion still reads disk via `inspectArtifactActivity`.
- `change.ts:91-139`: tool-layer artifact reads already prefer Temporal `state.documents[kind]`, proving the intended source-of-truth direction.
- `types/gates.ts:109-118`: `GateArtifactEvidence.content_hash` is optional.

## Validation Plan

1. RED: add test for agreement content in workflow state with no disk file; discovery gate should succeed but currently fails.
2. RED/GREEN: add missing and undersized state-document blocker tests.
3. Implement workflow-safe evidence helper and replace patched proposal/discovery/design artifact path.
4. Verify acceptance projection/executive-summary behavior still passes.
5. Run replay-determinism and workflow-bundle-boundary tests.
6. Run full `pnpm test`, `pnpm run check`, `pnpm run build`.
7. Document exact operator recovery steps for PokeEdge stuck gates.