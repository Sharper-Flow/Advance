/**
 * Tool Adapter Tests
 *
 * TDD tests for _adapters.ts helpers against mocked Temporal client.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  fireSignal,
  querySignal,
  fireSignalAndQuery,
  getChangeHandle,
  startChangeWorkflow,
} from "./_adapters";

// Mock the workflow-start module so startChangeWorkflow is testable
vi.mock("../temporal/workflow-start", () => ({
  ensureChangeWorkflowStarted: vi.fn(),
}));

import { ensureChangeWorkflowStarted } from "../temporal/workflow-start";

function createMockHandle(): {
  query: ReturnType<typeof vi.fn>;
  signal: ReturnType<typeof vi.fn>;
  executeUpdate: ReturnType<typeof vi.fn>;
} {
  return {
    query: vi.fn(),
    signal: vi.fn(),
    executeUpdate: vi.fn(),
  };
}

function createMockClient(handle: ReturnType<typeof createMockHandle>): {
  workflow: {
    getHandle: ReturnType<typeof vi.fn>;
    start?: ReturnType<typeof vi.fn>;
  };
} {
  return {
    workflow: {
      getHandle: vi.fn(() => handle),
      start: vi.fn(),
    },
  };
}

function createMockStoreInput(handle: ReturnType<typeof createMockHandle>) {
  return {
    projectId: "proj-123",
    legacy: {
      changes: {
        get: vi.fn(async () => ({
          success: true,
          data: { adv_project_id: "proj-123" },
        })),
      },
    },
    temporal: {
      client: {
        workflow: {
          getHandle: vi.fn(() => handle),
        },
      },
    },
  };
}

describe("_adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fireSignal", () => {
    test("fires signal with payload", async () => {
      const handle = createMockHandle();
      const signalDef = { name: "testSignal" };
      const payload = { foo: "bar" };

      await fireSignal(handle, signalDef, payload);

      expect(handle.signal).toHaveBeenCalledTimes(1);
      expect(handle.signal).toHaveBeenCalledWith(signalDef, payload);
    });

    test("fires signal with multiple args", async () => {
      const handle = createMockHandle();
      const signalDef = { name: "multiArgSignal" };

      await fireSignal(handle, signalDef, "arg1", 42, { nested: true });

      expect(handle.signal).toHaveBeenCalledWith(signalDef, "arg1", 42, {
        nested: true,
      });
    });

    test("rejects when handle.signal throws", async () => {
      const handle = createMockHandle();
      handle.signal.mockRejectedValue(new Error("signal failed"));

      await expect(fireSignal(handle, { name: "bad" }, {})).rejects.toThrow(
        "signal failed",
      );
    });

    test("resolves a guarded workflow handle from store input", async () => {
      const handle = createMockHandle();
      const input = createMockStoreInput(handle);
      const signalDef = { name: "taskAdded" };
      const payload = { taskId: "tk-1" };

      await fireSignal(input, "chg-456", signalDef, payload);

      expect(input.legacy.changes.get).toHaveBeenCalledWith("chg-456");
      expect(input.temporal.client.workflow.getHandle).toHaveBeenCalledWith(
        "adv/change/proj-123/chg-456",
      );
      expect(handle.signal).toHaveBeenCalledWith(signalDef, payload);
    });
  });

  describe("querySignal", () => {
    test("returns query result", async () => {
      const handle = createMockHandle();
      const expected = { state: "active", tasks: [] };
      handle.query.mockResolvedValue(expected);

      const result = await querySignal(handle, { name: "getState" });

      expect(handle.query).toHaveBeenCalledTimes(1);
      expect(handle.query).toHaveBeenCalledWith({ name: "getState" });
      expect(result).toEqual(expected);
    });

    test("passes query args through", async () => {
      const handle = createMockHandle();
      handle.query.mockResolvedValue("result");

      await querySignal(handle, { name: "getTask" }, "task-123");

      expect(handle.query).toHaveBeenCalledWith(
        { name: "getTask" },
        "task-123",
      );
    });

    test("rejects when handle.query throws", async () => {
      const handle = createMockHandle();
      handle.query.mockRejectedValue(new Error("query failed"));

      await expect(querySignal(handle, { name: "bad" })).rejects.toThrow(
        "query failed",
      );
    });

    test("queries via a guarded workflow handle from store input", async () => {
      const handle = createMockHandle();
      const input = createMockStoreInput(handle);
      handle.query.mockResolvedValue({ tasks: [] });

      await expect(
        querySignal(input, "chg-456", { name: "getTasks" }, "done"),
      ).resolves.toEqual({ tasks: [] });

      expect(input.temporal.client.workflow.getHandle).toHaveBeenCalledWith(
        "adv/change/proj-123/chg-456",
      );
      expect(handle.query).toHaveBeenCalledWith({ name: "getTasks" }, "done");
    });
  });

  describe("fireSignalAndQuery", () => {
    test("fires signal then queries for fresh state", async () => {
      const handle = createMockHandle();
      const freshState = { status: "active", gates: {} };
      handle.query.mockResolvedValue(freshState);

      const result = await fireSignalAndQuery(
        handle,
        { name: "gateCompleted" },
        [{ gateId: "proposal" }],
        { name: "getState" },
      );

      // Signal must be called before query
      expect(handle.signal).toHaveBeenCalledTimes(1);
      expect(handle.signal).toHaveBeenCalledWith(
        { name: "gateCompleted" },
        { gateId: "proposal" },
      );
      expect(handle.query).toHaveBeenCalledTimes(1);
      expect(handle.query).toHaveBeenCalledWith({ name: "getState" });
      expect(result).toEqual(freshState);
    });

    test("passes query args after signal args", async () => {
      const handle = createMockHandle();
      handle.query.mockResolvedValue("task-result");

      await fireSignalAndQuery(
        handle,
        { name: "taskAdded" },
        [{ taskId: "tk-1" }],
        { name: "getTask" },
        "tk-1",
      );

      expect(handle.signal).toHaveBeenCalledWith(
        { name: "taskAdded" },
        { taskId: "tk-1" },
      );
      expect(handle.query).toHaveBeenCalledWith({ name: "getTask" }, "tk-1");
    });

    test("rejects if signal fails without querying", async () => {
      const handle = createMockHandle();
      handle.signal.mockRejectedValue(new Error("signal refused"));

      await expect(
        fireSignalAndQuery(handle, { name: "bad" }, [{}], { name: "getState" }),
      ).rejects.toThrow("signal refused");

      expect(handle.query).not.toHaveBeenCalled();
    });

    test("fires then queries through store input", async () => {
      const handle = createMockHandle();
      const input = createMockStoreInput(handle);
      handle.query.mockResolvedValue({ fresh: true });

      const result = await fireSignalAndQuery(
        input,
        "chg-456",
        { name: "taskCompleted" },
        [{ taskId: "tk-1" }],
        { name: "getState" },
      );

      expect(handle.signal).toHaveBeenCalledWith(
        { name: "taskCompleted" },
        { taskId: "tk-1" },
      );
      expect(handle.query).toHaveBeenCalledWith({ name: "getState" });
      expect(result).toEqual({ fresh: true });
    });
  });

  describe("getChangeHandle", () => {
    test("builds correct workflowId and returns handle", () => {
      const handle = createMockHandle();
      const client = createMockClient(handle);

      const result = getChangeHandle(client, "proj-123", "chg-456");

      expect(client.workflow.getHandle).toHaveBeenCalledTimes(1);
      expect(client.workflow.getHandle).toHaveBeenCalledWith(
        "adv/change/proj-123/chg-456",
      );
      expect(result).toBe(handle);
    });
  });

  describe("startChangeWorkflow", () => {
    test("delegates to ensureChangeWorkflowStarted", async () => {
      const handle = createMockHandle();
      const client = createMockClient(handle);
      vi.mocked(ensureChangeWorkflowStarted).mockResolvedValue(handle);

      const input = {
        projectId: "proj-abc",
        changeId: "chg-def",
        title: "Test Change",
        initializedAt: new Date().toISOString(),
      };

      const result = await startChangeWorkflow(client, input);

      expect(ensureChangeWorkflowStarted).toHaveBeenCalledTimes(1);
      expect(result).toBe(handle);
    });

    test("throws when client lacks workflow.start", async () => {
      const client = {
        workflow: {
          getHandle: vi.fn(),
          // start is intentionally missing
        },
      } as unknown as Parameters<typeof startChangeWorkflow>[0];

      await expect(
        startChangeWorkflow(client, {
          projectId: "p",
          changeId: "c",
          title: "t",
          initializedAt: "now",
        }),
      ).rejects.toThrow("does not expose workflow.start");
    });
  });
});
