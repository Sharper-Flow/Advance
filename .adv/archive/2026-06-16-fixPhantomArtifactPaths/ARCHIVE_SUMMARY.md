# Archive: Fix phantom artifact paths

**Change ID:** fixPhantomArtifactPaths
**Archived:** 2026-06-16T00:22:24.659Z
**Created:** 2026-06-15T19:43:08.304Z

## Tasks Completed

- ✅ Add spec law and central artifact filename contract
  > Added spec-law requirements rq-artifactPathTruth01 and rq-subagentArtifactAccess01. Promoted ARTIFACT_FILENAME to the canonical types/artifacts module and replaced duplicated filename maps in change readback, Temporal activities, hydration, and temporal store changes. Added artifact filename unit coverage. Verified JSON validity and targeted artifact tests.
- ✅ Implement Temporal artifact metadata source model without fake paths
  > contracts.ts ArtifactMetadata: path optional, added source ("temporal"|"disk"|"archive"|"recovery") + readable. changes.ts fireContentSignalsSequentially fires metadata signal with source:temporal/readable:false, no path. change-state.ts seeds non-readable metadata + normalizes path:"" to unreadable. gate-readiness.ts readableArtifactPath helper gates path exposure on readable===true.
- ✅ Normalize artifact metadata in change readback and gate evidence
  > Task checkpoint completed
- ✅ Update ADV agent and command artifact access policies
  > Extended artifact-wide ADV state access policy across ADV worker agents, adding problem statement/agreement/design/executive-summary/acceptance/conformance coverage and explicit instructions to use packet inline content or adv_change_show include flags instead of artifacts.*.path unless readable:true. Added the missing ADV State Access Policy to adv-researcher. Updated adv-design, adv-research, and adv-refactor command packets to load artifact content through adv_change_show include fields and inject content inline for workers/validators. Added asset tests pinning the worker policy and command packet guidance, and updated subagent-reports spec asset expectations for rq-subagentArtifactAccess01.
- ✅ Run compatibility and contract verification sweep
  > Ran final compatibility sweep, review verification, and harden release-readiness checks. Fixed remaining formatting drift in hydrate-documents.ts caused by central ARTIFACT_FILENAME import change. Updated adv-skill-backed-commands asset expectation to match advance-workflow spec version 1.17.0 and require rq-artifactPathTruth01. After review remediation, confirmed targeted readback/gate/workflow tests pass, typecheck passes, smoke passes, and full suite passes. Harden remediation additionally normalized adv_gate_status gate artifact evidence using the shared readback normalizer, added gate tool regression coverage, updated temporal-recovery docs for optional path/source/readable metadata, and re-verified with targeted tests, typecheck, Prettier, final full suite, and merge dry-run.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When centralizing artifact filename maps in Advance, `types/artifacts.ts` is workflow-safe and already imported by workflow/tool/storage code. Add a unit test that asserts exact `ARTIFACT_FILENAME` keys/values before replacing duplicated maps; this catches drift without needing broader integration tests.
- **[pattern]** For artifact metadata, separate content authority from filesystem readability: workflow/state code should emit path only when metadata.readable === true, while tool-layer readback can additionally verify path existence before exposing it. This prevents phantom paths without blocking Temporal-only content access via include flags.
- **[gotcha]** Temporal-only artifact metadata can safely preserve legacy path-bearing state for replay, but every agent-facing read surface must re-validate readability before exposing paths. Snapshot/context builders need the same normalization as top-level tool output or phantom paths can leak through secondary surfaces.
