import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { WORKER_LOCK_FILENAME, type WorkerLockContentsV2 } from "./worker-lock";
import { startHeartbeatWriter } from "./heartbeat-writer";
import {
  getTemporalRetryTelemetry,
  resetTemporalRetryTelemetry,
} from "./retry-wrapper";

describe("heartbeat-writer", () => {
  let stateDir: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    resetTemporalRetryTelemetry();
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
      "2026-01-01T00:00:05.000Z",
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
    const onWorkerExhausted = vi.fn(async () => {});

    const writer = startHeartbeatWriter({
      projectStateDir: "/state",
      workerId: "owner",
      intervalMs: 1_000,
      fs,
      now: () => new Date("2026-01-01T00:00:05.000Z"),
      nonce: () => "nonce",
      debugLog,
      onWorkerExhausted,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await writer.stop();

    expect(fs.rename).not.toHaveBeenCalled();
    expect(fs.rm).toHaveBeenCalledWith(tmpPath, { force: true });
    expect(debugLog).toHaveBeenCalledWith(
      expect.stringContaining("heartbeat writer stopped"),
    );
    expect(onWorkerExhausted).toHaveBeenCalledTimes(1);
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

  it("logs first write failure without recording retry telemetry or exhausting", async () => {
    const fs = createFailingFs(1);
    const debugLog = vi.fn();
    const onWorkerExhausted = vi.fn(async () => {});

    const writer = startHeartbeatWriter({
      projectStateDir: "/state",
      workerId: "owner",
      intervalMs: 1_000,
      fs,
      debugLog,
      onWorkerExhausted,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await writer.stop();

    expect(debugLog).toHaveBeenCalledWith(
      expect.stringContaining("heartbeat write failed (1 consecutive)"),
    );
    expect(getTemporalRetryTelemetry().lastError).toBeNull();
    expect(onWorkerExhausted).not.toHaveBeenCalled();
  });

  it("records retry telemetry on second consecutive write failure and backs off", async () => {
    const fs = createFailingFs(2);
    const debugLog = vi.fn();

    const writer = startHeartbeatWriter({
      projectStateDir: "/state",
      workerId: "owner",
      intervalMs: 1_000,
      fs,
      debugLog,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await writer.stop();

    expect(getTemporalRetryTelemetry().lastError).toContain(
      "heartbeat write failed",
    );
    expect(fs.open).toHaveBeenCalledTimes(2);
  });

  it("fires onWorkerExhausted on third consecutive write failure", async () => {
    const fs = createFailingFs(3);
    const onWorkerExhausted = vi.fn(async () => {});

    const writer = startHeartbeatWriter({
      projectStateDir: "/state",
      workerId: "owner",
      intervalMs: 1_000,
      fs,
      onWorkerExhausted,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await writer.stop();

    expect(onWorkerExhausted).toHaveBeenCalledTimes(1);
    expect(fs.open).toHaveBeenCalledTimes(3);
  });

  it("fires onWorkerExhausted when the next projected heartbeat would exceed stale grace", async () => {
    const fs = createFailingFs(2);
    const onWorkerExhausted = vi.fn(async () => {});
    let nowMs = 0;

    const writer = startHeartbeatWriter({
      projectStateDir: "/state",
      workerId: "owner",
      intervalMs: 1_000,
      staleHeartbeatMs: 1_500,
      fs,
      now: () => new Date(nowMs),
      onWorkerExhausted,
    });
    nowMs = 1_000;
    await vi.advanceTimersByTimeAsync(1_000);
    nowMs = 2_000;
    await vi.advanceTimersByTimeAsync(1_000);
    await writer.stop();

    expect(onWorkerExhausted).toHaveBeenCalledTimes(1);
  });

  it("resets consecutive failure state after a successful heartbeat", async () => {
    const fs = createRecoveringFs();
    const onWorkerExhausted = vi.fn(async () => {});

    const writer = startHeartbeatWriter({
      projectStateDir: "/state",
      workerId: "owner",
      intervalMs: 1_000,
      fs,
      onWorkerExhausted,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await writer.stop();

    expect(onWorkerExhausted).not.toHaveBeenCalled();
    expect(fs.rename).toHaveBeenCalledTimes(1);
  });

  it("self-expires without renewing when local worker stays unserviceable past grace", async () => {
    await writeLock(stateDir, "owner", "2026-01-01T00:00:00.000Z");
    const debugLog = vi.fn();
    const onWorkerExhausted = vi.fn(async () => {});
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");

    const writer = startHeartbeatWriter({
      projectStateDir: stateDir,
      workerId: "owner",
      expectedQueue: "advance-proj123",
      intervalMs: 1_000,
      serviceabilityGraceMs: 0,
      isLocalWorkerServiceable: () => false,
      now: () => new Date(nowMs),
      debugLog,
      onWorkerExhausted,
    });
    await vi.advanceTimersByTimeAsync(0);

    nowMs = Date.parse("2026-01-01T00:00:01.000Z");
    await vi.advanceTimersByTimeAsync(1_000);

    nowMs = Date.parse("2026-01-01T00:00:02.000Z");
    await vi.advanceTimersByTimeAsync(1_000);
    nowMs = Date.parse("2026-01-01T00:00:03.000Z");
    await vi.advanceTimersByTimeAsync(1_000);
    await writer.stop();

    expect((await readLock(stateDir)).last_heartbeat).not.toBe(
      "2026-01-01T00:00:03.000Z",
    );
    expect(debugLog).toHaveBeenCalledWith(
      expect.stringContaining("local worker not serviceable"),
    );
    expect(getTemporalRetryTelemetry().lastError).toContain(
      "local worker not serviceable",
    );
    expect(onWorkerExhausted).not.toHaveBeenCalled();
  });
});

function createFailingFs(failures: number) {
  let openCount = 0;
  const handle = {
    writeFile: vi.fn(async () => {}),
    sync: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  return {
    readFile: vi.fn(async () =>
      JSON.stringify(lockContents("owner", "2026-01-01T00:00:00.000Z")),
    ),
    open: vi.fn(async () => {
      openCount += 1;
      if (openCount <= failures) throw new Error("disk full");
      return handle;
    }),
    rename: vi.fn(async () => {}),
    rm: vi.fn(async () => {}),
  };
}

function createRecoveringFs() {
  return createFailingFs(1);
}

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
