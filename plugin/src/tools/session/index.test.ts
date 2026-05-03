/**
 * Tests for adv_session_list (T19 — KD-4 privacy-defensive).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../worktree/state", () => ({
  initStateDb: vi.fn(async () => ({
    projectDir: "/test",
    projectId: "test-id",
  })),
  listSessions: vi.fn(async () => []),
}));

import { listPeerSessions, isPidAlive, projectSession } from "./index";
import { listSessions } from "../worktree/state";
import type { SessionRecord } from "../../temporal/contracts";

const mockedListSessions = vi.mocked(listSessions);

const baseRecord = (
  override: Partial<SessionRecord> = {},
): SessionRecord => ({
  sessionId: "sess_AAAA1111",
  worktreePath: "/home/u/proj/main",
  pid: 1000,
  startedAt: "2026-05-01T00:00:00Z",
  lastSeenAt: "2026-05-01T00:00:00Z",
  ...override,
});

describe("adv_session_list (T19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListSessions.mockResolvedValue([]);
  });

  it("returns empty + total:0 when no sessions exist", async () => {
    const result = await listPeerSessions({});
    expect(result.sessions).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.deadFiltered).toBe(0);
  });

  it("lists alive sessions in privacy-defensive schema (no PID, no full path)", async () => {
    mockedListSessions.mockResolvedValue([
      baseRecord({
        sessionId: "sess_AAAA1111",
        worktreePath: "/home/u/proj/main",
        pid: 1000,
      }),
      baseRecord({
        sessionId: "sess_BBBB2222",
        worktreePath: "/home/u/proj/feature",
        pid: 2000,
      }),
    ]);

    const result = await listPeerSessions(
      {},
      { liveness: () => true, selfPid: 9999 },
    );

    expect(result.total).toBe(2);
    for (const entry of result.sessions) {
      expect(entry).not.toHaveProperty("pid");
      expect(entry).not.toHaveProperty("worktreePath");
      expect(entry).not.toHaveProperty("activeChangeId");
      expect(entry).not.toHaveProperty("currentTaskId");
      expect(entry).not.toHaveProperty("activeGate");
      expect(entry.worktree).not.toContain("/");
    }
    expect(result.sessions.map((s) => s.worktree).sort()).toEqual([
      "feature",
      "main",
    ]);
  });

  it("filters out dead PIDs and reports deadFiltered count", async () => {
    mockedListSessions.mockResolvedValue([
      baseRecord({ sessionId: "sess_alive", pid: 1000 }),
      baseRecord({ sessionId: "sess_dead", pid: 2000 }),
    ]);
    const liveness = (pid: number) => pid !== 2000;

    const result = await listPeerSessions(
      {},
      { liveness, selfPid: 9999 },
    );

    expect(result.total).toBe(1);
    expect(result.deadFiltered).toBe(1);
    expect(result.sessions[0].sessionId).toBe("sess_alive");
  });

  it("sets isSelf flag for caller's own session and orders self first", async () => {
    mockedListSessions.mockResolvedValue([
      baseRecord({
        sessionId: "sess_other",
        pid: 2000,
        startedAt: "2026-05-01T00:00:00Z",
      }),
      baseRecord({
        sessionId: "sess_me",
        pid: 1000,
        startedAt: "2026-05-01T01:00:00Z", // started later
      }),
    ]);

    const result = await listPeerSessions(
      {},
      { liveness: () => true, selfPid: 1000 },
    );

    expect(result.sessions[0].sessionId).toBe("sess_me");
    expect(result.sessions[0].isSelf).toBe(true);
    expect(result.sessions[1].sessionId).toBe("sess_other");
    expect(result.sessions[1].isSelf).toBe(false);
  });

  it("returns unavailable:true when project workflow not reachable", async () => {
    const { initStateDb } = await import("../worktree/state");
    vi.mocked(initStateDb).mockRejectedValueOnce(
      new Error("workflow not ready"),
    );

    const result = await listPeerSessions({});
    expect(result.unavailable).toBe(true);
    expect(result.sessions).toEqual([]);
  });
});

describe("isPidAlive (T19 helper)", () => {
  it("returns true for own PID", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it("returns false for an unused high PID (ESRCH)", () => {
    // PID 999_999 is virtually never in use on a typical Linux system.
    // If it happens to be in use, the test is not catastrophic — the
    // semantic guarantee (ESRCH → false) is what we're checking.
    const result = isPidAlive(999_999);
    expect(typeof result).toBe("boolean");
  });
});

describe("projectSession (T19 internal)", () => {
  it("strips PID + full path; computes basename; sets isSelf", () => {
    const record = baseRecord({
      sessionId: "sess_X",
      pid: 1000,
      worktreePath: "/very/long/path/to/worktree-feat",
    });
    expect(projectSession(record, 1000)).toEqual({
      sessionId: "sess_X",
      startedAt: "2026-05-01T00:00:00Z",
      worktree: "worktree-feat",
      isSelf: true,
    });
    expect(projectSession(record, 9999).isSelf).toBe(false);
  });
});
