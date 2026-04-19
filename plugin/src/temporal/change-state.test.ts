import { describe, expect, it } from "vitest";
import {
  addChangeWisdom,
  addTaskToChangeState,
  cancelTaskInChangeState,
  closeChangeInChangeState,
  completeGateInChangeState,
  createChangeWorkflowState,
  listTasksFromChangeState,
  reclassifyTaskTddInChangeState,
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
});
