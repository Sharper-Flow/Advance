import { describe, expect, it, vi } from "vitest";

import {
  classifyQueueServiceability,
  probeTaskQueuePollers,
} from "./queue-serviceability";

describe("classifyQueueServiceability", () => {
  it("treats a locally owned ready worker as serviceable without server poller evidence", () => {
    const result = classifyQueueServiceability({
      projectId: "proj-a",
      expectedQueue: "advance-proj-a",
      localRegistered: true,
      localWorkerAlive: true,
      localOwnership: "owned",
      serverPollerProbe: { status: "unavailable", lastAccessMs: null },
      staleQueueProbe: "unavailable",
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("local");
    expect(result.blockers).toEqual([]);
    expect(result.evidence.serverPollerProbe).toBe("unavailable");
  });

  it("treats a fresh server poller as serviceable for peer-owned queues", () => {
    const result = classifyQueueServiceability({
      projectId: "proj-a",
      expectedQueue: "advance-proj-a",
      localRegistered: false,
      localWorkerAlive: false,
      localOwnership: "peer",
      serverPollerProbe: { status: "fresh", lastAccessMs: 12_000 },
      staleQueueProbe: "ok",
      staleRunningWorkflowCount: 0,
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("server");
  });

  it("does not claim peer-owned PID-only evidence is serviceable when poller evidence is unavailable", () => {
    const result = classifyQueueServiceability({
      projectId: "proj-a",
      expectedQueue: "advance-proj-a",
      localRegistered: false,
      localWorkerAlive: false,
      localOwnership: "peer",
      serverPollerProbe: { status: "unavailable", lastAccessMs: null },
      staleQueueProbe: "unavailable",
    });

    expect(result.status).toBe("unknown");
    expect(result.confidence).toBe("none");
    expect(result.blockers).toContain("server_poller_probe_unavailable");
  });

  it("marks stale or missing evidence with stale running workflows as not serviceable", () => {
    const result = classifyQueueServiceability({
      projectId: "proj-a",
      expectedQueue: "advance-proj-a",
      localRegistered: false,
      localWorkerAlive: false,
      localOwnership: "unknown",
      serverPollerProbe: { status: "none", lastAccessMs: null },
      staleQueueProbe: "ok",
      staleRunningWorkflowCount: 6,
    });

    expect(result.status).toBe("not_serviceable");
    expect(result.confidence).toBe("none");
    expect(result.blockers).toContain("stale_running_workflows_without_poller");
  });
});

describe("probeTaskQueuePollers", () => {
  it("reports fresh when describeTaskQueue returns a recent poller", async () => {
    const describeTaskQueue = vi.fn(async () => ({
      pollers: [{ identity: "worker-1", lastAccessTime: new Date(90_000) }],
    }));

    const result = await probeTaskQueuePollers({
      connection: { workflowService: { describeTaskQueue } },
      namespace: "default",
      taskQueue: "advance-proj-a",
      nowMs: () => 100_000,
      freshPollerMs: 60_000,
    });

    expect(result).toEqual({ status: "fresh", lastAccessMs: 10_000 });
    expect(describeTaskQueue).toHaveBeenCalledWith({
      namespace: "default",
      taskQueue: { name: "advance-proj-a" },
      taskQueueType: 1,
    });
  });

  it("reports stale when all pollers are older than the freshness budget", async () => {
    const result = await probeTaskQueuePollers({
      connection: {
        workflowService: {
          describeTaskQueue: vi.fn(async () => ({
            pollers: [{ lastAccessTime: "1970-01-01T00:00:10.000Z" }],
          })),
        },
      },
      namespace: "default",
      taskQueue: "advance-proj-a",
      nowMs: () => 100_000,
      freshPollerMs: 60_000,
    });

    expect(result).toEqual({ status: "stale", lastAccessMs: 90_000 });
  });

  it("reports unavailable when describeTaskQueue is missing or throws", async () => {
    await expect(
      probeTaskQueuePollers({
        connection: {},
        namespace: "default",
        taskQueue: "advance-proj-a",
      }),
    ).resolves.toMatchObject({ status: "unavailable", lastAccessMs: null });

    await expect(
      probeTaskQueuePollers({
        connection: {
          workflowService: {
            describeTaskQueue: vi.fn(async () => {
              throw new Error("unsupported");
            }),
          },
        },
        namespace: "default",
        taskQueue: "advance-proj-a",
      }),
    ).resolves.toMatchObject({ status: "unavailable", lastAccessMs: null });
  });
});
