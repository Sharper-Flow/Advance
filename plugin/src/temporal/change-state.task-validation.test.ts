/**
 * Task signal validation — workflow-boundary defense-in-depth tests.
 *
 * Covers applyTaskUpdatedToState and applyTaskBlockedToState validation paths
 * that guard against malformed signal payloads corrupting task state via
 * Object.assign. The validation pattern was introduced in addWisdomAutoSurfacing
 * (security-4) but shipped with no test coverage; this file closes that gap
 * and locks in the generalized TaskSchema.partial() safeParse behavior.
 */

import { describe, expect, it } from "vitest";

import {
  applyTaskBlockedToState,
  applyTaskUpdatedToState,
  createChangeWorkflowState,
} from "./change-state";
import type { ChangeWorkflowState } from "./contracts";
import type { Change, Task } from "../types";

function makeBaselineState(
  taskOverrides: Partial<Task> = {},
): ChangeWorkflowState {
  const baseChange = {
    id: "chg-validation",
    title: "Validation fixture",
    status: "draft",
    capability: "advance-workflow",
    summary: "Validation fixture",
    created_at: "2026-07-21T00:00:00.000Z",
    gates: {},
    tasks: [],
    deltas: {},
    artifacts: {},
  } as unknown as Change;
  const state = createChangeWorkflowState({
    change: baseChange,
    diskProjection: baseChange,
  });
  const task: Task = {
    id: "tk-validation",
    title: "Validation target task",
    content: "Validation target task",
    type: "code",
    status: "pending",
    priority: 0,
    created_at: "2026-07-21T00:00:00.000Z",
    evidence_policy: "test",
    ...taskOverrides,
  } as unknown as Task;
  state.tasks = [task];
  return state;
}

describe("applyTaskUpdatedToState — workflow-boundary validation", () => {
  it("AC1: valid partial with valid wisdom_drafts passes through unchanged", () => {
    const state = makeBaselineState();
    const validDraft = {
      id: "dr-valid",
      suggested_type: "failure",
      suggested_content: "diag → fix",
      source_attempts: [1],
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    applyTaskUpdatedToState(state, {
      taskId: "tk-validation",
      // Build via cast to avoid coupling the test to every required field;
      // the schema validation under test operates on this shape.
      partial: {
        status: "in_progress",
        notes: "validated update",
        wisdom_drafts: [validDraft],
      } as any,
      updatedAt: "2026-07-21T17:01:00.000Z",
    });

    const task = state.tasks[0];
    expect(task.status).toBe("in_progress");
    expect(task.notes).toBe("validated update");
    expect(task.wisdom_drafts).toHaveLength(1);
    expect(task.wisdom_drafts?.[0]).toMatchObject({
      id: "dr-valid",
      status: "suggested",
    });
  });

  it("AC2: malformed wisdom_drafts array element drops the whole field; existing task.wisdom_drafts preserved", () => {
    // Pre-existing draft on the task — must survive the malformed update.
    const existingDraft = {
      id: "dr-existing",
      suggested_type: "failure",
      suggested_content: "existing diag → fix",
      source_attempts: [1],
      status: "suggested",
      created_at: "2026-07-21T16:00:00.000Z",
    };
    const state = makeBaselineState({
      wisdom_drafts: [existingDraft] as any,
    });

    applyTaskUpdatedToState(state, {
      taskId: "tk-validation",
      partial: {
        status: "in_progress",
        // Missing required fields (status, created_at) inside the draft —
        // schema validation must reject this and drop the whole field.
        wisdom_drafts: [
          { id: "dr-bad", suggested_content: "no type, no status" },
        ] as any,
      },
      updatedAt: "2026-07-21T17:01:00.000Z",
    });

    const task = state.tasks[0];
    // status update still applies (independent of wisdom_drafts validation)
    expect(task.status).toBe("in_progress");
    // Existing draft preserved — malformed array did NOT clobber it.
    expect(task.wisdom_drafts).toHaveLength(1);
    expect(task.wisdom_drafts?.[0]?.id).toBe("dr-existing");
  });

  it("AC3: TaskSchema.passthrough() preserves unknown keys (design intent, not a security gap)", () => {
    // Document the actual behavior: TaskSchema uses .passthrough() for
    // forward/backward compatibility. Unknown keys ARE preserved through
    // Object.assign. This is intentional — the field-specific validation
    // pattern targets nested substructures that evolve (wisdom_drafts),
    // not unknown top-level keys. Signal payload schemas remain the
    // primary trust boundary for shape validation.
    //
    // This test exists to lock in the design decision and surface the
    // tradeoff explicitly: a future change that wants to strip unknown
    // keys would need to override TaskSchema.passthrough() locally OR
    // move validation to a different surface.
    const state = makeBaselineState();

    applyTaskUpdatedToState(state, {
      taskId: "tk-validation",
      partial: {
        status: "in_progress",
        injectedMaliciousField: "appears on task (passthrough design)",
      } as any,
      updatedAt: "2026-07-21T17:01:00.000Z",
    });

    const task = state.tasks[0] as any;
    expect(task.status).toBe("in_progress");
    // Passthrough means unknown keys ARE preserved. Document, don't strip.
    expect(task.injectedMaliciousField).toBe(
      "appears on task (passthrough design)",
    );
  });

  it("AC5 (negative path): malformed scalar status passes through (signal payload schema is primary validator)", () => {
    // The workflow handler does NOT re-validate scalar fields — that's the
    // job of the signal payload schema (TaskUpdatedSignalPayloadSchema
    // enforces partial: TaskSchema.partial()). Defense-in-depth here is
    // specifically for nested substructures (wisdom_drafts) that evolve
    // across workflow versions.
    //
    // A malformed scalar reaching this handler means the signal payload
    // schema was bypassed — that's a different threat model, handled by
    // workflow code signing / Temporal poisoning detection, not by
    // per-field re-validation in every handler.
    const state = makeBaselineState({ status: "in_progress" });

    applyTaskUpdatedToState(state, {
      taskId: "tk-validation",
      partial: {
        // Wrong type — would be caught by signal payload schema in
        // production. Reaches handler only in threat model where payload
        // schema is bypassed. Handler does not re-validate.
        status: 123 as any,
      },
      updatedAt: "2026-07-21T17:01:00.000Z",
    });

    const task = state.tasks[0] as any;
    // Document: handler does not re-validate scalar fields.
    expect(task.status).toBe(123);
  });
});

describe("applyTaskBlockedToState — wisdom_drafts payload validation", () => {
  it("AC4 happy path: valid wisdom_drafts payload updates task.wisdom_drafts", () => {
    const state = makeBaselineState({ status: "pending" });
    const validDraft = {
      id: "dr-blocked-ok",
      suggested_type: "failure",
      suggested_content: "diag → fix",
      source_attempts: [1],
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };

    applyTaskBlockedToState(state, {
      taskId: "tk-validation",
      reason: "Hit a wall",
      attempts: [],
      blockedAt: "2026-07-21T17:01:00.000Z",
      wisdom_drafts: [validDraft],
    });

    const task = state.tasks[0];
    expect(task.status).toBe("blocked");
    expect(task.blockReason).toBe("Hit a wall");
    expect(task.wisdom_drafts).toHaveLength(1);
    expect(task.wisdom_drafts?.[0]?.id).toBe("dr-blocked-ok");
  });

  it("AC4 rejection path: malformed wisdom_drafts payload leaves task.wisdom_drafts untouched", () => {
    const existingDraft = {
      id: "dr-existing",
      suggested_type: "failure",
      suggested_content: "existing",
      source_attempts: [1],
      status: "suggested",
      created_at: "2026-07-21T16:00:00.000Z",
    };
    const state = makeBaselineState({
      status: "pending",
      wisdom_drafts: [existingDraft] as any,
    });

    applyTaskBlockedToState(state, {
      taskId: "tk-validation",
      reason: "Hit a wall",
      attempts: [],
      blockedAt: "2026-07-21T17:01:00.000Z",
      // Malformed — missing required fields.
      wisdom_drafts: [{ id: "dr-bad" }] as any,
    });

    const task = state.tasks[0];
    // Blocked-status update still applies (it's a separate field, not in
    // the wisdom_drafts validation path).
    expect(task.status).toBe("blocked");
    // Existing draft preserved.
    expect(task.wisdom_drafts).toHaveLength(1);
    expect(task.wisdom_drafts?.[0]?.id).toBe("dr-existing");
  });

  it("AC4 backward-compat: payload without wisdom_drafts field leaves task.wisdom_drafts untouched", () => {
    const existingDraft = {
      id: "dr-existing",
      suggested_type: "failure",
      suggested_content: "existing",
      source_attempts: [1],
      status: "suggested",
      created_at: "2026-07-21T16:00:00.000Z",
    };
    const state = makeBaselineState({
      status: "pending",
      wisdom_drafts: [existingDraft] as any,
    });

    applyTaskBlockedToState(state, {
      taskId: "tk-validation",
      reason: "Legacy block signal",
      attempts: [],
      blockedAt: "2026-07-21T17:01:00.000Z",
      // wisdom_drafts omitted entirely — legacy payload shape.
    });

    const task = state.tasks[0];
    expect(task.status).toBe("blocked");
    expect(task.wisdom_drafts).toHaveLength(1);
    expect(task.wisdom_drafts?.[0]?.id).toBe("dr-existing");
  });
});
