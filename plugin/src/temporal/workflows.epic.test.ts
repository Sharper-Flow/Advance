import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { WorkflowHandle } from "@temporalio/client";

import type { EpicWorkflowInput, EpicWorkflowState } from "./contracts";
import {
  changeLinkedSignal,
  entryTerminalSummarySignal,
  epicArchivedSignal,
  epicCreatedSignal,
  epicUpdatedSignal,
  getEpicQuery,
  getEpicStateQuery,
  shellAddedSignal,
  shellPromotedSignal,
} from "./messages";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";
import { DEFAULT_CHANGE_HISTORY_THRESHOLD } from "./contracts";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

function makeEpicInput(): EpicWorkflowInput {
  return {
    projectId: "epic-wf-test-project",
    epicId: `epic-${Date.now()}`,
    title: "Epic Workflow Test",
    narrative: "Testing epic workflow.",
    initializedAt: "2026-06-24T00:00:00.000Z",
    searchAttributesEnabled: false,
  };
}

async function queryState(
  handle: WorkflowHandle<typeof import("./workflows").epicWorkflow>,
): Promise<EpicWorkflowState> {
  return handle.query(getEpicStateQuery);
}

describe("epicWorkflow", () => {
  it("persists Epic state across signals and queries", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `epic-wf-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const input = makeEpicInput();
          const handle = await env.client.workflow.start("epicWorkflow", {
            workflowId: `epic-${input.epicId}`,
            taskQueue,
            args: [input],
          });

          await handle.signal(epicCreatedSignal, {
            id: input.epicId,
            title: input.title,
            narrative: input.narrative,
            entries: [],
            progress: {
              status: "active" as const,
              total_entries: 0,
              completed_entries: 0,
              active_entries: 0,
              next_entry_id: null,
              updated_at: input.initializedAt,
            },
            created_at: input.initializedAt,
            updated_at: input.initializedAt,
            version: 0,
          });

          await handle.signal(shellAddedSignal, {
            entryId: "shell-1",
            title: "Shell One",
            successHint: "Do the thing",
            idempotencyKey: "add-shell-1",
            addedAt: "2026-06-24T00:01:00.000Z",
          });

          await handle.signal(shellPromotedSignal, {
            entryId: "shell-1",
            changeId: "change-1",
            promotedBy: "agent",
            promotedAt: "2026-06-24T00:02:00.000Z",
            idempotencyKey: "promote-shell-1",
          });

          await handle.signal(changeLinkedSignal, {
            entryId: "entry-2",
            changeId: "change-2",
            title: "Linked Change",
            order: 5,
            idempotencyKey: "link-change-2",
            linkedAt: "2026-06-24T00:03:00.000Z",
          });

          const state = await queryState(handle);
          expect(state.epic.entries).toHaveLength(2);
          expect(state.epic.entries[0].kind).toBe("change");
          expect(state.epic.entries[1].kind).toBe("change");

          const epic = await handle.query(getEpicQuery);
          expect(epic.id).toBe(input.epicId);
        });
      },
    );
  }, 60000);

  it("records rejection for stale-version update instead of failing workflow", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `epic-wf-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const input = makeEpicInput();
          const handle = await env.client.workflow.start("epicWorkflow", {
            workflowId: `epic-${input.epicId}`,
            taskQueue,
            args: [input],
          });

          await handle.signal(epicCreatedSignal, {
            id: input.epicId,
            title: input.title,
            narrative: input.narrative,
            entries: [],
            progress: {
              status: "active" as const,
              total_entries: 0,
              completed_entries: 0,
              active_entries: 0,
              next_entry_id: null,
              updated_at: input.initializedAt,
            },
            created_at: input.initializedAt,
            updated_at: input.initializedAt,
            version: 0,
          });

          await handle.signal(epicUpdatedSignal, {
            title: "Updated Title",
            expectedVersion: 5,
            idempotencyKey: "update-stale",
            updatedAt: "2026-06-24T00:01:00.000Z",
          });

          const state = await queryState(handle);
          expect(state.rejections).toHaveLength(1);
          expect(state.rejections![0].signalName).toBe("epicUpdated");
          expect(state.epic.title).toBe(input.title);
        });
      },
    );
  }, 60000);

  it("preserves idempotency ledger and Epic state across continue-as-new", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `epic-can-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const input = makeEpicInput();
          const workflowId = `epic-can-${input.epicId}`;
          const handle = await env.client.workflow.start("epicWorkflow", {
            workflowId,
            taskQueue,
            args: [input],
          });

          await handle.signal(epicCreatedSignal, {
            id: input.epicId,
            title: input.title,
            narrative: input.narrative,
            entries: [],
            progress: {
              status: "active" as const,
              total_entries: 0,
              completed_entries: 0,
              active_entries: 0,
              next_entry_id: null,
              updated_at: input.initializedAt,
            },
            created_at: input.initializedAt,
            updated_at: input.initializedAt,
            version: 0,
          });

          const signalCount = DEFAULT_CHANGE_HISTORY_THRESHOLD + 200;
          const results = await Promise.allSettled(
            Array.from({ length: signalCount }, (_, i) =>
              handle.signal(shellAddedSignal, {
                entryId: `shell-${i}`,
                title: `Shell ${i}`,
                successHint: "hint",
                idempotencyKey: `add-shell-${i}`,
                addedAt: `2026-06-24T00:${String(Math.floor((i + 1) / 60)).padStart(2, "0")}:${String((i + 1) % 60).padStart(2, "0")}.000Z`,
              }),
            ),
          );
          expect(results.filter((r) => r.status === "rejected")).toHaveLength(
            0,
          );

          const latestHandle = env.client.workflow.getHandle(workflowId);
          let state = await queryState(latestHandle);
          for (
            let i = 0;
            i < 30 && state.epic.entries.length < signalCount;
            i++
          ) {
            await new Promise((r) => setTimeout(r, 50));
            state = await queryState(latestHandle);
          }

          expect(state.epic.entries).toHaveLength(signalCount);
          expect(new Set(state.epic.entries.map((e) => e.entry_id)).size).toBe(
            signalCount,
          );

          const description = await latestHandle.describe();
          expect(description.status.name).toBe("RUNNING");
          expect(description.historyLength).toBeLessThan(
            DEFAULT_CHANGE_HISTORY_THRESHOLD,
          );

          // Idempotency ledger survived continue-as-new.
          expect(state.idempotencyLedger["add-shell-0"]).toBeDefined();
        });
      },
    );
  }, 120000);

  it("records entry terminal summary and recomputes Epic progress", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `epic-wf-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const input = makeEpicInput();
          const handle = await env.client.workflow.start("epicWorkflow", {
            workflowId: `epic-${input.epicId}`,
            taskQueue,
            args: [input],
          });

          await handle.signal(epicCreatedSignal, {
            id: input.epicId,
            title: input.title,
            narrative: input.narrative,
            entries: [],
            progress: {
              status: "active" as const,
              total_entries: 0,
              completed_entries: 0,
              active_entries: 0,
              next_entry_id: null,
              updated_at: input.initializedAt,
            },
            created_at: input.initializedAt,
            updated_at: input.initializedAt,
            version: 0,
          });

          await handle.signal(changeLinkedSignal, {
            entryId: "entry-1",
            changeId: "change-1",
            title: "Linked Change",
            order: 0,
            idempotencyKey: "link-change-1",
            linkedAt: "2026-06-24T00:01:00.000Z",
          });

          await handle.signal(entryTerminalSummarySignal, {
            entryId: "entry-1",
            status: "archived",
            completedAt: "2026-06-24T00:02:00.000Z",
            idempotencyKey: "terminal-1",
          });

          const state = await queryState(handle);
          expect(state.epic.entries).toHaveLength(1);
          const entry = state.epic.entries[0];
          expect(entry.kind).toBe("change");
          if (entry.kind !== "change") throw new Error("Expected change entry");
          expect(entry.terminal_summary).toEqual({
            status: "archived",
            completed_at: "2026-06-24T00:02:00.000Z",
          });
          expect(state.epic.progress.completed_entries).toBe(1);
          expect(state.epic.progress.active_entries).toBe(0);
          expect(state.epic.progress.status).toBe("completed");
          expect(state.epic.progress.next_entry_id).toBeNull();
        });
      },
    );
  }, 60000);

  it("archives the Epic and completes the workflow", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `epic-wf-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const input = makeEpicInput();
          const handle = await env.client.workflow.start("epicWorkflow", {
            workflowId: `epic-${input.epicId}`,
            taskQueue,
            args: [input],
          });

          await handle.signal(epicCreatedSignal, {
            id: input.epicId,
            title: input.title,
            narrative: input.narrative,
            entries: [],
            progress: {
              status: "active" as const,
              total_entries: 0,
              completed_entries: 0,
              active_entries: 0,
              next_entry_id: null,
              updated_at: input.initializedAt,
            },
            created_at: input.initializedAt,
            updated_at: input.initializedAt,
            version: 0,
          });

          await handle.signal(epicArchivedSignal, {
            archivedAt: "2026-06-24T00:01:00.000Z",
            archivedBy: "agent",
          });

          let description = await handle.describe();
          for (
            let i = 0;
            i < 30 && description.status.name !== "COMPLETED";
            i++
          ) {
            await new Promise((r) => setTimeout(r, 50));
            description = await handle.describe();
          }
          expect(description.status.name).toBe("COMPLETED");
        });
      },
    );
  }, 60000);
});
