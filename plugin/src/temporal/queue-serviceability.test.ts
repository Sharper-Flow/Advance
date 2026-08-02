import { describe, expect, it, vi } from "vitest";

import {
  classifyQueueServiceability,
  evaluateQueueReadiness,
  probeTaskQueuePollers,
} from "./queue-serviceability";
import { createMockOwner } from "./__tests__/mock-owner";

describe("classifyQueueServiceability", () => {
  it("treats a locally owned ready worker as serviceable without server poller evidence", () => {
    const result = classifyQueueServiceability({
      projectId: "0000a00000000000000000000000000000000000",
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
      projectId: "0000a00000000000000000000000000000000000",
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
      projectId: "0000a00000000000000000000000000000000000",
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
      projectId: "0000a00000000000000000000000000000000000",
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

describe("evaluateQueueReadiness", () => {
  it("returns ready/combined when both local and server signals are serviceable", () => {
    const result = evaluateQueueReadiness({
      localRegistered: true,
      localWorkerAlive: true,
      localOwnership: "owned",
      serverPollerStatus: "fresh",
      staleRunningWorkflowCount: 0,
    });

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.probeKind).toBe("combined");
  });

  it("returns ready/local when only the local worker signal is serviceable", () => {
    const result = evaluateQueueReadiness({
      localRegistered: true,
      localWorkerAlive: true,
      localOwnership: "owned",
      serverPollerStatus: "unavailable",
      staleRunningWorkflowCount: 0,
    });

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.probeKind).toBe("local");
  });

  it("returns ready/server when only a fresh server poller is present", () => {
    const result = evaluateQueueReadiness({
      localRegistered: false,
      localWorkerAlive: false,
      localOwnership: "peer",
      serverPollerStatus: "fresh",
      staleRunningWorkflowCount: 0,
    });

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.probeKind).toBe("server");
  });

  it("returns not ready when stale running workflows exist with stale server evidence", () => {
    const result = evaluateQueueReadiness({
      localRegistered: false,
      localWorkerAlive: false,
      localOwnership: "unknown",
      serverPollerStatus: "stale",
      staleRunningWorkflowCount: 6,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("stale_running_workflows_without_poller");
    expect(result.blockers).toContain("server_poller_stale");
    expect(result.probeKind).toBe("none");
  });

  it("returns not ready/unknown when no serviceable signals are present", () => {
    const result = evaluateQueueReadiness({
      localRegistered: false,
      localWorkerAlive: false,
      localOwnership: "unknown",
      serverPollerStatus: "unavailable",
      staleRunningWorkflowCount: 0,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("local_queue_not_registered");
    expect(result.blockers).toContain("local_worker_not_alive");
    expect(result.blockers).toContain("server_poller_probe_unavailable");
    expect(result.probeKind).toBe("none");
  });
});

describe("probeTaskQueuePollers", () => {
  it("reports fresh when describeTaskQueue returns a recent poller", async () => {
    const owner = createMockOwner({
      describeTaskQueue: vi.fn(async (_ctx, _taskQueue: string) => ({
        kind: "complete" as const,
        value: {
          pollers: [{ identity: "worker-1", lastAccessTime: new Date(90_000) }],
        },
      })),
    });

    const result = await probeTaskQueuePollers({
      owner,
      projectId: "0000a00000000000000000000000000000000000",
      taskQueue: "advance-proj-a",
      nowMs: () => 100_000,
      freshPollerMs: 60_000,
    });

    expect(result).toEqual({
      status: "fresh",
      lastAccessMs: 10_000,
      pollerCount: 1,
      lastPollerAt: "1970-01-01T00:01:30.000Z",
    });
  });

  it("reports stale when all pollers are older than the freshness budget", async () => {
    const owner = createMockOwner({
      describeTaskQueue: vi.fn(async () => ({
        kind: "complete" as const,
        value: {
          pollers: [{ lastAccessTime: "1970-01-01T00:00:10.000Z" }],
        },
      })),
    });

    const result = await probeTaskQueuePollers({
      owner,
      projectId: "0000a00000000000000000000000000000000000",
      taskQueue: "advance-proj-a",
      nowMs: () => 100_000,
      freshPollerMs: 60_000,
    });

    expect(result).toEqual({
      status: "stale",
      lastAccessMs: 90_000,
      pollerCount: 1,
      lastPollerAt: "1970-01-01T00:00:10.000Z",
    });
  });

  it("reports unavailable when describeTaskQueue is missing or throws", async () => {
    await expect(
      probeTaskQueuePollers({
        owner: createMockOwner({
          describeTaskQueue: vi.fn(async () => {
            throw new Error("unsupported");
          }),
        }),
        projectId: "0000a00000000000000000000000000000000000",
        taskQueue: "advance-proj-a",
      }),
    ).resolves.toMatchObject({
      status: "unavailable",
      lastAccessMs: null,
      pollerCount: 0,
      lastPollerAt: null,
    });

    await expect(
      probeTaskQueuePollers({
        owner: createMockOwner(),
        projectId: "0000a00000000000000000000000000000000000",
        taskQueue: "advance-proj-a",
      }),
    ).resolves.toMatchObject({
      status: "unavailable",
      lastAccessMs: null,
      pollerCount: 0,
      lastPollerAt: null,
    });
  });
});
