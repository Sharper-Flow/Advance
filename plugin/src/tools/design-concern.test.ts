import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Change } from "../types";
import type { Store } from "../storage/store-types";

const mocks = vi.hoisted(() => {
  const fireSignalAndRefresh = vi.fn(async () => undefined);
  const workflowHandle = { signal: vi.fn(), query: vi.fn() };
  return { fireSignalAndRefresh, workflowHandle };
});

vi.mock("./_adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_adapters")>()),
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  getChangeHandle: () => mocks.workflowHandle,
}));

vi.mock("../temporal/service", () => ({
  getService: () => ({ client: { workflow: { getHandle: vi.fn() } } }),
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: async () => "project-1",
}));

import { designConcernTools } from "./design-concern";

function parse(output: string): Record<string, any> {
  return JSON.parse(output) as Record<string, any>;
}

function change(overrides: Partial<Change> = {}): Change {
  return {
    id: "change-1",
    title: "Change one",
    status: "active",
    created_at: "2026-05-23T00:00:00.000Z",
    tasks: [
      {
        id: "tk-1",
        title: "Task one",
        status: "in_progress",
        priority: 1,
        created_at: "2026-05-23T00:00:00.000Z",
      },
    ],
    deltas: {},
    wisdom: [],
    gates: {} as Change["gates"],
    ...overrides,
  } as Change;
}

function storeFor(baseChange: Change): Store {
  return {
    paths: { root: "/repo", agenda: "/state/agenda.jsonl" } as Store["paths"],
    config: null,
    changes: {
      get: vi.fn(async () => ({ success: true, data: baseChange })),
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

const validArgs = {
  changeId: "change-1",
  taskId: "tk-1",
  concernKey: "dimension:site_design_consistency",
  disposition: "rejected_with_evidence" as const,
  evidence: "Legacy page, out of scope; fast-follow #123.",
};

describe("adv_design_concern_disposition", () => {
  beforeEach(() => {
    mocks.fireSignalAndRefresh.mockClear();
  });

  test("fires designConcernDispositionedSignal with the typed disposition", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        validArgs,
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    const signalArgs = mocks.fireSignalAndRefresh.mock.calls[0];
    // (handle, store, changeId, signal, payload)
    expect(signalArgs[2]).toBe("change-1");
    expect(signalArgs[4]).toMatchObject({
      taskId: "tk-1",
      concernKey: "dimension:site_design_consistency",
      disposition: "rejected_with_evidence",
      evidence: "Legacy page, out of scope; fast-follow #123.",
    });
    expect(typeof signalArgs[4].dispositionedAt).toBe("string");
  });

  test("rejects blank evidence", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        { ...validArgs, evidence: "   " },
        store,
      ),
    );

    expect(output.error).toBeTruthy();
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects an unknown disposition verb (no accepted_debt)", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        { ...validArgs, disposition: "accepted_debt" as never },
        store,
      ),
    );

    expect(output.error).toBeTruthy();
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects an unknown taskId", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        { ...validArgs, taskId: "tk-missing" },
        store,
      ),
    );

    expect(output.error).toBeTruthy();
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("dryRun previews without firing the signal", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        { ...validArgs, dryRun: true },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.dryRun).toBe(true);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });
});
