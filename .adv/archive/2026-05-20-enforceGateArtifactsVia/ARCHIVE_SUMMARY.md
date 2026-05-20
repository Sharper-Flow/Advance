# Archive: Enforce gate artifacts via Temporal workflow

**Change ID:** enforceGateArtifactsVia
**Archived:** 2026-05-20T18:39:12.942Z
**Created:** 2026-05-20T15:32:07.824Z

## Tasks Completed

- ✅ Add spec deltas for workflow-level gate artifact enforcement
  > Updated `.adv/specs/advance-workflow/spec.json` to v1.9.0 with rq-gateArtifactEnforcement01, rq-gateReadiness01, rq-gateArtifactAudit01, and rq-acceptanceProjection01. Updated `.adv/specs/adv-prep/spec.json` to v1.2.0 with rq-prepArtifactExcerpt01. Added citation comments in `docs/adv-gates.md` and `.opencode/command/adv-prep.md`. Verified JSON parsing and `pnpm test -- src/tools/spec.test.ts` passed.
- ✅ Add workflow-safe gate readiness and artifact evidence types
  > Added gate artifact kind/evidence and readiness blocker schemas/types in `plugin/src/types/gates.ts` and exports in `plugin/src/types/index.ts`. Added workflow-safe `plugin/src/temporal/gate-readiness.ts` with artifact-backed gate map, deterministic prior-gate blockers, artifact-store blockers, acceptance contract blockers, and explicit compatibility evidence. Added tests covering artifact map, prior gate blocker, missing artifact store, compatibility rationale, missing acceptance contract, and evidence parsing.
- ✅ Add artifact inspection and acceptance artifact activity support
  > Extended Temporal artifact activity support with `acceptance.md` in `ArtifactKind` and artifact filename map. Added `inspectArtifactActivity` that reads artifact content in activity context, returns path/contentHash/nonWhitespaceChars/checkedAt metadata, and structured missing/unreadable errors without returning content. Added tests for acceptance read/write support, valid metadata, blank metadata, and missing errors.
- ✅ Guard gateCompletedSignal with workflow-level artifact readiness
  > Changed `gateCompletedSignal` handling from direct synchronous mutation to guarded async workflow completion. The handler now serializes completion attempts, evaluates workflow-owned readiness, validates required artifacts via `inspectArtifactActivity`, marks gates stuck with deterministic blocker codes when readiness/artifacts fail, and records artifact evidence on success. Added async-safe handler rejection normalization and preserved projection/search-attribute updates. Carried `projectionChangesDir` into workflow state and made `lastSignalAt` monotonic for async signal ordering. Updated legacy tests to use explicit compatibility reasons where no artifact store is present and added direct-signal tests for missing artifact, valid artifact evidence, and prior-gate sequence blocking.
- ✅ Generate acceptance.md from typed contract review proof
  > Added renderAcceptanceProjection(state) in workflow-safe gate-readiness module, using ChangeContract.reviewMatrix as the source of truth. Acceptance gate completion now writes acceptance.md via writeArtifactActivity before inspecting the acceptance artifact and recording artifact evidence. Gate readiness now blocks required contract items with missing rows or unresolved statuses (fail/violated/unknown). Added RED/GREEN tests for missing review rows, failing rows, and generated acceptance.md artifact evidence. Also formatted files previously reported by Prettier so pnpm run check passes.
- ✅ Surface workflow readiness blockers through gate tools
  > Added machine-readable readiness_blockers to gate state and GateStuckSignalPayload. Workflow gate readiness now records structured GateReadinessBlocker objects when artifact/contract checks reject a completion signal. adv_gate_complete now waits for the workflow gate result after firing gateCompletedSignal; it returns a blocker response with workflowGateStatus, stuckReason, and readinessBlockers when the workflow marks the gate stuck, and refuses to claim success if completion cannot be confirmed. Added tests for tool-level blocker surfacing and workflow state blocker persistence.
- ✅ Update ADV gate, prep, and review contracts for artifact enforcement
  > Added asset test coverage pinning workflow-enforced gate artifact documentation. Updated docs/adv-gates.md to describe artifact-backed proposal/discovery/design/acceptance gates and structured readiness_blockers. Updated adv-prep with Artifact Excerpts guidance so tasks carry relevant problem/agreement/design context and avoid manual acceptance.md work. Updated adv-review to document ChangeContract/reviewMatrix as authoritative acceptance proof, generated acceptance.md projection, manual-edit prohibition, and readinessBlockers handling when adv_gate_complete reports workflowGateStatus stuck.
- ✅ Run full validation and fix integration fallout
  > Ran full validation after all implementation and docs tasks. pnpm test passed, pnpm run check passed (typecheck, isolation/lockfile checks, lint, format), and pnpm run build passed for plugin and worker bundles. No integration fallout required code changes during this final task; checkpoint recorded clean at 289fafc15df19f3f431114a2fbb20b25ebd070f3.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Async Temporal signal handlers can apply older signal timestamps after later synchronous handlers. Keep workflow last-activity timestamps monotonic (max existing/new ISO) and poll workflow state in tests/tools when a signal handler awaits activities; `handle.signal()` only confirms signal acceptance, not handler completion.
- **[pattern]** When a workflow must materialize a derived markdown artifact, keep rendering deterministic and workflow-safe (pure function over ChangeWorkflowState), then perform only the filesystem write/inspection through activities before recording artifact evidence.
- **[pattern]** When a Temporal signal can be rejected asynchronously by workflow readiness, tool-layer mutation responses must query/poll the post-signal workflow state before reporting success; otherwise the tool can claim a gate is done while the workflow marked it stuck.
