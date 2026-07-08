import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import { createDefaultGates } from "../types";
import type { ChangeWorkflowInput, EpicWorkflowInput } from "./contracts";
import {
  changeLinkedSignal,
  entryTerminalSummarySignal,
  epicCreatedSignal,
  getChangeStateQuery,
  getEpicStateQuery,
  proposalUpdatedSignal,
} from "./messages";
import { requiredAdvSearchAttributes } from "./search-attributes";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

async function registerSearchAttributes(
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
    const message = err instanceof Error ? err.message : String(err);
    if (!/already\s*exists|ALREADY_EXISTS/i.test(message)) throw err;
  }
}

function makeInput(): ChangeWorkflowInput {
  return {
    projectId: "search-attrs-proj",
    changeId: "search-attrs-change",
    title: "Search Attr Title",
    initializedAt: "2026-05-05T00:00:00.000Z",
    searchAttributesEnabled: true,
    seedState: {
      status: "active",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
      affectedProjects: ["search-attrs-proj"],
      affectedPaths: ["plugin/src/temporal"],
    },
  };
}

function makeEpicInput(): EpicWorkflowInput {
  return {
    projectId: "search-attrs-proj",
    epicId: `search-attrs-epic-${Date.now()}`,
    title: "Search Attr Epic",
    narrative: "Search attribute Epic test.",
    initializedAt: "2026-05-05T00:00:00.000Z",
    searchAttributesEnabled: true,
  };
}

describe("changeWorkflow search attribute upserts", () => {
  it("upserts signal-driven search attributes from a state-changing signal", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        await registerSearchAttributes(env);
        const taskQueue = "workflow-search-attrs";
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const workflowId = `search-attrs-${Date.now()}`;
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId,
            taskQueue,
            args: [makeInput()],
          });

          await handle.signal(proposalUpdatedSignal, {
            text: "proposal",
            updatedAt: "2026-05-05T00:00:01.000Z",
          });
          await handle.query(getChangeStateQuery);

          const description = await handle.describe();
          const serialized = JSON.stringify(description);

          expect(serialized).toContain("AdvChangeId");
          expect(serialized).toContain("search-attrs-change");
          expect(serialized).toContain("AdvCurrentBucket");
          expect(serialized).toContain("in_flight");
        });
      },
    );
  }, 30_000);
});

describe("epicWorkflow search attribute upserts", () => {
  it("upserts AdvEpicStatus as active and then completed for CLI active-list filtering", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        await registerSearchAttributes(env);
        const taskQueue = "epic-workflow-search-attrs";
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const input = makeEpicInput();
          const handle = await env.client.workflow.start("epicWorkflow", {
            workflowId: `epic-search-attrs-${input.epicId}`,
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
            linkedAt: "2026-05-05T00:01:00.000Z",
          });
          await handle.signal(entryTerminalSummarySignal, {
            entryId: "entry-1",
            status: "archived",
            completedAt: "2026-05-05T00:02:00.000Z",
            idempotencyKey: "terminal-1",
          });
          await handle.query(getEpicStateQuery);

          const description = await handle.describe();
          const serialized = JSON.stringify(description);

          expect(serialized).toContain("AdvEpicStatus");
          expect(serialized).toContain("completed");
        });
      },
    );
  }, 30_000);
});
