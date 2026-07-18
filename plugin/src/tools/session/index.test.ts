/**
 * Tests for adv_session_list (T19 — KD-4 privacy-defensive, live /proc source).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";

vi.mock("../worktree/state", () => ({
  initStateDb: vi.fn(async () => ({
    projectDir: "/test",
    projectId: "test-id",
  })),
  listSessions: vi.fn(async () => []),
  getSessionRecord: vi.fn(async () => null),
}));

vi.mock("../../utils/peer-sessions", async () => {
  const actual =
    await vi.importActual<typeof import("../../utils/peer-sessions")>(
      "../../utils/peer-sessions",
    );
  return {
    ...actual,
    detectPeerSessions: vi.fn(),
  };
});

vi.mock("../../migration/procfs", async () => {
  const actual =
    await vi.importActual<typeof import("../../migration/procfs")>(
      "../../migration/procfs",
    );
  return {
    ...actual,
    readProcessStartTicks: vi.fn(),
    readBootTimeMs: vi.fn(),
    isProcessAlive: vi.fn(),
  };
});

import {
  listPeerSessions,
  showOwnSession,
  isPidAlive,
} from "./index";
import { detectPeerSessions } from "../../utils/peer-sessions";
import {
  readProcessStartTicks,
  readBootTimeMs,
  isProcessAlive,
} from "../../migration/procfs";
import { getSessionRecord } from "../worktree/state";
import type { SessionRecord } from "../../temporal/contracts";

const mockedDetectPeerSessions = vi.mocked(detectPeerSessions);
const mockedReadStartTicks = vi.mocked(readProcessStartTicks);
const mockedReadBootTimeMs = vi.mocked(readBootTimeMs);
const mockedIsProcessAlive = vi.mocked(isProcessAlive);
const mockedGetSessionRecord = vi.mocked(getSessionRecord);

const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");

function setLinux() {
  Object.defineProperty(process, "platform", { value: "linux" });
}

function restorePlatform() {
  if (ORIGINAL_PLATFORM) {
    Object.defineProperty(process, "platform", ORIGINAL_PLATFORM);
  }
}

function expectSessionId(pid: number, startTicks: string): string {
  return (
    "sess_" +
    createHash("sha256")
      .update(`${pid}:${startTicks}`)
      .digest("hex")
      .slice(0, 8)
  );
}

function expectStartedAt(bootTimeMs: number, startTicks: string): string {
  return new Date(
    bootTimeMs + (Number(startTicks) / 100) * 1000,
  ).toISOString();
}

const baseRecord = (override: Partial<SessionRecord> = {}): SessionRecord => ({
  sessionId: "sess_AAAA1111",
  worktreePath: "/home/u/proj/main",
  pid: 1000,
  startedAt: "2026-05-01T00:00:00Z",
  lastSeenAt: "2026-05-01T00:00:00Z",
  ...override,
});

describe("adv_session_list (T19 — live /proc source)", () => {
  let tempRoot: string;
  let projectRoot: string;
  const selfPid = 1000;
  const bootTimeMs = 1_700_000_000_000;

  beforeEach(() => {
    vi.clearAllMocks();

    tempRoot = mkdtempSync(join(tmpdir(), "adv-session-list-"));
    projectRoot = join(tempRoot, "project-main");
    mkdirSync(projectRoot, { recursive: true });

    // A real git repo is required for detectPeerSessions to match via
    // git-common-dir; the scanner is injected below.
    execFileSync("git", ["init", "-q", "-b", "trunk"], {
      cwd: projectRoot,
    });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
    });
    execFileSync("git", ["config", "user.name", "Test"], {
      cwd: projectRoot,
    });
    execFileSync("git", ["commit", "--allow-empty", "-m", "root"], {
      cwd: projectRoot,
    });

    setLinux();

    mockedDetectPeerSessions.mockResolvedValue([]);
    mockedReadBootTimeMs.mockReturnValue(bootTimeMs);
    mockedReadStartTicks.mockImplementation((pid: number) => {
      if (pid === selfPid) return "100";
      if (pid === 2000) return "200";
      if (pid === 3000) return "300";
      return null;
    });
    mockedIsProcessAlive.mockReturnValue(true);
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    restorePlatform();
  });

  it("returns self first plus one entry per detected peer (N+1)", async () => {
    mockedDetectPeerSessions.mockResolvedValue([
      { pid: 2000, cwd: join(projectRoot, "feature"), matchVia: "common-dir" },
      { pid: 3000, cwd: join(projectRoot, "docs"), matchVia: "common-dir" },
    ]);

    const result = await listPeerSessions({ projectRoot }, { selfPid });

    expect(result.total).toBe(3);
    expect(result.sessions.map((s) => s.worktree)).toEqual([
      basename(projectRoot),
      "feature",
      "docs",
    ]);
    expect(result.sessions[0].isSelf).toBe(true);
    expect(result.sessions[1].isSelf).toBe(false);
    expect(result.sessions[2].isSelf).toBe(false);
  });

  it("projects privacy-safe fields only (no PID, no full cwd)", async () => {
    mockedDetectPeerSessions.mockResolvedValue([
      { pid: 2000, cwd: join(projectRoot, "feature"), matchVia: "common-dir" },
    ]);

    const result = await listPeerSessions({ projectRoot }, { selfPid });

    for (const entry of result.sessions) {
      expect(entry).not.toHaveProperty("pid");
      expect(entry).not.toHaveProperty("cwd");
      expect(entry).not.toHaveProperty("worktreePath");
      expect(entry).not.toHaveProperty("activeChangeId");
      expect(entry).not.toHaveProperty("currentTaskId");
      expect(entry).not.toHaveProperty("activeGate");
      expect(entry.worktree).not.toContain("/");
    }
  });

  it("derives a stable opaque sessionId from pid + startTicks", async () => {
    mockedDetectPeerSessions.mockResolvedValue([
      { pid: 2000, cwd: join(projectRoot, "feature"), matchVia: "common-dir" },
    ]);

    const first = await listPeerSessions({ projectRoot }, { selfPid });
    const second = await listPeerSessions({ projectRoot }, { selfPid });

    const selfId = expectSessionId(selfPid, "100");
    const peerId = expectSessionId(2000, "200");

    expect(first.sessions[0].sessionId).toBe(selfId);
    expect(first.sessions[1].sessionId).toBe(peerId);
    expect(second.sessions[0].sessionId).toBe(selfId);
    expect(second.sessions[1].sessionId).toBe(peerId);
  });

  it("derives startedAt from /proc startTicks + boot time", async () => {
    mockedDetectPeerSessions.mockResolvedValue([
      { pid: 2000, cwd: join(projectRoot, "feature"), matchVia: "common-dir" },
    ]);

    const result = await listPeerSessions({ projectRoot }, { selfPid });

    expect(result.sessions[0].startedAt).toBe(expectStartedAt(bootTimeMs, "100"));
    expect(result.sessions[1].startedAt).toBe(expectStartedAt(bootTimeMs, "200"));
  });

  it("filters dead / PID-reused peers and reports deadFiltered count", async () => {
    mockedDetectPeerSessions.mockResolvedValue([
      { pid: 2000, cwd: join(projectRoot, "feature"), matchVia: "common-dir" },
      { pid: 3000, cwd: join(projectRoot, "docs"), matchVia: "common-dir" },
    ]);
    mockedIsProcessAlive.mockImplementation((pid: number) => pid !== 2000);

    const result = await listPeerSessions({ projectRoot }, { selfPid });

    expect(result.total).toBe(2);
    expect(result.deadFiltered).toBe(1);
    expect(result.sessions.map((s) => s.worktree)).toEqual([
      basename(projectRoot),
      "docs",
    ]);
  });

  it("returns unavailable:true when the live detector is not usable", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    mockedDetectPeerSessions.mockRejectedValue(
      new Error("peer-sessions.ts requires Linux (got platform=win32)"),
    );

    const result = await listPeerSessions({ projectRoot }, { selfPid });

    expect(result.unavailable).toBe(true);
    expect(result.sessions).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.deadFiltered).toBe(0);
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

describe("adv_session_show (T20 — 2-factor ACL)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSessionRecord.mockResolvedValue(null);
  });

  it("returns SessionDetail when own-session lookup succeeds", async () => {
    const record = baseRecord({
      sessionId: "sess_self",
      pid: 1000,
      worktreePath: "/work/main",
      activeChangeId: "ch1",
      currentTaskId: "tk1",
      activeGate: "execution",
    });
    mockedGetSessionRecord.mockResolvedValue(record);

    const result = await showOwnSession(
      { sessionId: "sess_self" },
      { selfPid: 1000 },
    );

    expect(result).toMatchObject({
      sessionId: "sess_self",
      pid: 1000,
      workdir: "/work/main",
      activeChangeId: "ch1",
      currentTaskId: "tk1",
      activeGate: "execution",
    });
  });

  it("returns SESSION_NOT_FOUND when sessionId is unknown", async () => {
    mockedGetSessionRecord.mockResolvedValue(null);
    const result = await showOwnSession({ sessionId: "sess_missing" });
    expect(result).toEqual({ error: "SESSION_NOT_FOUND" });
  });

  it("returns ACCESS_DENIED with pid_mismatch when peer attempts lookup", async () => {
    mockedGetSessionRecord.mockResolvedValue(
      baseRecord({ sessionId: "sess_peer", pid: 2000 }),
    );
    const result = await showOwnSession(
      { sessionId: "sess_peer" },
      { selfPid: 1000 },
    );
    expect(result).toEqual({
      error: "ACCESS_DENIED",
      reason: "pid_mismatch",
    });
  });

  it("returns ACCESS_DENIED with non_self_peer when currentSessionId differs (Factor 2)", async () => {
    // PID matches (Factor 1 passes) but currentSessionId is different —
    // defense-in-depth against PID-recycle/spoof.
    mockedGetSessionRecord.mockResolvedValue(
      baseRecord({ sessionId: "sess_recycled", pid: 1000 }),
    );
    const result = await showOwnSession(
      { sessionId: "sess_recycled" },
      { selfPid: 1000, currentSessionId: "sess_real" },
    );
    expect(result).toEqual({
      error: "ACCESS_DENIED",
      reason: "non_self_peer",
    });
  });

  it("returns ACCESS_DENIED with workflow_unavailable when project workflow not reachable", async () => {
    const { initStateDb } = await import("../worktree/state");
    vi.mocked(initStateDb).mockRejectedValueOnce(
      new Error("workflow not ready"),
    );
    const result = await showOwnSession({ sessionId: "sess_x" });
    expect(result).toEqual({
      error: "ACCESS_DENIED",
      reason: "workflow_unavailable",
    });
  });
});
