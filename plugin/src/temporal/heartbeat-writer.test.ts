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

async function readLock(stateDir: string): Promise<WorkerLockContentsV2> {
  return JSON.parse(
    await readFile(join(stateDir, WORKER_LOCK_FILENAME), "utf8"),
  ) as WorkerLockContentsV2;
}
