import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { withTestWorkflowEnvironment } from "./with-test-env";
import {
  addTaskUpdate,
  updateTaskUpdate,
  completeGateUpdate,
  addAgendaItemUpdate,
  updateAgendaItemUpdate,
  addProjectWisdomUpdate,
  recordTaskEvidenceUpdate,
  recordMigrationEntryUpdate,
} from "../messages";
import { createDefaultGates } from "../../types";
import type {
  ChangeWorkflowInput,
  ProjectWorkflowInput,
  MigrationLedgerEntry,
} from "../contracts";
import { requiredAdvSearchAttributes } from "../observability";

const workflowsPath = fileURLToPath(
  new URL("../workflows.ts", import.meta.url),
);

async function registerAdvSearchAttributes(
  env: TestWorkflowEnvironment,
): Promise<void> {
  const searchAttributes: Record<string, number> = {};
  for (const attr of requiredAdvSearchAttributes()) {
    searchAttributes[attr.name] = attr.typeCode;
  }
  try {
    await env.connection.operatorService.addSearchAttributes({
      namespace: env.namespace ?? "default",
      searchAttributes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes("already exists")) {
      throw err;
    }
  }
}

describe("replay determinism", () => {
  it("changeWorkflow replays deterministically after representative mutations", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        await registerAdvSearchAttributes(env);

        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "replay-test-change",
        });

        await worker.runUntil(async () => {
          const input: ChangeWorkflowInput = {
            projectId: "proj-replay-001",
            changeId: "test-change-001",
            title: "Test change for replay",
            initializedAt: new Date().toISOString(),
            seedState: {
              status: "draft",
              tasks: [],
              wisdom: [],
              gates: createDefaultGates(),
              reentry_history: [],
            },
          };

          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `replay-change-${Date.now()}`,
            taskQueue: "replay-test-change",
            args: [input],
          });

          // Exercise mutations
          const newTask = await handle.executeUpdate(addTaskUpdate, {
            args: [
              {
                title: "Task 1",
                type: "code",
                section: "A",
              },
            ],
          });

          await handle.executeUpdate(updateTaskUpdate, {
            args: [
              newTask.id,
              {
                status: "in_progress",
              },
            ],
          });

          await handle.executeUpdate(recordTaskEvidenceUpdate, {
            args: [
              newTask.id,
              "green",
              {
                test_file: "src/temporal/service.test.ts",
                command: "pnpm test -- src/temporal/service.test.ts",
                output_snippet: "PASS src/temporal/service.test.ts",
                exit_code: 0,
                recorded_at: new Date().toISOString(),
              },
            ],
          });

          await handle.executeUpdate(completeGateUpdate, {
            args: ["proposal", undefined, "agent"],
          });

          // Fetch history and verify replay
          const history = await handle.fetchHistory();
          await Worker.runReplayHistory(
            { workflowsPath },
            history,
            handle.workflowId,
          );

          // If we get here without throwing, replay is deterministic
          expect(history.events).toBeDefined();
          expect(history.events!.length).toBeGreaterThan(0);
        });
      },
    );
  }, 60_000);

  it("projectWorkflow replays deterministically after representative mutations", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "replay-test-project",
        });

        await worker.runUntil(async () => {
          const input: ProjectWorkflowInput = {
            projectId: "proj-replay-002",
            initializedAt: new Date().toISOString(),
          };

          const handle = await env.client.workflow.start("projectWorkflow", {
            workflowId: `replay-project-${Date.now()}`,
            taskQueue: "replay-test-project",
            args: [input],
          });

          // Exercise mutations
          const newItem = await handle.executeUpdate(addAgendaItemUpdate, {
            args: [
              {
                title: "Investigate replay determinism",
                description: "Ensure workflows replay without divergence",
                priority: "high",
                category: "reliability",
              },
            ],
          });

          await handle.executeUpdate(updateAgendaItemUpdate, {
            args: [
              newItem.id,
              {
                status: "active",
              },
            ],
          });

          await handle.executeUpdate(addProjectWisdomUpdate, {
            args: [
              {
                type: "pattern",
                content:
                  "Use wf.condition with deterministic predicates for continue-as-new",
              },
            ],
          });

          const migrationEntry: MigrationLedgerEntry = {
            key: "temporal-native-reliability",
            source: "temporal",
            status: "done",
            recordedAt: new Date().toISOString(),
            detail: "Migrated to native Temporal connection with retry wrapper",
          };
          await handle.executeUpdate(recordMigrationEntryUpdate, {
            args: [migrationEntry],
          });

          // Fetch history and verify replay
          const history = await handle.fetchHistory();
          await Worker.runReplayHistory(
            { workflowsPath },
            history,
            handle.workflowId,
          );

          expect(history.events).toBeDefined();
          expect(history.events!.length).toBeGreaterThan(0);
        });
      },
    );
  }, 60_000);
});
