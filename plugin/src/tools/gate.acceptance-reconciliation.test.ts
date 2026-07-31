/**
 * Acceptance gate reconciliation integration tests.
 *
 * Verifies that adv_gate_complete reconciles recovered design-concern and
 * verification-evidence dispositions into the reachable workflow before firing
 * gateCompletedSignal, and surfaces a single actionable block when
 * reconciliation fails.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import type { Store } from "../storage/store";
import { gateTools } from "./gate";
import { createTempDir } from "../__tests__/setup";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../temporal/contracts";
import { loadChange } from "../storage/json";
import type { Change } from "../types";

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
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

vi.mock("./_adapters", () => ({
  fireSignalAndRefresh: vi.fn(async () => {}),
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
  waitForGateCompletion: vi.fn(async () => ({ status: "done" })),
  fireSignal: vi.fn(async () => {}),
}));

vi.mock("./target-project", () => ({
  formatTargetProjectContext: vi.fn((ctx) => ctx),
  resolveTargetAwareMutationCwd: vi.fn(({ store }) => store.paths.root),
  withOptionalTargetPathStore: vi.fn(async (_input, fn) =>
    fn(_input.store, undefined),
  ),
  withTargetPathStore: vi.fn(),
}));

vi.mock("./worktree-auto-manage", () => ({
  ensureWorktreeForMutation: vi.fn(async () => ({ decision: "ALLOW" })),
  buildWorktreeAutoManageDeps: vi.fn(async () => ({
    resumeRuntime: {
      projectRoot: "/tmp/test",
      database: {},
      log: {},
      store: {},
    },
  })),
}));

vi.mock("../utils/workflow-directive", async () => {
  const actual = await vi.importActual<
    typeof import("../utils/workflow-directive")
  >("../utils/workflow-directive");
  return {
    ...actual,
    deriveDirectiveSafe: vi.fn(() => undefined),
  };
});

const HEALTHY_GATES = {
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "done" },
  execution: { status: "done" },
  acceptance: { status: "done" },
  release: { status: "pending" },
} as import("../types").Gates;

function baseChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: HEALTHY_GATES,
    ...overrides,
  } as Change;
}

function createStore(changesDir: string, change: Change): Store {
  return {
    paths: {
      root: "/tmp/test",
      changes: changesDir,
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      list: vi.fn(),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    } as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => change.gates),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    } as unknown as Store["gates"],
    artifacts: {} as Store["artifacts"],
  } as Store;
}

async function seedProjection(
  changesDir: string,
  change: Change,
): Promise<void> {
  const changeDir = `${changesDir}/${change.id}`;
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    `${changeDir}/change.json`,
    JSON.stringify(change, null, 2),
    "utf-8",
  );
}

function recoveryAudit() {
  return {
    reason: "poisoned_history",
    evidence: "workflow completed before signal landed",
    recovered_at: "2026-01-01T00:00:00Z",
  };
}

function disposition(family: "design" | "verification") {
  const base = {
    taskId: family === "design" ? "tk-design" : "tk-verify",
    concernKey:
      family === "design" ? "component_correctness" : "verification_mismatch",
    disposition: "fixed" as const,
    evidence: "Fixed.",
    dispositionedAt: "2026-01-01T00:00:00Z",
  };
  return base;
}

function workflowState(families: { design?: boolean; verification?: boolean }) {
  return {
    design_concern_dispositions: families.design ? [disposition("design")] : [],
    verification_evidence_dispositions: families.verification
      ? [disposition("verification")]
      : [],
  };
}

describe("adv_gate_complete acceptance reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signalMock.mockReset();
    mocks.signalMock.mockResolvedValue(undefined);
    mocks.queryMock.mockReset();
    mocks.queryMock.mockImplementation(
      (queryName: string, receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(receiptId ? { id: receiptId } : undefined);
        }
        return Promise.resolve({});
      },
    );
    mocks.querySignal.mockReset();
    mocks.querySignal.mockImplementation((...args: unknown[]) => {
      const queryName = args[1];
      const name =
        typeof queryName === "object" &&
        queryName !== null &&
        "name" in queryName
          ? (queryName as { name: string }).name
          : String(queryName);
      if (name === CHANGE_WORKFLOW_QUERY_NAMES.getGateStatus) {
        return Promise.resolve(HEALTHY_GATES);
      }
      if (name === CHANGE_WORKFLOW_QUERY_NAMES.changeTasks) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    delete process.env.ADV_PLAN_ROUTING_FAIL_CLOSED;
  });

  test("re-delivers recovered design-concern and verification-evidence dispositions before firing gateCompletedSignal", async () => {
    const changesDir = await createTempDir("adv-gate-reconciliation-");
    const change = baseChange({
      design_concern_dispositions: [
        { ...disposition("design"), recovery_audit: recoveryAudit() },
      ],
      verification_evidence_dispositions: [
        { ...disposition("verification"), recovery_audit: recoveryAudit() },
      ],
    });
    await seedProjection(changesDir, change);
    mocks.queryMock.mockImplementation(
      (queryName: string, receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(receiptId ? { id: receiptId } : undefined);
        }
        return Promise.resolve(
          workflowState({ design: true, verification: true }),
        );
      },
    );

    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "test-change",
        gateId: "acceptance",
        completedBy: "agent",
      },
      createStore(changesDir, change),
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("acceptance");
    // Reconciliation signals fired before gateCompletedSignal.
    expect(mocks.signalMock).toHaveBeenCalledTimes(2);
    // Gate completion signal still fired via the mocked fireSignalAndRefresh.
    expect(vi.mocked(mocks.querySignal)).toHaveBeenCalled();

    const disk = await loadChange(changesDir, "test-change");
    expect(disk.success).toBe(true);
    expect(
      disk.data?.design_concern_dispositions?.[0].recovery_audit,
    ).toBeUndefined();
    expect(
      disk.data?.verification_evidence_dispositions?.[0].recovery_audit,
    ).toBeUndefined();
  });

  test("returns a single actionable block when reconciliation cannot confirm a disposition", async () => {
    const changesDir = await createTempDir("adv-gate-reconciliation-");
    const change = baseChange({
      design_concern_dispositions: [
        { ...disposition("design"), recovery_audit: recoveryAudit() },
      ],
    });
    await seedProjection(changesDir, change);
    // Receipt never confirmed, so redelivery fails.
    mocks.queryMock.mockImplementation(
      (queryName: string, _receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(undefined);
        }
        return Promise.resolve(workflowState({ design: true }));
      },
    );

    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "test-change",
        gateId: "acceptance",
        completedBy: "agent",
      },
      createStore(changesDir, change),
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBeUndefined();
    expect(parsed.error).toBeTruthy();
    expect(parsed.code).toBe("ACCEPTANCE_RECONCILIATION_SIGNAL_FAILED");
    expect(parsed.failedItems).toHaveLength(1);
    expect(parsed.gateId).toBe("acceptance");
    // gateCompletedSignal must not fire when reconciliation is blocked.
    expect(vi.mocked(mocks.querySignal)).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "gateCompleted" }),
    );
  });

  test("skips reconciliation and completes acceptance when no recovery markers exist", async () => {
    const changesDir = await createTempDir("adv-gate-reconciliation-");
    const change = baseChange({
      design_concern_dispositions: [disposition("design")],
    });
    await seedProjection(changesDir, change);

    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "test-change",
        gateId: "acceptance",
        completedBy: "agent",
      },
      createStore(changesDir, change),
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("acceptance");
    expect(mocks.signalMock).not.toHaveBeenCalled();
  });
});
