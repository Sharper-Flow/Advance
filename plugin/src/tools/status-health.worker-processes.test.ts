/**
 * Health-level tests for the AC5 worker-processes advisory section.
 *
 * Asserts that:
 *   1. `fetchStatusWorkerProcesses` (status-health probe) returns the
 *      stubbed enumeration snapshot — workerCount + orphanCount + per-process
 *      list — wrapped in probe freshness metadata, and degrades to `null`
 *      when enumeration is unavailable.
 *   2. The `health` view projection surfaces `worker_processes` while the
 *      `summary` view omits it.
 *
 * Enumeration is vi.mock'ed so tests are deterministic regardless of real
 * host process state.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockEnumerate = vi.fn();

vi.mock("../utils/worker-process-probe", () => ({
  enumerateAdvWorkerProcesses: (...args: unknown[]) => mockEnumerate(...args),
  DEFAULT_WORKER_SCRIPT_MARKER: "dist/temporal/worker.js",
}));

import { applyStatusView } from "./status-view";

describe("fetchStatusWorkerProcesses", () => {
  beforeEach(() => {
    vi.resetModules();
    mockEnumerate.mockReset();
  });

  test("returns workerCount + orphanCount + per-process list with freshness", async () => {
    mockEnumerate.mockResolvedValue({
      workerCount: 2,
      orphanCount: 1,
      processes: [
        { pid: 101, ppid: 50, orphan: false },
        { pid: 202, ppid: 901, orphan: true },
      ],
    });
    const { fetchStatusWorkerProcesses, _statusProbeCaches } =
      await import("./status-health");
    _statusProbeCaches.clear();

    const result = await fetchStatusWorkerProcesses();

    expect(result.value).toEqual({
      workerCount: 2,
      orphanCount: 1,
      processes: [
        { pid: 101, ppid: 50, orphan: false },
        { pid: 202, ppid: 901, orphan: true },
      ],
    });
    expect(result.freshness.ttl_ms).toBeGreaterThan(0);
    expect(typeof result.freshness.cached_at).toBe("string");
  });

  test("degrades to null when enumeration is unavailable (non-Linux)", async () => {
    mockEnumerate.mockResolvedValue(null);
    const { fetchStatusWorkerProcesses, _statusProbeCaches } =
      await import("./status-health");
    _statusProbeCaches.clear();

    const result = await fetchStatusWorkerProcesses();
    expect(result.value).toBeNull();
  });
});

describe("applyStatusView worker_processes projection", () => {
  const full = {
    formatted: { summary: "" },
    worker_processes: {
      workerCount: 1,
      orphanCount: 1,
      processes: [{ pid: 202, ppid: 901, orphan: true }],
    },
  };

  test("health view includes the worker-processes advisory section", () => {
    const projection = applyStatusView(full as never, "health");
    expect(projection.worker_processes).toEqual(full.worker_processes);
  });

  test("summary view omits the worker-processes section", () => {
    const projection = applyStatusView(full as never, "summary");
    expect("worker_processes" in projection).toBe(false);
  });
});
