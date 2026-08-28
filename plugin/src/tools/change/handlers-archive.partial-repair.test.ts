/** Partial archive-delta repair classification for adv_change_archive. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import type { Change, Delta, Gates, Store } from "../../types";
import type { SpecProjectionManifest } from "../../archive/projection";
import { canonicalSha256 } from "../../archive/projection";

const mocks = vi.hoisted(() => ({
  findArchiveBundle: vi.fn(),
  readProjectionManifest: vi.fn(),
  archiveChange: vi.fn(),
  reconcileInRepoArchive: vi.fn(),
  refreshArchiveBundleProjectionUnderLock: vi.fn(),
  withArchiveProjectionLock: vi.fn(),
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
  detectMergedArchiveReplay: vi.fn(),
  completeMergedArchiveReplay: vi.fn(),
  completeReleaseGateAfterFinalization: vi.fn(),
  verifyReleaseGateDurableForArchive: vi.fn(),
  projectEpicTerminalSummaryAfterArchive: vi.fn(),
  recordPhase9Status: vi.fn(),

  coordinateChangeMutation: vi.fn(),
  closeLinkedIssue: vi.fn(),
  removeChangeDir: vi.fn(),
  loadAllSpecs: vi.fn(),
  loadChange: vi.fn(),
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

vi.mock("../../archive/archive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../archive/archive")>();
  return {
    ...actual,
    findArchiveBundle: mocks.findArchiveBundle,
    archiveChange: mocks.archiveChange,
    reconcileInRepoArchive: mocks.reconcileInRepoArchive,
    refreshArchiveBundleProjectionUnderLock:
      mocks.refreshArchiveBundleProjectionUnderLock,
  };
});

vi.mock("../../archive/projection-lock", () => ({
  withArchiveProjectionLock: mocks.withArchiveProjectionLock,
}));

vi.mock("../../archive/projection-proof", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../archive/projection-proof")>();
  return {
    ...actual,
    readProjectionManifest: mocks.readProjectionManifest,
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
    detectMergedArchiveReplay: mocks.detectMergedArchiveReplay,
    completeMergedArchiveReplay: mocks.completeMergedArchiveReplay,
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

vi.mock("../../storage/change-projection-reader", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../storage/change-projection-reader")
    >();
  return {
    ...actual,
    loadChange: mocks.loadChange,
  };
});

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
  initStateDb: mocks.initWorktreeStateDb,
}));

vi.mock("../change-mutation-coordinator", () => ({
  coordinateChangeMutation: mocks.coordinateChangeMutation,
}));

import { archiveChangeTools, completeShippedChange } from "./handlers-archive";

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
    mocks.loadChange.mockResolvedValue({
      success: true,
      data: makeChange(),
    });

    mocks.readProjectionManifest.mockResolvedValue(null);
    mocks.archiveChange.mockImplementation(async (input: { change: Change }) =>
      archiveResult(input.change),
    );
    mocks.reconcileInRepoArchive.mockResolvedValue(
      join(REPAIR_WORKTREE, ".adv", "archive", CHANGE_ID),
    );
    mocks.refreshArchiveBundleProjectionUnderLock.mockResolvedValue({});
    mocks.withArchiveProjectionLock.mockImplementation(
      async (_root, operation) => operation(),
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
    mocks.detectMergedArchiveReplay.mockResolvedValue({ kind: "none" });
    mocks.completeMergedArchiveReplay.mockResolvedValue({
      ok: true,
      gate: { status: "done" },
      alreadyDone: false,
    });
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
          return { ok: true, planToken: "plan-token", path: REPAIR_WORKTREE };
        }
        return { ok: false, error: "WORKTREE_NOT_FOUND", branch: _branch };
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
      archivedAt: "2026-08-08T00:00:00.000Z",
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

  it("completes a proven merged replay before selecting archive writers", async () => {
    const change = makeChange({
      phase9_status: {
        status: "pending_merge",
        startedAt: "2026-08-08T00:00:00Z",
        repo: "owner/repo",
        prNumber: 42,
        prHeadSha: "pr-head-sha",
        defaultBranchSha: "default-sha",
      },
    });
    mocks.detectMergedArchiveReplay.mockResolvedValue({
      kind: "verified_merged_replay",
      existingBundlePath: BUNDLE_PATH,
      trackedBundlePath: `.adv/archive/2026-08-08-${CHANGE_ID}`,
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "pr_manual",
        repo: "owner/repo",
        prNumber: 42,
        prBranch: `change/${CHANGE_ID}`,
        prHeadSha: "pr-head-sha",
        mergeCommitSha: "merge-sha",
        defaultBranchSha: "default-sha",
        releasedCommitSha: "merge-sha",
        pushStatus: "skipped",
      },
    });
    const trackedBundlePath = join(
      REPAIR_WORKTREE,
      ".adv",
      "archive",
      `2026-08-08-${CHANGE_ID}`,
    );
    mocks.findArchiveBundle.mockResolvedValueOnce(trackedBundlePath);
    mocks.completeMergedArchiveReplay.mockResolvedValue({
      ok: true,
      gate: { status: "done" },
      alreadyDone: false,
      recoveryMutation: true,
    });
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        phase9: "run",
        worktreePath: REPAIR_WORKTREE,
      },
      store,
    );

    expect(parseResult(result)).toMatchObject({
      success: true,
      mergedReplay: true,
      archivePath: BUNDLE_PATH,
    });
    expect(mocks.completeMergedArchiveReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        changeId: CHANGE_ID,
        existingBundlePath: BUNDLE_PATH,
      }),
    );
    expect(mocks.reconcileInRepoArchive).not.toHaveBeenCalled();
    expect(mocks.archiveChange).not.toHaveBeenCalled();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
    expect(mocks.coordinateChangeMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          mutationKind: "archive_transition",
        }),
      }),
    );
    expect(
      mocks.refreshArchiveBundleProjectionUnderLock,
    ).not.toHaveBeenCalled();
    expect(mocks.advWorktreeDelete).toHaveBeenCalledTimes(2);
    expect(mocks.removeChangeDir).toHaveBeenCalledTimes(1);
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
    expect(parseResult(result).cleanup).toMatchObject({
      status: "already_absent",
    });
  });

  it("previews deferred cleanup without mutating a proven merged replay", async () => {
    const change = makeChange({
      phase9_status: {
        status: "pending_merge",
        startedAt: "2026-08-08T00:00:00Z",
        repo: "owner/repo",
        prNumber: 42,
        prHeadSha: "pr-head-sha",
        defaultBranchSha: "default-sha",
      },
    });
    mocks.detectMergedArchiveReplay.mockResolvedValue({
      kind: "verified_merged_replay",
      existingBundlePath: BUNDLE_PATH,
      trackedBundlePath: `.adv/archive/2026-08-08-${CHANGE_ID}`,
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "pr_manual",
        repo: "owner/repo",
        prNumber: 42,
        prBranch: `change/${CHANGE_ID}`,
        prHeadSha: "pr-head-sha",
        mergeCommitSha: "merge-sha",
        defaultBranchSha: "default-sha",
        releasedCommitSha: "merge-sha",
        pushStatus: "skipped",
      },
    });

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        dryRun: true,
        phase9: "run",
        worktreePath: REPAIR_WORKTREE,
      },
      makeStore(change),
    );

    expect(parseResult(result)).toMatchObject({
      success: true,
      dryRun: true,
      mergedReplay: true,
      noOp: false,
      canonicalCompletionPending: true,
      cleanup: {
        status: "retained",
        branch: `change/${CHANGE_ID}`,
        path: REPAIR_WORKTREE,
        evidence: { classification: "dry_run_cleanup_deferred" },
      },
    });
    expectNoRepairWrites();
  });

  it("retains a safely refused worktree cleanup while completing archive retirement", async () => {
    const change = makeChange();
    mocks.advWorktreeDelete.mockResolvedValue({
      ok: false,
      error: "WORKTREE_IN_USE",
      branch: `change/${CHANGE_ID}`,
      path: REPAIR_WORKTREE,
      hint: "A process uses the worktree.",
    });

    const result = await completeShippedChange({
      store: makeStore(change),
      change,
      changeId: CHANGE_ID,
      archiveMode: "pr",
      archivePath: BUNDLE_PATH,
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "pr_manual",
        pushStatus: "skipped",
      },
      worktreePath: REPAIR_WORKTREE,
    });

    expect(result).toMatchObject({
      ok: true,
      cleanup: {
        status: "retained",
        evidence: { classification: "WORKTREE_IN_USE" },
      },
    });
    expect(mocks.coordinateChangeMutation).toHaveBeenCalledTimes(1);
    expect(mocks.removeChangeDir).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "successful local and remote deletion",
      deletion: { localDeleted: true, remoteDeleted: true },
      warning: undefined,
    },
    {
      name: "local deletion failure",
      deletion: {
        localDeleted: false,
        remoteDeleted: false,
        error: "Local branch deletion failed: still checked out",
      },
      warning:
        "Branch cleanup warning: Local branch deletion failed: still checked out",
    },
    {
      name: "remote deletion failure",
      deletion: {
        localDeleted: true,
        remoteDeleted: false,
        error: "Remote branch deletion failed: denied",
      },
      warning: "Branch cleanup warning: Remote branch deletion failed: denied",
    },
  ])(
    "reports $name from direct archive branch cleanup",
    async ({ deletion, warning }) => {
      const change = makeChange();
      mocks.deleteChangeBranch.mockReturnValue(deletion);

      const result = await completeShippedChange({
        store: makeStore(change),
        change,
        changeId: CHANGE_ID,
        archiveMode: "direct",
        archivePath: BUNDLE_PATH,
        finalization: {
          status: "shipped",
          repoRoot: "/repo",
          defaultBranch: "trunk",
          route: "direct",
          pushStatus: "pushed",
        },
        worktreePath: REPAIR_WORKTREE,
      });

      expect(result).toMatchObject({ ok: true, branchCleanup: deletion });
      if (!result.ok) throw new Error(result.error);
      if (warning) expect(result.errors).toContain(warning);
      else
        expect(result.errors).not.toEqual(
          expect.arrayContaining([
            expect.stringContaining("Branch cleanup warning"),
          ]),
        );
      expect(
        mocks.refreshArchiveBundleProjectionUnderLock,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.refreshArchiveBundleProjectionUnderLock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ archivePath: BUNDLE_PATH }),
      );
      expect(
        mocks.refreshArchiveBundleProjectionUnderLock.mock
          .invocationCallOrder[0],
      ).toBeLessThan(mocks.advWorktreeDelete.mock.invocationCallOrder[0]);
      expect(mocks.advWorktreeDelete.mock.invocationCallOrder[1]).toBeLessThan(
        mocks.deleteChangeBranch.mock.invocationCallOrder[0],
      );
    },
  );

  it("keeps a PR-backed direct-route branch for operator cleanup", async () => {
    const change = makeChange();

    const result = await completeShippedChange({
      store: makeStore(change),
      change,
      changeId: CHANGE_ID,
      archiveMode: "direct",
      archivePath: BUNDLE_PATH,
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "direct",
        pushStatus: "skipped",
        prNumber: 42,
        prHeadSha: "pr-head-sha",
        mergeCommitSha: "merge-sha",
        releasedCommitSha: "merge-sha",
      },
      worktreePath: REPAIR_WORKTREE,
    });

    expect(result).toMatchObject({ ok: true });
    expect(result).not.toHaveProperty("branchCleanup");
    expect(mocks.deleteChangeBranch).not.toHaveBeenCalled();
  });

  it("constructs production archive recovery with separate local and PR repository identities", async () => {
    const root = mkdtempSync(join(tmpdir(), "adv-archive-recovery-"));
    const worktree = join(root, "linked");
    const canonicalBundlePath = join(root, "canonical", CHANGE_ID);
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
      execFileSync("git", ["config", "user.name", "ADV test"], { cwd: root });
      execFileSync("git", ["config", "user.email", "adv@example.test"], {
        cwd: root,
      });
      writeFileSync(join(root, "README.md"), "fixture\n");
      execFileSync("git", ["add", "README.md"], { cwd: root });
      execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
      const prHeadOid = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
      execFileSync(
        "git",
        ["worktree", "add", "-q", "-b", `change/${CHANGE_ID}`, worktree],
        { cwd: root },
      );
      const trackedBundlePath = join(worktree, ".adv", "archive", CHANGE_ID);
      mkdirSync(trackedBundlePath, { recursive: true });
      mkdirSync(canonicalBundlePath, { recursive: true });
      writeFileSync(join(trackedBundlePath, "change.json"), '{"id":"test"}\n');
      writeFileSync(
        join(canonicalBundlePath, "change.json"),
        '{"id":"test"}\n',
      );
      execFileSync("git", ["add", ".adv/archive"], { cwd: worktree });
      execFileSync("git", ["commit", "-qm", "archive projection"], {
        cwd: worktree,
      });

      const terminalChange = makeChange({
        status: "archived",
        lifecycleState: "archived",
        phase9_status: {
          status: "done",
          startedAt: "2026-08-08T00:00:00Z",
          completedAt: "2026-08-08T00:01:00Z",
        },
      });
      mocks.coordinateChangeMutation.mockResolvedValue({
        kind: "verified",
        value: terminalChange,
      });
      mocks.loadChange.mockResolvedValue({
        success: true,
        data: terminalChange,
      });
      const store = makeStore(terminalChange);
      store.paths.root = root;
      store.paths.changes = join(root, ".adv", "changes");
      store.paths.archive = join(root, "canonical");

      await completeShippedChange({
        store,
        change: terminalChange,
        changeId: CHANGE_ID,
        archiveMode: "pr",
        archivePath: canonicalBundlePath,
        trackedBundlePath,
        finalization: {
          status: "shipped",
          repoRoot: root,
          defaultBranch: "main",
          route: "pr_manual",
          mergeCommitSha: prHeadOid,
          releasedCommitSha: prHeadOid,
          prHeadSha: prHeadOid,
          defaultBranchSha: prHeadOid,
          pushStatus: "skipped",
          repo: "owner/repo",
          prNumber: 42,
        },
        worktreePath: worktree,
      });

      expect(mocks.advWorktreeDelete).toHaveBeenCalledWith(
        `change/${CHANGE_ID}`,
        expect.objectContaining({ dryRun: true, force: false }),
        expect.objectContaining({
          projectRoot: root,
          archiveRecovery: expect.objectContaining({
            repository: root,
            prRepository: "owner/repo",
            prNumber: 42,
            prHeadOid,
            terminal: {
              changeId: CHANGE_ID,
              status: "archived",
              evidence: "durable terminal status: archived",
            },
            changedPaths: [
              {
                status: "A",
                path: `.adv/archive/${CHANGE_ID}/change.json`,
              },
            ],
          }),
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not accept caller-supplied archive recovery authority", async () => {
    const change = makeChange();
    mocks.advWorktreeDelete.mockResolvedValue({
      ok: false,
      error: "WORKTREE_IN_USE",
      branch: `change/${CHANGE_ID}`,
      path: REPAIR_WORKTREE,
      hint: "A process uses the worktree.",
    });

    await completeShippedChange({
      store: makeStore(change),
      change,
      changeId: CHANGE_ID,
      archiveMode: "pr",
      archivePath: BUNDLE_PATH,
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "pr_manual",
        pushStatus: "skipped",
      },
      worktreePath: REPAIR_WORKTREE,
    });

    expect(mocks.advWorktreeDelete).toHaveBeenCalledWith(
      `change/${CHANGE_ID}`,
      expect.objectContaining({ dryRun: true }),
      expect.not.objectContaining({ archiveRecovery: expect.anything() }),
    );
  });

  it("does not infer cleanup success or repeat retirement side effects for an exact terminal replay", async () => {
    const change = makeChange({
      status: "archived",
      lifecycleState: "archived",
      phase9_status: {
        status: "done",
        startedAt: "2026-08-08T00:00:00Z",
        completedAt: "2026-08-08T00:01:00Z",
      },
    });

    const result = await completeShippedChange({
      store: makeStore(change),
      change,
      changeId: CHANGE_ID,
      archiveMode: "pr",
      archivePath: BUNDLE_PATH,
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "pr_manual",
        pushStatus: "skipped",
      },
      worktreePath: REPAIR_WORKTREE,
      terminalRefreshCompleted: true,
    });

    expect(result).toMatchObject({
      ok: true,
      cleanup: {
        status: "retained",
        path: REPAIR_WORKTREE,
        evidence: {
          classification: "terminal_replay_cleanup_not_rechecked",
        },
      },
    });
    expect(mocks.coordinateChangeMutation).not.toHaveBeenCalled();
    expect(mocks.projectEpicTerminalSummaryAfterArchive).not.toHaveBeenCalled();
    expect(mocks.advWorktreeDelete).not.toHaveBeenCalled();
    expect(mocks.removeChangeDir).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

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
    expect(mocks.refreshArchiveBundleProjectionUnderLock).toHaveBeenCalledWith(
      expect.objectContaining({
        archivePath: BUNDLE_PATH,
        archivedAt: "2026-08-08T00:00:00.000Z",
        change: expect.objectContaining({
          lifecycleState: "archived",
          phase9_status: expect.objectContaining({ status: "done" }),
        }),
      }),
    );
    expect(mocks.refreshArchiveBundleProjectionUnderLock).toHaveBeenCalledTimes(
      1,
    );
    expect(
      mocks.refreshArchiveBundleProjectionUnderLock,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        archivePath: join(
          REPAIR_WORKTREE,
          ".adv",
          "archive",
          `2026-08-08-${CHANGE_ID}`,
        ),
      }),
    );
    expect(mocks.reconcileInRepoArchive).toHaveBeenCalledWith(
      change,
      "/archive",
      join(REPAIR_WORKTREE, ".adv", "archive"),
      join("/repo/.adv/changes", CHANGE_ID),
    );
    expect(
      mocks.refreshArchiveBundleProjectionUnderLock.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.removeChangeDir.mock.invocationCallOrder[0]);
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

  // Bundle dominance can synthesize archived status while an active projection
  // still carries open lifecycle state. Active state must continue through retire.
  it("still archives when bundle dominance synthesized the archived status", async () => {
    const change = makeChange({
      status: "archived",
      lifecycleState: "open",
      deltas: {},
    });
    seedForChange(change);
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      { changeId: CHANGE_ID, phase9: "skip" },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.noOp).toBeUndefined();
    expect(mocks.reconcileArchivedBundleRetry).not.toHaveBeenCalled();
    expect(mocks.archiveChange).toHaveBeenCalled();
  });

  it("routes an open-lifecycle bundle to reconciliation when the active projection is absent", async () => {
    const change = makeChange({
      status: "archived",
      lifecycleState: "open",
      deltas: {},
    });
    seedForChange(change);
    mocks.loadChange.mockResolvedValue({ success: true, data: null });
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      { changeId: CHANGE_ID, phase9: "run" },
      store,
    );

    expect(parseResult(result)).toMatchObject({ success: true, noOp: true });
    expect(mocks.reconcileArchivedBundleRetry).toHaveBeenCalled();
    expect(mocks.archiveChange).not.toHaveBeenCalled();
    expect(mocks.coordinateChangeMutation).not.toHaveBeenCalled();
    expect(mocks.removeChangeDir).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
  });

  it("fails closed instead of reconciling when the active projection is corrupt", async () => {
    const change = makeChange({
      status: "archived",
      lifecycleState: "open",
      deltas: {},
    });
    seedForChange(change);
    mocks.loadChange.mockResolvedValue({
      success: false,
      type: "corrupt",
      error: "active projection is corrupt",
    });
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      { changeId: CHANGE_ID, phase9: "run" },
      store,
    );

    expect(parseResult(result)).toMatchObject({
      success: false,
      code: "CHANGE_PROJECTION_LOAD_FAILED",
      projectionFailureType: "corrupt",
    });
    expect(mocks.reconcileArchivedBundleRetry).not.toHaveBeenCalled();
    expectNoRepairWrites();
  });

  it("proves a raced bundle recovery from the bundle and skips active retirement", async () => {
    const change = makeChange({ status: "draft", deltas: {} });
    seedForChange(change);
    mocks.completeReleaseGateAfterFinalization.mockResolvedValue({
      ok: true,
      gate: { status: "done" },
      alreadyDone: false,
      recoveryMutation: true,
    });
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      { changeId: CHANGE_ID, phase9: "run" },
      store,
    );

    expect(parseResult(result)).toMatchObject({ success: true, noOp: true });
    expect(mocks.verifyReleaseGateDurableForArchive).toHaveBeenCalledWith(
      expect.objectContaining({ bundlePath: BUNDLE_PATH }),
    );
    expect(mocks.coordinateChangeMutation).not.toHaveBeenCalled();
    expect(mocks.removeChangeDir).not.toHaveBeenCalled();
    expect(mocks.closeLinkedIssue).not.toHaveBeenCalled();
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

// A successful archive creates the durable bundle for every change, including
// changes with no spec deltas.
describe("adv_change_archive zero-delta bundle creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getPluginBundleDistDir.mockReturnValue("/dist");
    mocks.getPluginBundleReleasePreflightError.mockReturnValue(null);
    mocks.findArchiveBundle.mockResolvedValue(null);
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

    mocks.archiveChange.mockImplementation(async (input: { change: Change }) =>
      archiveResult(input.change),
    );
    mocks.refreshArchiveBundleProjectionUnderLock.mockResolvedValue({});
    mocks.withArchiveProjectionLock.mockImplementation(
      async (_root, operation) => operation(),
    );

    mocks.verifyReleaseEvidenceFromMain.mockReturnValue({
      status: "shipped",
      repoRoot: "/repo",
      defaultBranch: "trunk",
      route: "direct",
      releasedCommitSha: "released-sha",
      pushStatus: "pushed",
    });
    mocks.detectMergedArchiveReplay.mockResolvedValue({ kind: "none" });
    mocks.completeMergedArchiveReplay.mockResolvedValue({
      ok: true,
      gate: { status: "done" },
      alreadyDone: false,
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

    mocks.isRequiredOpsFollowupLink.mockReturnValue(false);
    mocks.overlayOpsResolutionsForRead.mockImplementation((change) => change);
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
      commitPaths: [],
      archivePath: BUNDLE_PATH,
      errors: [],
      archivedAt: "2026-08-08T00:00:00.000Z",
    };
  }

  it("routes a zero-delta first archive through archiveChange so the bundle is written", async () => {
    const change = makeChange({ deltas: {} });
    const store = makeStore(change);

    const result = await archiveChangeTools.adv_change_archive.execute(
      {
        changeId: CHANGE_ID,
        phase9: "skip",
      },
      store,
    );

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(mocks.archiveChange).toHaveBeenCalledTimes(1);
    const archiveInput = mocks.archiveChange.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect("reuseExistingBundlePath" in archiveInput).toBe(false);
    expect(parsed.archivePath).toBe(BUNDLE_PATH);
    expect(mocks.coordinateChangeMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          mutationKind: "archive_transition",
        }),
      }),
    );
  });
});
