/**
 * adv_change_archive Phase 9 integration contract tests.
 *
 * Behavior-level tests verifying finalization ordering, blocked-finalization
 * handling, and PR mode outcomes.
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { changeTools } from "./change";
import { verifyReleaseGateDurableForArchive } from "./change/archive-gate";
import type { Store } from "../storage/store";
import type { Change, Gates, OpsFollowupLink } from "../types";
import * as storageJson from "../storage/json";

const mocks = vi.hoisted(() => {
  const workflow = {
    gates: {} as Gates,
    signalPayloads: [] as Array<Record<string, unknown>>,
    handle: {
      signal: vi.fn(
        async (_signal: unknown, payload: Record<string, unknown>) => {
          workflow.signalPayloads.push(payload);
          const gateId = payload.gateId as keyof Gates | undefined;
          if (gateId) {
            workflow.gates = {
              ...workflow.gates,
              [gateId]: {
                ...(workflow.gates[gateId] ?? {}),
                status: "done",
                completed_at: payload.completedAt as string,
                completed_by: payload.completedBy as string,
                approval_evidence: payload.approvalEvidence as string,
              },
            } as Gates;
          }
        },
      ),
      query: vi.fn(async (_query: unknown, gateId?: keyof Gates) =>
        gateId ? workflow.gates[gateId] : workflow.gates,
      ),
    },
  };

  return {
    workflow,
    archiveChange: vi.fn(() =>
      Promise.resolve({
        success: true,
        changeId: "example",
        specsUpdated: [],
        docsGenerated: [],
        archivePath: "/tmp/archive/example",
        errors: [],
      }),
    ),
    finalizeRelease: vi.fn(() =>
      Promise.resolve({
        status: "shipped",
        mainCheckout: "/tmp/main",
        defaultBranch: "trunk",
        mergeCommitSha: "abc123",
        pushStatus: "pushed",
      }),
    ),
    detectArchiveMode: vi.fn(() => ({ archiveMode: "direct", autoPush: true })),
    detectDefaultBranch: vi.fn(() => ({ branch: "trunk", source: "test" })),
    validateChangeWorktree: vi.fn(() => ({
      valid: true,
      mainCheckout: "/tmp/main",
      currentBranch: "change/example",
    })),
    verifyChangeBranchReachable: vi.fn(() => ({
      reachable: true,
      unmergedCommits: [],
    })),
    verifyDefaultBranchPushed: vi.fn(() => ({ pushed: true })),
    verifyChangeBranchPushed: vi.fn(() => ({ pushed: true })),
    classifyFinalizationRoute: vi.fn(() => ({
      route: "direct",
      repo: "Sharper-Flow/Advance",
    })),
    resolveReleaseReachability: vi.fn(() => ({
      reachable: true,
      proof: "origin_default",
    })),
    closeLinkedIssue: vi.fn(() =>
      Promise.resolve({ issue_closed: [], close_eligible: false }),
    ),
    validateChange: vi.fn(() => Promise.resolve({ errors: [], warnings: [] })),
    getArchiveContractProofErrors: vi.fn(() => []),
    loadSpecsMap: vi.fn(() => Promise.resolve(new Map())),
    findArchiveBundle: vi.fn(() => Promise.resolve(null)),
    getProjectId: vi.fn(() => Promise.resolve("test-project")),
    getService: vi.fn(() => ({
      client: {
        workflow: {
          getHandle: vi.fn(() => workflow.handle),
        },
      },
    })),
    saveRecoveredGateCompletion: vi.fn(
      async (input: {
        change: Change;
        gateId: keyof Gates;
        completion: Gates[keyof Gates];
      }) => {
        const gates = {
          ...(input.change.gates ?? {}),
          [input.gateId]: input.completion,
        } as Gates;
        mocks.workflow.gates = gates;
        return {
          ...input.change,
          gates,
        };
      },
    ),
  };
});

vi.mock("../archive", async () => {
  const actual =
    await vi.importActual<typeof import("../archive")>("../archive");
  return {
    ...actual,
    archiveChange: mocks.archiveChange,
    findArchiveBundle: mocks.findArchiveBundle,
    getArchiveContractProofErrors: mocks.getArchiveContractProofErrors,
    reconcileInRepoArchive: vi.fn(),
  };
});

vi.mock("./archive-helpers/git-finalize", async () => {
  const actual = await vi.importActual<
    typeof import("./archive-helpers/git-finalize")
  >("./archive-helpers/git-finalize");
  return {
    ...actual,
    finalizeRelease: mocks.finalizeRelease,
    detectArchiveMode: mocks.detectArchiveMode,
    detectDefaultBranch: mocks.detectDefaultBranch,
    validateChangeWorktree: mocks.validateChangeWorktree,
    verifyChangeBranchReachable: mocks.verifyChangeBranchReachable,
    verifyDefaultBranchPushed: mocks.verifyDefaultBranchPushed,
    verifyChangeBranchPushed: mocks.verifyChangeBranchPushed,
    classifyFinalizationRoute: mocks.classifyFinalizationRoute,
    resolveReleaseReachability: mocks.resolveReleaseReachability,
  };
});

vi.mock("../validator", () => ({
  validateChange: mocks.validateChange,
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

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("./_recovery-writers", () => ({
  saveRecoveredGateCompletion: mocks.saveRecoveredGateCompletion,
}));

function createMockStore(
  options: {
    releaseDone?: boolean;
    status?: Change["status"];
    phase9_status?: Change["phase9_status"];
    durableReleasePending?: boolean;
    ops_followup_links?: OpsFollowupLink[];
    epicMembership?: NonNullable<Change["epic_membership"]>;
  } = {},
): Store {
  const gates: Gates = {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "done" },
    execution: { status: "done" },
    acceptance: { status: "done" },
    release: { status: options.releaseDone ? "done" : "pending" },
  };
  const change: Change = {
    id: "example",
    title: "Example",
    status: options.status ?? "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [
      {
        id: "tk-1",
        title: "Task 1",
        status: "done",
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    deltas: {},
    wisdom: [],
    gates,
    phase9_status: options.phase9_status,
    ops_followup_links: options.ops_followup_links,
    epic_membership: options.epicMembership,
  };

  mocks.workflow.gates = gates;

  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/.adv/changes",
      archive: "/tmp/.adv/archive",
    } as Store["paths"],
    config: {
      name: "test",
      features: {},
    } as Store["config"],
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {
      list: vi.fn(() => Promise.resolve({ specs: [] })),
      get: vi.fn(() => Promise.resolve({ success: false, error: "not found" })),
    } as unknown as Store["specs"],
    changes: {
      list: vi.fn(async () => ({ changes: [] })),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
    } as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => ({
        ...mocks.workflow.gates,
        ...(options.durableReleasePending
          ? { release: { status: "pending" } }
          : {}),
      })),
    } as unknown as Store["gates"],
    epics: {
      setEntryTerminalSummary: vi.fn(async () => ({
        kind: "change",
        entry_id: options.epicMembership?.entry_id ?? "entry-1",
        change_id: change.id,
        title: change.title,
        order: options.epicMembership?.order ?? 0,
        membership_status: "terminal",
        linked_at: "2026-01-01T00:00:00Z",
        linked_by: "agent",
        link_evidence: "test fixture",
        terminal_summary: {
          status: "archived",
          completed_at: "2026-01-01T00:00:00Z",
        },
      })),
    } as unknown as Store["epics"],
    status: vi.fn(),
  } as unknown as Store;
}

describe("adv_change_archive Phase 9 behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workflow.gates = {} as Gates;
    mocks.workflow.signalPayloads = [];
    mocks.workflow.handle.query.mockImplementation(
      async (_query: unknown, gateId?: keyof Gates) =>
        gateId ? mocks.workflow.gates[gateId] : mocks.workflow.gates,
    );
    mocks.workflow.handle.signal.mockImplementation(
      async (_signal: unknown, payload: Record<string, unknown>) => {
        mocks.workflow.signalPayloads.push(payload);
        const gateId = payload.gateId as keyof Gates | undefined;
        if (gateId) {
          mocks.workflow.gates = {
            ...mocks.workflow.gates,
            [gateId]: {
              ...(mocks.workflow.gates[gateId] ?? {}),
              status: "done",
              completed_at: payload.completedAt as string,
              completed_by: payload.completedBy as string,
              approval_evidence: payload.approvalEvidence as string,
            },
          } as Gates;
        }
      },
    );
    mocks.classifyFinalizationRoute.mockReturnValue({
      route: "direct",
      repo: "Sharper-Flow/Advance",
    });
    mocks.resolveReleaseReachability.mockReturnValue({
      reachable: true,
      proof: "origin_default",
    });
  });

  test("completes release gate after finalization and before retiring the change", async () => {
    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.finalization).toMatchObject({
      status: "shipped",
      mergeCommitSha: "abc123",
      pushStatus: "pushed",
    });
    expect(mocks.validateChangeWorktree).toHaveBeenCalledWith(
      "/tmp/worktree",
      "example",
      { requireCleanWorktree: true },
    );
    expect(mocks.finalizeRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        workdir: "/tmp/worktree",
        expectedMainCheckout: "/tmp/main",
      }),
    );
    expect(mocks.workflow.handle.signal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        gateId: "release",
        completedBy: "adv-archive",
      }),
    );
    expect(mocks.workflow.signalPayloads[0]?.approvalEvidence).toContain(
      "Phase 9 finalization shipped",
    );
    expect(mocks.workflow.handle.signal).toHaveBeenCalledBefore(
      store.changes.save as ReturnType<typeof vi.fn>,
    );
    expect(mocks.finalizeRelease).toHaveBeenCalledBefore(
      store.changes.save as ReturnType<typeof vi.fn>,
    );
    expect(parsed.releaseGate).toMatchObject({
      status: "done",
      completed_by: "adv-archive",
    });
    expect(parsed.continueFrom).toEqual({ path: "/tmp/main", branch: "trunk" });
  });

  test("projects terminal summary to parent Epic after durable archive proof", async () => {
    const store = createMockStore({
      epicMembership: {
        epic_id: "shipInitiative",
        entry_id: "entry-archive",
        order: 2,
        title: "Archive-aware child",
        linked_at: "2026-01-01T00:00:00Z",
      },
    });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(store.epics.setEntryTerminalSummary).toHaveBeenCalledWith(
      "shipInitiative",
      expect.objectContaining({
        entryId: "entry-archive",
        status: "archived",
      }),
    );

    const saveOrder = vi.mocked(store.changes.save).mock.invocationCallOrder[0];
    const epicOrder = vi.mocked(store.epics.setEntryTerminalSummary).mock
      .invocationCallOrder[0];
    expect(epicOrder).toBeGreaterThan(saveOrder);
  });

  test("surfaces open ops follow-up obligations in archive output", async () => {
    const store = createMockStore({
      ops_followup_links: [
        {
          id: "ofl-1",
          changeId: "child-1",
          relationship: "blocks",
          status: "not_started",
          required_handoff: false,
          linked_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "ofl-2",
          changeId: "child-2",
          relationship: "follows_release",
          status: "not_started",
          required_handoff: true,
          linked_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "ofl-3",
          changeId: "child-3",
          relationship: "cleanup_after",
          status: "complete",
          required_handoff: true,
          linked_at: "2026-01-01T00:00:00Z",
          resolution: {
            source: "unreachable",
            status: "complete",
            verified_at: "2026-01-01T01:00:00Z",
            error: "child workflow unavailable",
          },
        },
      ],
    });
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.openOpsObligations).toHaveLength(3);
    expect(parsed.openOpsObligations).toContainEqual(
      expect.objectContaining({
        linkId: "ofl-1",
        changeId: "child-1",
        relationship: "blocks",
        open: true,
      }),
    );
    expect(parsed.openOpsObligations).toContainEqual(
      expect.objectContaining({
        linkId: "ofl-2",
        changeId: "child-2",
        relationship: "follows_release",
        required_handoff: true,
        status_source: "parent_snapshot",
        completion_proof: "unverified",
        open: true,
      }),
    );
    expect(parsed.openOpsObligations).toContainEqual(
      expect.objectContaining({
        linkId: "ofl-3",
        changeId: "child-3",
        relationship: "cleanup_after",
        status: "complete",
        status_source: "unreachable",
        completion_proof: "unreachable",
        resolution_error: "child workflow unavailable",
        open: true,
      }),
    );
  });

  test("blocks archive success when store-backed release proof remains pending", async () => {
    const store = createMockStore({ durableReleasePending: true });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.requirement).toBe("rq-releaseProjectionDurability01");
    expect(parsed.error).toContain("durable release gate proof");
    expect(parsed.releaseGateStatus).toBe("pending");
    expect(store.gates.get).toHaveBeenCalledWith("example");
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  test("accepts audited disk release recovery when store-backed proof is stale", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "adv-archive-release-proof-"));
    const changesDir = join(tmp, "changes");
    const changeDir = join(changesDir, "example");
    const evidence =
      "Phase 9 finalization shipped; defaultBranch=trunk; mainCheckout=/tmp/main; pushStatus=pushed; mergeCommitSha=abc123";

    try {
      const store = createMockStore({ durableReleasePending: true });
      store.paths.changes = changesDir;
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "done" },
        release: {
          status: "done",
          completed_at: "2026-01-01T00:00:00Z",
          completed_by: "adv-archive",
          recovery_audit: {
            reason: "completed_workflow_release_gate_recovery",
            evidence: `workflow execution already completed | WorkflowNotFoundError; ${evidence}`,
            recovered_at: "2026-01-01T00:00:01Z",
          },
        },
      } as Gates;

      await mkdir(changeDir, { recursive: true });
      await writeFile(
        join(changeDir, "change.json"),
        JSON.stringify(
          {
            id: "example",
            title: "Example",
            status: "archived",
            created_at: "2026-01-01T00:00:00Z",
            created_by: "test",
            tasks: [],
            deltas: {},
            wisdom: [],
            gates,
          },
          null,
          2,
        ),
      );

      const proof = await verifyReleaseGateDurableForArchive({
        store,
        changeId: "example",
        evidence,
      });

      expect(proof).toMatchObject({
        ok: true,
        gate: expect.objectContaining({
          status: "done",
          recovery_audit: expect.objectContaining({
            reason: "completed_workflow_release_gate_recovery",
          }),
        }),
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  describe("disk-fallback shipped reconciliation (fixDurableProofFallback)", () => {
    // When the workflow has terminated, store.gates.get() returns a stale
    // pending release gate and archive drops to the disk-fallback path. A
    // shipped change whose disk release gate was recovered (recovery_audit
    // reason = completed_workflow_release_gate_recovery) but whose evidence
    // text does NOT substring-match the freshly computed finalization evidence
    // must still be accepted when finalizationStatus === "shipped".
    const structuredEvidence =
      "Phase 9 finalization shipped; defaultBranch=trunk; mainCheckout=/tmp/main; pushStatus=pushed; mergeCommitSha=NEWBUNDLE999";

    async function makeDiskFallbackStore(input: {
      releaseGate: Gates["release"];
    }): Promise<{ store: Store; cleanup: () => Promise<void> }> {
      const tmp = await mkdtemp(join(tmpdir(), "adv-durable-proof-fallback-"));
      const changesDir = join(tmp, "changes");
      const changeDir = join(changesDir, "example");
      await mkdir(changeDir, { recursive: true });
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "done" },
        release: input.releaseGate,
      } as Gates;
      await writeFile(
        join(changeDir, "change.json"),
        JSON.stringify(
          {
            id: "example",
            title: "Example",
            status: "archived",
            created_at: "2026-01-01T00:00:00Z",
            created_by: "test",
            tasks: [],
            deltas: {},
            wisdom: [],
            gates,
          },
          null,
          2,
        ),
      );
      // Store gate read is stale (release pending) → forces disk fallback.
      const store = {
        paths: { changes: changesDir },
        gates: {
          get: async () => ({
            proposal: { status: "done" },
            discovery: { status: "done" },
            design: { status: "done" },
            planning: { status: "done" },
            execution: { status: "done" },
            acceptance: { status: "done" },
            release: { status: "pending" },
          }),
        },
      } as unknown as Store;
      return {
        store,
        cleanup: () => rm(tmp, { recursive: true, force: true }),
      };
    }

    test("AC1: shipped + release-recovery provenance + non-matching evidence → accepted", async () => {
      const { store, cleanup } = await makeDiskFallbackStore({
        releaseGate: {
          status: "done",
          completed_at: "2026-01-01T00:00:00Z",
          completed_by: "adv-archive",
          recovery_audit: {
            reason: "completed_workflow_release_gate_recovery",
            evidence:
              "workflow execution already completed | STALE OLD EVIDENCE",
            recovered_at: "2026-01-01T00:00:01Z",
          },
        } as Gates["release"],
      });
      try {
        const proof = await verifyReleaseGateDurableForArchive({
          store,
          changeId: "example",
          evidence: structuredEvidence,
          finalizationStatus: "shipped",
        });
        expect(proof.ok).toBe(true);
      } finally {
        await cleanup();
      }
    });

    test("AC2a: NOT shipped + non-matching evidence → blocked", async () => {
      const { store, cleanup } = await makeDiskFallbackStore({
        releaseGate: {
          status: "done",
          completed_at: "2026-01-01T00:00:00Z",
          completed_by: "adv-archive",
          recovery_audit: {
            reason: "completed_workflow_release_gate_recovery",
            evidence:
              "workflow execution already completed | STALE OLD EVIDENCE",
            recovered_at: "2026-01-01T00:00:01Z",
          },
        } as Gates["release"],
      });
      try {
        const proof = await verifyReleaseGateDurableForArchive({
          store,
          changeId: "example",
          evidence: structuredEvidence,
          finalizationStatus: "blocked",
        });
        expect(proof.ok).toBe(false);
      } finally {
        await cleanup();
      }
    });

    // The exact live-repro case: a terminated-workflow release gate recovered
    // through generic adv_gate_complete recovery is stamped with reason
    // "missing_workflow", not the archive's own recovery reason. It MUST be
    // accepted under shipped (bounded release-recovery allowlist).
    test("AC1b (live repro): shipped + missing_workflow recovery + non-matching evidence → accepted", async () => {
      const { store, cleanup } = await makeDiskFallbackStore({
        releaseGate: {
          status: "done",
          completed_at: "2026-01-01T00:00:00Z",
          completed_by: "agent",
          recovery_audit: {
            reason: "missing_workflow",
            evidence:
              "WorkflowNotFoundError: workflow execution already completed",
            recovered_at: "2026-01-01T00:00:01Z",
          },
        } as Gates["release"],
      });
      try {
        const proof = await verifyReleaseGateDurableForArchive({
          store,
          changeId: "example",
          evidence: structuredEvidence,
          finalizationStatus: "shipped",
        });
        expect(proof.ok).toBe(true);
      } finally {
        await cleanup();
      }
    });

    test("AC1c: shipped + poisoned_history recovery + non-matching evidence → accepted", async () => {
      const { store, cleanup } = await makeDiskFallbackStore({
        releaseGate: {
          status: "done",
          completed_at: "2026-01-01T00:00:00Z",
          completed_by: "agent",
          recovery_audit: {
            reason: "poisoned_history",
            evidence: "poisoned history recovery",
            recovered_at: "2026-01-01T00:00:01Z",
          },
        } as Gates["release"],
      });
      try {
        const proof = await verifyReleaseGateDurableForArchive({
          store,
          changeId: "example",
          evidence: structuredEvidence,
          finalizationStatus: "shipped",
        });
        expect(proof.ok).toBe(true);
      } finally {
        await cleanup();
      }
    });

    test("AC2b (forge guard): shipped + unknown (non-allowlisted) recovery reason + non-matching evidence → blocked", async () => {
      const { store, cleanup } = await makeDiskFallbackStore({
        releaseGate: {
          status: "done",
          completed_at: "2026-01-01T00:00:00Z",
          completed_by: "adv-archive",
          recovery_audit: {
            reason: "forged_unrecognized_reason",
            evidence: "forged | STALE OLD EVIDENCE",
            recovered_at: "2026-01-01T00:00:01Z",
          },
        } as Gates["release"],
      });
      try {
        const proof = await verifyReleaseGateDurableForArchive({
          store,
          changeId: "example",
          evidence: structuredEvidence,
          finalizationStatus: "shipped",
        });
        expect(proof.ok).toBe(false);
      } finally {
        await cleanup();
      }
    });
  });

  describe("finalizationShipped reconciliation (fixReleaseDurabilityFalse)", () => {
    const structuredEvidence =
      "Phase 9 finalization shipped; defaultBranch=trunk; mainCheckout=/tmp/main; pushStatus=pushed; mergeCommitSha=abc123";

    const makeReleaseDoneStore = (approvalEvidence: string): Store =>
      ({
        paths: { changes: "/nonexistent-durability-test" },
        gates: {
          get: async () => ({
            proposal: { status: "done" },
            discovery: { status: "done" },
            design: { status: "done" },
            planning: { status: "done" },
            execution: { status: "done" },
            acceptance: { status: "done" },
            release: {
              status: "done",
              completed_at: "2026-01-01T00:00:00Z",
              completed_by: "user",
              approval_evidence: approvalEvidence,
            },
          }),
        },
      }) as unknown as Store;

    test("AC4: manual free-text gate evidence + finalizationShipped accepts the durable proof", async () => {
      // The operator completed the release gate manually with a free-text
      // note that does NOT contain the structured completion evidence.
      const store = makeReleaseDoneStore(
        "PR #282 admin-merged to trunk (commit a10f2bc1)",
      );
      const proof = await verifyReleaseGateDurableForArchive({
        store,
        changeId: "example",
        evidence: structuredEvidence,
        finalizationStatus: "shipped",
      });
      expect(proof.ok).toBe(true);
    });

    test("AC2 (guard preserved): non-matching evidence + NOT shipped still fails", async () => {
      const store = makeReleaseDoneStore(
        "PR #282 admin-merged to trunk (commit a10f2bc1)",
      );
      const proof = await verifyReleaseGateDurableForArchive({
        store,
        changeId: "example",
        evidence: structuredEvidence,
        finalizationStatus: "blocked",
      });
      expect(proof.ok).toBe(false);
      expect(proof).toMatchObject({
        error: expect.stringContaining("lacks matching Phase 9 evidence"),
      });
    });

    test("AC3 (backward compat): matching structured evidence accepts even when finalizationShipped is false", async () => {
      // archive-completed gate: stored approval_evidence contains the
      // structured completion string, so the evidence path matches.
      const store = makeReleaseDoneStore(`release done; ${structuredEvidence}`);
      const proof = await verifyReleaseGateDurableForArchive({
        store,
        changeId: "example",
        evidence: structuredEvidence,
        finalizationStatus: "blocked",
      });
      expect(proof.ok).toBe(true);
    });

    test("squash-supersession regression: superseded SHA in gate evidence + finalizationShipped accepts", async () => {
      const store = makeReleaseDoneStore(
        "release done; mergeCommitSha=OLDSQUASHSHA111",
      );
      const proof = await verifyReleaseGateDurableForArchive({
        store,
        changeId: "example",
        evidence:
          "Phase 9 finalization shipped; mergeCommitSha=NEWBUNDLEMERGE222",
        finalizationStatus: "shipped",
      });
      expect(proof.ok).toBe(true);
    });
  });

  test("archives a shipped change whose done release gate lacks matching Phase 9 evidence (fixReleaseDurabilityFalse — no false-negative)", async () => {
    // T10 readArtifact fallback may call findArchiveBundle before the archive
    // flow; use a stable default so the existing-bundle path is actually hit.
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    // Genuinely-shipped change (default finalizeRelease → status: "shipped")
    // whose release gate is done but carries NO matching structured evidence
    // (createMockStore sets release done with no approval_evidence — the same
    // shape produced by a manual free-text gate completion or a squash-merge
    // SHA supersession). Pre-fix this produced the rq-releaseProjectionDurability01
    // false-negative that forced an adv_change_status_repair fallback. The
    // fresh shipped finalization is authoritative proof the change reached the
    // default branch, so archival now succeeds on the first call.
    const store = createMockStore({ status: "archived", releaseDone: true });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.error).toBeUndefined();
  });

  test("skips finalization when phase9=skip", async () => {
    const store = createMockStore({ releaseDone: true });
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", phase9: "skip" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.finalization).toBeUndefined();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
  });

  test("blocks phase9=skip when origin/default release proof is missing", async () => {
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: false,
      proof: "origin_unmerged",
      details: ["abc123 task commit"],
    });
    const store = createMockStore({ releaseDone: true });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", phase9: "skip" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(parsed.error).toContain("Phase 9 skip blocked");
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  test("does not archive when finalization is blocked", async () => {
    mocks.finalizeRelease.mockResolvedValueOnce({
      status: "blocked",
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      pushStatus: "not_attempted",
      blocked: {
        reason: "DIRTY_MAIN_CHECKOUT",
        remediation: "Clean the main checkout",
      },
    });

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Archive finalization blocked");
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(mocks.workflow.handle.signal).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  // AC2: a thrown finalization (git op failure) must NOT propagate out of
  // adv_change_archive as a silent failure. It must record durable
  // phase9_status="failed" with actionable recovery evidence, return
  // success=false, and leave the change active (no archive transition).
  test("records durable phase9_status failed and stays active when finalization throws", async () => {
    mocks.finalizeRelease.mockRejectedValueOnce(
      new Error("git push failed: network unreachable"),
    );

    const store = createMockStore();
    // Resolves (no unhandled rejection) — the throw is handled internally.
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    // (1) resolves with success: false rather than throwing
    expect(parsed.success).toBe(false);
    // (2) cites the requirement + actionable remediation
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(parsed.error).toContain("Archive finalization failed");
    expect(parsed.error).toContain("git push failed: network unreachable");
    expect(typeof parsed.remediation).toBe("string");
    expect(parsed.remediation).toContain("re-run adv_change_archive");
    // (3) durable phase9_status="failed" carrying error evidence was recorded
    expect(mocks.workflow.signalPayloads).toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({
          status: "failed",
          error: "git push failed: network unreachable",
        }),
      }),
    );
    // (4) change was NOT archived/saved (no silent pending/archive transition)
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  test("keeps change active when finalization is pending auto-merge", async () => {
    mocks.finalizeRelease.mockResolvedValueOnce({
      status: "pending_merge",
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      pushStatus: "pushed",
      prBranch: "change/example",
      prNumber: 42,
      prUrl: "https://github.com/Sharper-Flow/Advance/pull/42",
      autoMergeArmed: true,
      route: "pr_auto_merge",
    });

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.phase9).toBe("pending_merge");
    expect(parsed.finalization).toMatchObject({
      status: "pending_merge",
      prNumber: 42,
      autoMergeArmed: true,
    });
    expect(mocks.workflow.handle.signal).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ gateId: "release" }),
    );
    expect(mocks.workflow.signalPayloads).toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({
          status: "pending_merge",
          prNumber: 42,
          prUrl: "https://github.com/Sharper-Flow/Advance/pull/42",
          autoMergeArmed: true,
        }),
      }),
    );
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  // fixArchiveTerminalProjection SC3/AC4: when adv_change_archive is
  // interrupted past the durable bundle write (typed still-finalizing
  // result at the tool boundary), the operator's re-run must skip the
  // bundle write and complete the terminal projection to archived.
  test("re-run after interrupted terminal projection reaches archived without re-writing the bundle", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    const store = createMockStore();

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    // Bundle-first idempotence: no second bundle write on re-run.
    expect(mocks.archiveChange).not.toHaveBeenCalled();
    // Terminal projection completes: status flips to archived.
    expect(store.changes.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
  });

  test("reconciles release gate from existing bundle without worktree", async () => {
    // T10 (removePositionalArtifactApi): readArtifact in validation
    // context now calls findArchiveBundle as fallback before the archive
    // flow's own findArchiveBundle call. Set a stable default so both
    // callers receive the same bundle path.
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    const store = createMockStore();

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.archiveChange).not.toHaveBeenCalled();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
    expect(mocks.validateChangeWorktree).not.toHaveBeenCalled();
    expect(mocks.classifyFinalizationRoute).toHaveBeenCalledTimes(1);
    const classifyCall = mocks.classifyFinalizationRoute.mock.calls[0];
    expect(classifyCall?.[0]).toBe("/tmp/main");
    expect(classifyCall?.[1]).toBe("trunk");
    expect(mocks.resolveReleaseReachability).toHaveBeenCalledTimes(1);
    const rrCall = mocks.resolveReleaseReachability.mock.calls[0];
    expect(rrCall?.[0]).toMatchObject({
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      changeId: "example",
    });
    expect(mocks.workflow.handle.signal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        gateId: "release",
        completedBy: "adv-archive",
      }),
    );
    expect(store.changes.save).toHaveBeenCalled();
    expect(parsed.finalization).toMatchObject({
      status: "shipped",
      pushStatus: "pushed",
    });
  });

  test("finalizes PR-merged pending_merge from existing bundle and records phase9 done", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: true,
      proof: "pr_merged",
      prNumber: 42,
      mergeCommitOid: "merge-42",
      details: ["PR #42 merged"],
    });
    const store = createMockStore({
      phase9_status: {
        status: "pending_merge",
        startedAt: "2026-01-01T00:00:00Z",
        prNumber: 42,
        prUrl: "https://github.com/Sharper-Flow/Advance/pull/42",
        autoMergeArmed: true,
        route: "pr_auto_merge",
      },
    });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.resolveReleaseReachability).toHaveBeenCalledTimes(1);
    const rrCall = mocks.resolveReleaseReachability.mock.calls[0];
    expect(rrCall?.[0]).toMatchObject({
      prNumber: 42,
      route: expect.objectContaining({ route: "pr_auto_merge" }),
    });
    expect(parsed.finalization).toMatchObject({
      status: "shipped",
      prNumber: 42,
      mergeCommitSha: "merge-42",
      pushStatus: "pushed",
    });
    expect(mocks.workflow.signalPayloads).toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({
          status: "done",
          startedAt: "2026-01-01T00:00:00Z",
        }),
      }),
    );
    expect(store.changes.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
  });

  // rq-fixPhase9SquashMergeRedetect SC2: end-to-end retry path must thread
  // the persisted changeTipSha through to resolveReleaseReachability so
  // tree-SHA detection can succeed when the branch ref is gone.
  test("phase9 retry threads persisted changeTipSha to reachability detection", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: true,
      proof: "pr_merged",
      mergeCommitOid: "squash-merge-sha",
      details: ["tree-SHA matched trunk commit"],
    });
    const store = createMockStore({
      phase9_status: {
        status: "pending",
        startedAt: "2026-01-01T00:00:00Z",
        changeTipSha: "tip123abc",
      },
    });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    // The critical assertion: changeTipSha from phase9_status was threaded
    // through to resolveReleaseReachability so tree-SHA detection can use it.
    expect(mocks.resolveReleaseReachability).toHaveBeenCalledTimes(1);
    const rrCall = mocks.resolveReleaseReachability.mock.calls[0];
    expect(rrCall?.[0]).toMatchObject({
      changeTipSha: "tip123abc",
    });
    expect(parsed.finalization).toMatchObject({
      status: "shipped",
      mergeCommitSha: "squash-merge-sha",
      pushStatus: "pushed",
    });
    expect(mocks.workflow.signalPayloads).toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({
          status: "done",
        }),
      }),
    );
  });

  // rq-fixPhase9PrDetection AC4: durable fields from the prior phase9_status
  // must survive through to the terminal "done" status. Currently changeTipSha
  // is dropped when the done status is built.
  test("phase9 retry preserves changeTipSha in terminal done status", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: true,
      proof: "pr_merged",
      mergeCommitOid: "squash-merge-sha",
      details: ["tree-SHA matched trunk commit"],
    });
    const store = createMockStore({
      phase9_status: {
        status: "pending",
        startedAt: "2026-01-01T00:00:00Z",
        changeTipSha: "tip123abc",
      },
    });

    await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    expect(mocks.workflow.signalPayloads).toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({
          status: "done",
          changeTipSha: "tip123abc",
        }),
      }),
    );
  });

  test("re-running after PR-merged pending_merge recovery remains idempotent", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    mocks.resolveReleaseReachability.mockReturnValue({
      reachable: true,
      proof: "pr_merged",
      prNumber: 42,
      mergeCommitOid: "merge-42",
      details: ["PR #42 merged"],
    });
    const store = createMockStore({
      phase9_status: {
        status: "pending_merge",
        startedAt: "2026-01-01T00:00:00Z",
        prNumber: 42,
        prUrl: "https://github.com/Sharper-Flow/Advance/pull/42",
        autoMergeArmed: true,
        route: "pr_auto_merge",
      },
    });

    const first = JSON.parse(
      await changeTools.adv_change_archive.execute(
        { changeId: "example" },
        store,
      ),
    );
    const second = JSON.parse(
      await changeTools.adv_change_archive.execute(
        { changeId: "example" },
        store,
      ),
    );

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.finalization).toMatchObject({
      status: "shipped",
      prNumber: 42,
      mergeCommitSha: "merge-42",
    });
    expect(second.finalization).toMatchObject({
      status: "shipped",
      prNumber: 42,
      mergeCommitSha: "merge-42",
    });
    expect(second.archivePath).toBe("/tmp/archive/example");
    expect(mocks.resolveReleaseReachability).toHaveBeenCalledTimes(2);
    expect(store.changes.save).toHaveBeenCalledTimes(1);
    const doneSignals = mocks.workflow.signalPayloads.filter(
      (payload) =>
        (payload.phase9_status as { status?: string } | undefined)?.status ===
        "done",
    );
    expect(doneSignals).toHaveLength(2);
  });

  test("classifies failed phase9 without marking archived when recovery proof is missing", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: false,
      proof: "origin_unmerged",
      details: ["change/example is not reachable from origin/trunk"],
    });
    const store = createMockStore({
      phase9_status: {
        status: "failed",
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T00:05:00Z",
        error: "Archive finalization blocked: PR_BRANCH_PUSH_FAILED",
      },
    });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.phase9Failure).toMatchObject({
      status: "failed",
      error: "Archive finalization blocked: PR_BRANCH_PUSH_FAILED",
      blocker: "CHANGE_BRANCH_NOT_REACHABLE_FROM_ORIGIN",
      recoverable: false,
    });
    expect(parsed.phase9Failure.details).toContain(
      "change/example is not reachable from origin/trunk",
    );
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("blocks no-worktree reconciliation when Phase 9 evidence is missing", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: false,
      proof: "origin_push_unverified",
      details: ["origin/trunk is behind"],
    });
    const store = createMockStore();

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Archive finalization blocked");
    expect(parsed.details).toContain("origin/trunk is behind");
    expect(mocks.workflow.handle.signal).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  // rq-fixPhase9SquashMergeRedetect AC4: when reachability cannot be
  // established, the blocked result must point to adv_doctor as the
  // recovery path for squash-merged-and-deleted-branch scenarios.
  test("blocked reachability remediation includes adv_doctor pointer", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    mocks.resolveReleaseReachability.mockReturnValueOnce({
      reachable: false,
      proof: "origin_unmerged",
      details: ["abc123 unmerged task commit"],
    });
    const store = createMockStore();

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Archive finalization blocked");
    expect(parsed.remediation).toContain("adv_doctor");
    expect(mocks.workflow.handle.signal).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("repairs release projection when workflow already completed", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    mocks.workflow.handle.query.mockRejectedValue(
      Object.assign(new Error("workflow execution already completed"), {
        name: "WorkflowNotFoundError",
      }),
    );
    const store = createMockStore({ status: "archived" });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed._recoveryMutation).toBe(true);
    expect(mocks.saveRecoveredGateCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: "release",
        authorization: expect.objectContaining({
          reason: "completed_workflow_release_gate_recovery",
        }),
        completion: expect.objectContaining({
          status: "done",
          completed_by: "adv-archive",
        }),
      }),
    );
    expect(mocks.workflow.handle.signal).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("recovers release projection when workflow completes during confirmation poll", async () => {
    mocks.findArchiveBundle.mockResolvedValue("/tmp/archive/example");
    let releaseGateQueries = 0;
    mocks.workflow.handle.query.mockImplementation(
      async (_query: unknown, gateId?: keyof Gates) => {
        if (gateId === "release") {
          releaseGateQueries++;
          if (releaseGateQueries > 1) {
            throw Object.assign(
              new Error("workflow execution already completed"),
              {
                name: "WorkflowNotFoundError",
              },
            );
          }
        }
        return gateId ? mocks.workflow.gates[gateId] : mocks.workflow.gates;
      },
    );
    const store = createMockStore({ status: "archived" });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed._recoveryMutation).toBe(true);
    expect(parsed.releaseGate).toMatchObject({
      status: "done",
      completed_by: "adv-archive",
    });
    expect(mocks.saveRecoveredGateCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: "release",
        authorization: expect.objectContaining({
          reason: "completed_workflow_release_gate_recovery",
        }),
      }),
    );
  });

  test("includes continueFrom when release gate confirmation is blocked", async () => {
    let releaseGateQueries = 0;
    mocks.workflow.handle.query.mockImplementation(
      async (_query: unknown, gateId?: keyof Gates) => {
        if (gateId === "release") {
          releaseGateQueries++;
          if (releaseGateQueries > 1) {
            return {
              status: "stuck",
              stuck_reason: "contract proof missing",
              readiness_blockers: ["matrix missing"],
            };
          }
        }
        return gateId ? mocks.workflow.gates[gateId] : mocks.workflow.gates;
      },
    );

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Archive release gate completion blocked");
    expect(parsed.continueFrom).toEqual({ path: "/tmp/main", branch: "trunk" });
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("rejects invalid worktree before archive writes", async () => {
    mocks.validateChangeWorktree.mockReturnValueOnce({
      valid: false,
      mainCheckout: "/tmp/main",
      error: "wrong branch",
    });

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(mocks.archiveChange).not.toHaveBeenCalled();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("rejects legacy pr_pushed outcome before release completion", async () => {
    mocks.detectArchiveMode.mockReturnValueOnce({
      archiveMode: "pr",
      autoPush: true,
    });
    mocks.finalizeRelease.mockResolvedValueOnce({
      status: "pr_pushed",
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      prBranch: "change/example",
      pushStatus: "pushed",
    });

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Archive release gate completion blocked");
    expect(parsed.error).toContain("pr_pushed");
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  // rq-releaseFinalization01 AC1: release gate completion must happen BEFORE
  // archive status transition. This test verifies the structural ordering
  // guarantee: signal fires before save, even when the release gate poll
  // requires multiple attempts (simulating Temporal processing latency).
  test("completes release gate before archive status even with delayed gate confirmation", async () => {
    let queryCount = 0;
    mocks.workflow.handle.query.mockImplementation(
      async (_query: unknown, gateId?: keyof Gates) => {
        if (gateId === "release") {
          queryCount++;
          // Simulate Temporal processing delay: first query returns pending,
          // second query returns done (signal was processed).
          if (queryCount === 1) {
            return { status: "pending" };
          }
          return mocks.workflow.gates.release;
        }
        return gateId ? mocks.workflow.gates[gateId] : mocks.workflow.gates;
      },
    );

    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.releaseGate).toMatchObject({
      status: "done",
      completed_by: "adv-archive",
    });
    // Release gate signal must fire before archive status save
    expect(mocks.workflow.handle.signal).toHaveBeenCalledBefore(
      store.changes.save as ReturnType<typeof vi.fn>,
    );
    // Finalization must also fire before archive status save
    expect(mocks.finalizeRelease).toHaveBeenCalledBefore(
      store.changes.save as ReturnType<typeof vi.fn>,
    );
  });

  // rq-releaseProjectionDurability01 AC2: release completion is recorded only
  // after structural Phase 9 evidence exists. When the durable proof check
  // fails (store-backed gate still shows pending), archive must NOT proceed
  // to status transition.
  test("blocks archive status transition when durable release proof fails after signal", async () => {
    // Signal succeeds, but the store-backed gate read returns pending
    // (simulating a race where the projection hasn't landed yet).
    const store = createMockStore({ durableReleasePending: true });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.requirement).toBe("rq-releaseProjectionDurability01");
    expect(parsed.error).toContain("durable release gate proof");
    // Archive status must NOT be saved when proof fails
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  // rq-releaseFinalization01 AC3: archive retry reconciles stale release
  // metadata after completed workflow without manual worktree recreation.
  // When the change is already archived and the release gate is pending,
  // a retry with an existing bundle should complete the release gate and
  // succeed without re-running the full archive write.
  test("reconciles pending release gate on retry with existing bundle and completed workflow", async () => {
    mocks.findArchiveBundle.mockResolvedValueOnce("/tmp/archive/example");
    // Simulate completed workflow: query throws WorkflowNotFoundError
    mocks.workflow.handle.query.mockRejectedValue(
      Object.assign(new Error("workflow execution already completed"), {
        name: "WorkflowNotFoundError",
      }),
    );
    const store = createMockStore({ status: "archived" });

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed._recoveryMutation).toBe(true);
    // Release gate should be recovered via disk projection
    expect(mocks.saveRecoveredGateCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: "release",
        authorization: expect.objectContaining({
          reason: "completed_workflow_release_gate_recovery",
        }),
        completion: expect.objectContaining({
          status: "done",
          completed_by: "adv-archive",
        }),
      }),
    );
    // Archive bundle should NOT be re-written
    expect(mocks.archiveChange).not.toHaveBeenCalled();
    // Finalization should verify evidence from main (no worktree needed)
    expect(mocks.classifyFinalizationRoute).toHaveBeenCalled();
    expect(mocks.resolveReleaseReachability).toHaveBeenCalled();
    // Status should remain archived (no redundant save)
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  // AC3: phase9=run finalizes synchronously (no detached async dispatch).
  // Direct phase9:run must return a terminal outcome (shipped/archived,
  // pending_merge, or blocked error) rather than the legacy "pending"
  // fire-and-forget, and a thrown finalization must leave no residual
  // "pending" phase9_status.
  test("phase9=run runs finalization synchronously and archives (terminal, no pending)", async () => {
    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree", phase9: "run" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    // Finalization runs inline (synchronous), not via a detached dispatch.
    expect(mocks.finalizeRelease).toHaveBeenCalledTimes(1);
    // Terminal: no "pending" fire-and-forget marker is returned or recorded.
    expect(parsed.phase9).not.toBe("pending");
    expect(mocks.workflow.signalPayloads).not.toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({ status: "pending" }),
      }),
    );
    // Archive transition completes synchronously.
    expect(store.changes.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
  });

  test("phase9=run records pending_merge terminal without archiving", async () => {
    mocks.finalizeRelease.mockResolvedValueOnce({
      status: "pending_merge",
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      pushStatus: "pushed",
      prBranch: "change/example",
      prNumber: 42,
      prUrl: "https://github.com/Sharper-Flow/Advance/pull/42",
      autoMergeArmed: true,
      route: "pr_auto_merge",
    });
    const store = createMockStore();

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree", phase9: "run" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.phase9).toBe("pending_merge");
    expect(mocks.workflow.signalPayloads).toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({
          status: "pending_merge",
          prNumber: 42,
          autoMergeArmed: true,
        }),
      }),
    );
    expect(store.changes.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
  });

  test("phase9=run returns blocked error without residual pending state", async () => {
    mocks.finalizeRelease.mockResolvedValueOnce({
      status: "blocked",
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      pushStatus: "not_attempted",
      blocked: {
        reason: "DIRTY_MAIN_CHECKOUT",
        remediation: "Clean the main checkout",
      },
    });
    const store = createMockStore();

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree", phase9: "run" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Archive finalization blocked");
    // No "pending" phase9_status was ever written (no residual pending).
    expect(mocks.workflow.signalPayloads).not.toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({ status: "pending" }),
      }),
    );
    expect(store.changes.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
  });

  test("phase9=run thrown finalization is handled and leaves no residual pending state", async () => {
    // AC2 (rq-releaseFinalization01): a thrown finalization must NOT propagate
    // as a silent failure. It is handled: durable phase9_status="failed" is
    // recorded with the error evidence, the call resolves success=false, and
    // the change stays active (no archive transition, no residual "pending").
    mocks.finalizeRelease.mockRejectedValueOnce(new Error("boom"));
    const store = createMockStore();

    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", worktreePath: "/tmp/worktree", phase9: "run" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(parsed.error).toContain("Archive finalization failed");
    expect(parsed.error).toContain("boom");
    expect(mocks.workflow.signalPayloads).toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({
          status: "failed",
          error: "boom",
        }),
      }),
    );
    // No residual "pending" and no archive transition.
    expect(mocks.workflow.signalPayloads).not.toContainEqual(
      expect.objectContaining({
        phase9_status: expect.objectContaining({ status: "pending" }),
      }),
    );
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("dryRun with phase9=run does not finalize or mutate state", async () => {
    const store = createMockStore();
    const result = await changeTools.adv_change_archive.execute(
      {
        changeId: "example",
        worktreePath: "/tmp/worktree",
        phase9: "run",
        dryRun: true,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.dryRun).toBe(true);
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(parsed.phase9).toBeUndefined();
  });

  test("phase9=skip behavior unchanged with explicit run default", async () => {
    const store = createMockStore({ releaseDone: true });
    const result = await changeTools.adv_change_archive.execute(
      { changeId: "example", phase9: "skip" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.finalization).toBeUndefined();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
  });

  test("poisoned_history recovery bypasses Temporal read and archives from disk projection", async () => {
    const store = createMockStore();
    mocks.findArchiveBundle.mockResolvedValue(null);
    const change = (await store.changes.get("example")).data as Change;
    // If the pre-bundle Temporal read is still used, the first handler call to
    // store.changes.get will reject and fail the archive. The later proposal load
    // is allowed to reject because it falls back to a scaffold.
    vi.mocked(store.changes.get)
      .mockRejectedValueOnce(
        Object.assign(new Error("Failed to query Workflow"), {
          name: "WorkflowNotFoundError",
        }),
      )
      .mockResolvedValue({ success: true, data: change });
    const loadChangeSpy = vi
      .spyOn(storageJson, "loadChange")
      .mockResolvedValue({ success: true, data: change });
    (
      mocks.workflow.handle as typeof mocks.workflow.handle & {
        describe: ReturnType<typeof vi.fn>;
      }
    ).describe = vi.fn(async () => ({
      searchAttributes: {
        TemporalReportedProblems: [
          "category=WorkflowTaskFailed",
          "cause=WorkflowTaskFailedCauseNonDeterministicError",
        ],
      },
    }));

    const result = await changeTools.adv_change_archive.execute(
      {
        changeId: "example",
        worktreePath: "/tmp/worktree",
        phase9: "run",
      },
      store,
    );

    const parsed = JSON.parse(result);
    // Success proves the pre-bundle read skipped store.changes.get.
    expect(parsed.success).toBe(true);
    expect(loadChangeSpy).toHaveBeenCalledWith(store.paths.changes, "example");
    expect(mocks.archiveChange).toHaveBeenCalledWith(
      expect.objectContaining({
        change: expect.objectContaining({ id: "example" }),
      }),
    );
    expect(store.changes.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "example", status: "archived" }),
    );

    loadChangeSpy.mockRestore();
    delete (mocks.workflow.handle as { describe?: unknown }).describe;
  });

  test("absent workflow without recovery mode still throws on archive read", async () => {
    const store = createMockStore();
    mocks.findArchiveBundle.mockResolvedValue(null);
    const loadChangeSpy = vi.spyOn(storageJson, "loadChange");
    vi.mocked(store.changes.get).mockRejectedValue(
      Object.assign(new Error("Failed to query Workflow"), {
        name: "WorkflowNotFoundError",
      }),
    );

    await expect(
      changeTools.adv_change_archive.execute(
        {
          changeId: "example",
          worktreePath: "/tmp/worktree",
          phase9: "run",
        },
        store,
      ),
    ).rejects.toThrow("Failed to query Workflow");

    expect(loadChangeSpy).not.toHaveBeenCalled();
    expect(mocks.archiveChange).not.toHaveBeenCalled();

    loadChangeSpy.mockRestore();
  });

  // AC4: phase9_status visible in adv_change_show
  test("adv_change_show surfaces phase9_status when present on change", async () => {
    const store = createMockStore();
    const change = (await store.changes.get("example")).data as Change;
    change.phase9_status = {
      status: "pending",
      startedAt: "2026-01-01T00:00:00Z",
    };

    const result = await changeTools.adv_change_show.execute(
      { changeId: "example" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.phase9_status).toEqual({
      status: "pending",
      startedAt: "2026-01-01T00:00:00Z",
    });
  });
});
