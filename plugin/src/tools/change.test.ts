/**
 * Change Tools — Lifecycle Contract Tests (Signal-Driven)
 *
 * Tests for adv_change_close, adv_change_bulk_close, and adv_change_reenter
 * using signal/query surface instead of workflow updates.
 * Verifies tool-layer enforcement for cancellation/archive approval.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { changeTools } from "./change";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => {
  const signalMock = vi.fn();
  const queryMock = vi.fn();
  const handleMock = { signal: signalMock, query: queryMock };
  const getHandleMock = vi.fn(() => handleMock);
  const temporalBundle = {
    client: { workflow: { getHandle: getHandleMock } },
  };

  return {
    signalMock,
    queryMock,
    handleMock,
    getHandleMock,
    temporalBundle,
    getService: vi.fn(() => temporalBundle),
    getProjectId: vi.fn(async () => "test-project-id"),
    fireSignal: vi.fn(async () => {}),
    fireSignalAndRefresh: vi.fn(async () => {}),
    getChangeHandle: vi.fn(() => handleMock),
    removeChangeDir: vi.fn(async () => {}),
    sweepClosedChangesFromDisk: vi.fn(async () => ({
      removed: [] as string[],
      failed: [] as Array<{ id: string; error: string }>,
    })),
  };
});

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

vi.mock("./_adapters", () => ({
  fireSignal: mocks.fireSignal,
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  getChangeHandle: mocks.getChangeHandle,
}));

vi.mock("../storage/json", async () => {
  const actual =
    await vi.importActual<typeof import("../storage/json")>("../storage/json");
  return {
    ...actual,
    removeChangeDir: mocks.removeChangeDir,
  };
});

vi.mock("../storage/disk-sweep", () => ({
  sweepClosedChangesFromDisk: mocks.sweepClosedChangesFromDisk,
}));

function createMockStore(
  changeOverrides: Partial<import("../types").Change> = {},
): Store {
  const change: import("../types").Change = {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "done" },
      release: { status: "pending" },
    } as import("../types").Gates,
    ...changeOverrides,
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
      list: vi.fn(async () => ({
        changes: [
          { id: "test-change", title: "Test Change", status: "active" },
        ],
      })),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
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

describe("change tools — signal-driven lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("adv_change_close", () => {
    test("fires changeCancelledSignal with approval metadata", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "user confirmed cancellation",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle.client,
        "test-project-id",
        "test-change",
      );
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        approvalEvidence: "user confirmed cancellation",
        reason: "cancelled",
        cancelledBy: "agent",
      });
    });

    test("blocks close when approvalEvidence is empty", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("approvalEvidence is required");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("returns error when Temporal service is unavailable", async () => {
      mocks.getService.mockReturnValueOnce(null);
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "user confirmed",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Temporal service not available");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("returns error when change not found", async () => {
      const store = createMockStore();
      store.changes.get = vi.fn(async () => ({
        success: true,
        data: null,
      }));

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "missing-change",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "user confirmed",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("not found");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("requires supersededBy when reason is superseded", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "superseded",
          approvedByUser: true,
          approvalEvidence: "user confirmed",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("supersededBy is required");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });
  });

  describe("adv_change_bulk_close", () => {
    test("fires changeCancelledSignal for each selected change", async () => {
      const store = createMockStore();
      store.changes.list = vi.fn(async () => ({
        changes: [
          { id: "chg-1", title: "Change 1", status: "draft" },
          { id: "chg-2", title: "Change 2", status: "draft" },
        ],
      }));
      store.changes.get = vi.fn(async (id: string) => ({
        success: true,
        data: {
          id,
          title: `Change ${id}`,
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          created_by: "test",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
        } as import("../types").Change,
      }));

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "explicit",
            changeIds: ["chg-1", "chg-2"],
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user approved bulk close",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.closed).toBe(2);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle.client,
        "test-project-id",
        "chg-1",
      );
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle.client,
        "test-project-id",
        "chg-2",
      );
    });

    test("reports per-id failures without aborting siblings", async () => {
      const store = createMockStore();
      store.changes.list = vi.fn(async () => ({
        changes: [
          { id: "chg-1", title: "Change 1", status: "draft" },
          { id: "chg-2", title: "Change 2", status: "draft" },
        ],
      }));
      store.changes.get = vi.fn(async (id: string) => ({
        success: true,
        data: {
          id,
          title: `Change ${id}`,
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          created_by: "test",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
        } as import("../types").Change,
      }));
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("signal rejected"),
      );

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "explicit",
            changeIds: ["chg-1", "chg-2"],
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user approved bulk close",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.closed).toBe(1);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0].success).toBe(false);
      expect(parsed.results[1].success).toBe(true);
    });

    test("blocks filter-based bulk close for superseded reason", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "filter",
            status: "draft",
          },
          reason: "superseded",
          approvedByUser: true,
          approvalEvidence: "user approved",
          supersededBy: "chg-survivor",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("not supported");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });
  });

  describe("adv_change_reenter", () => {
    test("fires gateReenteredSignal for scope expansion", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "execution",
          reason: "Scope expanded",
          scopeDelta: "Add new module",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle.client,
        "test-project-id",
        "test-change",
      );
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        fromGateId: "execution",
        reason: "Scope expanded",
        scopeDelta: "Add new module",
        reenteredBy: "agent",
      });
    });

    test("blocks reenter on archived/closed changes", async () => {
      const store = createMockStore({ status: "archived" });

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "execution",
          reason: "Scope expanded",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Cannot reenter archived");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("returns error when Temporal service is unavailable", async () => {
      mocks.getService.mockReturnValueOnce(null);
      const store = createMockStore();

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "execution",
          reason: "Scope expanded",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Temporal service not available");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });
  });
});
