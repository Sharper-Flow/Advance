import { describe, expect, test } from "bun:test";

import {
  buildLiveStatusPayload,
  buildLiveStatusPayloadFromSummaries,
  filterTerminalSummaries,
} from "./live-status";

const PROJECT_ID = "0".repeat(40);
const NOW = new Date("2026-06-05T17:00:00.000Z");

const summary = (id: string, lastActivityAt: string) => ({
  id,
  title: id,
  status: "draft",
  lifecycleState: "open",
  recency: "fresh" as const,
  lastActivityAt,
  minutesSinceActivity: 0,
  tasksDone: 0,
  tasksTotal: 0,
  firstIncompleteGate: "proposal" as const,
  gateProgressStr: "○ ○ ○ ○ ○ ○ ○",
});

describe("disk status reader", () => {
  test("builds a disk-sourced payload with terminal counts", () => {
    const payload = buildLiveStatusPayload(
      [
        {
          id: "liveChange",
          title: "Live change",
          status: "draft",
          created_at: "2026-06-05T10:00:00.000Z",
          tasks: [],
          gates: {},
        },
      ],
      {
        projectId: PROJECT_ID,
        archivedCount: 2,
        closedCount: 1,
        now: new Date("2026-06-05T10:05:00.000Z"),
      },
    );

    expect(payload.source).toBe("disk");
    expect(payload.live).toBe(true);
    expect(payload.stale).toBe(false);
    expect(payload.changes.map((change) => change.id)).toEqual(["liveChange"]);
    expect(payload.counts).toEqual({ active: 1, archived: 2, closed: 1 });
  });

  test("buildLiveStatusPayloadFromSummaries carries disk summaries and counts", () => {
    const payload = buildLiveStatusPayloadFromSummaries(
      [summary("c1", "2026-06-05T16:00:00.000Z")],
      { projectId: PROJECT_ID, archivedCount: 3, closedCount: 0, now: NOW },
    );

    expect(payload.source).toBe("disk");
    expect(payload.live).toBe(true);
    expect(payload.stale).toBe(false);
    expect(payload.changes.map((change) => change.id)).toEqual(["c1"]);
    expect(payload.counts).toEqual({ active: 1, archived: 3, closed: 0 });
  });

  test("filters only change IDs proven terminal by disk state", () => {
    const filtered = filterTerminalSummaries(
      [summary("archived", "2026-06-05T10:00:00.000Z"), summary("open", "2026-06-05T11:00:00.000Z")],
      new Set(["archived"]),
    );

    expect(filtered.map((change) => change.id)).toEqual(["open"]);
  });
});
