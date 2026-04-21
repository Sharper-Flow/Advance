import { beforeEach, describe, expect, it, vi } from "vitest";

const workerMocks = vi.hoisted(() => {
  return {
    close: vi.fn(async () => {}),
    run: vi.fn(async () => {}),
    connect: vi.fn(async () => ({ close: workerMocks.close })),
    create: vi.fn(async () => ({ run: workerMocks.run })),
  };
});

vi.mock("@temporalio/worker", () => ({
  NativeConnection: { connect: workerMocks.connect },
  Worker: { create: workerMocks.create },
}));

import { runTemporalWorker, runTemporalWorkerFromEnv } from "./worker";

describe("temporal worker helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runTemporalWorkerFromEnv requires ADV_TEMPORAL_TASK_QUEUE", async () => {
    await expect(
      runTemporalWorkerFromEnv({} as NodeJS.ProcessEnv),
    ).rejects.toThrow(/ADV_TEMPORAL_TASK_QUEUE is required/);
  });

  it("runTemporalWorker creates a worker and closes the connection", async () => {
    await runTemporalWorker({
      taskQueue: "advance-proj1",
      address: "127.0.0.1:7233",
      namespace: "default",
      workflowsPath: "/tmp/workflows.js",
    });

    expect(workerMocks.connect).toHaveBeenCalledWith({
      address: "127.0.0.1:7233",
    });
    expect(workerMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "default",
        taskQueue: "advance-proj1",
        workflowsPath: "/tmp/workflows.js",
      }),
    );
    expect(workerMocks.run).toHaveBeenCalled();
    expect(workerMocks.close).toHaveBeenCalled();
  });

  it("runTemporalWorkerFromEnv uses env-derived defaults", async () => {
    await runTemporalWorkerFromEnv({
      ADV_TEMPORAL_TASK_QUEUE: "advance-proj2",
      ADV_TEMPORAL_ADDRESS: "10.0.0.2:9333",
      ADV_TEMPORAL_ALLOW_REMOTE: "true",
      ADV_TEMPORAL_NAMESPACE: "adv-dev",
    } as NodeJS.ProcessEnv);

    expect(workerMocks.connect).toHaveBeenCalledWith({
      address: "10.0.0.2:9333",
    });
    expect(workerMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "adv-dev",
        taskQueue: "advance-proj2",
      }),
    );
  });

  it("runTemporalWorker falls back to workflows.ts when workflows.js is absent in source mode", async () => {
    await runTemporalWorker({
      taskQueue: "advance-proj-source",
      address: "127.0.0.1:7233",
      namespace: "default",
    });

    expect(workerMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: "advance-proj-source",
        workflowsPath: expect.stringMatching(
          /src\/temporal\/workflows\.(js|ts)$/,
        ),
      }),
    );
  });
});
