import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  classifyBlankAssistantRows,
  createSessionActivityLivenessResolver,
  getDeletableBlankAssistantIds,
  getDefaultOpenCodeDbPath,
  scanOpenCodeSessionDebt,
  STALE_BLANK_ASSISTANT_THRESHOLD_MS,
  type BlankAssistantRow,
} from "./opencode-session-debt";

describe("opencode-session-debt", () => {
  const nowMs = Date.parse("2026-05-02T02:20:00.000Z");
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("classifies old blank assistant rows without liveness as idle active debt", () => {
    const rows: BlankAssistantRow[] = [
      {
        id: "msg-stale",
        session_id: "ses-stale",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
        part_count: 0,
      },
    ];

    const result = classifyBlankAssistantRows(rows, { nowMs });

    expect(result.repairable_stale).toHaveLength(0);
    expect(result.idle_active_session).toHaveLength(1);
    expect(result.idle_active_session[0]).toMatchObject({ id: "msg-stale" });
    expect(result.live_in_flight).toHaveLength(0);
  });

  test("classifies blank assistant rows by liveness before age", () => {
    const rows: BlankAssistantRow[] = [
      {
        id: "msg-live-in-flight",
        session_id: "ses-live-in-flight",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
        part_count: 0,
      },
      {
        id: "msg-idle-active",
        session_id: "ses-idle-active",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
        part_count: 0,
      },
      {
        id: "msg-orphan-ghost",
        session_id: "ses-orphan-ghost",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
        part_count: 0,
      },
    ];

    const result = classifyBlankAssistantRows(rows, {
      nowMs,
      resolveSessionLiveness: (row) => {
        if (row.session_id === "ses-live-in-flight") return "live_in_flight";
        if (row.session_id === "ses-idle-active") return "idle_active_session";
        return "orphan_ghost";
      },
    });

    expect(result.live_in_flight.map((row) => row.id)).toEqual([
      "msg-live-in-flight",
    ]);
    expect(result.idle_active_session.map((row) => row.id)).toEqual([
      "msg-idle-active",
    ]);
    expect(result.orphan_ghost.map((row) => row.id)).toEqual([
      "msg-orphan-ghost",
    ]);
    expect(getDeletableBlankAssistantIds(result)).toEqual(["msg-orphan-ghost"]);
    expect(result.repairable_stale.map((row) => row.id)).toEqual([
      "msg-orphan-ghost",
    ]);
  });

  test("builds deletable ids from stale session activity liveness", () => {
    const rows: BlankAssistantRow[] = [
      {
        id: "msg-stale-session",
        session_id: "ses-stale",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 10,
        part_count: 0,
      },
      {
        id: "msg-recent-session",
        session_id: "ses-recent",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 10,
        part_count: 0,
      },
      {
        id: "msg-missing-session",
        session_id: "ses-missing",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 10,
        part_count: 0,
      },
    ];

    const result = classifyBlankAssistantRows(rows, {
      nowMs,
      resolveSessionLiveness: createSessionActivityLivenessResolver(
        [
          {
            session_id: "ses-stale",
            time_updated_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
          },
          {
            session_id: "ses-recent",
            time_updated_ms: nowMs - 1,
          },
        ],
        { nowMs },
      ),
    });

    expect(result.live_in_flight.map((row) => row.id)).toEqual([
      "msg-recent-session",
    ]);
    expect(result.orphan_ghost.map((row) => row.id)).toEqual([
      "msg-stale-session",
      "msg-missing-session",
    ]);
    expect(getDeletableBlankAssistantIds(result)).toEqual([
      "msg-stale-session",
      "msg-missing-session",
    ]);
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
    const result = getDefaultOpenCodeDbPath({
      OPENCODE_DB: "/tmp/custom-opencode.db",
    });
    expect(result.dbPath).toBe("/tmp/custom-opencode.db");
    expect(result.envValue).toBe("/tmp/custom-opencode.db");
    expect(result.fallbackUsed).toBe(false);
  });

  test("absolute OPENCODE_DB is honored", () => {
    const result = getDefaultOpenCodeDbPath({
      OPENCODE_DB: "/tmp/custom-opencode.db",
    });
    expect(result.dbPath).toBe("/tmp/custom-opencode.db");
    expect(result.envValue).toBe("/tmp/custom-opencode.db");
    expect(result.attemptedPath).toBeUndefined();
    expect(result.fallbackUsed).toBe(false);
  });

  test("relative OPENCODE_DB missing falls back to canonical when present", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-home-"));
    tempDirs.push(homeDir);
    const canonicalDir = join(homeDir, ".local", "share", "opencode");
    mkdirSync(canonicalDir, { recursive: true });
    writeFileSync(join(canonicalDir, "opencode.db"), "stub");

    const oldHome = process.env.HOME;
    process.env.HOME = homeDir;
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/nonexistent/cwd");

    const result = getDefaultOpenCodeDbPath({ OPENCODE_DB: "opencode.db" });

    cwdSpy.mockRestore();
    process.env.HOME = oldHome;

    expect(result.dbPath).toBe(join(canonicalDir, "opencode.db"));
    expect(result.envValue).toBe("opencode.db");
    expect(result.attemptedPath).toBe("/nonexistent/cwd/opencode.db");
    expect(result.fallbackUsed).toBe(true);
  });

  test("relative OPENCODE_DB missing with canonical missing produces diagnostic", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-home-"));
    tempDirs.push(homeDir);

    const oldHome = process.env.HOME;
    process.env.HOME = homeDir;
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/nonexistent/cwd");

    const result = await scanOpenCodeSessionDebt({
      env: { OPENCODE_DB: "opencode.db" },
      importSqlite: vi.fn(async () => {
        throw new Error("should not import sqlite for missing DB");
      }),
    });

    cwdSpy.mockRestore();
    process.env.HOME = oldHome;

    expect(result.available).toBe(false);
    expect(result.diagnostics).toContain("OPENCODE_DB=opencode.db");
    expect(result.diagnostics).toContain(
      "attempted: /nonexistent/cwd/opencode.db",
    );
    expect(result.diagnostics).toContain("fallback unavailable");
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

  test("scanner opens database read-only and ignores malformed timestamps", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "opencode-session-debt-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "opencode.db");
    writeFileSync(dbPath, "stub");
    const constructorArgs: unknown[] = [];

    class FakeDatabase {
      constructor(...args: unknown[]) {
        constructorArgs.push(args);
      }

      query(sql: string) {
        if (sql.includes("FROM session")) {
          return {
            all: () => [
              {
                session_id: "ses-valid",
                time_updated_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
              },
            ],
          };
        }
        return {
          all: () => [
            {
              id: "msg-valid",
              session_id: "ses-valid",
              created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
              part_count: 0,
            },
            {
              id: "msg-malformed",
              session_id: "ses-malformed",
              created_ms: null,
              part_count: 0,
            },
          ],
        };
      }

      close() {}
    }

    const result = await scanOpenCodeSessionDebt({
      dbPath,
      importSqlite: vi.fn(async () => ({ Database: FakeDatabase })),
      nowMs,
    });

    expect(constructorArgs).toEqual([[dbPath, { readonly: true }]]);
    expect(result.available).toBe(true);
    expect(result.total_blank).toBe(1);
    expect(result.repairable_stale).toHaveLength(1);
    expect(result.orphan_ghost).toHaveLength(1);
    expect(result.orphan_ghost[0]?.id).toBe("msg-valid");
  });
});
