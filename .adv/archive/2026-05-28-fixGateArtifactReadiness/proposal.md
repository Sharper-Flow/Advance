# Fix gate artifact readiness source

## Problem

After `removePositionalArtifactApi`, artifact content is intentionally stored in Temporal workflow state (`state.documents[kind]`) and metadata is stored in `state.artifacts[kind]`. The Temporal store no longer writes active artifact markdown files to disk:

- `plugin/src/storage/store-temporal/changes.ts:642-646` explicitly forbids artifact-content disk writes.
- Content signals populate `state.documents[kind]` (`changes.ts:662-665`).
- `plugin/src/temporal/change-state.ts:372-384` applies content into `state.documents[kind]` and metadata into `state.artifacts[kind]`.

But gate completion still validates artifact-backed gates by reading disk through `inspectArtifactActivity`:

- `plugin/src/temporal/workflows.ts:862-902` validates required gate artifacts with `inspectArtifactActivity(...)`.
- `inspectArtifactActivity` reads `changesDir/changeId/{artifact}.md` from disk.

Result: an agreement can exist in workflow state while `agreement.md` is absent on disk. Discovery gate then gets stuck with `ARTIFACT_MISSING`, even though the canonical Temporal state has the artifact.

This matches the PokeEdge/PokeEdge-web report: stuck discovery gates such as `fixSubDollarLabels` after agreement content exists in workflow state.

## Scope

In scope:

- `plugin/src/temporal/workflows.ts` gate artifact evidence/readiness path
- workflow-safe helper logic colocated under `plugin/src/temporal/` if needed
- Temporal workflow tests under `plugin/src/temporal/*.test.ts`
- gate/tool tests only if needed to prove `adv_gate_complete discovery` succeeds with state-backed artifacts
- minimal docs/changelog note if behavior needs operator explanation
- recovery guidance for existing stuck discovery gates after deploy/restart

Out of scope:

- reintroducing active artifact `.md` writes in `plugin/src/storage/store-temporal/changes.ts`
- changing archive-bundle materialization
- broad artifact API refactors
- PokeEdge application code changes
- cleanup of unrelated active changes/worktrees

## Goal

Gate readiness for artifact-backed gates must validate the same canonical source that artifact writes use: `state.documents[kind]` + `state.artifacts[kind]`, not active-disk artifact files.

## Proposed Fix

1. Add a workflow-safe artifact evidence builder in `plugin/src/temporal/workflows.ts` or a workflow-safe helper module:
   - input: `state`, `kind`, `checkedAt`
   - reads `state.documents[kind]` and `state.artifacts[kind]`
   - computes non-whitespace char count from workflow-state content
   - compares computed content hash with `state.artifacts[kind].contentHash` when present
   - returns `GateArtifactEvidence` or typed blocker details

2. Replace artifact-backed gate completion at `workflows.ts:862-902` with the state-backed evidence builder.

3. Preserve special acceptance handling where it intentionally writes/generated `acceptance.md` projection and checks `executiveSummary` freshness. Adjust only where the source-of-truth must become `state.documents` instead of disk.

4. Add regression test:
   - signal agreement content into workflow state only (no disk `agreement.md` file)
   - complete discovery gate
   - assert gate completion succeeds and artifact evidence is populated from state
   - assert no artifact-content disk write is required

5. Add recovery path or operational guidance for existing stuck discovery changes like PokeEdge-web `fixSubDollarLabels`:
   - after code fix + local deploy + OpenCode restart, retry discovery gate
   - if stuck gate blocker remains in workflow state, provide a safe re-entry/retry path that does not require disk artifact writes

## Success Criteria

- [ ] Discovery/design/proposal artifact-backed gates validate using `state.documents[kind]` + `state.artifacts[kind]`, not disk artifact files.
- [ ] Missing `state.documents[kind]` still blocks with deterministic `ARTIFACT_MISSING`/equivalent blocker.
- [ ] Undersized state document still blocks with deterministic `ARTIFACT_UNDERSIZED` blocker.
- [ ] Stale/missing metadata hash is handled deterministically: either recompute evidence from content when metadata is absent, or block with actionable `ARTIFACT_HASH_STALE` when metadata conflicts.
- [ ] Existing disk-backed compatibility paths that are still intentionally disk-based (acceptance projection, archive bundle, recovery-only paths) are not regressed.
- [ ] Regression test proves agreement content in workflow state with no disk `agreement.md` allows discovery gate completion.
- [ ] No artifact-content disk writes are reintroduced into `store-temporal/changes.ts`.
- [ ] `pnpm test`, `pnpm run check`, and `pnpm run build` pass.

## Constraints

- Do not reintroduce active artifact `.md` writes in `store-temporal/changes.ts`; source comments/tests explicitly forbid that path.
- Workflow code must stay workflow-bundle-safe: no `node:*`, storage, tool, or filesystem imports from workflow code.
- Preserve replay safety: helper is deterministic over existing state; no nondeterministic new activity scheduling for old histories unless gated by existing command flow.
- Keep acceptance/release recovery semantics intact.

## Immediate Recovery Target

After shipping, use the fix to retry the stuck PokeEdge/PokeEdge-web discovery gate (`fixSubDollarLabels`) after local deploy + OpenCode restart. If workflow state still has a stuck blocker, use re-entry/retry rather than writing disk artifacts manually.