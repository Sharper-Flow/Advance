import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { WORKER_LOCK_FILENAME, type WorkerLockContentsV2 } from "./worker-lock";
import { startHeartbeatWriter } from "./heartbeat-writer";

describe("heartbeat-writer", () => {
  let stateDir: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    stateDir = await createTempDir("adv-heartbeat-writer-");
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanupTempDir(stateDir);
  });

  it("writes a heartbeat for the current worker", async () => {
    await writeLock(stateDir, "owner", "2026-01-01T00:00:00.000Z");
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));

    const writer = startHeartbeatWriter({
      projectStateDir: stateDir,
      workerId: "owner",
      intervalMs: 1_000,
    });
    await vi.runOnlyPendingTimersAsync();
    await writer.stop();

    expect((await readLock(stateDir)).last_heartbeat).toBe(
      "2026-01-01T00:00:06.000Z",
    );
  });

  it("stops when the lock belongs to a different worker", async () => {
    await writeLock(stateDir, "stranger", "2026-01-01T00:00:00.000Z");
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));

    const writer = startHeartbeatWriter({
      projectStateDir: stateDir,
      workerId: "owner",
      intervalMs: 1_000,
    });
    await vi.runOnlyPendingTimersAsync();
    await writer.stop();

    expect((await readLock(stateDir)).last_heartbeat).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("writes heartbeats through a synced temp file before atomic rename", async () => {
    const lockPath = join("/state", WORKER_LOCK_FILENAME);
    const tmpPath = `${lockPath}.tmp.${process.pid}.nonce`;
    const handle = {
      writeFile: vi.fn(async () => {}),
      sync: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const fs = {
      readFile: vi.fn(async () =>
        JSON.stringify(lockContents("owner", "2026-01-01T00:00:00.000Z")),
      ),
      open: vi.fn(async () => handle),
      rename: vi.fn(async () => {}),
      rm: vi.fn(async () => {}),
    };

    const writer = startHeartbeatWriter({
      projectStateDir: "/state",
      workerId: "owner",
      intervalMs: 1_000,
      fs,
      now: () => new Date("2026-01-01T00:00:05.000Z"),
      nonce: () => "nonce",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await writer.stop();

    expect(fs.open).toHaveBeenCalledWith(tmpPath, "w");
    expect(JSON.parse(handle.writeFile.mock.calls[0][0] as string)).toEqual({
      ...lockContents("owner", "2026-01-01T00:00:00.000Z"),
      last_heartbeat: "2026-01-01T00:00:05.000Z",
    });
    expect(handle.sync).toHaveBeenCalled();
    expect(fs.rename).toHaveBeenCalledWith(tmpPath, lockPath);
    expect(handle.sync.mock.invocationCallOrder[0]).toBeLessThan(
      fs.rename.mock.invocationCallOrder[0],
    );
    expect(fs.rm).not.toHaveBeenCalled();
  });

  it("removes temp file, logs debug, and stops when identity guard fails before rename", async () => {
    const lockPath = join("/state", WORKER_LOCK_FILENAME);
    const tmpPath = `${lockPath}.tmp.${process.pid}.nonce`;
    let readCount = 0;
    const handle = {
      writeFile: vi.fn(async () => {}),
      sync: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const fs = {
      readFile: vi.fn(async () => {
        readCount += 1;
        return JSON.stringify(
          readCount === 1
            ? lockContents("owner", "2026-01-01T00:00:00.000Z")
            : lockContents("stranger", "2026-01-01T00:00:00.000Z"),
        );
      }),
      open: vi.fn(async () => handle),
      rename: vi.fn(async () => {}),
      rm: vi.fn(async () => {}),
    };
    const debugLog = vi.fn();

    const writer = startHeartbeatWriter({
      projectStateDir: "/state",
      workerId: "owner",
      intervalMs: 1_000,
      fs,
      now: () => new Date("2026-01-01T00:00:05.000Z"),
      nonce: () => "nonce",
      debugLog,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await writer.stop();

    expect(fs.rename).not.toHaveBeenCalled();
    expect(fs.rm).toHaveBeenCalledWith(tmpPath, { force: true });
    expect(debugLog).toHaveBeenCalledWith(
      expect.stringContaining("heartbeat writer stopped"),
    );
    expect(fs.readFile).toHaveBeenCalledTimes(2);
  });

  it("stop terminates future heartbeat writes", async () => {
    await writeLock(stateDir, "owner", "2026-01-01T00:00:00.000Z");
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
    const writer = startHeartbeatWriter({
      projectStateDir: stateDir,
      workerId: "owner",
      intervalMs: 1_000,
    });
    await vi.runOnlyPendingTimersAsync();
    await writer.stop();
    const stoppedAt = (await readLock(stateDir)).last_heartbeat;

    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
    await vi.advanceTimersByTimeAsync(5_000);

    expect((await readLock(stateDir)).last_heartbeat).toBe(stoppedAt);
  });
});

async function writeLock(
  stateDir: string,
  workerId: string,
  heartbeat: string,
): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  const contents: WorkerLockContentsV2 = {
    pid: 12345,
    worker_id: workerId,
    acquired_at: "2026-01-01T00:00:00.000Z",
    schema_version: 2,
    last_heartbeat: heartbeat,
  };
  await writeFile(
    join(stateDir, WORKER_LOCK_FILENAME),
    JSON.stringify(contents),
  );
}

function lockContents(
  workerId: string,
  heartbeat: string,
): WorkerLockContentsV2 {
  return {
    pid: 12345,
    worker_id: workerId,
    acquired_at: "2026-01-01T00:00:00.000Z",
    schema_version: 2,
    last_heartbeat: heartbeat,
  };
}

async function readLock(stateDir: string): Promise<WorkerLockContentsV2> {
  return JSON.parse(
    await readFile(join(stateDir, WORKER_LOCK_FILENAME), "utf8"),
  ) as WorkerLockContentsV2;
}
