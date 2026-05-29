import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { WorkflowHandle } from "@temporalio/client";

import type { Task } from "../types";
import { createDefaultGates } from "../types";
import type { ChangeWorkflowInput, ChangeWorkflowState } from "./contracts";
import {
  acceptanceCriteriaSetSignal,
  acceptanceUpdatedSignal,
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
  executiveSummaryUpdatedSignal,
  gateAwaitingApprovalSignal,
  gateCompletedSignal,
  gateInProgressSignal,
  gateReenteredSignal,
  gateStuckSignal,
  getChangeStateQuery,
  problemStatementUpdatedSignal,
  proposalUpdatedSignal,
  reflectionRecordedSignal,
  subagentReportSubmittedSignal,
  taskAddedSignal,
  taskAssignedSignal,
  taskBlockedSignal,
  taskCancelledSignal,
  taskCompletedSignal,
  taskRemovedSignal,
  taskUpdatedSignal,
  updateArtifactMetadataSignal,
  wisdomAddedSignal,
  worktreeCreatedSignal,
  worktreeDeletedSignal,
} from "./messages";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";
import { inspectArtifactActivity, writeArtifactActivity } from "./activities";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));
const contractsPath = fileURLToPath(new URL("./contracts.ts", import.meta.url));

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

function makeEngineerReport(taskId: string, attempt = 1) {
  return {
    schema_version: "1.0" as const,
    change_id: "signal-handler-test-project",
    task_id: taskId,
    attempt,
    agent: "adv-engineer" as const,
    scope: "Persist report",
    status: "complete" as const,
    files_touched: ["plugin/src/types/subagent-reports.ts"],
    verification: [
      {
        command: "pnpm test",
        exit_code: 0,
        summary: "tests pass",
      },
    ],
    decisions: [],
    blockers: [],
    follow_ups: [],
    related_scan: "none",
    workdir_used: "/tmp/worktree",
    context_update_for_adv: {
      what_ads_needs_to_know: "report persisted",
      suggested_next_action: "continue",
    },
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
        activities: { inspectArtifactActivity, writeArtifactActivity },
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

function extractSetHandlerBlocks(source: string): string[] {
  const blocks: string[] = [];
  let searchIndex = 0;
  while (searchIndex < source.length) {
    const start = source.indexOf("wf.setHandler(", searchIndex);
    if (start === -1) break;

    let depth = 0;
    let end = start;
    for (; end < source.length; end++) {
      const char = source[end];
      if (char === "(") depth++;
      if (char === ")") {
        depth--;
        if (depth === 0) {
          blocks.push(source.slice(start, end + 1));
          break;
        }
      }
    }
    searchIndex = end + 1;
  }

  return blocks;
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
      await handle.signal(executiveSummaryUpdatedSignal, {
        text: "exec summary text",
        updatedAt: "2026-05-05T00:00:04.500Z",
      });
      await handle.signal(acceptanceUpdatedSignal, {
        text: "acceptance text",
        updatedAt: "2026-05-05T00:00:04.750Z",
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
        compatibilityReason:
          "legacy signal handler fixture has no artifact store",
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
        executiveSummary: "exec summary text",
        acceptance: "acceptance text",
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
        compatibilityReason:
          "legacy signal handler fixture has no artifact store",
      });
      await handle.signal(gateCompletedSignal, {
        gateId: "discovery",
        completedBy: "tester",
        completedAt: "2026-05-05T00:00:02.000Z",
        compatibilityReason:
          "legacy signal handler fixture has no artifact store",
      });
      await handle.signal(gateCompletedSignal, {
        gateId: "design",
        completedBy: "tester",
        completedAt: "2026-05-05T00:00:03.000Z",
        compatibilityReason:
          "legacy signal handler fixture has no artifact store",
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

      await withArtifactSignalWorker(
        "missing-artifact",
        input,
        async (handle) => {
          await handle.signal(gateCompletedSignal, {
            gateId: "proposal",
            completedBy: "tester",
            completedAt: "2026-05-05T00:00:01.000Z",
          });

          const state = await waitForGateStatus(handle, "proposal", "stuck");
          expect(state.gates.proposal.status).toBe("stuck");
          expect(state.gates.proposal.stuck_reason).toContain(
            "ARTIFACT_MISSING",
          );
          expect(state.gates.proposal.readiness_blockers).toContainEqual(
            expect.objectContaining({ code: "ARTIFACT_MISSING" }),
          );
        },
      );
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);

  it("records artifact evidence when required artifact exists in workflow state", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const proposalContent =
        "# Proposal\n\nThis artifact has enough durable gate evidence.";
      const input = {
        ...makeChangeInput("valid-artifact"),
        projectionChangesDir: changesDir,
      };

      await withArtifactSignalWorker(
        "valid-artifact",
        input,
        async (handle) => {
          await handle.signal(proposalUpdatedSignal, {
            text: proposalContent,
            updatedBy: "tester",
            updatedAt: "2026-05-05T00:00:00.500Z",
          });
          await handle.signal(updateArtifactMetadataSignal, {
            kind: "proposal",
            metadata: {
              path: join(changesDir, "valid-artifact", "proposal.md"),
              updatedAt: "2026-05-05T00:00:00.500Z",
              contentHash: createHash("sha256")
                .update(proposalContent)
                .digest("hex"),
            },
          });
          await handle.signal(gateCompletedSignal, {
            gateId: "proposal",
            completedBy: "tester",
            completedAt: "2026-05-05T00:00:01.000Z",
          });

          const state = await waitForGateStatus(handle, "proposal", "done");
          expect(state.gates.proposal.status).toBe("done");
          expect(state.gates.proposal.artifact_evidence).toMatchObject({
            kind: "proposal",
            path: join(changesDir, "valid-artifact", "proposal.md"),
            content_hash: createHash("sha256")
              .update(proposalContent)
              .digest("hex"),
            non_whitespace_chars: expect.any(Number),
          });
        },
      );
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);

  it("completes discovery from workflow-state agreement without disk agreement file", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const agreementContent =
        "# Agreement\n\nThis agreement exists only in Temporal workflow state.";
      const gates = createDefaultGates();
      gates.proposal.status = "done";
      const input = {
        ...makeChangeInput("state-agreement-discovery"),
        projectionChangesDir: changesDir,
        seedState: {
          ...makeChangeInput("state-agreement-discovery").seedState,
          gates,
        },
      };

      await withArtifactSignalWorker(
        "state-agreement-discovery",
        input,
        async (handle) => {
          await handle.signal(agreementUpdatedSignal, {
            text: agreementContent,
            updatedAt: "2026-05-05T00:00:01.000Z",
          });
          await handle.signal(updateArtifactMetadataSignal, {
            kind: "agreement",
            metadata: {
              path: join(
                changesDir,
                "state-agreement-discovery",
                "agreement.md",
              ),
              updatedAt: "2026-05-05T00:00:01.000Z",
              contentHash: createHash("sha256")
                .update(agreementContent)
                .digest("hex"),
            },
          });
          await handle.signal(contractSetSignal, {
            contract: {
              version: 1,
              rigor: "standard",
              source: {
                artifact: "agreement",
                approvedAt: "2026-05-05T00:00:01.000Z",
              },
              items: [],
              amendments: [],
            },
            updatedAt: "2026-05-05T00:00:01.000Z",
          });

          await expect(
            readFile(
              join(changesDir, "state-agreement-discovery", "agreement.md"),
              "utf8",
            ),
          ).rejects.toMatchObject({ code: "ENOENT" });

          await handle.signal(gateCompletedSignal, {
            gateId: "discovery",
            completedBy: "tester",
            completedAt: "2026-05-05T00:00:02.000Z",
          });

          const state = await waitForGateStatus(handle, "discovery", "done");
          expect(state.gates.discovery.status).toBe("done");
          expect(state.gates.discovery.artifact_evidence).toMatchObject({
            kind: "agreement",
            path: join(changesDir, "state-agreement-discovery", "agreement.md"),
            content_hash: createHash("sha256")
              .update(agreementContent)
              .digest("hex"),
            non_whitespace_chars: expect.any(Number),
          });
        },
      );
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

      await withArtifactSignalWorker(
        "sequence-artifact",
        input,
        async (handle) => {
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
        },
      );
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);

  it("generates acceptance.md from typed contract review proof", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "acceptance-projection");
      const executiveSummaryContent =
        "# Executive Summary\n\nAcceptance proof persisted before approval.";
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        join(changeDir, "executive-summary.md"),
        executiveSummaryContent,
      );
      const gates = createDefaultGates();
      gates.proposal.status = "done";
      gates.discovery.status = "done";
      gates.design.status = "done";
      gates.planning.status = "done";
      gates.execution.status = "done";
      const input = {
        ...makeChangeInput("acceptance-projection"),
        projectionChangesDir: changesDir,
        seedState: {
          ...makeChangeInput("acceptance-projection").seedState,
          gates,
          // State-backed acceptance (completeStateBackedGate): proof comes
          // from state.documents.executiveSummary, not the disk file.
          documents: {
            executiveSummary: executiveSummaryContent,
          },
          artifacts: {
            executiveSummary: {
              path: join(changeDir, "executive-summary.md"),
              updatedAt: "2026-05-05T00:01:30.000Z",
              contentHash: createHash("sha256")
                .update(executiveSummaryContent)
                .digest("hex"),
            },
          },
          contract: {
            version: 1 as const,
            rigor: "standard" as const,
            source: {
              artifact: "agreement" as const,
              approvedAt: "2026-05-05T00:00:00.000Z",
            },
            items: [
              {
                id: "AC1",
                kind: "acceptance_criterion" as const,
                text: "Artifact-backed gates are enforced.",
                sourceArtifact: "agreement" as const,
                verificationRequired: true,
                evidencePolicy: "test" as const,
                status: "approved" as const,
              },
            ],
            reviewMatrix: {
              reviewedAt: "2026-05-05T00:01:00.000Z",
              rows: [
                {
                  contractId: "AC1",
                  kind: "acceptance_criterion" as const,
                  status: "pass" as const,
                  evidencePolicy: "test" as const,
                  evidence: "workflow tests pass",
                },
              ],
            },
            amendments: [],
          },
        },
      };

      await withArtifactSignalWorker(
        "acceptance-projection",
        input,
        async (handle) => {
          await handle.signal(gateCompletedSignal, {
            gateId: "acceptance",
            completedBy: "tester",
            completedAt: "2026-05-05T00:02:00.000Z",
          });

          const state = await waitForGateStatus(handle, "acceptance", "done");
          expect(state.gates.acceptance.artifact_evidence).toMatchObject({
            kind: "acceptance",
          });
          await expect(
            readFile(
              join(changesDir, "acceptance-projection", "acceptance.md"),
              "utf-8",
            ),
          ).resolves.toContain("Artifact-backed gates are enforced.");
        },
      );
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);

  // AC1/AC5 (completeStateBackedGate): acceptance completes from
  // state.documents.executiveSummary + state.artifacts.executiveSummary
  // metadata WITHOUT any pre-existing disk file. The Temporal-only store no
  // longer writes artifact .md files (no-disk-writes-invariant), so the legacy
  // disk inspectArtifactActivity path leaves the acceptance gate stuck with
  // ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING. The state-backed branch reads the
  // proof from workflow state, completes acceptance, and (AC7) materializes
  // executive-summary.md to disk for archive-bundle inclusion.
  //
  // RED before the fix: gate goes "stuck" because no disk file exists.
  it("completes acceptance state-backed with no pre-existing disk file (AC1, AC5, AC7)", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "acceptance-no-disk");
      const executiveSummaryContent =
        "# Executive Summary\n\nState-backed acceptance proof — no disk file written before approval.";
      // Intentionally create the change dir but DO NOT write
      // executive-summary.md — proof comes only from workflow state.
      await mkdir(changeDir, { recursive: true });
      const gates = createDefaultGates();
      gates.proposal.status = "done";
      gates.discovery.status = "done";
      gates.design.status = "done";
      gates.planning.status = "done";
      gates.execution.status = "done";
      const input = {
        ...makeChangeInput("acceptance-no-disk"),
        projectionChangesDir: changesDir,
        seedState: {
          ...makeChangeInput("acceptance-no-disk").seedState,
          gates,
          documents: {
            executiveSummary: executiveSummaryContent,
          },
          artifacts: {
            executiveSummary: {
              path: join(changeDir, "executive-summary.md"),
              updatedAt: "2026-05-05T00:01:30.000Z",
              contentHash: createHash("sha256")
                .update(executiveSummaryContent)
                .digest("hex"),
            },
          },
          contract: {
            version: 1 as const,
            rigor: "standard" as const,
            source: {
              artifact: "agreement" as const,
              approvedAt: "2026-05-05T00:00:00.000Z",
            },
            items: [
              {
                id: "AC1",
                kind: "acceptance_criterion" as const,
                text: "State-backed acceptance is enforced.",
                sourceArtifact: "agreement" as const,
                verificationRequired: true,
                evidencePolicy: "test" as const,
                status: "approved" as const,
              },
            ],
            reviewMatrix: {
              reviewedAt: "2026-05-05T00:01:00.000Z",
              rows: [
                {
                  contractId: "AC1",
                  kind: "acceptance_criterion" as const,
                  status: "pass" as const,
                  evidencePolicy: "test" as const,
                  evidence: "workflow tests pass",
                },
              ],
            },
            amendments: [],
          },
        },
      };

      await withArtifactSignalWorker(
        "acceptance-no-disk",
        input,
        async (handle) => {
          await handle.signal(gateCompletedSignal, {
            gateId: "acceptance",
            completedBy: "tester",
            completedAt: "2026-05-05T00:02:00.000Z",
          });

          const state = await waitForGateStatus(handle, "acceptance", "done");
          expect(state.gates.acceptance.status).toBe("done");
          expect(state.gates.acceptance.artifact_evidence).toMatchObject({
            kind: "acceptance",
          });
          // AC7: executive-summary.md materialized to disk for the archive
          // bundle even though no disk file existed before approval.
          await expect(
            readFile(join(changeDir, "executive-summary.md"), "utf-8"),
          ).resolves.toContain("State-backed acceptance proof");
        },
      );
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);

  // completeStateBackedGate: on the canonical state-backed acceptance path,
  // proof comes from state.documents.executiveSummary (not a disk-hash
  // comparison). The legacy disk-hash-stale blocker no longer fires for new
  // histories — the stale-contract class is prevented structurally by cache
  // invalidation (AC9) + sequential content/metadata signal ordering. The
  // meaningful state-backed block is: acceptance metadata present but the
  // executive-summary CONTENT is missing from workflow state.
  it("blocks acceptance when executive-summary content is missing from state", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "acceptance-missing-state-content");
      await mkdir(changeDir, { recursive: true });
      const gates = createDefaultGates();
      gates.proposal.status = "done";
      gates.discovery.status = "done";
      gates.design.status = "done";
      gates.planning.status = "done";
      gates.execution.status = "done";
      const input = {
        ...makeChangeInput("acceptance-missing-state-content"),
        projectionChangesDir: changesDir,
        seedState: {
          ...makeChangeInput("acceptance-missing-state-content").seedState,
          gates,
          // Metadata present (passes L1 acceptanceContractBlockers) but
          // state.documents.executiveSummary deliberately absent.
          artifacts: {
            executiveSummary: {
              path: join(changeDir, "executive-summary.md"),
              updatedAt: "2026-05-05T00:01:30.000Z",
              contentHash: "0".repeat(64),
            },
          },
          contract: {
            version: 1 as const,
            rigor: "standard" as const,
            source: {
              artifact: "agreement" as const,
              approvedAt: "2026-05-05T00:00:00.000Z",
            },
            items: [
              {
                id: "AC1",
                kind: "acceptance_criterion" as const,
                text: "Artifact-backed gates are enforced.",
                sourceArtifact: "agreement" as const,
                verificationRequired: true,
                evidencePolicy: "test" as const,
                status: "approved" as const,
              },
            ],
            reviewMatrix: {
              reviewedAt: "2026-05-05T00:01:00.000Z",
              rows: [
                {
                  contractId: "AC1",
                  kind: "acceptance_criterion" as const,
                  status: "pass" as const,
                  evidencePolicy: "test" as const,
                  evidence: "workflow tests pass",
                },
              ],
            },
            amendments: [],
          },
        },
      };

      await withArtifactSignalWorker(
        "acceptance-missing-state-content",
        input,
        async (handle) => {
          await handle.signal(gateCompletedSignal, {
            gateId: "acceptance",
            completedBy: "tester",
            completedAt: "2026-05-05T00:02:00.000Z",
          });

          const state = await waitForGateStatus(handle, "acceptance", "stuck");
          expect(state.gates.acceptance.stuck_reason).toContain(
            "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING",
          );
          expect(state.gates.acceptance.readiness_blockers).toContainEqual(
            expect.objectContaining({
              code: "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING",
            }),
          );
        },
      );
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

  it("stores sub-agent reports from subagentReportSubmittedSignal on task", async () => {
    await withSignalWorker("subagent-report", async (handle) => {
      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-report", "report task"),
        addedAt: "2026-05-05T00:00:01.000Z",
      });
      await handle.signal(subagentReportSubmittedSignal, {
        taskId: "tk-report",
        report: makeEngineerReport("tk-report"),
        submittedAt: "2026-05-05T00:00:02.000Z",
      });

      const state = await queryState(handle);
      const task = state.tasks.find((t) => t.id === "tk-report");
      expect(task).toBeDefined();
      expect(task!.subagent_reports).toHaveLength(1);
      expect(task!.subagent_reports![0].agent).toBe("adv-engineer");
      expect(task!.subagent_reports![0].attempt).toBe(1);
    });
  }, 30_000);

  it("records signal rejections instead of failing workflow when a signal apply path throws", async () => {
    await withSignalWorker("signal-rejection", async (handle) => {
      await handle.signal(taskUpdatedSignal, {
        taskId: "tk-missing",
        partial: { title: "should be rejected" },
        updatedAt: "2026-05-05T00:00:01.000Z",
      });

      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-after-rejection", "after rejection"),
        addedAt: "2026-05-05T00:00:02.000Z",
      });

      const state = await queryState(handle);
      const signalRejections = (state as any).signal_rejections ?? [];

      expect(signalRejections).toHaveLength(1);
      expect((state as any).signal_rejections_total).toBe(1);
      expect(signalRejections[0]).toMatchObject({
        signalName: "taskUpdated",
        errorClass: "Error",
      });
      expect(signalRejections[0].errorMessage).toContain("tk-missing");
      expect(signalRejections[0].payloadDigest).toEqual(
        expect.objectContaining({
          payload_size: expect.any(Number),
          payload_sample: expect.any(String),
          payload_fnv1a: expect.any(String),
        }),
      );
      expect(state.tasks.map((task) => task.id)).toContain(
        "tk-after-rejection",
      );
    });
  }, 30_000);

  it("routes every signal handler through a signal-safe wrapper", () => {
    const source = readFileSync(workflowsPath, "utf8");
    const signalHandlerBlocks = extractSetHandlerBlocks(source).filter(
      (block) => /wf\.setHandler\(\s*\w+Signal,/.test(block),
    );

    expect(signalHandlerBlocks.length).toBeGreaterThan(0);
    expect(source).not.toContain("safeUpdateHandler");
    for (const block of signalHandlerBlocks) {
      expect(block).toMatch(/,\s*(signalMutation|signalAsync)\(/);
    }
  });

  it("deduplicates repeated sub-agent report submissions by task agent and attempt", async () => {
    await withSignalWorker("subagent-report-dedupe", async (handle) => {
      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-report", "report task"),
        addedAt: "2026-05-05T00:00:01.000Z",
      });
      const payload = {
        taskId: "tk-report",
        report: makeEngineerReport("tk-report", 2),
        submittedAt: "2026-05-05T00:00:02.000Z",
      };
      await handle.signal(subagentReportSubmittedSignal, payload);
      await handle.signal(subagentReportSubmittedSignal, {
        ...payload,
        submittedAt: "2026-05-05T00:00:03.000Z",
      });

      const state = await queryState(handle);
      const task = state.tasks.find((t) => t.id === "tk-report");
      expect(task).toBeDefined();
      expect(task!.subagent_reports).toHaveLength(1);
      expect(task!.subagent_reports![0].attempt).toBe(2);
    });
  }, 30_000);

  it("maps sub-agent blockers into task error_recovery", async () => {
    await withSignalWorker("subagent-report-blocker", async (handle) => {
      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-report", "report task"),
        addedAt: "2026-05-05T00:00:01.000Z",
      });
      await handle.signal(subagentReportSubmittedSignal, {
        taskId: "tk-report",
        report: {
          ...makeEngineerReport("tk-report"),
          status: "error",
          blockers: [
            {
              file: "plugin/src/foo.ts",
              line: 12,
              what: "Type error",
              diagnosis: "Missing export",
            },
          ],
        },
        submittedAt: "2026-05-05T00:00:02.000Z",
      });

      const state = await queryState(handle);
      const task = state.tasks.find((t) => t.id === "tk-report");
      expect(task).toBeDefined();
      expect(task!.error_recovery?.error_class).toBe("SEMANTIC");
      expect(task!.error_recovery?.last_error).toContain("Type error");
      expect(task!.error_recovery?.attempts?.[0].diagnosis).toContain(
        "Missing export",
      );
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

  it("preserves checkpoint metadata when a weaker duplicate completion arrives", async () => {
    await withSignalWorker("preserve-checkpoint-metadata", async (handle) => {
      await handle.signal(taskAddedSignal, {
        task: makeTask("tk-preserve", "preserve metadata task"),
        addedAt: "2026-05-05T00:00:01.000Z",
      });
      await handle.signal(taskCompletedSignal, {
        taskId: "tk-preserve",
        verification: "checkpoint verification",
        summary: "checkpoint summary",
        filesTouched: ["src/strong.ts"],
        checkpointSha: "strong-sha",
        completedAt: "2026-05-05T00:00:02.000Z",
      });
      await handle.signal(taskCompletedSignal, {
        taskId: "tk-preserve",
        verification: "weaker duplicate",
        summary: "weaker summary",
        filesTouched: [],
        completedAt: "2026-05-05T00:00:03.000Z",
      });

      const state = await queryState(handle);
      const task = state.tasks.find((t) => t.id === "tk-preserve");
      expect(task).toBeDefined();
      expect(task!.verification).toBe("checkpoint verification");
      expect(task!.summary).toBe("checkpoint summary");
      expect(task!.filesTouched).toEqual(["src/strong.ts"]);
      expect(task!.touched_files).toEqual(["src/strong.ts"]);
      expect(task!.checkpointSha).toBe("strong-sha");
      expect(task!.completedAt).toBe("2026-05-05T00:00:02.000Z");
    });
  }, 30_000);

  it("drains in-flight handlers before continuing as new", () => {
    const source = readFileSync(workflowsPath, "utf8");

    expect(source).toMatch(
      /await wf\.condition\(wf\.allHandlersFinished\);\s+await wf\.continueAsNew<typeof changeWorkflow>\(seed\);/,
    );
  });

  it("preserves origin and worktree projections in continue-as-new seed", () => {
    const source = readFileSync(workflowsPath, "utf8");

    for (const assignment of [
      "origin: state.origin",
      "worktree_auto_managed: state.worktree_auto_managed",
      "target_worktree_path: state.target_worktree_path",
      "scope_worktrees: state.scope_worktrees",
    ]) {
      expect(source).toContain(assignment);
    }
  });

  it("continues as new with every declared seedState field", () => {
    const contracts = readFileSync(contractsPath, "utf8");
    const workflows = readFileSync(workflowsPath, "utf8");
    const seedStatePick = contracts.match(
      /seedState\?: Partial<\s*Pick<\s*ChangeWorkflowState,\s*([\s\S]*?)\s*>\s*>/,
    );

    expect(seedStatePick).not.toBeNull();
    const seedStateKeys = Array.from(
      seedStatePick![1].matchAll(/\|\s*"([^"]+)"/g),
      (match) => match[1],
    );

    expect(seedStateKeys).not.toHaveLength(0);
    for (const key of seedStateKeys) {
      expect(workflows).toContain(`${key}: state.${key}`);
    }
  });

  // AC3 (completeStateBackedGate): replay determinism. The new state-backed
  // acceptance patch marker MUST be checked BEFORE the legacy acceptance
  // disk-inspect patch marker. New histories record STATE_BACKED_ACCEPTANCE_
  // PROOF_PATCH and take the state-backed branch; old histories (without the
  // new marker) fall through to the legacy ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_
  // PATCH disk-inspect branch, so their committed command sequence still
  // replays deterministically. Ordering inversion would poison old-history
  // replay, so this structural guard protects the patch-ordering invariant.
  it("checks state-backed acceptance patch before the legacy disk-inspect patch (AC3)", () => {
    const source = readFileSync(workflowsPath, "utf8");

    const stateBackedIdx = source.indexOf(
      "wf.patched(STATE_BACKED_ACCEPTANCE_PROOF_PATCH)",
    );
    const legacyIdx = source.indexOf(
      "wf.patched(ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH)",
    );

    expect(stateBackedIdx).toBeGreaterThan(-1);
    expect(legacyIdx).toBeGreaterThan(-1);
    // State-backed branch must appear (and be evaluated) before the legacy
    // disk-inspect branch in the gate-completion if/else chain.
    expect(stateBackedIdx).toBeLessThan(legacyIdx);
  });
});
