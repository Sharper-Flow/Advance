import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { WorkflowHandle } from "@temporalio/client";

import type { Task } from "../types";
import { createDefaultGates } from "../types";
import type { ChangeWorkflowInput, ChangeWorkflowState } from "./contracts";
import {
  acceptanceCriteriaSetSignal,
  agreementUpdatedSignal,
  archiveRequestedSignal,
  changeCancelledSignal,
  conformanceLockedSignal,
  conformanceOverriddenSignal,
  conformanceVerdictSignal,
  contractAmendedSignal,
  contractReviewMatrixSetSignal,
  contractSetSignal,
  designUpdatedSignal,
  gateAwaitingApprovalSignal,
  gateCompletedSignal,
  gateInProgressSignal,
  gateReenteredSignal,
  gateStuckSignal,
  getChangeStateQuery,
  problemStatementUpdatedSignal,
  proposalUpdatedSignal,
  reflectionRecordedSignal,
  taskAddedSignal,
  taskAssignedSignal,
  taskBlockedSignal,
  taskCancelledSignal,
  taskCompletedSignal,
  taskRemovedSignal,
  taskUpdatedSignal,
  wisdomAddedSignal,
  worktreeCreatedSignal,
  worktreeDeletedSignal,
} from "./messages";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";
import { inspectArtifactActivity } from "./activities";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

function makeChangeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "signal-handler-test-project",
    changeId,
    title: `Signal handler test: ${changeId}`,
    initializedAt: "2026-05-05T00:00:00.000Z",
    searchAttributesEnabled: false,
    seedState: {
      status: "active",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

function makeTask(id: string, title = id): Task {
  return {
    id,
    title,
    type: "code",
    status: "pending",
    priority: 0,
    created_at: "2026-05-05T00:00:00.000Z",
  };
}

async function withSignalWorker(
  name: string,
  fn: (
    handle: WorkflowHandle<typeof import("./workflows").changeWorkflow>,
  ) => Promise<void>,
): Promise<void> {
  await withTestWorkflowEnvironment(
    () => TestWorkflowEnvironment.createTimeSkipping(),
    async (env) => {
      const taskQueue = `signal-handlers-${name}`;
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue,
      });

      await worker.runUntil(async () => {
        const handle = await env.client.workflow.start("changeWorkflow", {
          workflowId: `signal-${name}-${Date.now()}`,
          taskQueue,
          args: [makeChangeInput(name)],
        });
        await fn(handle);
      });
    },
  );
}

async function withArtifactSignalWorker(
  name: string,
  input: ChangeWorkflowInput,
  fn: (
    handle: WorkflowHandle<typeof import("./workflows").changeWorkflow>,
  ) => Promise<void>,
): Promise<void> {
  await withTestWorkflowEnvironment(
    () => TestWorkflowEnvironment.createTimeSkipping(),
    async (env) => {
      const taskQueue = `signal-handlers-${name}`;
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue,
        activities: { inspectArtifactActivity },
      });

      await worker.runUntil(async () => {
        const handle = await env.client.workflow.start("changeWorkflow", {
          workflowId: `signal-${name}-${Date.now()}`,
          taskQueue,
          args: [input],
        });
        await fn(handle);
      });
    },
  );
}

async function queryState(
  handle: WorkflowHandle<typeof import("./workflows").changeWorkflow>,
): Promise<ChangeWorkflowState> {
  return await handle.query(getChangeStateQuery);
}

async function waitForGateStatus(
  handle: WorkflowHandle<typeof import("./workflows").changeWorkflow>,
  gateId: keyof ChangeWorkflowState["gates"],
  status: ChangeWorkflowState["gates"][keyof ChangeWorkflowState["gates"]]["status"],
): Promise<ChangeWorkflowState> {
  for (let i = 0; i < 20; i++) {
    const state = await queryState(handle);
    if (state.gates[gateId].status === status) return state;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return await queryState(handle);
}

describe("changeWorkflow signal handlers", () => {
  it("applies document, task, gate, wisdom, worktree, and conformance signals to workflow state", async () => {
    await withSignalWorker("state-mutations", async (handle) => {
      await handle.signal(proposalUpdatedSignal, {
        text: "proposal text",
        updatedBy: "tester",
        updatedAt: "2026-05-05T00:00:01.000Z",
      });
      await handle.signal(problemStatementUpdatedSignal, {
        text: "problem text",
        updatedAt: "2026-05-05T00:00:02.000Z",
      });
      await handle.signal(agreementUpdatedSignal, {
        text: "agreement text",
        updatedAt: "2026-05-05T00:00:03.000Z",
      });
      await handle.signal(designUpdatedSignal, {
        text: "design text",
        updatedAt: "2026-05-05T00:00:04.000Z",
      });
      await handle.signal(acceptanceCriteriaSetSignal, {
        criteria: ["SC1", "SC2"],
        setBy: "tester",
        setAt: "2026-05-05T00:00:05.000Z",
      });
      await handle.signal(contractSetSignal, {
        contract: {
          version: 1,
          rigor: "standard",
          source: {
            artifact: "agreement",
            approvedAt: "2026-05-05T00:00:06.000Z",
          },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Contract state is persisted.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          amendments: [],
        },
        updatedAt: "2026-05-05T00:00:06.000Z",
      });

      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-added", "added task"),
        addedAt: "2026-05-05T00:01:00.000Z",
      });
      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-updated", "updated task"),
        addedAt: "2026-05-05T00:01:01.000Z",
      });
      await handle.signal(taskUpdatedSignal, {
        taskId: "tk-updated",
        partial: { title: "updated title", priority: 3 },
        updatedAt: "2026-05-05T00:01:02.000Z",
      });
      await handle.signal(taskAssignedSignal, {
        taskId: "tk-added",
        sessionId: "session-1",
        assignedAt: "2026-05-05T00:01:03.000Z",
      });
      await handle.signal(taskBlockedSignal, {
        taskId: "tk-added",
        reason: "needs dependency",
        attempts: [],
        blockedAt: "2026-05-05T00:01:04.000Z",
      });
      await handle.signal(taskCompletedSignal, {
        taskId: "tk-updated",
        verification: "focused signal tests pass",
        summary: "completed task",
        filesTouched: ["plugin/src/temporal/workflows.ts"],
        checkpointSha: "abc1234",
        completedAt: "2026-05-05T00:01:05.000Z",
      });
      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-cancelled", "cancelled task"),
        addedAt: "2026-05-05T00:01:06.000Z",
      });
      await handle.signal(taskCancelledSignal, {
        taskId: "tk-cancelled",
        approvalEvidence: "test approval",
        reason: "no longer needed",
        cancelledAt: "2026-05-05T00:01:07.000Z",
      });
      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-removed", "removed task"),
        addedAt: "2026-05-05T00:01:08.000Z",
      });
      await handle.signal(taskRemovedSignal, {
        taskId: "tk-removed",
        removedAt: "2026-05-05T00:01:09.000Z",
      });

      await handle.signal(gateInProgressSignal, {
        gateId: "planning",
        triggeredBy: "tester",
        triggeredAt: "2026-05-05T00:02:00.000Z",
      });
      await handle.signal(gateAwaitingApprovalSignal, {
        gateId: "acceptance",
        evidence: "acceptance report",
        triggeredAt: "2026-05-05T00:02:01.000Z",
      });
      await handle.signal(gateStuckSignal, {
        gateId: "release",
        reason: "conformance drift",
        triggeredAt: "2026-05-05T00:02:02.000Z",
      });
      await handle.signal(gateCompletedSignal, {
        gateId: "proposal",
        approvalEvidence: "approved in test",
        completedBy: "tester",
        completedAt: "2026-05-05T00:02:03.000Z",
        compatibilityReason: "legacy signal handler fixture has no artifact store",
      });

      await handle.signal(wisdomAddedSignal, {
        entry: {
          id: "ws-1",
          type: "pattern",
          content: "signals mutate workflow state",
          recorded_at: "2026-05-05T00:03:00.000Z",
        },
        addedAt: "2026-05-05T00:03:00.000Z",
      });
      await handle.signal(reflectionRecordedSignal, {
        report: { verdict: "useful" },
        recordedAt: "2026-05-05T00:03:01.000Z",
      });
      await handle.signal(worktreeCreatedSignal, {
        branch: "change/signal-test",
        path: "/tmp/signal-test",
        baseRef: "main",
        headSha: "def5678",
        createdAt: "2026-05-05T00:03:02.000Z",
      });
      await handle.signal(worktreeDeletedSignal, {
        branch: "change/signal-test",
        reason: "merged",
        deletedAt: "2026-05-05T00:03:03.000Z",
      });
      await handle.signal(conformanceLockedSignal, {
        specs: ["rq-one", "rq-two"],
        lockedAt: "2026-05-05T00:03:04.000Z",
      });
      await handle.signal(conformanceVerdictSignal, {
        verdict: "DRIFT",
        runId: "run-1",
        failed: [{ rq_id: "rq-one", summary: "missing behavior" }],
        recordedAt: "2026-05-05T00:03:05.000Z",
      });
      await handle.signal(conformanceOverriddenSignal, {
        user: "tester",
        reason: "known fixture drift",
        reVerifyDeadline: "2026-05-06",
        overriddenAt: "2026-05-05T00:03:06.000Z",
      });
      await handle.signal(contractReviewMatrixSetSignal, {
        reviewMatrix: {
          reviewedAt: "2026-05-05T00:03:07.000Z",
          rows: [
            {
              contractId: "AC1",
              kind: "acceptance_criterion",
              status: "pass",
              evidencePolicy: "test",
              evidence: "workflow signal test",
            },
          ],
        },
        updatedAt: "2026-05-05T00:03:07.000Z",
      });
      await handle.signal(contractAmendedSignal, {
        amendments: [
          {
            id: "am-1",
            actor: "tester",
            reason: "clarified wording without changing intent",
            amendedAt: "2026-05-05T00:03:08.000Z",
            affectedIds: ["AC1"],
            invalidatesReviewMatrix: false,
          },
        ],
        updatedAt: "2026-05-05T00:03:08.000Z",
      });

      const state = await queryState(handle);
      expect(state.documents).toEqual({
        proposal: "proposal text",
        problemStatement: "problem text",
        agreement: "agreement text",
        design: "design text",
      });
      expect(state.acceptanceCriteria).toEqual([
        "Contract state is persisted.",
      ]);
      expect(state.contract).toMatchObject({
        rigor: "standard",
        items: [{ id: "AC1" }],
        reviewMatrix: {
          rows: [{ contractId: "AC1", status: "pass" }],
        },
        amendments: [{ id: "am-1" }],
      });
      expect(state.tasks.map((task) => task.id)).toEqual([
        "tk-added",
        "tk-updated",
        "tk-cancelled",
      ]);
      expect(state.tasks.find((task) => task.id === "tk-added")).toMatchObject({
        status: "blocked",
        assignedTo: "session-1",
        blockReason: "needs dependency",
      });
      expect(
        state.tasks.find((task) => task.id === "tk-updated"),
      ).toMatchObject({
        status: "done",
        title: "updated title",
        priority: 3,
        verification: "focused signal tests pass",
        checkpointSha: "abc1234",
      });
      expect(
        state.tasks.find((task) => task.id === "tk-cancelled"),
      ).toMatchObject({
        status: "cancelled",
        cancelApproval: "test approval",
        cancellation: {
          reason: "no longer needed",
          approved_by_user: true,
          approval_evidence: "test approval",
        },
      });
      expect(state.gates.proposal).toMatchObject({
        status: "done",
        completed_by: "tester",
        approval_evidence: "approved in test",
      });
      expect(state.gates.planning).toMatchObject({
        status: "in_progress",
        triggered_by: "tester",
      });
      expect(state.gates.acceptance).toMatchObject({
        status: "awaiting_approval",
        approval_evidence: "acceptance report",
      });
      expect(state.gates.release).toMatchObject({
        status: "stuck",
        stuck_reason: "conformance drift",
      });
      expect(state.wisdom).toHaveLength(1);
      expect((state as any).reflections).toEqual([{ verdict: "useful" }]);
      expect((state as any).worktrees["change/signal-test"]).toMatchObject({
        branch: "change/signal-test",
        path: "/tmp/signal-test",
        status: "deleted",
      });
      expect((state as any).conformance).toMatchObject({
        lockedSpecs: ["rq-one", "rq-two"],
        lastVerdict: {
          verdict: "DRIFT",
          runId: "run-1",
        },
        overrides: [
          {
            user: "tester",
            reason: "known fixture drift",
          },
        ],
      });
      expect(state.lastSignalAt).toBe("2026-05-05T00:03:08.000Z");
    });
  }, 30_000);

  it("records gate reentry by resetting the selected gate and downstream gates", async () => {
    await withSignalWorker("gate-reentry", async (handle) => {
      await handle.signal(gateCompletedSignal, {
        gateId: "proposal",
        completedBy: "tester",
        completedAt: "2026-05-05T00:00:01.000Z",
        compatibilityReason: "legacy signal handler fixture has no artifact store",
      });
      await handle.signal(gateCompletedSignal, {
        gateId: "discovery",
        completedBy: "tester",
        completedAt: "2026-05-05T00:00:02.000Z",
        compatibilityReason: "legacy signal handler fixture has no artifact store",
      });
      await handle.signal(gateCompletedSignal, {
        gateId: "design",
        completedBy: "tester",
        completedAt: "2026-05-05T00:00:03.000Z",
        compatibilityReason: "legacy signal handler fixture has no artifact store",
      });
      await waitForGateStatus(handle, "design", "done");
      await handle.signal(gateReenteredSignal, {
        fromGateId: "design",
        reason: "scope changed",
        scopeDelta: "new AC",
        reenteredBy: "tester",
        reenteredAt: "2026-05-05T00:00:04.000Z",
      });

      const state = await queryState(handle);
      expect(state.gates.proposal.status).toBe("done");
      expect(state.gates.discovery.status).toBe("done");
      expect(state.gates.design.status).toBe("pending");
      expect(state.gates.planning.status).toBe("pending");
      expect(state.reentry_history?.[0]).toMatchObject({
        from_gate: "design",
        reason: "scope changed",
        scope_delta: "new AC",
        reopened_by: "tester",
      });
    });
  }, 30_000);

  it("blocks artifact-backed gate completion when the required artifact is missing", async () => {
    const dir = await createTempDir();
    try {
      const input = {
        ...makeChangeInput("missing-artifact"),
        projectionChangesDir: join(dir, "changes"),
      };

      await withArtifactSignalWorker("missing-artifact", input, async (handle) => {
        await handle.signal(gateCompletedSignal, {
          gateId: "proposal",
          completedBy: "tester",
          completedAt: "2026-05-05T00:00:01.000Z",
        });

        const state = await waitForGateStatus(handle, "proposal", "stuck");
        expect(state.gates.proposal.status).toBe("stuck");
        expect(state.gates.proposal.stuck_reason).toContain("ARTIFACT_MISSING");
      });
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);

  it("records artifact evidence when required artifact passes deterministic checks", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "valid-artifact");
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        join(changeDir, "proposal.md"),
        "# Proposal\n\nThis artifact has enough durable gate evidence.",
      );
      const input = {
        ...makeChangeInput("valid-artifact"),
        projectionChangesDir: changesDir,
      };

      await withArtifactSignalWorker("valid-artifact", input, async (handle) => {
        await handle.signal(gateCompletedSignal, {
          gateId: "proposal",
          completedBy: "tester",
          completedAt: "2026-05-05T00:00:01.000Z",
        });

        const state = await waitForGateStatus(handle, "proposal", "done");
        expect(state.gates.proposal.status).toBe("done");
        expect(state.gates.proposal.artifact_evidence).toMatchObject({
          kind: "proposal",
          non_whitespace_chars: expect.any(Number),
        });
      });
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);

  it("blocks direct completion that skips prior gates before artifact inspection", async () => {
    const dir = await createTempDir();
    try {
      const input = {
        ...makeChangeInput("sequence-artifact"),
        projectionChangesDir: join(dir, "changes"),
      };

      await withArtifactSignalWorker("sequence-artifact", input, async (handle) => {
        await handle.signal(gateCompletedSignal, {
          gateId: "design",
          completedBy: "tester",
          completedAt: "2026-05-05T00:00:01.000Z",
        });

        const state = await waitForGateStatus(handle, "design", "stuck");
        expect(state.gates.design.status).toBe("stuck");
        expect(state.gates.design.stuck_reason).toContain(
          "PRIOR_GATE_INCOMPLETE",
        );
      });
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);

  it("treats archiveRequested and changeCancelled as terminal lifecycle signals", async () => {
    await withSignalWorker("archive-terminal", async (handle) => {
      await handle.signal(archiveRequestedSignal, {
        approvalEvidence: "ship it",
        requestedBy: "tester",
        requestedAt: "2026-05-05T00:00:01.000Z",
      });
      await expect(handle.result()).resolves.toBeUndefined();
      const description = await handle.describe();
      expect(description.status.name).toBe("COMPLETED");
    });

    await withSignalWorker("cancel-terminal", async (handle) => {
      await handle.signal(changeCancelledSignal, {
        approvalEvidence: "cancel approved",
        reason: "not planned",
        cancelledBy: "tester",
        cancelledAt: "2026-05-05T00:00:01.000Z",
      });
      await expect(handle.result()).resolves.toBeUndefined();
      const description = await handle.describe();
      expect(description.status.name).toBe("COMPLETED");
    });
  }, 30_000);

  it("stores structured_output from taskCompletedSignal on task", async () => {
    await withSignalWorker("structured-output", async (handle) => {
      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-struct", "structured output task"),
        addedAt: "2026-05-05T00:00:01.000Z",
      });
      await handle.signal(taskCompletedSignal, {
        taskId: "tk-struct",
        verification: "tests pass",
        summary: "implemented feature",
        filesTouched: [],
        completedAt: "2026-05-05T00:00:02.000Z",
        structured_output: {
          filesChanged: [{ path: "src/foo.ts", linesAdded: 5 }],
          testsAdded: 2,
          testsModified: 0,
          decisions: [{ decision: "use schema", why: "type safety" }],
          followUps: [],
        },
      });

      const state = await queryState(handle);
      const task = state.tasks.find((t) => t.id === "tk-struct");
      expect(task).toBeDefined();
      expect(task!.structured_output).toBeDefined();
      expect(task!.structured_output.filesChanged).toHaveLength(1);
      expect(task!.structured_output.filesChanged[0].path).toBe("src/foo.ts");
      expect(task!.structured_output.testsAdded).toBe(2);
    });
  }, 30_000);

  it("taskCompletedSignal without structured_output leaves field undefined", async () => {
    await withSignalWorker("no-structured-output", async (handle) => {
      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-nostruct", "no structured output task"),
        addedAt: "2026-05-05T00:00:01.000Z",
      });
      await handle.signal(taskCompletedSignal, {
        taskId: "tk-nostruct",
        verification: "done",
        summary: "completed",
        filesTouched: [],
        completedAt: "2026-05-05T00:00:02.000Z",
      });

      const state = await queryState(handle);
      const task = state.tasks.find((t) => t.id === "tk-nostruct");
      expect(task).toBeDefined();
      expect(task!.structured_output).toBeUndefined();
    });
  }, 30_000);

  it("drains in-flight handlers before continuing as new", () => {
    const source = readFileSync(workflowsPath, "utf8");

    expect(source).toMatch(
      /await wf\.condition\(wf\.allHandlersFinished\);\s+await wf\.continueAsNew<typeof changeWorkflow>\(seed\);/,
    );
  });
});
