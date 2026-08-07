import { describe, expect, test } from "bun:test";

import {
  buildLiveEpicListFailure,
  buildLiveEpicListPayload,
} from "./epic-list";

const PROJECT_ID = "e".repeat(40);
const NOW = new Date("2026-06-26T03:00:00.000Z");

describe("disk Epic list helper", () => {
  test("builds a disk payload with stable Epic entry objects", () => {
    const payload = buildLiveEpicListPayload(
      [
        { id: "cardIdentity", startTime: "2026-06-25T10:00:00.000Z" },
        { id: "providerArchitecture", startTime: null },
      ],
      { projectId: PROJECT_ID, now: NOW },
    );

    expect(payload).toEqual({
      source: "disk",
      live: true,
      stale: false,
      generated_at: "2026-06-26T03:00:00.000Z",
      project_id: PROJECT_ID,
      epics: [
        { id: "cardIdentity", startTime: "2026-06-25T10:00:00.000Z" },
        { id: "providerArchitecture", startTime: null },
      ],
    });
  });

  test("builds fail-closed disk error metadata", () => {
    const payload = buildLiveEpicListFailure(
      PROJECT_ID,
      new Error("state directory unreadable"),
      NOW,
    );

    expect(payload.source).toBe("disk");
    expect(payload.live).toBe(false);
    expect(payload.stale).toBe(false);
    expect(payload.project_id).toBe(PROJECT_ID);
    expect(payload.epics).toEqual([]);
    expect(payload.error).toBe("state directory unreadable");
    expect(payload.remediation).toContain("state directory");
  });
});
