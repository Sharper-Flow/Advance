import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import {
  createDefaultGates,
  type Change,
  type Task,
  type WisdomEntry,
} from "../types";
import type { ChangeWorkflowInput } from "./contracts";
import { getChangeStateQuery } from "./messages";
import {
  replayChangeAsSignals,
  validateMigrationRoundTrip,
} from "./migration-replay";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));
const NOW = "2026-05-05T00:00:00.000Z";

function makeTask(id: string, status: Task["status"]): Task {
  return {
    id,
    title: `${status} task`,
    type: "code",
    status,
    priority: 1,
    created_at: NOW,
    started_at:
      status === "in_progress" ? "2026-05-05T00:00:30.000Z" : undefined,
    completed_at:
      status === "done" || status === "cancelled"
        ? "2026-05-05T00:01:00.000Z"
        : undefined,
    implementation_summary: status === "done" ? "Implemented" : undefined,
    verification: status === "done" ? "Verified" : undefined,
    touched_files: status === "done" ? ["src/example.ts"] : undefined,
    blockReason: status === "blocked" ? "Needs input" : undefined,
    cancellation:
      status === "cancelled"
        ? {
            reason: "No longer needed",
            approved_by_user: true,
            approval_evidence: "test approval",
            approved_at: "2026-05-05T00:01:00.000Z",
          }
        : undefined,
  };
}

function makeChange(): Change {
  const wisdom: WisdomEntry[] = [
    {
      id: "ws-one",
      type: "pattern",
      content: "Keep migration deterministic",
      recorded_at: "2026-05-05T00:02:00.000Z",
    },
  ];

  return {
    id: "migrationRoundTripChange",
    title: "Migration round-trip change",
    status: "active",
    created_at: NOW,
    tasks: [
      makeTask("tk-pending", "pending"),
      makeTask("tk-progress", "in_progress"),
      makeTask("tk-blocked", "blocked"),
      makeTask("tk-done", "done"),
      makeTask("tk-cancelled", "cancelled"),
    ],
    deltas: {},
    wisdom,
    gates: {
      ...createDefaultGates(),
      proposal: {
        status: "done",
        completed_at: "2026-05-05T00:03:00.000Z",
        completed_by: "agent",
      },
      discovery: {
        status: "awaiting_approval",
        approval_evidence: "Discovery ready",
        started_at: "2026-05-05T00:04:00.000Z",
      },
      design: {
        status: "stuck",
        stuck_reason: "Validator conflict",
        started_at: "2026-05-05T00:05:00.000Z",
      },
    },
  };
}

function makeInput(change: Change): ChangeWorkflowInput {
  return {
    projectId: "migration-roundtrip-test-project",
    changeId: change.id,
    title: change.title,
    initializedAt: change.created_at,
    searchAttributesEnabled: false,
    seedState: {
      status: change.status,
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

describe("signal architecture migration replay", () => {
  it("replays docs, task lifecycle, ordered gates, wisdom, and validates round trip", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `migration-roundtrip-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const change = makeChange();
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `migration-roundtrip-${Date.now()}`,
            taskQueue,
            args: [makeInput(change)],
          });

          await replayChangeAsSignals(handle, change, {
            proposal: "Proposal text",
            problemStatement: "Problem text",
            agreement: "Agreement text",
            design: "Design text",
          });

          const state = await handle.query(getChangeStateQuery);
          const report = validateMigrationRoundTrip(change, state, {
            proposal: "Proposal text",
            problemStatement: "Problem text",
            agreement: "Agreement text",
            design: "Design text",
          });

          expect(report.ok).toBe(true);
          expect(report.unexpectedLosses).toEqual([]);
          expect(state.tasks.map((task) => task.status).sort()).toEqual(
            ["blocked", "cancelled", "done", "in_progress", "pending"].sort(),
          );
          expect(state.gates.proposal.status).toBe("done");
          expect(state.gates.discovery.status).toBe("awaiting_approval");
          expect(state.gates.design.status).toBe("stuck");
          expect(state.wisdom).toHaveLength(1);
          expect(state.documents?.proposal).toBe("Proposal text");
          expect(state.documents?.problemStatement).toBe("Problem text");
        });
      },
    );
  }, 60_000);
});
