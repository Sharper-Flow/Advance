/** Partial archive-delta repair classification for adv_change_archive. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import type { Change, Delta, Gates, Store } from "../../types";
import type { SpecProjectionManifest } from "../../archive/projection";
import { canonicalSha256 } from "../../archive/projection";

const mocks = vi.hoisted(() => ({
  findArchiveBundle: vi.fn(),
  readProjectionManifest: vi.fn(),
  archiveChange: vi.fn(),
  reconcileInRepoArchive: vi.fn(),
  verifyProjectionAtGitCommit: vi.fn(),

  detectArchiveMode: vi.fn(),
  validateArchiveDeltaRepairWorktree: vi.fn(),
  validateChangeWorktree: vi.fn(),
  finalizeRelease: vi.fn(),
  deleteChangeBranch: vi.fn(),

  getPluginBundleDistDir: vi.fn(),
  getPluginBundleReleasePreflightError: vi.fn(),

  getArchiveTaskPreflightError: vi.fn(),
  resolveArchiveGateState: vi.fn(),
  getArchiveGatePreflightError: vi.fn(),
  verifyReleaseEvidenceFromMain: vi.fn(),
  reconcileArchivedBundleRetry: vi.fn(),
  completeReleaseGateAfterFinalization: vi.fn(),
  verifyReleaseGateDurableForArchive: vi.fn(),
  projectEpicTerminalSummaryAfterArchive: vi.fn(),
  recordPhase9Status: vi.fn(),

  coordinateChangeMutation: vi.fn(),
  closeLinkedIssue: vi.fn(),
  removeChangeDir: vi.fn(),
  loadAllSpecs: vi.fn(),
  loadSpecsMap: vi.fn(),
  loadValidationContext: vi.fn(),
  validateChange: vi.fn(),

  advWorktreeDelete: vi.fn(),
  initWorktreeStateDb: vi.fn(),

  withTargetPathStore: vi.fn(),
  appendTargetProjectContextOutput: vi.fn(),

  isRequiredOpsFollowupLink: vi.fn(),
  overlayOpsResolutionsForRead: vi.fn(),
  reconcileOpsFollowupLinks: vi.fn(),
  resolveRequiredOpsLinks: vi.fn(),
}));

vi.mock("../../archive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../archive")>();
  return {
    ...actual,
    findArchiveBundle: mocks.findArchiveBundle,
    readProjectionManifest: mocks.readProjectionManifest,
    archiveChange: mocks.archiveChange,
    reconcileInRepoArchive: mocks.reconcileInRepoArchive,
    verifyProjectionAtGitCommit: mocks.verifyProjectionAtGitCommit,
  };
});

vi.mock("../archive-helpers/git-finalize", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../archive-helpers/git-finalize")>();
  return {
    ...actual,
    detectArchiveMode: mocks.detectArchiveMode,
    validateArchiveDeltaRepairWorktree:
      mocks.validateArchiveDeltaRepairWorktree,
    validateChangeWorktree: mocks.validateChangeWorktree,
    finalizeRelease: mocks.finalizeRelease,
    deleteChangeBranch: mocks.deleteChangeBranch,
  };
});

vi.mock("./archive-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./archive-gate")>();
  return {
    ...actual,
    getArchiveTaskPreflightError: mocks.getArchiveTaskPreflightError,
    resolveArchiveGateState: mocks.resolveArchiveGateState,
    getArchiveGatePreflightError: mocks.getArchiveGatePreflightError,
    verifyReleaseEvidenceFromMain: mocks.verifyReleaseEvidenceFromMain,
    reconcileArchivedBundleRetry: mocks.reconcileArchivedBundleRetry,
    completeReleaseGateAfterFinalization:
      mocks.completeReleaseGateAfterFinalization,
    verifyReleaseGateDurableForArchive:
      mocks.verifyReleaseGateDurableForArchive,
    projectEpicTerminalSummaryAfterArchive:
      mocks.projectEpicTerminalSummaryAfterArchive,
    recordPhase9Status: mocks.recordPhase9Status,
  };
});

vi.mock("../../plugin-bundle-manifest", () => ({
  getPluginBundleDistDir: mocks.getPluginBundleDistDir,
  getPluginBundleReleasePreflightError:
    mocks.getPluginBundleReleasePreflightError,
}));

vi.mock("../target-project", () => ({
  withTargetPathStore: mocks.withTargetPathStore,
  appendTargetProjectContextOutput: mocks.appendTargetProjectContextOutput,
}));

vi.mock("../ops-followup-reconciliation", () => ({
  isRequiredOpsFollowupLink: mocks.isRequiredOpsFollowupLink,
  overlayOpsResolutionsForRead: mocks.overlayOpsResolutionsForRead,
  reconcileOpsFollowupLinks: mocks.reconcileOpsFollowupLinks,
  resolveRequiredOpsLinks: mocks.resolveRequiredOpsLinks,
}));

vi.mock("./recovery", () => ({
  loadSpecsMap: mocks.loadSpecsMap,
  closeLinkedIssue: mocks.closeLinkedIssue,
}));

vi.mock("./create-clarify", () => ({
  loadValidationContext: mocks.loadValidationContext,
}));

vi.mock("../../validator", () => ({
  validateChange: mocks.validateChange,
}));

vi.mock("../../storage/json", () => ({
  loadAllSpecs: mocks.loadAllSpecs,
  removeChangeDir: mocks.removeChangeDir,
}));

vi.mock("../worktree", () => ({
  advWorktreeDelete: mocks.advWorktreeDelete,
}));

vi.mock("../worktree/state", () => ({
  initWorktreeStateDb: mocks.initWorktreeStateDb,
}));

vi.mock("../change-mutation-coordinator", () => ({
  coordinateChangeMutation: mocks.coordinateChangeMutation,
}));

import { archiveChangeTools } from "./handlers-archive";

const CHANGE_ID = "fixWorktreeDeletionReliability";
const BUNDLE_PATH = `/archive/2026-08-08-${CHANGE_ID}`;
const REPAIR_WORKTREE = `/repo-wt/repair/archive-${CHANGE_ID}`;

function makeDoneGates(): Gates {
  const gate = (evidence: string) => ({
    status: "done" as const,
    approval_evidence: evidence,
  });
  return {
    proposal: gate("proposal approved"),
    discovery: gate("discovery approved"),
    design: gate("design approved"),
    planning: gate("planning approved"),
    execution: gate("execution approved"),
    acceptance: gate("acceptance approved"),
    release: gate("release sign-off after v1.21.0 deploy"),
  };
}

function makeDeltas(): Record<string, Delta[]> {
  return {
    "worktree-lifecycle": [
      {
        id: "dl-1",
        operation: "add",
        requirement: {
          id: "rq-worktreeDeletionProtocol01",
          title: "Bounded Git-Authoritative Worktree Deletion Protocol",
          body: "Worktree deletion must use Git census.",
          priority: "must",
          tags: ["worktree", "cleanup"],
        },
      } as Delta,
    ],
  };
}

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: CHANGE_ID,
    title: "Fix worktree deletion reliability",
    status: "draft",
    lifecycleState: "open",
    created_at: "2026-08-08T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: makeDeltas(),
    wisdom: [],
    gates: makeDoneGates(),
    phase9_status: {
      status: "failed",
      startedAt: "2026-08-08T00:00:00Z",
      error: "first Phase 9 failed before archive_transition",
    },
    ...overrides,
  } as Change;
}

function makeManifest(change: Change): SpecProjectionManifest {
  return {
    schema_version: 1,
    change_id: change.id,
    delta_set_sha256: canonicalSha256(change.deltas),
    capabilities: Object.entries(change.deltas).map(([capability, deltas]) => ({
      capability,
      base_version: "1.0.0",
      target_version: "1.0.1",
      spec_sha256: "a".repeat(64),
      document_sha256: "b".repeat(64),
      requirement_sha256: {},
      dispositions: deltas.map((delta) => ({
        deltaId: delta.id,
        operation: delta.operation,
        status: "identical" as const,
      })),
    })),
  };
}

function makeStore(change: Change): Store {
  return {
    paths: {
      root: "/repo",
      changes: "/repo/.adv/changes",
      archive: "/archive",
    },
    config: { name: "test", features: {} },
    changes: {
      get: vi.fn(async () => ({ success: true, data: change })),
    },
  } as unknown as Store;
}

function parseResult(result: string) {
  return JSON.parse(result) as Record<string, unknown>;
}

describe("adv_change_archive partial archive-delta repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getPluginBundleDistDir.mockReturnValue("/dist");
    mocks.getPluginBundleReleasePreflightError.mockReturnValue(null);
    mocks.findArchiveBundle.mockResolvedValue(BUNDLE_PATH);
    mocks.detectArchiveMode.mockReturnValue({
      archiveMode: "direct",
      autoPush: false,
    });
    mocks.getArchiveTaskPreflightError.mockReturnValue(null);
    mocks.resolveArchiveGateState.mockImplementation((_, __, change) => ({
      effectiveGates: change.gates ?? makeDoneGates(),
      storeGates: change.gates ?? makeDoneGates(),
      source: "store",
    }));
    mocks.getArchiveGatePreflightError.mockReturnValue(null);
    mocks.loadValidationContext.mockResolvedValue({
      specs: {},
      activeChanges: [],
      conflictInventory: [],
      proposalText: "",
      changedSpecFiles: [],
    });
    mocks.validateChange.mockResolvedValue({
      passed: true,
      errors: [],
      warnings: [],
    });
    mocks.loadSpecsMap.mockResolvedValue({});
    mocks.loadAllSpecs.mockResolvedValue([]);

    mocks.readProjectionManifest.mockResolvedValue(null);
    mocks.archiveChange.mockImplementation(async (input: { change: Change }) =>
      archiveResult(input.change),
    );
    mocks.reconcileInRepoArchive.mockResolvedValue(
      join(REPAIR_WORKTREE, ".adv", "archive", CHANGE_ID),
    );

    mocks.verifyReleaseEvidenceFromMain.mockReturnValue({
      status: "shipped",
      repoRoot: "/repo",
      defaultBranch: "trunk",
      route: "direct",
      releasedCommitSha: "released-sha",
      pushStatus: "pushed",
    });
    mocks.verifyProjectionAtGitCommit.mockResolvedValue({
      ok: true,
      receipt: {
        schema_version: 1,
        change_id: CHANGE_ID,
        manifest_sha256: "manifest-sha",
        released_commit_sha: "released-sha",
        status: "verified",
        verified_at: "2026-08-08T00:00:00Z",
      },
    });
    mocks.reconcileArchivedBundleRetry.mockResolvedValue(
      JSON.stringify({ success: true, noOp: true }),
    );
    mocks.validateArchiveDeltaRepairWorktree.mockReturnValue({
      valid: true,
      repoRoot: "/repo",
      repairBranch: `repair/archive-${CHANGE_ID}`,
      repairHeadSha: "repair-head-sha",
      defaultBranch: "trunk",
      defaultBranchSha: "default-sha",
      defaultTreeSha: "tree-sha",
    });
    mocks.finalizeRelease.mockResolvedValue({
      status: "shipped",
      repoRoot: "/repo",
      defaultBranch: "trunk",
      route: "direct",
      releasedCommitSha: "released-sha",
      changeTipSha: "tip-sha",
      pushStatus: "pushed",
    });
    mocks.completeReleaseGateAfterFinalization.mockResolvedValue({
      ok: true,
      gate: { status: "done" },
      alreadyDone: true,
    });
    mocks.verifyReleaseGateDurableForArchive.mockResolvedValue({
      ok: true,
      gate: { status: "done" },
      source: "disk",
    });
    mocks.coordinateChangeMutation.mockImplementation(async ({ intent }) => ({
      kind: "verified",
      value: intent.mutateLatestProjection
        ? intent.mutateLatestProjection(makeChange({ status: "archived" }))
        : makeChange({ status: "archived" }),
    }));
    mocks.projectEpicTerminalSummaryAfterArchive.mockResolvedValue({
      status: "not_applicable",
    });
    mocks.closeLinkedIssue.mockResolvedValue({ issue_closed: [] });
    mocks.removeChangeDir.mockResolvedValue(undefined);
    mocks.initWorktreeStateDb.mockResolvedValue({});
    mocks.advWorktreeDelete.mockImplementation(
      async (_branch: string, opts: { dryRun?: boolean }) => {
        if (opts?.dryRun) {
          return { ok: true, planToken: "plan-token" };
        }
        return { ok: true, error: "WORKTREE_NOT_FOUND" };
      },
    );

    mocks.isRequiredOpsFollowupLink.mockReturnValue(false);
    mocks.overlayOpsResolutionsForRead.mockImplementation((change) => change);
    mocks.reconcileOpsFollowupLinks.mockResolvedValue({ parent: makeChange() });
    mocks.resolveRequiredOpsLinks.mockResolvedValue({ resolutionByLinkId: {} });
    mocks.withTargetPathStore.mockImplementation(async (_input, fn) =>
      fn({
        context: {},
        store: _input.store ?? makeStore(makeChange()),
      } as any),
    );
    mocks.appendTargetProjectContextOutput.mockImplementation(
      async (output) => output,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function archiveResult(change: Change) {
    return {
      success: true,
      changeId: change.id,
      specsUpdated: [],
      docsGenerated: [],
      commitPaths: [
        join(REPAIR_WORKTREE, ".adv", "archive", `2026-08-08-${change.id}`),
      ],
      archivePath: BUNDLE_PATH,
      errors: [],
      projectionManifest: makeManifest(change),
    };
  }

  function seedForChange(change: Change) {
    mocks.readProjectionManifest.mockResolvedValue(makeManifest(change));
  }

  function expectNoRepairWrites() {
    expect(mocks.reconcileInRepoArchive).not.toHaveBeenCalled();
    expect(mocks.archiveChange).not.toHaveBeenCalled();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
    expect(mocks.recordPhase9Status).not.toHaveBeenCalled();
    expect(mocks.coordinateChangeMutation).not.toHaveBeenCalled();
    expect(mocks.advWorktreeDelete).not.toHaveBeenCalled();
    expect(mocks.deleteChangeBranch).not.toHaveBeenCalled();
    expect(mocks.removeChangeDir).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  }

  it("proceeds for a partial archive with exact bundle, failed phase9, all gates done, approval, and a valid repair worktree", async () => {
    const change = makeChange();
    seedForChange(change);
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: REPAIR_WORKTREE,
        phase9: "run",
        confirmationEvidence: "operator approved archived-delta repair",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(mocks.archiveChange).toHaveBeenCalledWith(
      expect.objectContaining({
        reuseExistingBundlePath: BUNDLE_PATH,
      }),
    );
    expect(mocks.finalizeRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceBranch: `repair/archive-${CHANGE_ID}`,
      }),
    );
    expect(mocks.coordinateChangeMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          mutationKind: "archive_transition",
        }),
      }),
    );
  });

  it("refuses a partial repair without prior phase9 attempt evidence", async () => {
    const change = makeChange({
      phase9_status: undefined,
    });
    seedForChange(change);
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: REPAIR_WORKTREE,
        phase9: "run",
        confirmationEvidence: "operator approved archived-delta repair",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(String(parsed.error)).toContain("prior Phase 9");
    expectNoRepairWrites();
  });

  it("refuses a partial repair when the existing bundle does not match the change", async () => {
    const change = makeChange();
    mocks.readProjectionManifest.mockResolvedValue({
      schema_version: 1,
      change_id: "wrong-change-id",
      delta_set_sha256: canonicalSha256(change.deltas),
      capabilities: [],
    });
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: REPAIR_WORKTREE,
        phase9: "run",
        confirmationEvidence: "operator approved archived-delta repair",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(String(parsed.error)).toContain("Bundle");
    expectNoRepairWrites();
  });

  it("refuses a partial repair when the bundle omits an accepted delta ID", async () => {
    const change = makeChange();
    const manifest = makeManifest(change);
    manifest.capabilities[0]!.dispositions = [];
    mocks.readProjectionManifest.mockResolvedValue(manifest);
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: REPAIR_WORKTREE,
        phase9: "run",
        confirmationEvidence: "operator approved archived-delta repair",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(String(parsed.error)).toContain("exact accepted delta IDs");
    expectNoRepairWrites();
  });

  it("refuses a partial repair when the lifecycle is closed", async () => {
    const change = makeChange({ lifecycleState: "closed" });
    seedForChange(change);
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: REPAIR_WORKTREE,
        phase9: "run",
        confirmationEvidence: "operator approved archived-delta repair",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(String(parsed.error)).toContain("closed");
    expectNoRepairWrites();
  });

  it("refuses a partial repair without explicit approval evidence", async () => {
    const change = makeChange();
    seedForChange(change);
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: REPAIR_WORKTREE,
        phase9: "run",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(String(parsed.error)).toContain(
      "explicit archived-delta repair approval",
    );
    expectNoRepairWrites();
  });

  it("refuses a partial repair unless Phase 9 is run", async () => {
    const change = makeChange();
    seedForChange(change);
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: REPAIR_WORKTREE,
        phase9: "skip",
        confirmationEvidence: "operator approved archived-delta repair",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(String(parsed.error)).toContain("requires phase9=run");
    expectNoRepairWrites();
  });

  it("refuses a partial repair on the wrong branch", async () => {
    const change = makeChange();
    seedForChange(change);
    mocks.validateArchiveDeltaRepairWorktree.mockReturnValue({
      valid: false,
      repoRoot: "/repo",
      repairBranch: "change/some-topic",
      error:
        "Worktree is on change/some-topic, expected repair/archive-fixWorktreeDeletionReliability",
    });
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: "/repo-wt/change/some-topic",
        phase9: "run",
        confirmationEvidence: "operator approved archived-delta repair",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(String(parsed.error)).toContain("refused before writes");
    expectNoRepairWrites();
  });

  it("leaves the normal archived path idempotent", async () => {
    const change = makeChange({
      status: "archived",
      lifecycleState: "archived",
    });
    seedForChange(change);
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: REPAIR_WORKTREE,
        phase9: "run",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(mocks.reconcileArchivedBundleRetry).toHaveBeenCalled();
    expect(mocks.archiveChange).not.toHaveBeenCalled();
  });

  it("requires explicit approval before repairing an archived absent projection", async () => {
    const change = makeChange({
      status: "archived",
      lifecycleState: "archived",
    });
    seedForChange(change);
    mocks.verifyProjectionAtGitCommit.mockResolvedValue({
      ok: false,
      code: "MANIFEST_ABSENT",
      message: "projection manifest is absent from the released commit",
    });
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        worktreePath: REPAIR_WORKTREE,
        phase9: "run",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(String(parsed.error)).toContain(
      "explicit archived-delta repair approval",
    );
    expectNoRepairWrites();
  });
});
