import { describe, expect, test, vi } from "vitest";
import {
  classifyBlankAssistantRows,
  getDefaultOpenCodeDbPath,
  scanOpenCodeSessionDebt,
  STALE_BLANK_ASSISTANT_THRESHOLD_MS,
  type BlankAssistantRow,
} from "./opencode-session-debt";

describe("opencode-session-debt", () => {
  const nowMs = Date.parse("2026-05-02T02:20:00.000Z");

  test("classifies old blank assistant rows as repairable stale debt", () => {
    const rows: BlankAssistantRow[] = [
      {
        id: "msg-stale",
        session_id: "ses-stale",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
        part_count: 0,
      },
    ];

    const result = classifyBlankAssistantRows(rows, { nowMs });

    expect(result.repairable_stale).toHaveLength(1);
    expect(result.repairable_stale[0]).toMatchObject({ id: "msg-stale" });
    expect(result.live_in_flight).toHaveLength(0);
  });

  test("classifies young blank assistant rows as live in-flight", () => {
    const rows: BlankAssistantRow[] = [
      {
        id: "msg-live",
        session_id: "ses-live",
        created_ms: nowMs - 1_000,
        part_count: 0,
      },
    ];

    const result = classifyBlankAssistantRows(rows, { nowMs });

    expect(result.repairable_stale).toHaveLength(0);
    expect(result.live_in_flight).toHaveLength(1);
    expect(result.live_in_flight[0]).toMatchObject({ id: "msg-live" });
  });

  test("ignores rows that have parts", () => {
    const rows: BlankAssistantRow[] = [
      {
        id: "msg-with-part",
        session_id: "ses-with-part",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
        part_count: 1,
      },
    ];

    const result = classifyBlankAssistantRows(rows, { nowMs });

    expect(result.repairable_stale).toHaveLength(0);
    expect(result.live_in_flight).toHaveLength(0);
  });

  test("uses OPENCODE_DB override for default database path", () => {
    expect(
      getDefaultOpenCodeDbPath({ OPENCODE_DB: "/tmp/custom-opencode.db" }),
    ).toBe("/tmp/custom-opencode.db");
  });

  test("scanner degrades safely when database is unavailable", async () => {
    const result = await scanOpenCodeSessionDebt({
      dbPath: "/definitely/missing/opencode.db",
      importSqlite: vi.fn(async () => {
        throw new Error("should not import sqlite for missing DB");
      }),
    });

    expect(result.available).toBe(false);
    expect(result.reason).toContain("not found");
  });
});
