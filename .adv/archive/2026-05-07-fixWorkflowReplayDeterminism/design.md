# Design — fixWorkflowReplayDeterminism

## Architecture Overview

Fix the replay cliff at the store boundary, not in every tool.

Current read flow:

```text
tool → store.changes.get/change list/gates/reflection/archive → Temporal query → TMPRL1100 → tool failure
```

Target read flow:

```text
tool → store.changes.get/list/gates/reflection/archive
  → Temporal query
  → if poisoned-history replay error: disk/archive projection fallback
  → tool receives normal Change-shaped data with recovery marker
```

The design keeps Temporal as source of truth for live workflows, while treating disk/archive projections as durable recovery sources for terminal or unreplayable pre-cull histories.

## Key Decisions

### KD-1 — Classify poisoned-history TMPRL as fallback-eligible

Update `plugin/src/temporal/retry-wrapper.ts` so `classifyTemporalError()` returns `"fallback"` for the known replay-poison shapes:

- `TMPRL1100`
- `Nondeterminism error`
- `No command scheduled for event`
- `WorkflowExecutionUpdateAccepted` **only when part of a TMPRL/nondeterminism/no-command replay error**, not as a standalone accepted-update race.

Rationale: existing `getTemporalChange()` already has fallback mechanics, but never enters them for this class. This is the smallest correction to activate intended recovery.

Non-goal: classifying all Temporal fatal errors as fallback. Only the known pre-cull replay-history signature should route to projection fallback. Bare `WorkflowExecutionUpdateAccepted` without TMPRL/no-command context remains transient or fatal according to existing retry semantics.

### KD-2 — Add direct archive-bundle fallback for `changes.get`

Extend `reseedChangeFromDisk(changeId)` (or a small helper it calls) to resolve projections in this order:

1. Active source snapshot: `legacy.changes.get(changeId)` / `changes/<id>/change.json`.
2. Archive bundle: `loadChange(legacy.paths.archive, changeId)` when active source is absent and archive bundle exists.
3. No projection: return `null`, preserving original error.

Return shape:

```ts
type RecoveredChange = Change & {
  _source?: "disk" | "archive";
  _recovery?: {
    mode: "temporal_query_fallback";
    reason: "poisoned_history" | "missing_workflow";
  };
};
```

Implementation can keep `_source` for backward compatibility with existing tests and add `_recovery` for clearer diagnosis. Public tools do not need to expose `_recovery` unless their existing `formatToolOutput` preserves unknown fields.

### KD-3 — Do not reseed terminal recovery cases

When a projection loaded from disk/archive is already `archived` or `closed`, return it directly. Do not call `ensureChangeWorkflowStarted()`.

Rationale: terminal changes should not recreate workflows, and archived bundles are already durable source of truth.

For non-terminal changes with a disk snapshot, keep current reseed behavior. If reseed succeeds but post-reseed query still fails, return the projection only when the failure is the poisoned-history class and the projection carries enough state for read-only tool output. Mutating tools should still fail if they require live workflow mutation.

### KD-4 — Gate/status/reflection/archive recovery through existing store surfaces

- `adv_change_show`: no special-case; succeeds through `store.changes.get`.
- `adv_reflect`: no special-case; it already begins with `store.changes.get` and requires `status === "archived"`.
- `adv_change_archive`: no special-case for active work; it already begins with `store.changes.get`. If recovered status is already `archived`, archive remains idempotent/no-op success via existing bundle path logic where possible. If gates/tasks incomplete, existing preflight still blocks.
- `adv_gate_status`: today `createGateOps().get` directly queries Temporal. Add the same fallback behavior there: on fallback-class query error, call `deps.getTemporalChange(changeId)` and return `change.gates` when projection exists.

### KD-5 — `adv_status` retry/classification belongs at status tool/store boundary

`adv_status` invokes `activeStore.status()` before Temporal health wrapping. Add a narrow wrapper around that call:

```ts
const status = await withBootstrapReplayRetry(() => activeStore.status());
```

Behavior:

- If first call throws fallback-class TMPRL poison/bootstrap error, wait bounded delay (e.g. 250–500ms) and retry once.
- If retry succeeds, add diagnostic marker/recommendation such as `bootstrap_retry: { recovered: true }` only in health/full output if useful.
- If retry fails with the same class, return structured status output with `diagnostics.lastErrorClass = "bootstrap_in_progress"` or equivalent rather than crashing the tool.

Rationale: #56 is transient and retry-proven. Keeping retry at `adv_status` avoids changing all Temporal query semantics.

### KD-6 — Correct guardrail: ban change-workflow update surface drift, not Temporal-patched Date/random

Do not create a scanner that fails on `Date.now()`, `new Date()`, or `Math.random()` in TypeScript workflow code; official Temporal TS docs state these are deterministic in the workflow sandbox.

Instead, extend `plugin/src/temporal/workflow-bundle-boundary.test.ts` or add `plugin/src/temporal/replay-determinism.test.ts` with static checks that production workflow-reachable code:

- does not call/import `defineUpdate` / `wf.defineUpdate` on the change workflow surface;
- still does not transitively import `storage/`, `tools/`, `tool-registry`, `plugin-init`, or `node:*` (existing tests already cover this);
- optionally flags raw `setTimeout`/`setInterval` only in workflow-reachable production files if such APIs become reachable from `workflows.ts`.

This aligns tests with actual long-term best practice and avoids false-positive CI failures.

### KD-7 — Document the corrected Temporal TS determinism model

Update `AGENTS.md` Architecture Gotchas or add `docs/decisions/replay-determinism.md`:

- Temporal TypeScript workflow sandbox patches `Date.now()`, `new Date()`, and `Math.random()` to be deterministic.
- Use `sleep()` / `condition()` for workflow timers.
- In this project, change workflows are signal/query state holders; reintroducing update handlers requires explicit spec/design migration handling because old update events can poison histories across code changes.

## Implementation Strategy

1. **Tests first: fallback classification**
   - Add unit tests in `plugin/src/temporal/retry-wrapper.test.ts` or nearby coverage for TMPRL1100 / nondeterminism / no-command event classification.
   - Include a negative/guard test for bare `WorkflowExecutionUpdateAccepted` text without TMPRL/no-command context so it does not silently become disk fallback.
   - Expect `"fallback"` only for the poisoned-history replay shape.

2. **Tests first: direct archive fallback**
   - Add store-temporal tests around `changes.get` where Temporal query throws TMPRL1100 and archive bundle exists.
   - Expect success with `_source: "archive"` (and `_recovery` if implemented).

3. **Implement fallback helpers**
   - Extend `classifyTemporalError`.
   - Add `loadProjectionFallback(changeId, reason)` inside `store-temporal/index.ts` or a small local helper.
   - Reuse `hasArchiveBundle` / `loadChange` already imported in list flow.

4. **Gate fallback**
   - In `plugin/src/storage/store-temporal/gates.ts`, wrap direct query in try/catch.
   - On fallback-class error, call `deps.getTemporalChange(changeId)` and return `data.gates` if available.
   - Preserve original error if no projection exists.

5. **Status bootstrap handling**
   - Add a small helper in `plugin/src/tools/status.ts` to run `activeStore.status()` with one fallback-class retry and structured degrade.
   - Test with mocked store status throwing then succeeding, and throwing twice.

6. **Replay guardrail test**
   - Extend `workflow-bundle-boundary.test.ts` helper traversal, or create a sibling test using the same `reachableFrom(workflowRoot)` logic.
   - Fail on non-test reachable files containing `defineUpdate` or `wf.defineUpdate`.

7. **Docs**
   - Update `AGENTS.md` because agents read it before code work.
   - Optionally add a decision doc only if implementation introduces subtle policy beyond AGENTS.md.

8. **Verification**
   - Targeted tests: retry wrapper, store-temporal fallback, gate fallback, status retry, workflow guardrail.
   - `pnpm run check`.
   - `pnpm test`.

## Affected Components

- `plugin/src/temporal/retry-wrapper.ts` — fallback classification.
- `plugin/src/storage/store-temporal/index.ts` — direct disk/archive projection fallback.
- `plugin/src/storage/store-temporal/gates.ts` — gate query fallback through recovered projection.
- `plugin/src/tools/status.ts` + `plugin/src/tools/status.test.ts` — first-call retry/classification.
- `plugin/src/temporal/workflow-bundle-boundary.test.ts` or new replay guardrail test — no update-surface regression.
- `AGENTS.md` and/or `docs/decisions/replay-determinism.md` — corrected determinism guidance.

## LBP Analysis

- Prefer source-appropriate official guidance: Temporal TS docs confirm patched time/random APIs are deterministic, so scanner must not encode false cross-SDK folklore.
- Prefer central recovery at storage boundary over per-tool patches; tools already compose through store surfaces.
- Prefer projection fallback for terminal poisoned histories over destructive reset/history deletion; least risky and consistent with archive/disk durability model.
- Prefer static guardrail on actual project invariant (`defineUpdate` retired from change workflows) over broad regex bans that generate CI noise.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Over-classify real fatal nondeterminism as safe fallback | Match only TMPRL1100 / no-command replay strings; keep generic fatal errors fatal. Bare accepted-update text is not enough. |
| Disk/archive projection stale for active non-terminal change | Return projection directly only for terminal states or fallback-specific read-only paths; mutation still requires live workflow. |
| `adv_change_archive` accidentally archives stale recovered active state | Existing preflight and validation still run; terminal archive-only states should no-op/idempotently succeed, not mutate. |
| Status retry hides real health problem | Retry once only; second failure produces structured diagnostic instead of silent success. |
| Static scanner false positives in tests/docs | Scope to production workflow-reachable files from `workflows.ts`, not repo-wide text. |

## Spec Delta Shape

Likely capability: `advance-delivery`.

- `rq-replayFallback01`: Given a change workflow query fails with known poisoned-history TMPRL, when a disk/archive projection exists, read tools return projection-backed data with recovery marker instead of failing.
- `rq-changeWorkflowSignalOnly01`: Given production change workflow code, when workflow-reachable code is statically scanned, then `defineUpdate` is absent unless a future spec explicitly reintroduces updates with migration handling.
- `rq-temporalTsDeterminismDocs01`: Agent-facing docs state Temporal TS patched Date/random behavior correctly.

## Validator Result

Verdict: `VALIDATED` with one caution.

- Correctness: store-boundary fallback addresses all objectives; `getTemporalChange` already has the right chokepoint and `gates.ts` is the main bypass.
- Simplicity: simpler alternatives either duplicate fallback in tools or hide behavior in Temporal client interception.
- Spec-law: no conflict with `rq-gatemodel01`, `rq-archiveRetirement01`, `rq-autonomy01`, or workflow-bundle boundary. Static `defineUpdate` guard enforces existing `AGENTS.md` signal-only invariant.
- Caution resolved in design: bare `WorkflowExecutionUpdateAccepted` should not itself classify as fallback; only TMPRL/no-command/nondeterminism replay context routes to disk/archive fallback.
