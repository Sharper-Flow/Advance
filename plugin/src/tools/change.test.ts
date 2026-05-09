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
import type { Change, Spec } from "../types";

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
    querySignal: vi.fn(),
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
  querySignal: mocks.querySignal,
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
  changeOverrides: Partial<Change> = {},
  specs: Spec[] = [],
): Store {
  const change: Change = {
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
    } as Change["gates"],
    ...changeOverrides,
  };

  return {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
      archive: "/tmp/test/.adv/archive",
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {
      list: vi.fn(async () => ({
        specs: specs.map((spec) => ({ name: spec.name, title: spec.title })),
      })),
      get: vi.fn(async (name: string) => {
        const spec = specs.find((candidate) => candidate.name === name);
        return spec
          ? { success: true, data: spec }
          : { success: false, error: `Spec not found: ${name}` };
      }),
    } as unknown as Store["specs"],
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

const existingSpec: Spec = {
  name: "existing-capability",
  title: "Existing Capability",
  purpose: "Test fixture spec",
  version: "1.0.0",
  updated_at: "2026-01-01T00:00:00Z",
  requirements: [
    {
      id: "rq-existing1",
      title: "Existing requirement",
      body: "Existing requirement body",
      priority: "must",
      scenarios: [
        {
          id: "rq-existing1.1",
          title: "Existing scenario",
          given: ["Existing state"],
          when: "Validated",
          then: ["It passes"],
        },
      ],
    },
  ],
};

const allDoneGates: NonNullable<Change["gates"]> = {
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "done" },
  execution: { status: "done" },
  acceptance: { status: "done" },
  release: { status: "done" },
};

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

  describe("adv_change_validate", () => {
    beforeEach(() => {
      vi.mocked(mocks.removeChangeDir).mockReset();
      vi.mocked(mocks.removeChangeDir).mockResolvedValue(undefined);
    });

    test("strict mode passes when validation has warnings only", async () => {
      const store = createMockStore({
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(true);
      expect(parsed.errors).toEqual([]);
      expect(parsed.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "NO_DELTAS", severity: "warning" }),
        ]),
      );
    });

    test("strictWarnings opt-in fails warnings-only validation", async () => {
      const store = createMockStore({
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true, strictWarnings: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(false);
      expect(parsed.errors).toEqual([]);
      expect(parsed.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "NO_DELTAS", severity: "warning" }),
        ]),
      );
    });

    test("strict mode fails when validation has errors", async () => {
      const store = createMockStore(
        {
          tasks: [
            { id: "tk-1", title: "Task", status: "done" },
          ] as Change["tasks"],
          deltas: {
            "existing-capability": [
              {
                id: "dl-duplicate1",
                operation: "add",
                requirement: {
                  id: "rq-existing1",
                  title: "Duplicate requirement",
                  body: "Duplicate requirement body",
                  priority: "must",
                  scenarios: [
                    {
                      id: "rq-existing1.1",
                      title: "Duplicate scenario",
                      given: ["Duplicate state"],
                      when: "Validated",
                      then: ["It fails"],
                    },
                  ],
                },
              },
            ],
          },
        },
        [existingSpec],
      );

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(false);
      expect(parsed.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "DUPLICATE_REQUIREMENT_ID",
            severity: "error",
          }),
        ]),
      );
    });

    test("non-strict mode preserves clean validation result", async () => {
      const store = createMockStore({
        title: "Implement new requirement",
        tasks: [
          {
            id: "tk-1",
            title: "Implement new requirement intent scope",
            status: "done",
            verification: "Red and green tests passed.",
          },
        ] as Change["tasks"],
        deltas: {
          "new-capability": [
            {
              id: "dl-add1",
              operation: "add",
              requirement: {
                id: "rq-new1",
                title: "New requirement",
                body: "New requirement body",
                priority: "must",
                scenarios: [
                  {
                    id: "rq-new1.1",
                    title: "New scenario",
                    given: ["New state"],
                    when: "Validated",
                    then: ["It passes"],
                  },
                ],
              },
            },
          ],
        },
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(true);
      expect(parsed.errors).toEqual([]);
      expect(parsed.warnings).toEqual([]);
    });
  });

  describe("adv_change_archive", () => {
    test("uses live gate status for archive preflight when cached gates are stale", async () => {
      const staleStoreGates: NonNullable<Change["gates"]> = {
        ...allDoneGates,
        acceptance: { status: "pending" },
        release: { status: "pending" },
      };
      const store = createMockStore({ gates: staleStoreGates });
      mocks.querySignal.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(mocks.querySignal).toHaveBeenCalledTimes(1);
      expect(parsed.error ?? "").not.toContain("incomplete gates");
      expect(parsed.incompleteGates).toBeUndefined();
    });

    test("blocks archive when live gate status is incomplete", async () => {
      const liveIncompleteGates: NonNullable<Change["gates"]> = {
        ...allDoneGates,
        release: { status: "pending" },
      };
      const store = createMockStore({ gates: allDoneGates });
      mocks.querySignal.mockResolvedValueOnce(liveIncompleteGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("incomplete gates");
      expect(parsed.incompleteGates).toEqual(["release"]);
      expect(parsed.gateStateSource).toBe("live");
      expect(parsed.storeIncompleteGates).toEqual([]);
      expect(parsed.liveIncompleteGates).toEqual(["release"]);
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
