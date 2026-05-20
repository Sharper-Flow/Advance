# Agreement

## Objectives

1. Make the Temporal change workflow the structural authority for artifact-backed gate completion.
2. Require required gate artifacts before proposal/discovery/design/acceptance can be marked complete.
3. Keep file I/O outside workflow code by using Temporal activities or existing tool/storage boundaries.
4. Expose deterministic readiness blockers so agents can pre-flight gate completion safely.
5. Update command/docs contracts so user checkpoints display the artifacts they approve.
6. Add regression tests that fail if gate completion bypasses required artifact evidence.

## Acceptance Criteria

1. Missing required gate artifacts block gate completion at workflow level.
2. Enforcement is strict for new behavior, with explicit compatibility only where needed for replay/migration safety.
3. Artifact checks use activities/tooling, not direct workflow filesystem I/O.
4. Acceptance proof uses typed contract/review state as source, with generated `acceptance.md` as durable artifact projection.
5. Readiness blockers are deterministic and expose missing prior gates/artifacts.
6. Tests cover missing, undersized, valid, compatibility, and sequence cases.

## Constraints

- Preserve Temporal TypeScript workflow determinism.
- Preserve signal/query-only workflow surface; do not reintroduce `defineUpdate` on change workflow.
- Use structural correctness: schemas, state machine checks, activities, and tests over agent prose.
- Strict enforcement is the target posture for new behavior.
- Existing replay/migration hazards may use explicit compatibility code only when necessary and tested.
- Runtime validation of live tool behavior may require `pnpm run build` and OpenCode restart because source is ahead of dist.

## Avoidances

- Do not treat toolbox `removePhantomSubAgent` as authoritative origin context for this change; keep it only as historical trigger context.
- Do not add manual-only acceptance proof that can drift from typed workflow state.
- Do not perform filesystem I/O directly inside Temporal workflow code.
- Do not rely on agent instructions as the enforcement mechanism for gate correctness.
- Do not silently let old/mid-flight changes bypass enforcement without an explicit compatibility rationale.

## Decisions

### User Decisions

- Origin context: user selected “No, ignore it” for toolbox/removePhantomSubAgent origin relevance.
- Rollout posture: user selected “Strict now”.
- Acceptance proof: generated `acceptance.md` projection from typed contract/review state.

### Agent Decisions (LBP)

- Temporal workflow owns gate state; gate preconditions must be checked before applying `applyGateCompletedToState`.
- Side-effecting artifact reads belong in activities/tooling.
- Typed workflow contract/review state remains source of truth; markdown projections are durable human-readable artifacts.
- Deterministic readiness blockers are preferred over heuristic agent preflight.

## Deferred Questions

None.

## Sign-Off

Acceptance criteria approved by user reply `approve` on 2026-05-20. Discovery agreement may proceed to design.