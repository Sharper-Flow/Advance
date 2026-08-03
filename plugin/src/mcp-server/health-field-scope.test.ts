import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTemporalHealth,
  resetTemporalHealthProbeState,
} from "../temporal/health-probe";
import { executeTier4Tool, TOOL_CLASSIFICATIONS } from "./tools/index";
import { tagHostProbeFields } from "./degradation";

const mockCanReachTemporalAddress = vi.hoisted(() => vi.fn());
const mockGetTemporalWorkerAliveness = vi.hoisted(() => vi.fn());
const mockHasResolvedWorkerRole = vi.hoisted(() => vi.fn());
const mockGetRegisteredTemporalWorkerQueues = vi.hoisted(() => vi.fn());
const mockGetTemporalAddress = vi.hoisted(() => vi.fn());
const mockProbeTaskQueuePollers = vi.hoisted(() => vi.fn());
const mockGetService = vi.hoisted(() => vi.fn());
const mockGetTemporalRetryTelemetry = vi.hoisted(() => vi.fn());
const mockGetTemporalOpTelemetry = vi.hoisted(() => vi.fn());
const mockGetLastWorkerRunError = vi.hoisted(() => vi.fn());

vi.mock("../temporal/runtime-manager", () => ({
  canReachTemporalAddress: (...args: unknown[]) =>
    mockCanReachTemporalAddress(...args),
}));

vi.mock("../plugin-init", () => ({
  getTemporalWorkerAliveness: () => mockGetTemporalWorkerAliveness(),
  hasResolvedWorkerRole: () => mockHasResolvedWorkerRole(),
  getRegisteredTemporalWorkerQueues: () =>
    mockGetRegisteredTemporalWorkerQueues(),
}));

vi.mock("../temporal/client", () => ({
  getTemporalAddress: (...args: unknown[]) => mockGetTemporalAddress(...args),
}));

vi.mock("../temporal/queue-serviceability", () => ({
  probeTaskQueuePollers: (...args: unknown[]) =>
    mockProbeTaskQueuePollers(...args),
}));

vi.mock("../temporal/service", () => ({
  getService: () => mockGetService(),
}));

vi.mock("../temporal/retry-wrapper", () => ({
  getTemporalRetryTelemetry: () => mockGetTemporalRetryTelemetry(),
  getTemporalOpTelemetry: () => mockGetTemporalOpTelemetry(),
  getLastWorkerRunError: () => mockGetLastWorkerRunError(),
}));

describe("MCP health worker-field contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTemporalHealthProbeState();
    mockCanReachTemporalAddress.mockResolvedValue(true);
    mockGetTemporalAddress.mockReturnValue("127.0.0.1:7233");
    mockGetTemporalWorkerAliveness.mockReturnValue(false);
    mockHasResolvedWorkerRole.mockReturnValue(false);
    mockGetRegisteredTemporalWorkerQueues.mockReturnValue([]);
    mockGetService.mockReturnValue(null);
    mockGetTemporalRetryTelemetry.mockReturnValue({
      lastOpAt: null,
      lastError: null,
    });
    mockGetTemporalOpTelemetry.mockReturnValue([]);
    mockGetLastWorkerRunError.mockReturnValue(null);
  });

  it("serializes role-unresolved health without boolean worker liveness", async () => {
    const result = await executeTier4Tool(
      process.cwd(),
      "status",
      {},
      {
        temporalReachable: () => Promise.resolve(true),
        createToolMap: () => ({
          adv_status: {
            execute: async () =>
              JSON.stringify({
                temporal_health: await getTemporalHealth(),
              }),
          },
        }),
      },
    );

    const serializedPayload = JSON.parse(JSON.stringify(JSON.parse(result)));
    const health = serializedPayload.temporal_health;

    expect(typeof health.worker_alive).not.toBe("boolean");
    expect(typeof health.worker_process_alive).not.toBe("boolean");
    expect(health.worker_alive).toEqual({
      status: "unavailable",
      reason: "not_host_capable",
    });
    expect(health.worker_process_alive).toEqual({
      status: "unavailable",
      reason: "not_host_capable",
    });
  });

  it("adds degradation metadata around temporal_health without rewriting nested unions", () => {
    const payload = tagHostProbeFields({
      temporal_health: {
        worker_alive: { status: "unavailable", reason: "not_host_capable" },
        worker_process_alive: {
          status: "unavailable",
          reason: "not_host_capable",
        },
      },
    });

    expect(payload.temporal_health).toEqual({
      worker_alive: { status: "unavailable", reason: "not_host_capable" },
      worker_process_alive: {
        status: "unavailable",
        reason: "not_host_capable",
      },
      degraded: true,
      source: "host_probe_unavailable_in_mcp",
    });
  });

  it("keeps the status classification on the MCP diagnostics path", () => {
    expect(TOOL_CLASSIFICATIONS.status).toContain("needs-temporal-diagnostics");
  });
});
