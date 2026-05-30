# Archive: Fix gate artifact readiness

**Change ID:** fixGateArtifactReadiness
**Archived:** 2026-05-28T22:31:18.749Z
**Created:** 2026-05-28T21:55:02.723Z

## Tasks Completed

- ✅ Prepare isolated worktree and baseline
  > Materialized branch change/fixGateArtifactReadiness at /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixGateArtifactReadiness from trunk 439910251bb55cfd8a4142eb49f085130cf628a3. Verified clean git status.
- ✅ RED tests for state-backed gate artifact evidence
  > Added unit tests for state-backed artifact evidence helper and projection-store relaxation. Added workflow regression proving agreement content/metadata in Temporal state with no disk agreement.md should allow discovery completion. RED run failed for expected reasons: helper missing, old artifact-store blocker still active for design, and discovery stays stuck from disk inspect path.
- ✅ Implement state-backed artifact evidence helper in gate-readiness.ts
  > Added `stateBackedArtifactEvidence` in gate-readiness.ts. It validates `state.documents[kind]`, blocks missing/blank and undersized content, builds evidence from state metadata/path/hash when present, and omits content_hash when absent. Added shared `MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS = 20`. Relaxed artifact-store-unavailable blocker to apply only to acceptance. Gate-readiness tests pass.
- ✅ Patch workflow gate completion to use state-backed evidence for non-acceptance artifact gates
  > Added `STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH`. Proposal/discovery/design gate completion now uses `stateBackedArtifactEvidence` on patched path and avoids `inspectArtifactActivity`. Legacy branch remains for old histories; acceptance branch remains disk-projection based. Updated proposal artifact evidence test to use workflow-state proposal content and metadata. Targeted gate-readiness + workflow signal tests pass.
- ✅ Document recovery steps for existing stuck discovery gates
  > Added a temporal-recovery runbook section for stuck proposal/discovery/design gates after artifact disk writes were removed. It documents symptoms, deploy/restart/re-enter recovery procedure, explicit no-manual-disk-write guidance, and relationship to the toolbox per-project OpenCode wrapper work.
- ✅ Run targeted tests, replay determinism, bundle boundary, full test/check/build
  > Ran targeted tests covering gate readiness, workflow signal handlers, workflow bundle boundary, replay determinism, artifact signal invariant, and store-temporal changes (6 files, 64 tests). Ran full `pnpm test` (pass), `pnpm run check` (pass after formatting), `pnpm run build` (pass), and re-ran full `pnpm test` after formatting (pass).
- ✅ Complete critical agenda item and record recovery handoff
  > Marked ag-mgupBeWk complete with implementation evidence and recovery handoff notes. No filesystem changes for this bookkeeping task.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When a migration moves canonical artifact content into Temporal workflow state, all workflow-owned readiness checks must validate the same in-workflow source (`state.documents` + metadata) rather than legacy disk projections. Keep disk reads only on explicitly disk-backed recovery/projection paths, and guard command-sequence changes with `wf.patched` for replay safety.
