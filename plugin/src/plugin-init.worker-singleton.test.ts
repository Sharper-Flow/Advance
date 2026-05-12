import { access } from "fs/promises";
import { join } from "path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "./__tests__/setup";
import { WORKER_LOCK_FILENAME } from "./temporal/worker-lock";
import { resolveWorkerSingletonPlan } from "./plugin-init";

const NOW = new Date("2026-05-12T00:00:00.000Z");

describe("plugin-init worker singleton plan", () => {
  let tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
    tempDirs = [];
  });

  const tempDir = async () => {
    const dir = await createTempDir("plugin-init-worker-singleton-");
    tempDirs.push(dir);
    return dir;
  };

  test("three enforced init attempts produce one host and two clients", async () => {
    const dir = await tempDir();

    const first = await resolveWorkerSingletonPlan({
      projectStateDir: dir,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 1001,
      now: () => NOW,
    });
    const second = await resolveWorkerSingletonPlan({
      projectStateDir: dir,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 1002,
      now: () => NOW,
      isPidAlive: () => true,
    });
    const third = await resolveWorkerSingletonPlan({
      projectStateDir: dir,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 1003,
      now: () => NOW,
      isPidAlive: () => true,
    });

    expect([first.workerRole, second.workerRole, third.workerRole]).toEqual([
      "host",
      "client",
      "client",
    ]);
    expect([first.shouldSpawnWorker, second.shouldSpawnWorker, third.shouldSpawnWorker]).toEqual([
      true,
      false,
      false,
    ]);
  });

  test("flag off preserves legacy spawn path and does not acquire lock", async () => {
    const dir = await tempDir();

    const first = await resolveWorkerSingletonPlan({
      projectStateDir: dir,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: false,
      pid: 2001,
    });
    const second = await resolveWorkerSingletonPlan({
      projectStateDir: dir,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: false,
      pid: 2002,
    });

    expect(first).toMatchObject({ shouldSpawnWorker: true, workerRole: "host" });
    expect(second).toMatchObject({ shouldSpawnWorker: true, workerRole: "host" });
    await expect(access(join(dir, WORKER_LOCK_FILENAME))).rejects.toThrow();
  });

  test("dead lock holder is reclaimed through worker-lock helper", async () => {
    const dir = await tempDir();
    await resolveWorkerSingletonPlan({
      projectStateDir: dir,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 3001,
      now: () => NOW,
    });

    const next = await resolveWorkerSingletonPlan({
      projectStateDir: dir,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 3002,
      now: () => NOW,
      isPidAlive: () => false,
    });

    expect(next).toMatchObject({ shouldSpawnWorker: true, workerRole: "host" });
  });
});
