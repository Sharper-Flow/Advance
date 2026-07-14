/**
 * Archived merged-branch cleanup (rq-archiveBranchCleanup01).
 *
 * Operator-explicit git-branch hygiene for archived ADV changes whose
 * `change/{id}` branch is fully merged into the default branch
 * (squash-merge-safe detection). This is git maintenance, not ADV recovery
 * state, so it lives behind `adv_worktree_cleanup mode=archived_branches`
 * rather than `adv_archive_repair`.
 */

import { execGit } from "../../utils/git.js";
import type { Store } from "../../storage/store";
import {
  deleteChangeBranch,
  detectArchivedMergedBranches,
  detectDefaultBranch,
  getCheckedOutChangeBranches,
  resolveMainCheckout,
} from "./git-finalize";

export interface ArchivedBranchCleanupInput {
  store: Store;
  changeId?: string;
  dryRun?: boolean;
}

/**
 * Scan local `change/*` branches tied to archived ADV changes, detect the
 * fully-merged ones, and (unless dryRun) delete the safe candidates.
 *
 * Returns the structured tool-output payload. `mode` is set to
 * "archived_branches" so the owning tool surface is explicit in output.
 */
export async function cleanupArchivedMergedBranches(
  input: ArchivedBranchCleanupInput,
): Promise<Record<string, unknown>> {
  const { store, changeId, dryRun } = input;
  const mainCheckout = resolveMainCheckout(store.paths.root);
  const { branch: defaultBranch } = detectDefaultBranch(mainCheckout);

  const archivedList = await store.changes.list({
    status: "archived",
    includeArchived: true,
  });
  const archivedChangeIds = archivedList.changes.map((change) => change.id);

  let targetArchivedChangeIds = archivedChangeIds;
  if (changeId?.trim()) {
    if (!archivedChangeIds.includes(changeId)) {
      return {
        success: false,
        mode: "archived_branches",
        changeId,
        error: `Change is not archived or was not found: ${changeId}`,
      };
    }
    targetArchivedChangeIds = [changeId];
  }

  const fetchWarnings: string[] = [];
  try {
    await execGit(["fetch", "origin", defaultBranch], mainCheckout);
  } catch (err) {
    fetchWarnings.push(
      `Best-effort default-branch fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const detect = detectArchivedMergedBranches({
    mainCheckout,
    defaultBranch,
    archivedChangeIds: targetArchivedChangeIds,
  });
  if (detect.status === "blocked") {
    return {
      success: false,
      mode: "archived_branches",
      error: `Cleanup scan blocked: ${detect.reason}`,
      details: detect.details,
    };
  }

  const checkedOut = getCheckedOutChangeBranches(mainCheckout);
  if (checkedOut.status === "blocked") {
    return {
      success: false,
      mode: "archived_branches",
      error: `Worktree safety check blocked: ${checkedOut.reason}`,
      details: checkedOut.details,
    };
  }

  const candidates = detect.branches.filter(
    (b) => !checkedOut.branches.has(b.branch),
  );
  const skippedWorktree = detect.branches.filter((b) =>
    checkedOut.branches.has(b.branch),
  );
  const skipped = skippedWorktree.map((b) => ({
    ...b,
    reason: "WORKTREE_CHECKED_OUT",
    worktreePath: checkedOut.worktreePaths[b.branch],
  }));

  if (dryRun) {
    return {
      success: true,
      mode: "archived_branches",
      dryRun: true,
      mainCheckout,
      defaultBranch,
      candidates,
      skipped,
      count: candidates.length,
      ...(fetchWarnings.length > 0 ? { warnings: fetchWarnings } : {}),
    };
  }

  const results = candidates.map((b) => {
    try {
      const deletion = deleteChangeBranch(mainCheckout, b.changeId);
      return {
        changeId: b.changeId,
        branch: b.branch,
        mergeProof: b.mergeProof,
        ...deletion,
      };
    } catch (error) {
      return {
        changeId: b.changeId,
        branch: b.branch,
        mergeProof: b.mergeProof,
        localDeleted: false,
        remoteDeleted: false,
        blocked: {
          reason: "DELETE_FAILED",
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });
  const summary = {
    total: detect.branches.length,
    candidates: candidates.length,
    deleted: results.filter((r) => r.localDeleted).length,
    remoteDeleted: results.filter((r) => r.remoteDeleted).length,
    failed: results.filter((r) => !r.localDeleted).length,
    skippedWorktree: skippedWorktree.length,
  };
  return {
    success: true,
    mode: "archived_branches",
    dryRun: false,
    mainCheckout,
    defaultBranch,
    results,
    skipped,
    summary,
    ...(fetchWarnings.length > 0 ? { warnings: fetchWarnings } : {}),
  };
}
