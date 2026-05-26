import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  classifyBlankAssistantRows,
  classifyToolPartRows,
  createSessionActivityLivenessResolver,
  getDeletableBlankAssistantIds,
  getDefaultOpenCodeDbPath,
  getRepairableToolPartIds,
  scanOpenCodeSessionDebt,
  STALE_BLANK_ASSISTANT_THRESHOLD_MS,
  type BlankAssistantRow,
  type ToolPartRow,
} from "./opencode-session-debt";

describe("opencode-session-debt", () => {
  const nowMs = Date.parse("2026-05-02T02:20:00.000Z");
  const tempDirs: string[] = [];
  const repoRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
  );

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

  test("classifies stale tool parts and excludes live sessions before repair", () => {
    const rows: ToolPartRow[] = [
      {
        id: "prt-stale-orphan",
        message_id: "msg-stale-orphan",
        session_id: "ses-stale-orphan",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 10,
        updated_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 5,
        tool: "bash",
        call_id: "call-stale",
        status: "running",
      },
      {
        id: "prt-live",
        message_id: "msg-live",
        session_id: "ses-live",
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 10,
        updated_ms: nowMs - 1,
        tool: "lgrep_search_text",
        call_id: "call-live",
        status: "pending",
      },
    ];

    const result = classifyToolPartRows(rows, {
      nowMs,
      resolveSessionLiveness: (row) =>
        row.session_id === "ses-live" ? "live_in_flight" : "orphan_ghost",
    });

    expect(result.repairable_tool_parts.map((row) => row.id)).toEqual([
      "prt-stale-orphan",
    ]);
    expect(result.live_tool_parts.map((row) => row.id)).toEqual(["prt-live"]);
    expect(getRepairableToolPartIds(result)).toEqual(["prt-stale-orphan"]);
  });

  test("keeps total repair counts separate from bounded samples", () => {
    const blankRows: BlankAssistantRow[] = Array.from(
      { length: 12 },
      (_, i) => ({
        id: `msg-${i}`,
        session_id: `ses-${i}`,
        created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
        part_count: 0,
      }),
    );
    const toolRows: ToolPartRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: `prt-${i}`,
      message_id: `msg-tool-${i}`,
      session_id: `ses-tool-${i}`,
      created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
      updated_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
      tool: "bash",
      call_id: `call-${i}`,
      status: "running" as const,
    }));

    const blankResult = classifyBlankAssistantRows(blankRows, {
      nowMs,
      resolveSessionLiveness: () => "orphan_ghost",
    });
    const toolResult = classifyToolPartRows(toolRows, {
      nowMs,
      resolveSessionLiveness: () => "orphan_ghost",
    });

    expect(blankResult.total_orphan_ghost).toBe(12);
    expect(blankResult.orphan_ghost).toHaveLength(10);
    expect(toolResult.total_repairable_tool_parts).toBe(12);
    expect(toolResult.repairable_tool_parts).toHaveLength(10);
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
        if (sql.includes("json_extract(p.data, '$.type') = 'tool'")) {
          return {
            all: () => [
              {
                id: "prt-valid",
                message_id: "msg-tool",
                session_id: "ses-valid",
                created_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
                updated_ms: nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 1,
                tool: "bash",
                call_id: "call-valid",
                status: "running",
              },
            ],
          };
        }
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
    expect(result.total_tool_parts).toBe(1);
    expect(result.repairable_tool_parts).toHaveLength(1);
    expect(result.repairable_tool_parts[0]?.id).toBe("prt-valid");
  });

  test("doctor apply is backup-gated and repairs stale tool parts without completing partial parents", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "opencode-session-doctor-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "opencode.db");
    const backupDir = join(tempDir, "backup");
    const oldMs = nowMs - STALE_BLANK_ASSISTANT_THRESHOLD_MS - 10;
    const liveMs = Date.now() - 1;

    execFileSync(
      "bun",
      [
        "-e",
        `
          import { Database } from "bun:sqlite";
          const db = new Database(${JSON.stringify(dbPath)}, { create: true });
          db.run("CREATE TABLE session (id text PRIMARY KEY, time_updated integer NOT NULL)");
          db.run("CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)");
          db.run("CREATE TABLE part (id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)");
          db.run("INSERT INTO session (id, time_updated) VALUES (?, ?)", ["ses-stale", ${oldMs}]);
          db.run("INSERT INTO session (id, time_updated) VALUES (?, ?)", ["ses-live", ${liveMs}]);
          db.run("INSERT INTO message VALUES (?, ?, ?, ?, ?)", ["msg-complete", "ses-stale", ${oldMs}, ${oldMs}, JSON.stringify({ role: "assistant", time: { created: ${oldMs} }, finish: null })]);
          db.run("INSERT INTO message VALUES (?, ?, ?, ?, ?)", ["msg-partial", "ses-stale", ${oldMs}, ${oldMs}, JSON.stringify({ role: "assistant", time: { created: ${oldMs} }, finish: null })]);
          db.run("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)", ["prt-repair", "msg-complete", "ses-stale", ${oldMs}, ${oldMs}, JSON.stringify({ type: "tool", tool: "bash", callID: "call-repair", state: { status: "running", metadata: { output: "" } } })]);
          db.run("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)", ["prt-partial-repair", "msg-partial", "ses-stale", ${oldMs}, ${oldMs}, JSON.stringify({ type: "tool", tool: "bash", callID: "call-partial-repair", state: { status: "pending", metadata: {} } })]);
          db.run("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)", ["prt-partial-live", "msg-partial", "ses-live", ${oldMs}, ${liveMs}, JSON.stringify({ type: "tool", tool: "bash", callID: "call-partial-live", state: { status: "running", metadata: {} } })]);
          db.close();
        `,
      ],
      { cwd: repoRoot },
    );

    const dryRun = JSON.parse(
      execFileSync(
        "bun",
        [
          "scripts/opencode-session-doctor.ts",
          "--dry-run",
          "--db",
          dbPath,
          "--threshold-ms",
          String(STALE_BLANK_ASSISTANT_THRESHOLD_MS),
        ],
        { cwd: repoRoot, encoding: "utf8" },
      ),
    ) as {
      would_repair_tool_parts: number;
      repairable_tool_parts: Array<{
        session_id: string;
        tool: string;
        call_id: string;
      }>;
    };
    expect(dryRun.would_repair_tool_parts).toBe(2);
    expect(dryRun.repairable_tool_parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          session_id: "ses-stale",
          tool: "bash",
          call_id: "call-repair",
        }),
      ]),
    );

    expect(() =>
      execFileSync(
        "bun",
        ["scripts/opencode-session-doctor.ts", "--apply", "--db", dbPath],
        { cwd: repoRoot, encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow(/--apply requires --backup-dir/);

    const applied = JSON.parse(
      execFileSync(
        "bun",
        [
          "scripts/opencode-session-doctor.ts",
          "--apply",
          "--backup-dir",
          backupDir,
          "--db",
          dbPath,
          "--threshold-ms",
          String(STALE_BLANK_ASSISTANT_THRESHOLD_MS),
        ],
        { cwd: repoRoot, encoding: "utf8" },
      ),
    ) as { repaired_tool_parts: number; backup_files: string[] };
    expect(applied.repaired_tool_parts).toBe(2);
    expect(applied.backup_files.length).toBeGreaterThan(0);

    const repaired = JSON.parse(
      execFileSync(
        "bun",
        [
          "-e",
          `
            import { Database } from "bun:sqlite";
            const db = new Database(${JSON.stringify(dbPath)}, { readonly: true });
            const part = JSON.parse(db.query("SELECT data FROM part WHERE id = 'prt-repair'").get().data);
            const livePart = JSON.parse(db.query("SELECT data FROM part WHERE id = 'prt-partial-live'").get().data);
            const completeMessage = JSON.parse(db.query("SELECT data FROM message WHERE id = 'msg-complete'").get().data);
            const partialMessage = JSON.parse(db.query("SELECT data FROM message WHERE id = 'msg-partial'").get().data);
            console.log(JSON.stringify({ part, livePart, completeMessage, partialMessage }));
            db.close();
          `,
        ],
        { cwd: repoRoot, encoding: "utf8" },
      ),
    );
    expect(repaired.part.state.status).toBe("error");
    expect(repaired.part.state.metadata.interrupted).toBe(true);
    expect(repaired.part.state.time.end).toEqual(expect.any(Number));
    expect(repaired.livePart.state.status).toBe("running");
    expect(repaired.completeMessage.finish).toBe("error");
    expect(repaired.partialMessage.finish).toBeNull();
  });
});
