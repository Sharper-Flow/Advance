import { describe, expect, it } from "vitest";
import {
  addChangeWisdom,
  addTaskToChangeState,
  cancelTaskInChangeState,
  closeChangeInChangeState,
  completeGateInChangeState,
  createChangeWorkflowState,
  getTaskRunFromChangeState,
  listTasksFromChangeState,
  listTaskRunsFromChangeState,
  reclassifyTaskTddInChangeState,
  recordTaskRunEventInChangeState,
  recordTaskEvidenceInChangeState,
  reopenFromGateInChangeState,
  updateTaskInChangeState,
  updateArtifactMetadataInChangeState,
} from "./change-state";

describe("change workflow state", () => {
  it("creates change state with pending gates", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });

    expect(state.id).toBe("myChange");
    expect(state.gates.proposal.status).toBe("pending");
    expect(state.tasks).toEqual([]);
  });

  it("adds tasks and filters by metadata", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });

    addTaskToChangeState(
      state,
      {
        title: "task one",
        metadata: { env: "prod", tdd_intent: "inline" },
      },
      { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
    );
    addTaskToChangeState(
      state,
      {
        title: "task two",
        metadata: { env: "stage", tdd_intent: "inline" },
      },
      { now: "2026-04-14T00:02:00.000Z", uuid: () => "task-2" },
    );

    expect(
      listTasksFromChangeState(state, undefined, "has_metadata_key:env"),
    ).toHaveLength(2);
    expect(
      listTasksFromChangeState(state, undefined, "metadata:env=prod"),
    ).toHaveLength(1);
    expect(
      listTasksFromChangeState(state, undefined, "metadata:env=prod")[0]?.id,
    ).toBe("tk-task-1");
  });

  it("enforces gate sequencing", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });

    expect(() =>
      completeGateInChangeState(state, "discovery", {
        now: "2026-04-14T00:01:00.000Z",
        completedBy: "agent",
      }),
    ).toThrow(/previous gate/i);

    completeGateInChangeState(state, "proposal", {
      now: "2026-04-14T00:01:00.000Z",
      completedBy: "agent",
    });
    completeGateInChangeState(state, "discovery", {
      now: "2026-04-14T00:02:00.000Z",
      completedBy: "agent",
    });

    expect(state.gates.discovery.status).toBe("done");
  });

  it("records tdd evidence and reaches complete phase", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });
    const task = addTaskToChangeState(
      state,
      { title: "task one", metadata: { tdd_intent: "inline" } },
      { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
    );

    recordTaskEvidenceInChangeState(state, task.id, "red", {
      command: "vitest",
      exit_code: 1,
      recorded_at: "2026-04-14T00:02:00.000Z",
    });
    recordTaskEvidenceInChangeState(state, task.id, "green", {
      command: "vitest",
      exit_code: 0,
      recorded_at: "2026-04-14T00:03:00.000Z",
    });

    expect(state.tasks[0]?.tdd_phase).toBe("complete");
    expect(state.tasks[0]?.tdd_evidence?.green?.exit_code).toBe(0);
  });

  it("records task-run events with phase, resume action, and idempotency", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });
    const task = addTaskToChangeState(
      state,
      { title: "task one", metadata: { tdd_intent: "inline" } },
      { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
    );

    const first = recordTaskRunEventInChangeState(state, task.id, {
      idempotencyKey: "run:start:1",
      type: "start",
      recordedAt: "2026-04-14T00:02:00.000Z",
      payload: { workdir: "/repo" },
    });
    expect(first.duplicate).toBe(false);
    expect(first.run.phase).toBe("started");
    expect(first.run.requiredNextAction).toBe("capture_baseline");

    const duplicate = recordTaskRunEventInChangeState(state, task.id, {
      idempotencyKey: "run:start:1",
      type: "start",
      recordedAt: "2026-04-14T00:02:01.000Z",
      payload: { workdir: "/repo" },
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.run.events).toHaveLength(1);

    expect(getTaskRunFromChangeState(state, task.id)?.runId).toBe(
      `run-${task.id}`,
    );
    expect(listTaskRunsFromChangeState(state)).toHaveLength(1);
  });

  it("rejects missing task-run idempotency keys and invalid transitions", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });
    const task = addTaskToChangeState(
      state,
      { title: "task one", metadata: { tdd_intent: "inline" } },
      { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
    );

    expect(() =>
      recordTaskRunEventInChangeState(state, task.id, {
        idempotencyKey: "",
        type: "start",
        recordedAt: "2026-04-14T00:02:00.000Z",
        payload: {},
      }),
    ).toThrow(/idempotency/i);

    expect(() =>
      recordTaskRunEventInChangeState(state, task.id, {
        idempotencyKey: "run:checkpoint:early",
        type: "checkpoint",
        recordedAt: "2026-04-14T00:03:00.000Z",
        payload: { status: "clean" },
      }),
    ).toThrow(/invalid task-run transition/i);
  });

  it("caps retained task-run events and idempotency keys", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });
    const task = addTaskToChangeState(
      state,
      { title: "task one", metadata: { tdd_intent: "inline" } },
      { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
    );

    recordTaskRunEventInChangeState(state, task.id, {
      idempotencyKey: "run:start",
      type: "start",
      recordedAt: "2026-04-14T00:02:00.000Z",
      payload: {},
    });
    for (let i = 0; i < 60; i += 1) {
      recordTaskRunEventInChangeState(state, task.id, {
        idempotencyKey: `run:failure:${i}`,
        type: "failure",
        recordedAt: `2026-04-14T00:03:${String(i).padStart(2, "0")}.000Z`,
        payload: { attempt: i },
      });
    }

    const run = getTaskRunFromChangeState(state, task.id);
    expect(run?.events).toHaveLength(50);
    expect(run?.seenIdempotencyKeys.length).toBeLessThanOrEqual(50);
    expect(run?.events[0]?.idempotencyKey).toBe("run:failure:10");
  });

  it("preserves tasks when reopening from a completed gate and tracks audit history", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });
    addTaskToChangeState(
      state,
      { title: "task one", metadata: { tdd_intent: "inline" } },
      { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
    );

    completeGateInChangeState(state, "proposal", {
      now: "2026-04-14T00:02:00.000Z",
      completedBy: "agent",
    });
    completeGateInChangeState(state, "discovery", {
      now: "2026-04-14T00:03:00.000Z",
      completedBy: "agent",
    });
    completeGateInChangeState(state, "design", {
      now: "2026-04-14T00:04:00.000Z",
      completedBy: "agent",
    });

    reopenFromGateInChangeState(state, "discovery", {
      now: "2026-04-14T00:05:00.000Z",
      reason: "scope expansion",
      reopenedBy: "agent",
    });

    expect(state.tasks).toHaveLength(1);
    expect(state.gates.proposal.status).toBe("done");
    expect(state.gates.discovery.status).toBe("pending");
    expect(state.gates.design.status).toBe("pending");
    expect(state.reentry_history).toHaveLength(1);
  });

  it("tracks change wisdom and artifact metadata", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });

    addChangeWisdom(
      state,
      { type: "pattern", content: "Use workflow.uuid4()", sourceTask: "tk-1" },
      { now: "2026-04-14T00:01:00.000Z", uuid: () => "wisdom-1" },
    );
    updateArtifactMetadataInChangeState(state, "design", {
      path: "/tmp/design.md",
      updatedAt: "2026-04-14T00:02:00.000Z",
      contentHash: "abc123",
    });

    expect(state.wisdom).toHaveLength(1);
    expect(state.wisdom[0]?.id).toBe("ws-wisdom-1");
    expect(state.artifacts.design?.contentHash).toBe("abc123");
  });

  it("updates task lifecycle and can close a change", () => {
    const state = createChangeWorkflowState({
      changeId: "myChange",
      title: "My Change",
      createdAt: "2026-04-14T00:00:00.000Z",
    });
    const task = addTaskToChangeState(
      state,
      { title: "task one", metadata: { tdd_intent: "inline" } },
      { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
    );

    updateTaskInChangeState(state, task.id, {
      status: "in_progress",
      now: "2026-04-14T00:02:00.000Z",
    });
    expect(state.tasks[0]?.started_at).toBe("2026-04-14T00:02:00.000Z");

    reclassifyTaskTddInChangeState(state, task.id, {
      from_intent: "inline",
      to_intent: "not_applicable",
      reason: "docs-only",
      approved_by_user: true,
      approval_evidence: "user said okay",
      approved_at: "2026-04-14T00:03:00.000Z",
    });
    expect(state.tasks[0]?.metadata?.tdd_intent).toBe("not_applicable");

    cancelTaskInChangeState(
      state,
      task.id,
      {
        reason: "superseded",
        approved_by_user: true,
        approval_evidence: "user approved",
        approved_at: "2026-04-14T00:04:00.000Z",
      },
      "2026-04-14T00:04:00.000Z",
    );
    expect(state.tasks[0]?.status).toBe("cancelled");

    closeChangeInChangeState(state, {
      reason: "not_planned",
      approved_by_user: true,
      approval_evidence: "user approved",
      approved_at: "2026-04-14T00:05:00.000Z",
    });
    expect(state.status).toBe("closed");
  });

  describe("ledger flexibility for tdd_intent (reliability fix)", () => {
    /**
     * Regression: tasks with tdd_intent: 'not_applicable' have no TDD
     * lifecycle (no red/green/baseline). Going from 'started' directly to
     * 'checkpoint' MUST be allowed for these tasks, otherwise the
     * checkpoint tool throws in the workflow handler and wedges the entire
     * change workflow with WorkflowWorkerUnhandledFailure.
     *
     * Surfaced during inlineApprovalGateTransition Phase A + B.1 — both
     * tasks were tdd_intent: 'not_applicable' (prose/spec edits) and
     * checkpoint(complete) wedged the workflow. Manual recovery required
     * `temporal workflow terminate` + reseed-from-disk.
     */
    it("allows started -> checkpoint for tdd_intent: 'not_applicable' tasks", () => {
      const state = createChangeWorkflowState({
        changeId: "myChange",
        title: "My Change",
        createdAt: "2026-04-14T00:00:00.000Z",
      });
      const task = addTaskToChangeState(
        state,
        {
          title: "prose edit task",
          metadata: { tdd_intent: "not_applicable" },
        },
        { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
      );

      recordTaskRunEventInChangeState(state, task.id, {
        idempotencyKey: "run:start",
        type: "start",
        recordedAt: "2026-04-14T00:02:00.000Z",
        payload: { workdir: "/repo" },
      });

      expect(() =>
        recordTaskRunEventInChangeState(state, task.id, {
          idempotencyKey: "run:checkpoint",
          type: "checkpoint",
          recordedAt: "2026-04-14T00:03:00.000Z",
          payload: { status: "committed", sha: "abc123" },
        }),
      ).not.toThrow();

      const run = getTaskRunFromChangeState(state, task.id);
      expect(run?.phase).toBe("checkpointed");
    });

    it("STILL rejects started -> checkpoint for tdd_intent: 'inline' tasks (TDD discipline preserved)", () => {
      const state = createChangeWorkflowState({
        changeId: "myChange",
        title: "My Change",
        createdAt: "2026-04-14T00:00:00.000Z",
      });
      const task = addTaskToChangeState(
        state,
        { title: "code task", metadata: { tdd_intent: "inline" } },
        { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
      );

      recordTaskRunEventInChangeState(state, task.id, {
        idempotencyKey: "run:start",
        type: "start",
        recordedAt: "2026-04-14T00:02:00.000Z",
        payload: { workdir: "/repo" },
      });

      expect(() =>
        recordTaskRunEventInChangeState(state, task.id, {
          idempotencyKey: "run:checkpoint",
          type: "checkpoint",
          recordedAt: "2026-04-14T00:03:00.000Z",
          payload: { status: "committed", sha: "abc123" },
        }),
      ).toThrow(/invalid task-run transition/i);
    });

    it("STILL rejects started -> checkpoint for tdd_intent: 'separate_verification' tasks", () => {
      const state = createChangeWorkflowState({
        changeId: "myChange",
        title: "My Change",
        createdAt: "2026-04-14T00:00:00.000Z",
      });
      const task = addTaskToChangeState(
        state,
        {
          title: "verification task",
          metadata: { tdd_intent: "separate_verification" },
        },
        { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
      );

      recordTaskRunEventInChangeState(state, task.id, {
        idempotencyKey: "run:start",
        type: "start",
        recordedAt: "2026-04-14T00:02:00.000Z",
        payload: { workdir: "/repo" },
      });

      // separate_verification tasks still need full TDD lifecycle since
      // they verify other tasks. Skipping baseline/red/green is wrong.
      expect(() =>
        recordTaskRunEventInChangeState(state, task.id, {
          idempotencyKey: "run:checkpoint",
          type: "checkpoint",
          recordedAt: "2026-04-14T00:03:00.000Z",
          payload: { status: "committed", sha: "abc123" },
        }),
      ).toThrow(/invalid task-run transition/i);
    });

    it("allows started -> checkpoint when task has NO tdd_intent metadata (legacy tasks)", () => {
      // Legacy tasks created before tdd_intent existed should not be
      // wedged by the strict state machine. Treat absent metadata as
      // permissive (matches default behavior elsewhere in the codebase).
      const state = createChangeWorkflowState({
        changeId: "myChange",
        title: "My Change",
        createdAt: "2026-04-14T00:00:00.000Z",
      });
      const task = addTaskToChangeState(
        state,
        { title: "legacy task" },
        { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
      );

      recordTaskRunEventInChangeState(state, task.id, {
        idempotencyKey: "run:start",
        type: "start",
        recordedAt: "2026-04-14T00:02:00.000Z",
        payload: { workdir: "/repo" },
      });

      expect(() =>
        recordTaskRunEventInChangeState(state, task.id, {
          idempotencyKey: "run:checkpoint",
          type: "checkpoint",
          recordedAt: "2026-04-14T00:03:00.000Z",
          payload: { status: "committed", sha: "abc123" },
        }),
      ).not.toThrow();
    });

    it("allows started -> complete for tdd_intent: 'not_applicable' (no checkpoint needed)", () => {
      // Some not_applicable tasks may not even create a checkpoint
      // (e.g., the change itself is just an agenda update with no
      // file changes). Allow direct started -> complete.
      const state = createChangeWorkflowState({
        changeId: "myChange",
        title: "My Change",
        createdAt: "2026-04-14T00:00:00.000Z",
      });
      const task = addTaskToChangeState(
        state,
        {
          title: "no-op task",
          metadata: { tdd_intent: "not_applicable" },
        },
        { now: "2026-04-14T00:01:00.000Z", uuid: () => "task-1" },
      );

      recordTaskRunEventInChangeState(state, task.id, {
        idempotencyKey: "run:start",
        type: "start",
        recordedAt: "2026-04-14T00:02:00.000Z",
        payload: { workdir: "/repo" },
      });

      expect(() =>
        recordTaskRunEventInChangeState(state, task.id, {
          idempotencyKey: "run:complete",
          type: "complete",
          recordedAt: "2026-04-14T00:03:00.000Z",
          payload: {},
        }),
      ).not.toThrow();

      const run = getTaskRunFromChangeState(state, task.id);
      expect(run?.phase).toBe("done");
    });
  });
});
