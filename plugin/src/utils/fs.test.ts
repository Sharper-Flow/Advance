import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireFileLock } from "./fs";
import { mkdir, rm, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { tmpdir } from "os";

const syncCalls: Array<{ path: string; flags: string | number | undefined }> =
  [];
const openCalls: Array<{ path: string; flags: string | number | undefined }> =
  [];

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    open: async (path: string, flags?: string | number) => {
      openCalls.push({ path, flags });
      const handle = await actual.open(path, flags);
      const originalSync = handle.sync.bind(handle);
      (handle as { sync: () => Promise<void> }).sync = async () => {
        syncCalls.push({ path, flags });
        return originalSync();
      };
      return handle;
    },
  };
});

import { atomicWriteFile } from "./fs";

describe("acquireFileLock", () => {
  let testDir: string;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (testDir) {
      await rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  async function makeTestDir(): Promise<string> {
    testDir = join(
      tmpdir(),
      `fs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
    return testDir;
  }

  it("single contender acquires lock immediately", async () => {
    const dir = await makeTestDir();
    const target = join(dir, "test.json");

    const release = await acquireFileLock(target);
    expect(release).toBeTypeOf("function");

    await release();
  });

  it("uses jittered exponential backoff — first delay < 25ms base", async () => {
    const dir = await makeTestDir();
    const target = join(dir, "jitter-test.json");
    const lockPath = `${target}.lock`;

    // Fix random at 0.5 so boundedRetry's delay = 0.75 * base.
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const delays: number[] = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      cb: () => void,
      ms?: number,
    ) => {
      if (ms !== undefined && ms > 0) {
        delays.push(ms);
      }
      cb();
      return {} as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    // Create a lock held by our own PID (never stale-detected)
    await writeFile(lockPath, `${process.pid}\n${Date.now()}`, { flag: "wx" });

    await expect(acquireFileLock(target, 200)).rejects.toThrow(
      /Failed to acquire lock/,
    );

    // boundedRetry owns the backoff: attempt 1 delay =
    // (0.5 + 0.5 * 0.5) * min(500, 25*2^0) = 0.75*25 = 18.75.
    // A fixed retry loop would produce exactly 50 every time, so the delay
    // being jittered and exponential is what this asserts.
    expect(delays.length).toBeGreaterThanOrEqual(1);
    expect(delays[0]).toBe(18.75);

    // Second delay = 0.75 * min(500, 25*2^1) = 0.75*50 = 37.5
    if (delays.length >= 2) {
      expect(delays[1]).toBe(37.5);
    }

    await import("fs/promises").then((fs) =>
      fs.unlink(lockPath).catch(() => {}),
    );
  });

  it(
    "caps delay at maxWaitMs (500ms) with jitter",
    { timeout: 10_000 },
    async () => {
      const dir = await makeTestDir();
      const target = join(dir, "cap-test.json");
      const lockPath = `${target}.lock`;

      // Fix random at high value to stress the cap
      vi.spyOn(Math, "random").mockReturnValue(0.99);

      const delays: number[] = [];
      vi.spyOn(globalThis, "setTimeout").mockImplementation(((
        cb: () => void,
        ms?: number,
      ) => {
        if (ms !== undefined && ms > 0) {
          delays.push(ms);
        }
        cb();
        return {} as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

      await writeFile(lockPath, `${process.pid}\n${Date.now()}`, {
        flag: "wx",
      });

      // Give enough budget for exponential to grow past 500
      await expect(acquireFileLock(target, 5000)).rejects.toThrow(
        /Failed to acquire lock/,
      );

      // Every delay must be <= 500 (maxWaitMs)
      for (const d of delays) {
        expect(d).toBeLessThanOrEqual(500);
      }

      // And we should see growth: later delays > earlier delays (before cap)
      // With initial 25, coefficient 2: 25, 50, 100, 200, 400, 500 (cap), 500, ...
      // At random=0.99: 24.75, 49.5, 99, 198, 396, 495, 495, ...
      expect(delays.length).toBeGreaterThan(4);

      await import("fs/promises").then((fs) =>
        fs.unlink(lockPath).catch(() => {}),
      );
    },
  );

  it("clears stale lock from dead process and acquires", async () => {
    const dir = await makeTestDir();
    const target = join(dir, "stale-test.json");
    const lockPath = `${target}.lock`;

    // Create a stale lock: dead PID + old timestamp
    const deadPid = 99999;
    const staleTimestamp = Date.now() - 60000; // 60s ago
    await writeFile(lockPath, `${deadPid}\n${staleTimestamp}`, { flag: "wx" });

    // Should detect stale, clear it, and acquire
    const release = await acquireFileLock(target, 1000);
    expect(release).toBeTypeOf("function");

    await release();
  });

  it("respects explicit timeoutMs override", async () => {
    const dir = await makeTestDir();
    const target = join(dir, "explicit-test.json");
    const lockPath = `${target}.lock`;

    vi.spyOn(Math, "random").mockReturnValue(0.5);

    await writeFile(lockPath, `${process.pid}\n${Date.now()}`, { flag: "wx" });

    const startTime = Date.now();
    await expect(acquireFileLock(target, 200)).rejects.toThrow(
      /Failed to acquire lock/,
    );
    const elapsed = Date.now() - startTime;

    // Should have waited ~200ms (the explicit timeout) before failing
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(600);

    await import("fs/promises").then((fs) =>
      fs.unlink(lockPath).catch(() => {}),
    );
  });
});

describe("atomicWriteFile", () => {
  let testDir: string;

  afterEach(async () => {
    syncCalls.length = 0;
    openCalls.length = 0;
    vi.restoreAllMocks();
    if (testDir) {
      await rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  async function makeTestDir(): Promise<string> {
    testDir = join(
      tmpdir(),
      `atomic-write-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
    return testDir;
  }

  it("fsyncs the parent directory after rename", async () => {
    const dir = await makeTestDir();
    const filePath = join(dir, "nested", "file.txt");
    const parentDir = dirname(filePath);

    await atomicWriteFile(filePath, "hello");

    // file handle sync before rename (on temp path)
    expect(syncCalls.some((c) => c.path.startsWith(filePath))).toBe(true);
    // directory sync after rename
    expect(openCalls.some((c) => c.path === parentDir && c.flags === "r")).toBe(
      true,
    );
    expect(syncCalls.some((c) => c.path === parentDir)).toBe(true);
  });

  it("creates missing parent directories", async () => {
    const dir = await makeTestDir();
    const filePath = join(dir, "deeply", "nested", "file.txt");

    await atomicWriteFile(filePath, "content");

    const fs = await import("fs/promises");
    const read = await fs.readFile(filePath, "utf-8");
    expect(read).toBe("content");
  });
});
