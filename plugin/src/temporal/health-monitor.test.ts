import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  composeWorkerHealthProbe,
  createHealthMonitor,
} from "./health-monitor";

// P1.6 — Health-probed worker restart.
//
// Periodic health probe + bounded-budget worker restart. Implemented as a
// pure factory injecting `probe()` and `restart()` callbacks so tests can
// drive the state machine without a real Temporal server.
//
// Schedule:
//   - probe every 30s (default), 3s timeout
//   - probe failure → log + attempt restart
//   - restart bounded to 10 attempts with exponential backoff
//     1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s, 60s (capped at 60s)
//   - 10th failure → emit [ADV:BLOCKED] + stop retrying
//   - successful probe resets restart counter
//   - stop() clears all timers

describe("createHealthMonitor (P1.6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls probe every interval", async () => {
    const probe = vi.fn(async () => true);
    const monitor = createHealthMonitor({
      probe,
      restart: vi.fn(async () => {}),
      intervalMs: 1000,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1100);
    expect(probe).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(probe).toHaveBeenCalledTimes(2);

    monitor.stop();
  });

  it("does NOT call probe before the first interval elapses", async () => {
    const probe = vi.fn(async () => true);
    const monitor = createHealthMonitor({
      probe,
      restart: vi.fn(async () => {}),
      intervalMs: 1000,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(500);
    expect(probe).not.toHaveBeenCalled();

    monitor.stop();
  });

  it("triggers restart on probe failure", async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"));
    const restart = vi.fn(async () => {});
    const monitor = createHealthMonitor({
      probe,
      restart,
      intervalMs: 1000,
      backoffMs: [10],
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1100);
    // Allow microtasks for restart promise to resolve
    await vi.advanceTimersByTimeAsync(50);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it("times out a hanging probe (probeTimeoutMs)", async () => {
    const probe = vi.fn(
      () => new Promise<boolean>(() => {}), // never resolves
    );
    const restart = vi.fn(async () => {});
    const monitor = createHealthMonitor({
      probe,
      restart,
      intervalMs: 1000,
      probeTimeoutMs: 200,
      backoffMs: [10],
    });
    monitor.start();

    // Advance past first interval + probe timeout + small buffer for backoff
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(50);

    expect(probe).toHaveBeenCalled();
    expect(restart).toHaveBeenCalled();

    monitor.stop();
  });

  it("uses exponential backoff on consecutive failures", async () => {
    const probe = vi.fn(async () => {
      throw new Error("down");
    });
    const restartTimes: number[] = [];
    const restart = vi.fn(async () => {
      restartTimes.push(Date.now());
      throw new Error("restart failed too");
    });
    const monitor = createHealthMonitor({
      probe,
      restart,
      intervalMs: 1000,
      backoffMs: [100, 200, 400],
      maxRestarts: 3,
    });

    monitor.start();

    // Drive 3 failures in quick succession
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1100);
      await vi.advanceTimersByTimeAsync(50); // probe completion
      await vi.advanceTimersByTimeAsync(500); // backoff
    }

    expect(restart).toHaveBeenCalledTimes(3);

    monitor.stop();
  });

  it("stops retrying after maxRestarts and emits [ADV:BLOCKED]", async () => {
    const probe = vi.fn(async () => {
      throw new Error("down");
    });
    const restart = vi.fn(async () => {
      throw new Error("restart failed too");
    });
    const onBlocked = vi.fn();
    const monitor = createHealthMonitor({
      probe,
      restart,
      intervalMs: 1000,
      backoffMs: [10],
      maxRestarts: 2,
      onBlocked,
    });
    monitor.start();

    // Drive 3 failures (one more than maxRestarts to verify cutoff)
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1100);
      await vi.advanceTimersByTimeAsync(20);
      await vi.advanceTimersByTimeAsync(50);
    }

    // Restart called maxRestarts times, then NO more
    expect(restart).toHaveBeenCalledTimes(2);
    expect(onBlocked).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it("resets restart counter on successful probe (recovery)", async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("down again"));
    const restart = vi.fn(async () => {});
    const monitor = createHealthMonitor({
      probe,
      restart,
      intervalMs: 1000,
      backoffMs: [10],
      maxRestarts: 1,
    });
    monitor.start();

    // First probe: fails → restart 1/1
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(50);
    expect(restart).toHaveBeenCalledTimes(1);

    // Second probe: succeeds → counter resets
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(50);

    // Third probe: fails → restart 1/1 again (counter was reset)
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(50);
    expect(restart).toHaveBeenCalledTimes(2);

    monitor.stop();
  });

  it("stop() clears scheduled timers", async () => {
    const probe = vi.fn(async () => true);
    const monitor = createHealthMonitor({
      probe,
      restart: vi.fn(async () => {}),
      intervalMs: 1000,
    });
    monitor.start();
    monitor.stop();

    await vi.advanceTimersByTimeAsync(2000);
    expect(probe).not.toHaveBeenCalled();
  });

  it("getStats reports restart count", async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"));
    const restart = vi.fn(async () => {});
    const monitor = createHealthMonitor({
      probe,
      restart,
      intervalMs: 1000,
      backoffMs: [10],
      maxRestarts: 5,
    });
    monitor.start();

    expect(monitor.getStats().restartCount).toBe(0);

    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(50);
    expect(monitor.getStats().restartCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(50);
    expect(monitor.getStats().restartCount).toBe(2);

    monitor.stop();
  });
});

// P1.10 — Stale-worker auto-reboot via composite probe.
//
// Extends P1.6's single-leg `describeNamespace` probe with a second leg
// that hits `describeWorkflowExecution` against a sentinel workflow ID.
// A `NotFound` rejection from the sentinel describe is healthy proof
// that the worker side of the connection is responsive. A hang on the
// describe — which a zombie/wedged worker produces — gets caught by
// the monitor's outer probeTimeoutMs and routed through the existing
// restart budget.
describe("composeWorkerHealthProbe (P1.10 zombie detection)", () => {
  function makeBundle(svc: unknown) {
    return {
      namespace: "default",
      connection: { workflowService: svc },
    };
  }

  it("returns false when bundle is null (STSL not initialized)", async () => {
    const probe = composeWorkerHealthProbe({ getBundle: () => null });
    expect(await probe()).toBe(false);
  });

  it("returns false when workflowService methods are missing", async () => {
    const probe = composeWorkerHealthProbe({
      getBundle: () => makeBundle({ describeNamespace: undefined }),
    });
    expect(await probe()).toBe(false);
  });

  it("returns true when both legs succeed (sentinel WorkflowNotFound is healthy)", async () => {
    const describeNamespace = vi.fn(async () => ({}));
    const describeWorkflowExecution = vi.fn(async () => {
      const err = new Error(
        "WorkflowExecutionNotFound: sentinel does not exist",
      );
      throw err;
    });
    const probe = composeWorkerHealthProbe({
      getBundle: () =>
        makeBundle({ describeNamespace, describeWorkflowExecution }),
    });
    expect(await probe()).toBe(true);
    expect(describeNamespace).toHaveBeenCalledTimes(1);
    expect(describeWorkflowExecution).toHaveBeenCalledTimes(1);
  });

  it("returns true when sentinel actually exists (still healthy)", async () => {
    const probe = composeWorkerHealthProbe({
      getBundle: () =>
        makeBundle({
          describeNamespace: vi.fn(async () => ({})),
          describeWorkflowExecution: vi.fn(async () => ({
            workflowExecutionInfo: { execution: { workflowId: "sentinel" } },
          })),
        }),
    });
    expect(await probe()).toBe(true);
  });

  it("propagates non-NotFound errors from sentinel describe (caught by monitor)", async () => {
    const probe = composeWorkerHealthProbe({
      getBundle: () =>
        makeBundle({
          describeNamespace: vi.fn(async () => ({})),
          describeWorkflowExecution: vi.fn(async () => {
            throw new Error("Unavailable: server overloaded");
          }),
        }),
    });
    await expect(probe()).rejects.toThrow(/Unavailable/);
  });

  it("propagates describeNamespace failures (leg 1 short-circuits)", async () => {
    const describeWorkflowExecution = vi.fn(async () => ({}));
    const probe = composeWorkerHealthProbe({
      getBundle: () =>
        makeBundle({
          describeNamespace: vi.fn(async () => {
            throw new Error("ECONNREFUSED");
          }),
          describeWorkflowExecution,
        }),
    });
    await expect(probe()).rejects.toThrow(/ECONNREFUSED/);
    expect(describeWorkflowExecution).not.toHaveBeenCalled();
  });

  it("uses default sentinel workflow ID 'adv-healthcheck-sentinel'", async () => {
    const describeWorkflowExecution = vi.fn(async () => {
      throw new Error("NotFound");
    });
    const probe = composeWorkerHealthProbe({
      getBundle: () =>
        makeBundle({
          describeNamespace: vi.fn(async () => ({})),
          describeWorkflowExecution,
        }),
    });
    await probe();
    expect(describeWorkflowExecution).toHaveBeenCalledWith({
      namespace: "default",
      execution: { workflowId: "adv-healthcheck-sentinel" },
    });
  });

  it("respects custom sentinelWorkflowId override", async () => {
    const describeWorkflowExecution = vi.fn(async () => {
      throw new Error("NotFound");
    });
    const probe = composeWorkerHealthProbe({
      getBundle: () =>
        makeBundle({
          describeNamespace: vi.fn(async () => ({})),
          describeWorkflowExecution,
        }),
      sentinelWorkflowId: "custom-sentinel-id",
    });
    await probe();
    expect(describeWorkflowExecution).toHaveBeenCalledWith({
      namespace: "default",
      execution: { workflowId: "custom-sentinel-id" },
    });
  });

  it("hanging sentinel describe is caught by the monitor's probeTimeoutMs (zombie scenario)", async () => {
    vi.useFakeTimers();
    try {
      const probe = composeWorkerHealthProbe({
        getBundle: () =>
          makeBundle({
            describeNamespace: vi.fn(async () => ({})),
            describeWorkflowExecution: vi.fn(
              () => new Promise<unknown>(() => {}), // hangs forever
            ),
          }),
      });
      const restart = vi.fn(async () => {});
      const monitor = createHealthMonitor({
        probe,
        restart,
        intervalMs: 1000,
        probeTimeoutMs: 200,
        backoffMs: [10],
      });
      monitor.start();

      await vi.advanceTimersByTimeAsync(1100); // first probe interval
      await vi.advanceTimersByTimeAsync(250); // probe timeout fires
      await vi.advanceTimersByTimeAsync(50); // backoff completes

      expect(restart).toHaveBeenCalledTimes(1);
      monitor.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
