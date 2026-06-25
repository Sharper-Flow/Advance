/**
 * Tests for worktree-lease.ts — one-writer-per-worktree lease protocol.
 *
 * Lease state keyed by (projectID, canonicalWorktreePath) with PID + heartbeat
 * liveness. Stored as JSON in ADV external state directory.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  acquireLease,
  checkLease,
  refreshHeartbeat,
  releaseLease,
  reclaimStaleLease,
  leaseFilePath,
} from "./worktree-lease";

// ── Helpers ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adv-lease-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const leasesDir = () => path.join(tmpDir, "leases");

// ── Tests ────────────────────────────────────────────────────────────────

describe("acquireLease", () => {
  it("creates a new lease when no existing lease", () => {
    const result = acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
      sessionId: "ses-1",
      staleHeartbeatMs: 60_000,
    });
    expect(result.status).toBe("acquired");
    expect(result.lease).toBeDefined();
    expect(result.lease!.pid).toBe(12345);
    expect(result.lease!.sessionId).toBe("ses-1");
    expect(result.lease!.acquiredAt).toBeGreaterThan(0);
    expect(result.lease!.heartbeatAt).toBeGreaterThan(0);
  });

  it("blocks when active lease exists from another PID", () => {
    // First lease
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 11111,
      sessionId: "ses-1",
      staleHeartbeatMs: 60_000,
    });

    // Second attempt with different PID
    const result = acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 22222,
      sessionId: "ses-2",
      staleHeartbeatMs: 60_000,
    });
    expect(result.status).toBe("blocked");
    expect(result.existingLease).toBeDefined();
    expect(result.existingLease!.pid).toBe(11111);
  });

  it("allows same PID to re-acquire (idempotent)", () => {
    const first = acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
      sessionId: "ses-1",
      staleHeartbeatMs: 60_000,
    });
    expect(first.status).toBe("acquired");

    const second = acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
      sessionId: "ses-1",
      staleHeartbeatMs: 60_000,
    });
    expect(second.status).toBe("acquired");
  });
});

describe("refreshHeartbeat", () => {
  it("updates heartbeat timestamp for own PID", () => {
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
      sessionId: "ses-1",
      staleHeartbeatMs: 60_000,
    });

    const before = Date.now();
    const result = refreshHeartbeat({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
    });
    expect(result).toBe(true);

    const lease = checkLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
    });
    expect(lease).not.toBeNull();
    expect(lease!.heartbeatAt).toBeGreaterThanOrEqual(before);
  });

  it("fails when PID does not own the lease", () => {
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
      sessionId: "ses-1",
      staleHeartbeatMs: 60_000,
    });

    const result = refreshHeartbeat({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 99999,
    });
    expect(result).toBe(false);
  });
});

describe("reclaimStaleLease", () => {
  it("reclaims when heartbeat is stale", () => {
    // Acquire with old heartbeat
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 11111,
      sessionId: "ses-old",
      staleHeartbeatMs: 60_000,
    });

    // Manually backdate the heartbeat
    const leaseFile = leaseFilePath(leasesDir(), "/repo/worktree/change/abc");
    const record = JSON.parse(fs.readFileSync(leaseFile, "utf8"));
    record.heartbeatAt = Date.now() - 120_000; // 2 minutes ago
    fs.writeFileSync(leaseFile, JSON.stringify(record));

    const result = reclaimStaleLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      newPid: 22222,
      newSessionId: "ses-new",
      staleHeartbeatMs: 60_000,
    });
    expect(result.status).toBe("reclaimed");
    expect(result.previousLease).toBeDefined();
    expect(result.previousLease!.pid).toBe(11111);
    expect(result.newLease.pid).toBe(22222);
  });

  it("blocks when heartbeat is fresh", () => {
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 11111,
      sessionId: "ses-old",
      staleHeartbeatMs: 60_000,
    });

    const result = reclaimStaleLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      newPid: 22222,
      newSessionId: "ses-new",
      staleHeartbeatMs: 60_000,
    });
    expect(result.status).toBe("blocked");
  });

  it("reclaims when existing lease has no live PID", () => {
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 99999999, // Very unlikely to exist as a live PID
      sessionId: "ses-dead",
      staleHeartbeatMs: 600_000, // 10 min stale threshold — heartbeat is fresh but PID dead
    });

    const result = reclaimStaleLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      newPid: 22222,
      newSessionId: "ses-new",
      staleHeartbeatMs: 60_000,
      allowDeadPidReclaim: true,
    });
    expect(result.status).toBe("reclaimed");
  });

  it("does NOT reclaim a fresh-heartbeat lease when the PID probe throws EPERM (live peer, fail-safe) — rq-worktreeLeaseLiveness01 / AC1", () => {
    const existingPid = 4242;
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: existingPid,
      sessionId: "ses-peer",
      staleHeartbeatMs: 600_000, // heartbeat is fresh; reclaim depends solely on PID liveness
    });

    const killSpy = vi.spyOn(process, "kill").mockImplementation(((
      pid: number,
    ) => {
      if (pid === existingPid) {
        const err = new Error("EPERM") as NodeJS.ErrnoException;
        err.code = "EPERM";
        throw err;
      }
      return true;
    }) as typeof process.kill);

    try {
      const result = reclaimStaleLease({
        leasesDir: leasesDir(),
        worktreePath: "/repo/worktree/change/abc",
        newPid: 22222,
        newSessionId: "ses-new",
        staleHeartbeatMs: 60_000,
        allowDeadPidReclaim: true,
      });
      // EPERM means the peer exists but is not signalable by this user →
      // treated as alive → lease must NOT be reclaimed.
      expect(result.status).toBe("blocked");
    } finally {
      killSpy.mockRestore();
    }
  });
});

describe("releaseLease", () => {
  it("removes lease file when PID owns it", () => {
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
      sessionId: "ses-1",
      staleHeartbeatMs: 60_000,
    });

    const result = releaseLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
    });
    expect(result).toBe(true);

    const lease = checkLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
    });
    expect(lease).toBeNull();
  });

  it("fails when PID does not own the lease", () => {
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
      sessionId: "ses-1",
      staleHeartbeatMs: 60_000,
    });

    const result = releaseLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 99999,
    });
    expect(result).toBe(false);
  });
});

describe("checkLease", () => {
  it("returns null when no lease exists", () => {
    const lease = checkLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
    });
    expect(lease).toBeNull();
  });

  it("returns lease record when exists", () => {
    acquireLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
      pid: 12345,
      sessionId: "ses-1",
      staleHeartbeatMs: 60_000,
    });

    const lease = checkLease({
      leasesDir: leasesDir(),
      worktreePath: "/repo/worktree/change/abc",
    });
    expect(lease).not.toBeNull();
    expect(lease!.pid).toBe(12345);
  });
});
