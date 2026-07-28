/**
 * Orphan-queue adopter construction after restart (RED test).
 *
 * restartCurrentProjectTemporalWorker currently registers the restarted worker
 * but does not instantiate OrphanQueueAdopter. Therefore
 * getOrphanQueueAdoptionDiagnostics() returns null after restart — this test
 * captures that defect.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PathLike } from "node:fs";

import { cleanupTempDir, createTempDir } from "./__tests__/setup";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  getProjectId: vi.fn(),
  getExternalRoot: vi.fn(),
  ensureTemporalRuntime: vi.fn(),
  probeTemporalWorkerRuntime: vi.fn(),
  createInProcessWorker: vi.fn(),
  createOutOfProcessWorker: vi.fn(),
  getService: vi.fn(),
  initStsl: vi.fn(),
  closeStsl: vi.fn(),
  fakeWorker: {
    queues: ["adv-test-queue"],
    shutdown: vi.fn(async () => {}),
  } as const,
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: (path: PathLike) => {
      const override = mocks.existsSync(path);
      if (override !== undefined) return override;
      return actual.existsSync(path);
    },
  };
});

vi.mock("./utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("./utils/project-id")>(
    "./utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
    getExternalRoot: mocks.getExternalRoot,
  };
});

vi.mock("./temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("./temporal/runtime-manager")
  >("./temporal/runtime-manager");
  return {
    ...actual,
    ensureTemporalRuntime: mocks.ensureTemporalRuntime,
    probeTemporalWorkerRuntime: mocks.probeTemporalWorkerRuntime,
  };
});

vi.mock("./temporal/in-process-worker", () => ({
  createInProcessWorker: mocks.createInProcessWorker,
}));

vi.mock("./temporal/out-of-process-worker", () => ({
  createOutOfProcessWorker: mocks.createOutOfProcessWorker,
}));

vi.mock("./temporal/service", () => ({
  getService: mocks.getService,
  initStsl: mocks.initStsl,
  closeStsl: mocks.closeStsl,
}));

import {
  getOrphanQueueAdoptionDiagnostics,
  restartCurrentProjectTemporalWorker,
} from "./plugin-init";

describe("restartCurrentProjectTemporalWorker orphan-queue adopter (RED)", () => {
  let tempDirs: string[] = [];
  let externalDir: string | undefined;
  let savedAdoptionEnv: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();

    savedAdoptionEnv = process.env.ADV_ORPHAN_QUEUE_ADOPTION;
    process.env.ADV_ORPHAN_QUEUE_ADOPTION = "1";

    externalDir = await createTempDir("adv-restart-adopter-ext-");
    tempDirs.push(externalDir);

    mocks.existsSync.mockImplementation((path) => {
      if (
        typeof path === "string" &&
        path.includes("dist/temporal/worker.js")
      ) {
        return true;
      }
      return undefined;
    });

    mocks.probeTemporalWorkerRuntime.mockReturnValue({
      supported: true,
      runtime: "node",
      reason: "mocked",
    });

    mocks.ensureTemporalRuntime.mockResolvedValue({
      address: "localhost:7233",
      namespace: "default",
    });

    mocks.createInProcessWorker.mockResolvedValue(mocks.fakeWorker);
    mocks.createOutOfProcessWorker.mockResolvedValue(mocks.fakeWorker);

    mocks.getProjectId.mockImplementation((dir: string) =>
      Promise.resolve(`synthetic-project-${dir}`),
    );

    mocks.getExternalRoot.mockImplementation(() => externalDir ?? "/tmp");

    mocks.getService.mockReturnValue({ client: {} });
  });

  afterEach(async () => {
    if (savedAdoptionEnv === undefined) {
      delete process.env.ADV_ORPHAN_QUEUE_ADOPTION;
    } else {
      process.env.ADV_ORPHAN_QUEUE_ADOPTION = savedAdoptionEnv;
    }
    await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
    tempDirs = [];
  });

  test("constructs an orphan-queue adopter after restart", async () => {
    const projectDir = await createTempDir("adv-restart-adopter-");
    tempDirs.push(projectDir);

    await restartCurrentProjectTemporalWorker(projectDir);

    const diag = getOrphanQueueAdoptionDiagnostics();
    expect(diag).not.toBeNull();
  });
});
