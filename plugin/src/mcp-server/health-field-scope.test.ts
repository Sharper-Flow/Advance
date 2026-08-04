import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTemporalHealthProbeState } from "../temporal/health-probe";
import { createTier4ToolMap } from "./tier4-tool-map";
import { executeTier4Tool, TOOL_CLASSIFICATIONS } from "./tools/index";
import { tagHostProbeFields } from "./degradation";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
} from "../__tests__/setup";

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

vi.mock("../plugin-init", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plugin-init")>()),
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

// Partial mock: the status read path consumes a growing surface of this module
// (deadline construction, retry classification, gRPC status extraction). Listing
// exports individually made this mock silently rot — a newly-imported export
// threw "No <name> export is defined on the mock" at call time, which surfaced
// as an error envelope instead of a status payload. Spread the real module and
// override only the telemetry accessors this test actually stubs.
vi.mock("../temporal/retry-wrapper", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../temporal/retry-wrapper")>()),
  getTemporalRetryTelemetry: () => mockGetTemporalRetryTelemetry(),
  getTemporalOpTelemetry: () => mockGetTemporalOpTelemetry(),
  getLastWorkerRunError: () => mockGetLastWorkerRunError(),
}));

describe("MCP health worker-field contract", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("adv-mcp-health-");
    await createTestProject(tempDir, {
      withSpecs: false,
      withChanges: false,
      withConfig: true,
    });
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

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("serializes role-unresolved health without boolean worker liveness", async () => {
    const result = await executeTier4Tool(
      tempDir,
      "status",
      { view: "health" },
      {
        temporalReachable: () => Promise.resolve(true),
        createToolMap: createTier4ToolMap,
      },
    );

    const serializedPayload = JSON.parse(JSON.stringify(JSON.parse(result)));
    const health = serializedPayload.temporal_health;

    expect(serializedPayload).toHaveProperty("temporal_health");
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
  }, 20_000);

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
