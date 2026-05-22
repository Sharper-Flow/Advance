import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";

const workflowsPath = fileURLToPath(
  new URL("../workflows.ts", import.meta.url),
);

interface ReplayFixtureMetadata {
  name: string;
  workflowType: "changeWorkflow";
  workflowId: string;
  covers: string[];
  eventCount: number;
  incidentEventId: string;
  incidentEventType: string;
}

const replayFixtures = [
  {
    metadataUrl: new URL(
      "./replay/histories/fixGateAutoWorktree.discovery-gate-tmprl1100.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/fixGateAutoWorktree.discovery-gate-tmprl1100.history.json",
      import.meta.url,
    ),
  },
];

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

describe("changeWorkflow replay determinism", () => {
  it.each(replayFixtures)(
    "replays committed history fixture %#",
    async ({ metadataUrl, historyUrl }) => {
      const metadata = await readJson<ReplayFixtureMetadata>(metadataUrl);
      const history = await readJson<{
        events: Array<{ eventId: string; eventType: string }>;
      }>(historyUrl);

      expect(metadata.workflowType).toBe("changeWorkflow");
      expect(history.events).toHaveLength(metadata.eventCount);
      expect(history.events).toContainEqual(
        expect.objectContaining({
          eventId: metadata.incidentEventId,
          eventType: metadata.incidentEventType,
        }),
      );
      expect(metadata.covers.join("\n")).toContain("TMPRL1100");

      await Worker.runReplayHistory(
        {
          workflowsPath,
          replayName: metadata.name,
        },
        history,
        metadata.workflowId,
      );
    },
    30_000,
  );
});
