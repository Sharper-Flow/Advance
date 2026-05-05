import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import { createDefaultGates } from "../types";
import type { ChangeWorkflowInput } from "./contracts";
import { getChangeStateQuery, proposalUpdatedSignal } from "./messages";
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
