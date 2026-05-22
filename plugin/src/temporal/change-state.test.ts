import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applyContractAmendedToState,
  applyGateReenteredToState,
  applyTaskAddedToState,
  applyTaskCompletedToState,
  completeGateInChangeState,
  createChangeWorkflowState,
} from "./change-state";
import type { ChangeOrigin } from "../types";
import type { ChangeWorkflowInput } from "./contracts";

const sourcePath = fileURLToPath(new URL("./change-state.ts", import.meta.url));

describe("change-state pure mutation helpers", () => {
  it("keeps workflow and I/O imports out of the mutation module", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toContain("@temporalio/");
    expect(source).not.toContain("../storage/");
    expect(source).not.toContain("../tools/");
    expect(source).not.toContain("node:");
  });

  it("records task lifecycle mutations without task-run ledger state", () => {
    const state = createChangeWorkflowState({
      changeId: "change-state-test",
      title: "Change state test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applyTaskAddedToState(state, {
      task: {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "unit verified",
      summary: "done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      completedAt: "2026-05-06T00:00:02.000Z",
    });

    expect(state.tasks[0]).toMatchObject({
      id: "tk-1",
      status: "done",
      verification: "unit verified",
      implementation_summary: "done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
    });
    expect(state).not.toHaveProperty("taskRuns");
    expect(state.lastSignalAt).toBe("2026-05-06T00:00:02.000Z");
  });

  it("preserves checkpoint metadata when a duplicate completion omits checkpointSha", () => {
    const state = createChangeWorkflowState({
      changeId: "checkpoint-sha-guard-test",
      title: "Checkpoint sha guard test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applyTaskAddedToState(state, {
      task: {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "checkpoint verified",
      summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "weaker duplicate",
      summary: "weaker done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      completedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.tasks[0]).toMatchObject({
      status: "done",
      verification: "checkpoint verified",
      implementation_summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    expect(state.lastSignalAt).toBe("2026-05-06T00:00:03.000Z");
  });

  it("preserves checkpoint metadata when a duplicate completion omits filesTouched", () => {
    const state = createChangeWorkflowState({
      changeId: "checkpoint-files-guard-test",
      title: "Checkpoint files guard test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applyTaskAddedToState(state, {
      task: {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "checkpoint verified",
      summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "weaker duplicate",
      summary: "weaker done",
      filesTouched: [],
      checkpointSha: "def456",
      completedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.tasks[0]).toMatchObject({
      verification: "checkpoint verified",
      implementation_summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    expect(state.lastSignalAt).toBe("2026-05-06T00:00:03.000Z");
  });

  it("allows an equally strong duplicate completion to replace checkpoint metadata", () => {
    const state = createChangeWorkflowState({
      changeId: "checkpoint-strong-replace-test",
      title: "Checkpoint strong replace test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applyTaskAddedToState(state, {
      task: {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "checkpoint verified",
      summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "new checkpoint verified",
      summary: "new checkpoint done",
      filesTouched: ["plugin/src/temporal/workflows.ts"],
      checkpointSha: "def456",
      completedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.tasks[0]).toMatchObject({
      verification: "new checkpoint verified",
      implementation_summary: "new checkpoint done",
      filesTouched: ["plugin/src/temporal/workflows.ts"],
      checkpointSha: "def456",
      completedAt: "2026-05-06T00:00:03.000Z",
    });
  });

  it("leaves sequential gate enforcement to the tool layer", () => {
    const state = createChangeWorkflowState({
      changeId: "gate-purity-test",
      title: "Gate purity test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    completeGateInChangeState(state, "planning", {
      now: "2026-05-06T00:00:01.000Z",
      completedBy: "tool-layer-after-validation",
    });

    expect(state.gates.planning).toMatchObject({
      status: "done",
      completed_by: "tool-layer-after-validation",
    });
  });

  it("invalidates contract review proof on amendment and downstream re-entry", () => {
    const state = createChangeWorkflowState({
      changeId: "contract-reentry-test",
      title: "Contract reentry test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    state.contract = {
      version: 1,
      rigor: "standard",
      source: { artifact: "agreement", approvedAt: "2026-05-06T00:00:00.000Z" },
      items: [
        {
          id: "AC1",
          kind: "acceptance_criterion",
          text: "Contract proof invalidates",
          sourceArtifact: "agreement",
          verificationRequired: true,
          evidencePolicy: "test",
          status: "approved",
        },
      ],
      reviewMatrix: {
        reviewedAt: "2026-05-06T00:00:01.000Z",
        rows: [
          {
            contractId: "AC1",
            kind: "acceptance_criterion",
            status: "pass",
            evidencePolicy: "test",
            evidence: "old proof",
          },
        ],
      },
      amendments: [],
    };

    applyContractAmendedToState(state, {
      amendments: [
        {
          id: "am-1",
          actor: "tester",
          reason: "substantive AC change",
          approvalEvidence: "approved",
          amendedAt: "2026-05-06T00:00:02.000Z",
          affectedIds: ["AC1"],
          invalidatesReviewMatrix: true,
        },
      ],
      updatedAt: "2026-05-06T00:00:02.000Z",
    });

    expect(state.contract.reviewMatrix).toBeUndefined();

    state.contract.reviewMatrix = {
      reviewedAt: "2026-05-06T00:00:03.000Z",
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion",
          status: "pass",
          evidencePolicy: "test",
          evidence: "new proof",
        },
      ],
    };

    applyGateReenteredToState(state, {
      fromGateId: "execution",
      reason: "implementation changed",
      scopeDelta: "new behavior evidence needed",
      reenteredBy: "tester",
      reenteredAt: "2026-05-06T00:00:04.000Z",
    });

    expect(state.contract.reviewMatrix).toBeUndefined();
  });

  it("carries optional origin on ChangeWorkflowState (rq-backlogCoord01 prereq)", () => {
    // rq-backlogCoord01 prereq (task A0): ChangeWorkflowState must carry
    // `origin` so `buildChangeSearchAttributes` can populate
    // `AdvBacklogIssueNumber` from `state.origin?.issue_number`.
    const state = createChangeWorkflowState({
      changeId: "origin-state-test",
      title: "Origin state test",
      createdAt: "2026-05-11T00:00:00.000Z",
    });

    const origin: ChangeOrigin = {
      kind: "roadmap",
      issue_number: 42,
    };
    state.origin = origin;

    expect(state.origin).toBeDefined();
    expect(state.origin?.kind).toBe("roadmap");
    expect(state.origin?.issue_number).toBe(42);
  });

  it("accepts origin in ChangeWorkflowInput.seedState pick list (rq-backlogCoord01 prereq)", () => {
    // rq-backlogCoord01 prereq (task A0): callers must be able to pass
    // `origin` through `ChangeWorkflowInput.seedState` so the workflow
    // can seed `state.origin` at start time.
    const input: ChangeWorkflowInput = {
      projectId: "test-project",
      changeId: "origin-seed-test",
      title: "Origin seed test",
      initializedAt: "2026-05-11T00:00:00.000Z",
      seedState: {
        origin: {
          kind: "roadmap",
          issue_number: 51,
        },
      },
    };

    expect(input.seedState?.origin?.issue_number).toBe(51);
  });
});
