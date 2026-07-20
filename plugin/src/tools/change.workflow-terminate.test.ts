/**
 * adv_change_workflow_terminate — pinned wedged-workflow termination tool.
 *
 * Operator-only lever (fixWedgedWorkflowRecovery): terminates the EXACT
 * wedged run of a shipped change's workflow, pinned via describe() runId.
 * NOT a Temporal Reset — termination only, with the disk projection left
 * authoritative. Archive purge semantics (rq-archivePurge01) are untouched:
 * archived changes route to adv_archive_purge, which remains the sole lever
 * for archived-change workflow termination and bundle removal.
 *
 * Contract encoded here (RED phase — tool not yet implemented):
 *   - Approval-first: approvedByUser + non-blank approvalEvidence gate any
 *     read or mutation (mirrors adv_archive_purge C3 ordering).
 *   - Eligibility: non-archived status + shipped proof (acceptance AND
 *     release gates done on the disk projection).
 *   - describe() pins the exact run: runId + status name extracted
 *     structurally; termination targets getChangeHandle(..., runId).
 *   - Idempotent completed/not-found handling ONLY after eligibility: a
 *     not-found/completed describe or an already-terminal run status yields
 *     alreadyTerminated success; the same not-found with incomplete shipped
 *     proof is a refusal, never idempotent success.
 *   - Healthy guard: RUNNING run without poisoned-history describe evidence
 *     is refused (never terminate a healthy workflow).
 *   - Structured dry-run: full eligibility + pin assessment, no terminate,
 *     no projection refresh.
 *   - failure-before-projection-mutation: a non-not-found terminate failure
     returns a structured error and never refreshes the projection cache.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeTools } from "./change";
import { ADV_TOOL_NAMES } from "../tool-registry";
import type { Change } from "../types";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  getProjectId: vi.fn(),
  getChangeHandle: vi.fn(),
  describe: vi.fn(),
  terminate: vi.fn(),
}));

const TERMINATE_EVIDENCE =
  "Operator approved termination of wedged shipped change workflow (TMPRL1100 poisoned history)";

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

vi.mock("./_adapters", async () => {
  const actual =
    await vi.importActual<typeof import("./_adapters")>("./_adapters");
  return {
    ...actual,
    getChangeHandle: mocks.getChangeHandle,
  };
});

interface WorkflowTerminateToolDef {
  description: string;
  args: Record<string, unknown>;
  execute: (
    args: {
      changeId: string;
      approvedByUser: true;
      approvalEvidence: string;
      dryRun?: boolean;
    },
    store: Store,
  ) => Promise<string>;
}

/**
 * Type-tolerant accessor: keeps this RED-phase file typecheck-clean while the
 * tool does not exist yet; RED failures surface as test failures (undefined
 * tool), not compile errors.
 */
function tool(): WorkflowTerminateToolDef {
  return (changeTools as unknown as Record<string, WorkflowTerminateToolDef>)[
    "adv_change_workflow_terminate"
  ];
}

const DONE_GATE = { status: "done" } as const;

function shippedGates(): NonNullable<Change["gates"]> {
  return {
    proposal: { ...DONE_GATE },
    discovery: { ...DONE_GATE },
    design: { ...DONE_GATE },
    planning: { ...DONE_GATE },
    execution: { ...DONE_GATE },
    acceptance: { ...DONE_GATE },
    release: { ...DONE_GATE },
  } as NonNullable<Change["gates"]>;
}

function wedgedChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "wedgedChange",
    title: "Wedged shipped change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: shippedGates(),
    ...overrides,
  } as Change;
}

function createMockStore(change: Change | null): Store {
  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/main/.adv/changes",
      archive: "/tmp/main/.adv/archive",
    } as Store["paths"],
    config: { name: "test", features: {} } as Store["config"],
    changes: {
      get: vi.fn(async (changeId: string) => ({
        success: true,
        data: change && change.id === changeId ? change : null,
      })),
      refresh: vi.fn(async () => undefined),
    } as unknown as Store["changes"],
  } as unknown as Store;
}

/** describe() payload for a RUNNING run carrying poisoned-history evidence. */
function poisonedRunningDescription(runId = "run-123") {
  return {
    workflowId: "adv-change-test-project-id-wedgedChange",
    runId,
    status: { code: 1, name: "RUNNING" },
    raw: {
      pendingWorkflowTask: {
        lastFailure:
          "WorkflowTaskFailedCauseNonDeterministicError: TMPRL1100 No command scheduled for event",
      },
    },
  };
}

function notFoundError(): Error {
  const err = new Error("workflow not found");
  err.name = "WorkflowNotFoundError";
  return err;
}

describe("adv_change_workflow_terminate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.getService.mockReturnValue({ client: { workflow: {} } });
    mocks.getProjectId.mockResolvedValue("test-project-id");
    mocks.getChangeHandle.mockReturnValue({
      describe: mocks.describe,
      terminate: mocks.terminate,
      signal: vi.fn(),
      query: vi.fn(),
    });
    mocks.describe.mockResolvedValue(poisonedRunningDescription());
    mocks.terminate.mockResolvedValue(undefined);
  });

  test("is registered on the canonical tool list", () => {
    expect(ADV_TOOL_NAMES).toContain("adv_change_workflow_terminate");
  });

  test("rejects approvedByUser !== true before any read or mutation", async () => {
    const store = createMockStore(wedgedChange());

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: false as unknown as true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/approvedByUser/);
    expect(store.changes.get).not.toHaveBeenCalled();
    expect(mocks.describe).not.toHaveBeenCalled();
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("rejects blank approvalEvidence before any read or mutation", async () => {
    const store = createMockStore(wedgedChange());

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "   ",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/approvalEvidence/);
    expect(store.changes.get).not.toHaveBeenCalled();
    expect(mocks.describe).not.toHaveBeenCalled();
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("refuses unknown changeId with structured error and no mutations", async () => {
    const store = createMockStore(null);

    const result = await tool().execute(
      {
        changeId: "ghost",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not found/i);
    expect(mocks.describe).not.toHaveBeenCalled();
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("refuses archived change and routes to adv_archive_purge", async () => {
    const store = createMockStore(wedgedChange({ status: "archived" }));

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/archived/i);
    expect(parsed.hint).toMatch(/adv_archive_purge/);
    expect(mocks.describe).not.toHaveBeenCalled();
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("refuses change without shipped acceptance/release gate proof", async () => {
    const gates = shippedGates();
    (gates.release as { status: string }).status = "pending";
    const store = createMockStore(wedgedChange({ gates }));

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/shipped|gate/i);
    expect(parsed.incompleteGates).toContain("release");
    expect(mocks.describe).not.toHaveBeenCalled();
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("returns structured error when Temporal service is unavailable", async () => {
    const store = createMockStore(wedgedChange());
    mocks.getService.mockReturnValue(null);

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/Temporal/i);
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("treats not-found describe as idempotent alreadyTerminated after eligibility", async () => {
    const store = createMockStore(wedgedChange());
    mocks.describe.mockRejectedValue(notFoundError());

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.alreadyTerminated).toBe(true);
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).toHaveBeenCalledWith("wedgedChange");
  });

  test("idempotent not-found handling never precedes eligibility (gates not shipped → refusal)", async () => {
    const gates = shippedGates();
    (gates.acceptance as { status: string }).status = "pending";
    const store = createMockStore(wedgedChange({ gates }));
    mocks.describe.mockRejectedValue(notFoundError());

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.alreadyTerminated).toBeUndefined();
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  test("treats already-terminal run status as idempotent alreadyTerminated", async () => {
    const store = createMockStore(wedgedChange());
    mocks.describe.mockResolvedValue({
      workflowId: "adv-change-test-project-id-wedgedChange",
      runId: "run-123",
      status: { code: 3, name: "TERMINATED" },
    });

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.alreadyTerminated).toBe(true);
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).toHaveBeenCalledWith("wedgedChange");
  });

  test("refuses a RUNNING run without poisoned-history describe evidence", async () => {
    const store = createMockStore(wedgedChange());
    mocks.describe.mockResolvedValue({
      workflowId: "adv-change-test-project-id-wedgedChange",
      runId: "run-123",
      status: { code: 1, name: "RUNNING" },
    });

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/wedged/i);
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  test("dryRun returns the structured pin assessment without terminate or refresh", async () => {
    const store = createMockStore(wedgedChange());

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
        dryRun: true,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.wouldTerminate).toBe(true);
    expect(parsed.runId).toBe("run-123");
    expect(parsed.runStatus).toBe("RUNNING");
    expect(typeof parsed.wedgedEvidence).toBe("string");
    expect(parsed.wedgedEvidence.length).toBeGreaterThan(0);
    expect(mocks.describe).toHaveBeenCalledTimes(1);
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  test("terminates the exact pinned run and refreshes the projection cache", async () => {
    const store = createMockStore(wedgedChange());

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe("wedgedChange");
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.runId).toBe("run-123");
    expect(typeof parsed.wedgedEvidence).toBe("string");
    // Exact run pinning: describe once, then terminate via a handle bound to
    // the described runId.
    expect(mocks.describe).toHaveBeenCalledTimes(1);
    expect(mocks.getChangeHandle).toHaveBeenCalledWith(
      expect.anything(),
      "test-project-id",
      "wedgedChange",
      "run-123",
    );
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
    const reason = mocks.terminate.mock.calls[0][0];
    expect(typeof reason).toBe("string");
    expect(reason).toMatch(/adv_change_workflow_terminate/);
    expect(store.changes.refresh).toHaveBeenCalledWith("wedgedChange");
  });

  test("treats WorkflowNotFoundError from terminate as idempotent success", async () => {
    const store = createMockStore(wedgedChange());
    mocks.terminate.mockRejectedValue(notFoundError());

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.alreadyTerminated).toBe(true);
    expect(store.changes.refresh).toHaveBeenCalledWith("wedgedChange");
  });

  test("terminate failure returns structured error before any projection mutation", async () => {
    const store = createMockStore(wedgedChange());
    mocks.terminate.mockRejectedValue(new Error("connection refused"));

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.workflowTerminated).toBe(false);
    expect(parsed.error).toMatch(/connection refused/);
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  test("refuses termination when describe yields no runId to pin", async () => {
    const store = createMockStore(wedgedChange());
    mocks.describe.mockResolvedValue({
      workflowId: "adv-change-test-project-id-wedgedChange",
      status: { code: 1, name: "RUNNING" },
      raw: {
        pendingWorkflowTask: {
          lastFailure: "WorkflowTaskFailedCauseNonDeterministicError",
        },
      },
    });

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/runId|pin/i);
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  test("refuses termination when run status cannot be classified", async () => {
    const store = createMockStore(wedgedChange());
    mocks.describe.mockResolvedValue({
      workflowId: "adv-change-test-project-id-wedgedChange",
      runId: "run-123",
      status: { code: 0, name: "UNSPECIFIED" },
      raw: {
        pendingWorkflowTask: {
          lastFailure: "WorkflowTaskFailedCauseNonDeterministicError",
        },
      },
    });

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/status/i);
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  test("terminates a wedged closed change workflow when shipped proof holds", async () => {
    const store = createMockStore(wedgedChange({ status: "closed" }));

    const result = await tool().execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: TERMINATE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.eligibilityClass).toBe("poisoned_history");
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
    expect(store.changes.refresh).toHaveBeenCalledWith("wedgedChange");
  });
});

// =============================================================================
// rq-shippedWorkflowTermination01 — alternate "shipped_terminal" eligibility
// branch. These tests use real filesystem fixtures (temp dirs with valid
// archive bundles) so computeShippedTerminalProof can read actual change.json
// files and the convergence write hits real disk.
// =============================================================================

function allGatesDone(): NonNullable<Change["gates"]> {
  const done = { status: "done" } as const;
  return {
    proposal: { ...done },
    discovery: { ...done },
    design: { ...done },
    planning: { ...done },
    execution: { ...done },
    acceptance: { ...done },
    release: { ...done },
  } as NonNullable<Change["gates"]>;
}

function shippedTerminalChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "fixWorkflowReliabilityDefects",
    title: "Fix workflow reliability defects",
    status: "draft",
    lifecycleState: "open",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: allGatesDone(),
    phase9_status: {
      status: "done",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-02T00:00:00Z",
      route: "direct",
      changeTipSha: "abc123",
    },
    ...overrides,
  } as Change;
}

/** RUNNING describe with NO poisoned-history evidence — exercises the new branch. */
function shippedTerminalRunningDescription(runId = "run-shipped-1") {
  return {
    workflowId: "adv-change-test-project-id-fixWorkflowReliabilityDefects",
    runId,
    status: { code: 1, name: "RUNNING" },
    // No pendingWorkflowTask.lastFailure → poisonedDescriptionEvidence returns null.
    raw: {},
  };
}

describe("adv_change_workflow_terminate — shipped_terminal eligibility (rq-shippedWorkflowTermination01)", () => {
  let tempRoot: string;
  let changesDir: string;
  let archiveDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await mkdtemp(join(tmpdir(), "adv-wf-terminate-shipped-"));
    changesDir = join(tempRoot, "changes");
    archiveDir = join(tempRoot, "archive");
    await mkdir(changesDir, { recursive: true });
    await mkdir(archiveDir, { recursive: true });

    mocks.getService.mockReturnValue({ client: { workflow: {} } });
    mocks.getProjectId.mockResolvedValue("test-project-id");
    mocks.getChangeHandle.mockReturnValue({
      describe: mocks.describe,
      terminate: mocks.terminate,
      signal: vi.fn(),
      query: vi.fn(),
    });
    mocks.describe.mockResolvedValue(shippedTerminalRunningDescription());
    mocks.terminate.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  async function writeChangeToDisk(change: Change): Promise<void> {
    const dir = join(changesDir, change.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "change.json"),
      JSON.stringify(change, null, 2),
    );
  }

  async function writeBundle(change: Change): Promise<void> {
    const bundlePath = join(archiveDir, `2026-01-15-${change.id}`);
    await mkdir(bundlePath, { recursive: true });
    await writeFile(
      join(bundlePath, "change.json"),
      JSON.stringify(change, null, 2),
    );
  }

  function createDiskBackedStore(change: Change): Store {
    // Mock store.changes.get returns the in-memory change (live workflow
    // state) but store.paths point at real disk so computeShippedTerminalProof
    // and saveRecoveredChangeStatus can read/write actual files.
    return {
      paths: {
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      } as Store["paths"],
      config: { name: "test", features: {} } as Store["config"],
      changes: {
        get: vi.fn(async (changeId: string) => ({
          success: true,
          data: change && change.id === changeId ? change : null,
        })),
        refresh: vi.fn(async () => undefined),
        list: vi.fn(async () => ({ changes: [] })),
        save: vi.fn(async () => undefined),
      } as unknown as Store["changes"],
    } as unknown as Store;
  }

  test("refuses RUNNING run without poison AND without shipped-terminal proof (no bundle)", async () => {
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    // No bundle written → PROOF_NO_BUNDLE.
    const store = createDiskBackedStore(change);

    const result = await tool().execute(
      {
        changeId: "fixWorkflowReliabilityDefects",
        approvedByUser: true,
        approvalEvidence: "operator approved shipped-terminal recovery",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/shipped-terminal proof failed/);
    expect(parsed.shippedTerminalProof.refusalCode).toBe("PROOF_NO_BUNDLE");
    expect(parsed.eligibilityClass).toBe("none");
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("dryRun returns eligibilityClass=shipped_terminal with full proof when bundle is valid", async () => {
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    await writeBundle(change);
    const store = createDiskBackedStore(change);

    const result = await tool().execute(
      {
        changeId: "fixWorkflowReliabilityDefects",
        approvedByUser: true,
        approvalEvidence: "operator approved shipped-terminal recovery",
        dryRun: true,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.eligibilityClass).toBe("shipped_terminal");
    expect(parsed.runId).toBe("run-shipped-1");
    expect(parsed.runStatus).toBe("RUNNING");
    expect(parsed.shippedTerminalProof.ok).toBe(true);
    expect(parsed.shippedTerminalProof.bundlePath).toContain(
      "fixWorkflowReliabilityDefects",
    );
    expect(mocks.describe).toHaveBeenCalledTimes(1);
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("terminates pinned run, writes status+lifecycleState=archived, readback verifies convergence", async () => {
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    await writeBundle(change);
    const store = createDiskBackedStore(change);

    // store.changes.list for readback returns the just-written change as archived.
    (store.changes.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: unknown) => {
        const q = query as { status?: string } | null;
        // Read the freshly-written disk projection.
        const text = await readFile(
          join(changesDir, change.id, "change.json"),
          "utf-8",
        );
        const fresh = JSON.parse(text) as Change;
        if (q && q.status === "archived") {
          return { changes: [fresh] };
        }
        return { changes: [] }; // in-flight list is empty after convergence.
      },
    );
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id !== change.id) return { success: true, data: null };
        const text = await readFile(
          join(changesDir, change.id, "change.json"),
          "utf-8",
        );
        return { success: true, data: JSON.parse(text) as Change };
      },
    );

    const result = await tool().execute(
      {
        changeId: "fixWorkflowReliabilityDefects",
        approvedByUser: true,
        approvalEvidence: "operator approved shipped-terminal recovery",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.eligibilityClass).toBe("shipped_terminal");
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.converged).toBe(true);
    expect(parsed.fromStatus).toBe("draft");
    expect(parsed.toStatus).toBe("archived");
    expect(parsed.readback.showStatus).toBe("archived");
    expect(parsed.readback.showLifecycleState).toBe("archived");
    expect(parsed.readback.inFlightCount).toBe(0);
    expect(parsed.readback.archivedCount).toBe(1);

    // Confirm real disk projection was written atomically.
    const diskText = await readFile(
      join(changesDir, change.id, "change.json"),
      "utf-8",
    );
    const disk = JSON.parse(diskText) as Change;
    expect(disk.status).toBe("archived");
    expect(disk.lifecycleState).toBe("archived");

    // Terminate targeted the exact pinned run.
    expect(mocks.getChangeHandle).toHaveBeenCalledWith(
      expect.anything(),
      "test-project-id",
      "fixWorkflowReliabilityDefects",
      "run-shipped-1",
    );
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
  });

  test("refuses when shipped-terminal proof fails on PROOF_BUNDLE_ID_MISMATCH", async () => {
    const diskChange = shippedTerminalChange();
    await writeChangeToDisk(diskChange);

    // Bundle directory suffix matches but embedded id is different.
    const bundlePath = join(
      archiveDir,
      `2026-01-15-${diskChange.id}`,
    );
    await mkdir(bundlePath, { recursive: true });
    const mismatchedBundle = { ...diskChange, id: "someOtherChangeId" };
    await writeFile(
      join(bundlePath, "change.json"),
      JSON.stringify(mismatchedBundle, null, 2),
    );

    const store = createDiskBackedStore(diskChange);

    const result = await tool().execute(
      {
        changeId: "fixWorkflowReliabilityDefects",
        approvedByUser: true,
        approvalEvidence: "operator approved shipped-terminal recovery",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.shippedTerminalProof.refusalCode).toBe(
      "PROOF_BUNDLE_ID_MISMATCH",
    );
    expect(parsed.eligibilityClass).toBe("none");
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("dryRun preserves eligibilityClass=poisoned_history for poisoned runs (no proof required)", async () => {
    // A poisoned run with no archive bundle still qualifies via the existing
    // poisoned-history branch.
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    // No bundle.
    mocks.describe.mockResolvedValue(poisonedRunningDescription("run-poison-1"));
    const store = createDiskBackedStore(change);

    const result = await tool().execute(
      {
        changeId: "fixWorkflowReliabilityDefects",
        approvedByUser: true,
        approvalEvidence: "operator approved poisoned-history recovery",
        dryRun: true,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.eligibilityClass).toBe("poisoned_history");
    expect(parsed.wedgedEvidence).toBeTruthy();
    expect(parsed.runId).toBe("run-poison-1");
  });
});
