/**
 * Tests for the worker-bundle release-provenance surface:
 *   - adv_worker_bundle_provenance_record (execution-time evidence receipt)
 *   - adv_change_set_worker_bundle_impact (planning applicability declaration)
 *
 * Both tools use the signal/query change workflow surface and refresh the
 * in-memory change cache after mutation.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { z } from "zod";
import { changeTools } from "./change";
import {
  workerBundleProvenanceRecordedSignal,
  workerBundleImpactSetSignal,
} from "../temporal/messages";
import type { Change, Store } from "../types";

const mocks = vi.hoisted(() => ({
  getService: vi.fn(() => temporalBundle),
  getProjectId: vi.fn(async () => "test-project-id"),
  fireSignalAndRefresh: vi.fn(async () => {}),
  getChangeHandle: vi.fn(() => handleMock),
  signalMock: vi.fn(),
  queryMock: vi.fn(),
}));

const handleMock = {
  signal: mocks.signalMock,
  query: mocks.queryMock,
};
const temporalBundle = {
  client: { workflow: { getHandle: vi.fn(() => handleMock) } },
};

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
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  getChangeHandle: mocks.getChangeHandle,
}));

function createMockStore(change: Change): Store {
  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/main/.adv/changes",
      archive: "/tmp/main/.adv/archive",
    } as Store["paths"],
    config: { name: "test", features: {} } as Store["config"],
    changes: {
      get: vi.fn(async (_changeId: string) => ({
        success: true,
        data: change,
      })),
      list: vi.fn(async () => ({ changes: [change] })),
      save: vi.fn(),
      refresh: vi.fn(),
    } as unknown as Store["changes"],
  } as unknown as Store;
}

function activeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "worker-bundle-change",
    title: "Worker bundle change",
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
      execution: { status: "in_progress" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    } as Change["gates"],
    ...overrides,
  } as Change;
}

const tools = changeTools as unknown as Record<
  string,
  {
    args: Record<string, unknown>;
    execute: (input: unknown, store: Store) => Promise<string>;
  }
>;

describe("adv_worker_bundle_provenance_record", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService.mockReturnValue(temporalBundle);
    mocks.fireSignalAndRefresh.mockImplementation(async () => {});
  });

  test("fires workerBundleProvenanceRecordedSignal with the typed payload and refreshes the cache", async () => {
    const change = activeChange();
    const store = createMockStore(change);

    const result = await tools.adv_worker_bundle_provenance_record.execute(
      {
        changeId: change.id,
        source_sha: "abc123def456",
        build_run_id: "tr_build_001",
        replay_run_id: "tr_replay_002",
        worker_manifest_generation: 7,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe(change.id);
    expect(parsed.source_sha).toBe("abc123def456");

    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    const call = mocks.fireSignalAndRefresh.mock.calls[0];
    expect(call[0]).toBe(handleMock);
    expect(call[1]).toBe(store);
    expect(call[2]).toBe(change.id);
    expect(call[3]).toBe(workerBundleProvenanceRecordedSignal);
    expect(call[4]).toMatchObject({
      source_sha: "abc123def456",
      build_run_id: "tr_build_001",
      replay_run_id: "tr_replay_002",
      worker_manifest_generation: 7,
    });
    expect(typeof call[4].recorded_at).toBe("string");
  });

  test("rejects an unknown change id", async () => {
    const store = createMockStore(activeChange());
    vi.mocked(store.changes.get).mockResolvedValue({
      success: false,
      error: "change not found",
    } as never);

    const result = await tools.adv_worker_bundle_provenance_record.execute(
      {
        changeId: "missing",
        source_sha: "abc",
        build_run_id: "build-1",
        replay_run_id: "replay-1",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/change missing|not found/i);
  });

  test("rejects missing required provenance fields", () => {
    const parsed = z
      .object(tools.adv_worker_bundle_provenance_record.args)
      .safeParse({
        changeId: "c",
        source_sha: "abc",
      });
    expect(parsed.success).toBe(false);
  });
});

describe("adv_change_set_worker_bundle_impact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService.mockReturnValue(temporalBundle);
    mocks.fireSignalAndRefresh.mockImplementation(async () => {});
  });

  test("saves worker_bundle_impact to the change and fires workerBundleImpactSetSignal", async () => {
    const change = activeChange();
    const store = createMockStore(change);

    const result = await tools.adv_change_set_worker_bundle_impact.execute(
      {
        changeId: change.id,
        kind: "required",
        rationale: "Touches workflow-reachable code",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe(change.id);
    expect(parsed.worker_bundle_impact.kind).toBe("required");

    expect(store.changes.save).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(store.changes.save).mock.calls[0][0] as Change;
    expect(saved.worker_bundle_impact).toMatchObject({
      kind: "required",
      rationale: "Touches workflow-reachable code",
    });
    expect(typeof saved.worker_bundle_impact?.confirmed_at).toBe("string");

    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    const call = mocks.fireSignalAndRefresh.mock.calls[0];
    expect(call[3]).toBe(workerBundleImpactSetSignal);
    expect(call[4]).toMatchObject({
      worker_bundle_impact: {
        kind: "required",
        rationale: "Touches workflow-reachable code",
      },
    });
    expect(typeof call[4].set_at).toBe("string");
  });

  test("allows not_applicable with rationale", async () => {
    const change = activeChange();
    const store = createMockStore(change);

    const result = await tools.adv_change_set_worker_bundle_impact.execute(
      {
        changeId: change.id,
        kind: "not_applicable",
        rationale: "Pure documentation change",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.worker_bundle_impact.kind).toBe("not_applicable");

    const saved = vi.mocked(store.changes.save).mock.calls[0][0] as Change;
    expect(saved.worker_bundle_impact?.kind).toBe("not_applicable");
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });

  test("rejects invalid kind", () => {
    const parsed = z
      .object(tools.adv_change_set_worker_bundle_impact.args)
      .safeParse({
        changeId: "c",
        kind: "maybe",
        rationale: "x",
      });
    expect(parsed.success).toBe(false);
  });

  test("rejects unknown change id", async () => {
    const store = createMockStore(activeChange());
    vi.mocked(store.changes.get).mockResolvedValue({
      success: false,
      error: "change missing",
    } as never);

    const result = await tools.adv_change_set_worker_bundle_impact.execute(
      {
        changeId: "missing",
        kind: "not_applicable",
        rationale: "docs",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/change missing|not found/i);
  });
});
