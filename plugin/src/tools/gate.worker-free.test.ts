/**
 * adv_gate_status worker-free durable projection tests (AC1, AC2).
 *
 * Verifies that gate status reads from the persisted change projection and
 * never issues workflow queries, while surfacing workflow-only fields as
 * explicitly unavailable rather than deriving them from absence.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { gateTools } from "./gate";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => {
  const queryMock = vi.fn();
  const handleMock = { query: queryMock };
  const temporalBundle = {
    client: { workflow: { getHandle: vi.fn(() => handleMock) } },
  };
  return {
    queryMock,
    handleMock,
    temporalBundle,
    getService: vi.fn(() => temporalBundle),
    getProjectId: vi.fn(async () => "test-project-id"),
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handleMock),
  };
});

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return { ...actual, getProjectId: mocks.getProjectId };
});

vi.mock("./_adapters", () => ({
  fireSignal: vi.fn(async () => {}),
  fireSignalAndRefresh: vi.fn(async () => {}),
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
  waitForGateCompletion: vi.fn(),
}));

function createMockStore(
  overrides: {
    change?: Partial<import("../types").Change>;
    gates?: import("../types").Gates;
  } = {},
): Store {
  const defaultGates = {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "in_progress" },
    execution: { status: "pending" },
    acceptance: { status: "pending" },
    release: { status: "pending" },
  } as import("../types").Gates;

  const change: import("../types").Change = {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: overrides.gates ?? defaultGates,
    projection_revision: 7,
    ...overrides.change,
  };

  return {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      get: vi.fn(async () => ({ success: true, data: change })),
      list: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(),
      invalidate: vi.fn(),
    } as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => change.gates),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
  } as unknown as Store;
}

describe("adv_gate_status worker-free projection reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.querySignal.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AC1 — returns persisted gates without issuing a workflow query", async () => {
    const gates = {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "in_progress" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    } as import("../types").Gates;
    const store = createMockStore({ gates });

    const result = await gateTools.adv_gate_status.execute(
      { changeId: "test-change" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.gates).toEqual(gates);
    expect(parsed.nextGate).toBe("planning");
    expect(parsed.canArchive).toBe(false);
    expect(mocks.querySignal).not.toHaveBeenCalled();
    expect(mocks.getChangeHandle).not.toHaveBeenCalled();
  });

  test("AC1 — uses disk gates when workflow would have returned different state", async () => {
    const diskGates = {
      proposal: { status: "done" },
      discovery: { status: "pending" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    } as import("../types").Gates;
    const store = createMockStore({ gates: diskGates });

    // Even if a workflow query would return different gates, the tool must
    // never invoke it, so this mock should be ignored.
    mocks.querySignal.mockResolvedValue({
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    });

    const result = await gateTools.adv_gate_status.execute(
      { changeId: "test-change" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.gates.discovery.status).toBe("pending");
    expect(parsed.nextGate).toBe("discovery");
    expect(mocks.querySignal).not.toHaveBeenCalled();
  });

  test("AC2 — workflow-only criteria are unavailable, not derived", async () => {
    const gates = {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    } as import("../types").Gates;
    const store = createMockStore({ gates });

    const result = await gateTools.adv_gate_status.execute(
      { changeId: "test-change" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.gateCriteria).toBeUndefined();
    expect(parsed.acceptanceCriteriaProjection).toBeUndefined();
    expect(parsed._unavailable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "gateCriteria",
          status: "unavailable",
          reason: expect.stringContaining("workflow-only"),
        }),
        expect.objectContaining({
          scope: "acceptanceCriteriaProjection",
          status: "unavailable",
          reason: expect.stringContaining("workflow-only"),
        }),
      ]),
    );
    // Absence must never be treated as a passing projection.
    expect(parsed._unavailable).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "fresh" })]),
    );
  });
});
