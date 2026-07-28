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
  shouldThrowConstruction: false,
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
  const actual =
    await vi.importActual<typeof import("./utils/project-id")>(
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

vi.mock("./temporal/orphan-queue-adopter", async () => {
  const actual =
    await vi.importActual<typeof import("./temporal/orphan-queue-adopter")>(
      "./temporal/orphan-queue-adopter",
    );
  class MockOrphanQueueAdopter extends actual.OrphanQueueAdopter {
    constructor(options: ConstructorParameters<typeof actual.OrphanQueueAdopter>[0]) {
      if (mocks.shouldThrowConstruction) {
        throw new Error("construction failure");
      }
      super(options);
    }
  }
  return { ...actual, OrphanQueueAdopter: MockOrphanQueueAdopter };
});

import {
  getOrphanQueueAdoptionDiagnostics,
  getOrphanQueueAdoptionStatus,
  getWorkerAdoptionAttachmentCount,
  restartCurrentProjectTemporalWorker,
} from "./plugin-init";
import { OrphanQueueAdopter } from "./temporal/orphan-queue-adopter";

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

  test("restart with no temporal client reports typed unavailable adoption (AC10)", async () => {
    mocks.getService.mockReturnValue(null); // no STSL bundle

    const projectDir = await createTempDir("adv-restart-no-client-");
    tempDirs.push(projectDir);

    await restartCurrentProjectTemporalWorker(projectDir);

    const status = getOrphanQueueAdoptionStatus();
    expect(status.enabled).toBe(false);
    expect(status.reason).toBe("no_temporal_client"); // typed, not silent null
    expect(status.diagnostics).toBeNull();
  });

  test("restart-path adopter is driven by attachment tick driver (AC3)", async () => {
    const projectDir = await createTempDir("adv-restart-driven-");
    tempDirs.push(projectDir);

    // Spy on adoptNextOrphan via the real OrphanQueueAdopter prototype.
    const adoptSpy = vi.spyOn(OrphanQueueAdopter.prototype, "adoptNextOrphan");
    adoptSpy.mockResolvedValue(undefined);

    // Use fake timers *before* restart so the attachment's setInterval is
    // created under fake time and can be advanced deterministically.
    vi.useFakeTimers();
    await restartCurrentProjectTemporalWorker(projectDir);

    await vi.advanceTimersByTimeAsync(10_500); // one tick
    vi.useRealTimers();

    expect(adoptSpy).toHaveBeenCalled(); // AC3: tick occurred, not just construction
    adoptSpy.mockRestore();
  });

  test("driver tick error is recorded and driver continues (C7)", async () => {
    const projectDir = await createTempDir("adv-restart-driver-error-");
    tempDirs.push(projectDir);

    const adoptSpy = vi
      .spyOn(OrphanQueueAdopter.prototype, "adoptNextOrphan")
      .mockRejectedValueOnce(new Error("tick failure"));

    vi.useFakeTimers();
    await restartCurrentProjectTemporalWorker(projectDir);

    await vi.advanceTimersByTimeAsync(10_500);
    const status = getOrphanQueueAdoptionStatus();
    expect(status.enabled).toBe(false);
    expect(status.reason).toMatch(/^driver_error: tick failure/);

    // Driver interval is still alive — C3 fail-soft.
    expect(vi.getTimerCount()).toBe(1);

    vi.useRealTimers();
    adoptSpy.mockRestore();
  });

  test("adopter construction failure does not break worker startup (C3)", async () => {
    const projectDir = await createTempDir("adv-restart-construction-fail-");
    tempDirs.push(projectDir);

    mocks.shouldThrowConstruction = true;

    await expect(
      restartCurrentProjectTemporalWorker(projectDir),
    ).resolves.toBeDefined();

    const status = getOrphanQueueAdoptionStatus();
    expect(status.enabled).toBe(false);
    expect(status.reason).toMatch(/^construction_failed: construction failure/);
    expect(getOrphanQueueAdoptionDiagnostics()).toBeNull();

    mocks.shouldThrowConstruction = false;
  });

  test("consecutive restarts do not leak adoption attachments or timers (AC9)", async () => {
    const projectDir = await createTempDir("adv-restart-no-leak-");
    tempDirs.push(projectDir);

    vi.useFakeTimers();

    for (let i = 0; i < 3; i++) {
      await restartCurrentProjectTemporalWorker(projectDir);
      expect(getWorkerAdoptionAttachmentCount()).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
    }

    expect(getWorkerAdoptionAttachmentCount()).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    vi.useRealTimers();
  });

  test("drain stops driver before worker shutdown (C6)", async () => {
    const projectDir = await createTempDir("adv-restart-drain-order-");
    tempDirs.push(projectDir);

    vi.useFakeTimers();

    await restartCurrentProjectTemporalWorker(projectDir);
    expect(vi.getTimerCount()).toBe(1);

    mocks.fakeWorker.shutdown.mockImplementation(async () => {
      // When shutdown is invoked, the old driver must already be cleared.
      expect(vi.getTimerCount()).toBe(0);
    });

    await restartCurrentProjectTemporalWorker(projectDir);
    expect(mocks.fakeWorker.shutdown).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1); // new driver scheduled after restart

    vi.useRealTimers();
    mocks.fakeWorker.shutdown.mockReset();
    mocks.fakeWorker.shutdown.mockResolvedValue(undefined);
  });
});
