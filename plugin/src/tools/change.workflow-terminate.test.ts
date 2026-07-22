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

  test("refuses not-found describe with no poison AND no shipped-terminal proof (IDEMPOTENT_BUT_PROOF_MISSING)", async () => {
    // rq-shippedWorkflowTermination01 AC3/AC5/AC7 (blocker remediation):
    // describe-throws-not-found with no poison evidence cannot establish
    // terminal authority. Legacy refresh+idempotent-success masked
    // half-shipped states; the new contract requires typed refusal so the
    // operator uses adv_doctor or completes the proof.
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
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/IDEMPOTENT_BUT_PROOF_MISSING/);
    expect(parsed.eligibilityClass).toBe("none");
    expect(parsed.shippedTerminalProof.refusalCode).toMatch(/^PROOF_/);
    expect(parsed.alreadyTerminated).toBeUndefined();
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
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

  test("treats already-terminal run status as idempotent alreadyTerminated (poisoned-history class)", async () => {
    // rq-shippedWorkflowTermination01 D11: already-terminal runs route through
    // poisoned-history (refresh-only) when poison evidence is present in the
    // description. Without poison, shipped-terminal proof + convergence is
    // required (covered by the shipped-terminal describe block below).
    const store = createMockStore(wedgedChange());
    mocks.describe.mockResolvedValue({
      workflowId: "adv-change-test-project-id-wedgedChange",
      runId: "run-123",
      status: { code: 3, name: "TERMINATED" },
      raw: {
        pendingWorkflowTask: {
          lastFailure:
            "WorkflowTaskFailedCauseNonDeterministicError: TMPRL1100 No command scheduled for event",
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
    expect(parsed.success).toBe(true);
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.alreadyTerminated).toBe(true);
    expect(parsed.eligibilityClass).toBe("poisoned_history");
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).toHaveBeenCalledWith("wedgedChange");
  });

  test("refuses already-terminal run without poison AND without shipped-terminal proof (IDEMPOTENT_BUT_PROOF_MISSING)", async () => {
    // D11: already-terminal with no poison evidence must produce shipped-
    // terminal proof or refuse. A half-shipped stale run cannot be declared
    // converged without structural proof.
    const store = createMockStore(wedgedChange());
    mocks.describe.mockResolvedValue({
      workflowId: "adv-change-test-project-id-wedgedChange",
      runId: "run-123",
      status: { code: 3, name: "TERMINATED" },
      // No raw.pendingWorkflowTask.lastFailure → no poison evidence.
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
    expect(parsed.error).toMatch(/IDEMPOTENT_BUT_PROOF_MISSING/);
    // Mock store points at /tmp/main/.adv/changes which does not exist on
    // disk, so loadChange fails first → PROOF_INVALID_DISK_PROJECTION. Any
    // proof-refusal code is acceptable; what matters is that idempotent
    // success is NOT returned without either poison evidence or valid proof.
    expect(parsed.shippedTerminalProof.refusalCode).toMatch(/^PROOF_/);
    expect(parsed.eligibilityClass).toBe("none");
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
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
    await writeFile(join(dir, "change.json"), JSON.stringify(change, null, 2));
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

  test("converges shipped-terminal authority when the pinned terminate is already completed", async () => {
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    await writeBundle(change);
    const store = createDiskBackedStore(change);
    mocks.terminate.mockRejectedValue(notFoundError());

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
    (store.changes.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: unknown) => {
        const fresh = JSON.parse(
          await readFile(join(changesDir, change.id, "change.json"), "utf-8"),
        ) as Change;
        return (query as { status?: string } | null)?.status === "archived"
          ? { changes: [fresh] }
          : { changes: [] };
      },
    );

    const result = await tool().execute(
      {
        changeId: change.id,
        approvedByUser: true,
        approvalEvidence: "operator approved shipped-terminal recovery",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.alreadyTerminated).toBe(true);
    expect(parsed.converged).toBe(true);
    expect(parsed.readback.showLifecycleState).toBe("archived");
    expect(parsed.readback.archivedCount).toBe(1);
  });

  test("converges shipped-terminal authority when describe throws not-found (proof valid)", async () => {
    // rq-shippedWorkflowTermination01 AC7 + blocker remediation: an
    // idempotent completed/not-found describe still routes through
    // convergeTerminalAuthority when shipped-terminal proof is complete,
    // rather than returning refresh-only success.
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    await writeBundle(change);
    const store = createDiskBackedStore(change);
    mocks.describe.mockRejectedValue(notFoundError());

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
    (store.changes.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: unknown) => {
        const fresh = JSON.parse(
          await readFile(join(changesDir, change.id, "change.json"), "utf-8"),
        ) as Change;
        return (query as { status?: string } | null)?.status === "archived"
          ? { changes: [fresh] }
          : { changes: [] };
      },
    );

    const result = await tool().execute(
      {
        changeId: change.id,
        approvedByUser: true,
        approvalEvidence: "operator approved shipped-terminal recovery",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.alreadyTerminated).toBe(true);
    expect(parsed.converged).toBe(true);
    expect(parsed.eligibilityClass).toBe("shipped_terminal");
    expect(parsed.shippedTerminalProof.ok).toBe(true);
    expect(parsed.readback.showStatus).toBe("archived");
    expect(parsed.readback.showLifecycleState).toBe("archived");
    expect(parsed.readback.archivedCount).toBe(1);
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("refuses describe-throws-not-found when shipped-terminal proof fails (disk-backed, IDEMPOTENT_BUT_PROOF_MISSING)", async () => {
    // Blocker remediation: describe-throws-not-found without poison evidence
    // AND without a valid shipped-terminal proof refuses via the disk-backed
    // path as well. Verifies the contract from a realistic disk scenario
    // (half-shipped state: gates done but no bundle).
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    // No bundle → PROOF_NO_BUNDLE.
    const store = createDiskBackedStore(change);
    mocks.describe.mockRejectedValue(notFoundError());

    const result = await tool().execute(
      {
        changeId: change.id,
        approvedByUser: true,
        approvalEvidence: "operator approved shipped-terminal recovery",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/IDEMPOTENT_BUT_PROOF_MISSING/);
    expect(parsed.eligibilityClass).toBe("none");
    expect(parsed.shippedTerminalProof.refusalCode).toBe("PROOF_NO_BUNDLE");
    expect(parsed.alreadyTerminated).toBeUndefined();
    expect(parsed.converged).toBeUndefined();
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  test("refuses when shipped-terminal proof fails on PROOF_BUNDLE_ID_MISMATCH", async () => {
    const diskChange = shippedTerminalChange();
    await writeChangeToDisk(diskChange);

    // Bundle directory suffix matches but embedded id is different.
    const bundlePath = join(archiveDir, `2026-01-15-${diskChange.id}`);
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
    mocks.describe.mockResolvedValue(
      poisonedRunningDescription("run-poison-1"),
    );
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

  test("successor check #1: a different live successor before write returns typed successorRace", async () => {
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    await writeBundle(change);
    const store = createDiskBackedStore(change);

    // First describe (during classification) returns the pinned RUNNING run.
    // Subsequent describes (post-terminate, in convergeTerminalAuthority)
    // return a DIFFERENT live runId — successor race.
    let describeCallCount = 0;
    mocks.describe.mockImplementation(async () => {
      describeCallCount++;
      if (describeCallCount === 1) {
        return shippedTerminalRunningDescription("run-original");
      }
      // Post-terminate describe returns a different live successor.
      return shippedTerminalRunningDescription("run-successor");
    });

    // store.changes.get returns the live change (still draft) — the convergence
    // write will mutate disk; we don't need readback to succeed for this test.
    (store.changes.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: change,
    });
    (store.changes.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      changes: [],
    });

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
    expect(parsed.partialRecovery).toBe(true);
    expect(parsed.pinnedRunTerminated).toBe(true);
    expect(parsed.converged).toBe(false);
    expect(parsed.successorRace).toBeDefined();
    expect(parsed.successorRace.pinnedRunId).toBe("run-original");
    expect(parsed.successorRace.successorRunId).toBe("run-successor");
    expect(parsed.successorRace.phase).toBe("pre_write");
    expect(parsed.remediation).toBeTruthy();
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
  });

  test("successor check #2: a late successor after readback returns typed lateSuccessorRace", async () => {
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    await writeBundle(change);
    const store = createDiskBackedStore(change);

    let describeCallCount = 0;
    mocks.describe.mockImplementation(async () => {
      describeCallCount++;
      if (describeCallCount === 1) {
        // Pinned describe.
        return shippedTerminalRunningDescription("run-original");
      }
      if (describeCallCount === 2) {
        // Pre-write successor check: no successor yet.
        return {
          workflowId:
            "adv-change-test-project-id-fixWorkflowReliabilityDefects",
          runId: "run-original",
          status: { code: 3, name: "TERMINATED" },
        };
      }
      // Post-readback describe (#2): a NEW successor has appeared.
      return shippedTerminalRunningDescription("run-late-successor");
    });

    // Make store.changes.get return the freshly-written archived change so
    // the convergence write completes successfully.
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id !== change.id) return { success: true, data: null };
        // First read is the live (pre-write) state; subsequent reads return
        // the on-disk archived projection that was just written.
        try {
          const text = await readFile(
            join(changesDir, change.id, "change.json"),
            "utf-8",
          );
          return { success: true, data: JSON.parse(text) as Change };
        } catch {
          return { success: true, data: change };
        }
      },
    );
    (store.changes.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: unknown) => {
        const q = query as { status?: string } | null;
        try {
          const text = await readFile(
            join(changesDir, change.id, "change.json"),
            "utf-8",
          );
          const fresh = JSON.parse(text) as Change;
          if (q && q.status === "archived") {
            return { changes: [fresh] };
          }
          return { changes: [] };
        } catch {
          return { changes: [] };
        }
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
    expect(parsed.success).toBe(false);
    expect(parsed.partialRecovery).toBe(true);
    expect(parsed.pinnedRunTerminated).toBe(true);
    expect(parsed.converged).toBe(false);
    expect(parsed.lateSuccessorRace).toBeDefined();
    expect(parsed.lateSuccessorRace.pinnedRunId).toBe("run-original");
    expect(parsed.lateSuccessorRace.successorRunId).toBe("run-late-successor");
    expect(parsed.lateSuccessorRace.phase).toBe("post_readback");
    expect(parsed.remediation).toBeTruthy();
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
  });

  test("successor check #2 describe failure surfaces typed partial-recovery (not silent success)", async () => {
    // rq-shippedWorkflowTermination01 AC8: a non-completed error from the
    // post-readback successor describe cannot prove absence of a live
    // successor. The call must return a typed partial-recovery shape rather
    // than reporting full convergence success.
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    await writeBundle(change);
    const store = createDiskBackedStore(change);

    let describeCallCount = 0;
    mocks.describe.mockImplementation(async () => {
      describeCallCount++;
      if (describeCallCount <= 2) {
        // Pinned describe + pre-write successor check: original run, then terminated.
        return shippedTerminalRunningDescription("run-original-2");
      }
      // Post-readback describe throws a non-completed error.
      throw new Error("gRPC channel closed unexpectedly");
    });

    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id !== change.id) return { success: true, data: null };
        try {
          const text = await readFile(
            join(changesDir, change.id, "change.json"),
            "utf-8",
          );
          return { success: true, data: JSON.parse(text) as Change };
        } catch {
          return { success: true, data: change };
        }
      },
    );
    (store.changes.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: unknown) => {
        const q = query as { status?: string } | null;
        try {
          const text = await readFile(
            join(changesDir, change.id, "change.json"),
            "utf-8",
          );
          const fresh = JSON.parse(text) as Change;
          if (q && q.status === "archived") {
            return { changes: [fresh] };
          }
          return { changes: [] };
        } catch {
          return { changes: [] };
        }
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
    expect(parsed.success).toBe(false);
    expect(parsed.partialRecovery).toBe(true);
    expect(parsed.pinnedRunTerminated).toBe(true);
    expect(parsed.converged).toBe(false);
    expect(parsed.error).toMatch(/post-readback successor describe failed/);
    expect(parsed.remediation).toMatch(/adv_doctor/);
  });

  test("readback failure returns typed partialRecovery with attempted fields and remediation", async () => {
    const change = shippedTerminalChange();
    await writeChangeToDisk(change);
    await writeBundle(change);
    const store = createDiskBackedStore(change);

    // make readback fail: store.changes.get after write returns a change with
    // status:"draft" (simulating that the disk write didn't take or that a
    // stale workflow re-asserted itself over disk).
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id !== change.id) return { success: true, data: null };
        // Return a draft-state change to force readback failure.
        return {
          success: true,
          data: { ...change, status: "draft", lifecycleState: "open" },
        };
      },
    );
    (store.changes.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      changes: [],
    });

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
    expect(parsed.partialRecovery).toBe(true);
    expect(parsed.pinnedRunTerminated).toBe(true);
    expect(parsed.converged).toBe(false);
    expect(parsed.attemptedStatus).toBe("archived");
    expect(parsed.attemptedLifecycleState).toBe("archived");
    expect(parsed.readback).toBeDefined();
    expect(parsed.remediation).toMatch(/adv_doctor/);
  });

  // ===========================================================================
  // AC9 regression fixture: reproduces the observed incident shape
  // (fixWorkflowReliabilityDefects). Verifies the full recovery flow:
  // classify → terminate pinned → converge authority → readback proves
  // terminal → re-invoke after convergence is refused via archived route.
  // ===========================================================================
  test("AC9 regression: fixWorkflowReliabilityDefects-shaped state recovers end-to-end", async () => {
    // Live workflow state: status="draft", lifecycleState="open", all gates
    // done, phase9 done. This is the exact wedge the original incident hit:
    // shipped-terminal projection vs RUNNING draft workflow.
    const liveChange = shippedTerminalChange({
      id: "fixWorkflowReliabilityDefects",
      title: "Fix workflow reliability defects",
      status: "draft",
      lifecycleState: "open",
    });
    await writeChangeToDisk(liveChange);
    await writeBundle(liveChange);

    // describe returns RUNNING with no poisoned-history evidence (the exact
    // state the old poison-only guard refused to recover).
    mocks.describe.mockResolvedValue(
      shippedTerminalRunningDescription("run-wedge-1"),
    );

    const store = createDiskBackedStore(liveChange);
    // Make store.changes.get/list read the on-disk projection so the
    // convergence write + readback see consistent state.
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id !== liveChange.id) return { success: true, data: null };
        try {
          const text = await readFile(
            join(changesDir, liveChange.id, "change.json"),
            "utf-8",
          );
          return { success: true, data: JSON.parse(text) as Change };
        } catch {
          return { success: true, data: liveChange };
        }
      },
    );
    (store.changes.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: unknown) => {
        const q = query as { status?: string } | null;
        try {
          const text = await readFile(
            join(changesDir, liveChange.id, "change.json"),
            "utf-8",
          );
          const fresh = JSON.parse(text) as Change;
          if (q && q.status === "archived") {
            return { changes: fresh.status === "archived" ? [fresh] : [] };
          }
          return { changes: fresh.status === "draft" ? [fresh] : [] };
        } catch {
          return { changes: [] };
        }
      },
    );

    // Step 1: dryRun qualifies as shipped_terminal with full proof.
    const dryRunResult = await tool().execute(
      {
        changeId: "fixWorkflowReliabilityDefects",
        approvedByUser: true,
        approvalEvidence:
          "operator approved shipped-terminal recovery for fixWorkflowReliabilityDefects wedge",
        dryRun: true,
      },
      store,
    );
    const dryParsed = JSON.parse(dryRunResult);
    expect(dryParsed.success).toBe(true);
    expect(dryParsed.eligibilityClass).toBe("shipped_terminal");
    expect(dryParsed.shippedTerminalProof.ok).toBe(true);
    expect(dryParsed.runId).toBe("run-wedge-1");
    expect(dryParsed.runStatus).toBe("RUNNING");
    expect(mocks.terminate).not.toHaveBeenCalled();

    // Step 2: execute terminates the exact pinned run + converges authority.
    const execResult = await tool().execute(
      {
        changeId: "fixWorkflowReliabilityDefects",
        approvedByUser: true,
        approvalEvidence:
          "operator approved shipped-terminal recovery for fixWorkflowReliabilityDefects wedge",
      },
      store,
    );
    const execParsed = JSON.parse(execResult);
    expect(execParsed.success).toBe(true);
    expect(execParsed.eligibilityClass).toBe("shipped_terminal");
    expect(execParsed.workflowTerminated).toBe(true);
    expect(execParsed.converged).toBe(true);
    expect(execParsed.fromStatus).toBe("draft");
    expect(execParsed.toStatus).toBe("archived");
    expect(execParsed.readback.showStatus).toBe("archived");
    expect(execParsed.readback.showLifecycleState).toBe("archived");
    expect(execParsed.readback.inFlightCount).toBe(0);
    expect(execParsed.readback.archivedCount).toBe(1);

    // Pinned terminate targeted the exact run.
    expect(mocks.getChangeHandle).toHaveBeenCalledWith(
      expect.anything(),
      "test-project-id",
      "fixWorkflowReliabilityDefects",
      "run-wedge-1",
    );
    expect(mocks.terminate).toHaveBeenCalledTimes(1);

    // Disk projection was written atomically.
    const diskText = await readFile(
      join(changesDir, liveChange.id, "change.json"),
      "utf-8",
    );
    const disk = JSON.parse(diskText) as Change;
    expect(disk.status).toBe("archived");
    expect(disk.lifecycleState).toBe("archived");

    // Step 3: idempotent re-invocation sees status:"archived" and routes to
    // adv_archive_purge (the archived-only lever). It does NOT re-converge
    // or duplicate work.
    const reInvokeResult = await tool().execute(
      {
        changeId: "fixWorkflowReliabilityDefects",
        approvedByUser: true,
        approvalEvidence:
          "operator re-approved for verification of idempotent recovery",
      },
      store,
    );
    const reParsed = JSON.parse(reInvokeResult);
    expect(reParsed.success).toBe(false);
    expect(reParsed.error).toMatch(/archived/i);
    expect(reParsed.hint).toMatch(/adv_archive_purge/);
    // No additional terminate call beyond the first execution.
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
  });
});
