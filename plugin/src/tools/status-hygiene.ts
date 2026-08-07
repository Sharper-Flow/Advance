/**
 * status-hygiene
 *
 * Extracted from status.ts — pure move, no behavior change.
 */

import { basename, join } from "path";
import { access, readdir } from "fs/promises";
import type { Store } from "../storage/store";
import { scanOpenCodeSessionDebt } from "../utils/opencode-session-debt";
import {
  detectArchivedMergedBranches,
  detectDefaultBranch,
  getCheckedOutChangeBranches,
  type GitFinalizeDeps,
} from "./archive-helpers/git-finalize";
import {
  getDataHome,
  getWorktreeBase,
  SYNTHETIC_TEST_PROJECT_ID_PREFIX,
} from "../utils/project-id";
import {
  pushStatusRecommendation,
  type StatusRecommendationCarrier,
} from "./status-enrich";

export interface ExternalStateHygieneReport {
  dry_run_only: true;
  deletion_requires_approval: true;
  external_root: string | null;
  nested_adv_dir: boolean;
  stale_db_dir: boolean;
  worker_locks_excluded: true;
  synthetic_project_dirs: number;
  synthetic_worktree_dirs: number;
  empty_worktree_prefix_dirs: string[];
  in_repo_changes: boolean;
  in_repo_archive: boolean;
  recommendations: string[];
}

export interface ArchivedBranchHygieneSection {
  count: number;
  branches: Array<{
    changeId: string;
    branch: string;
    mergeProof:
      | { kind: "tree-identical"; trunkCommitSha: string }
      | { kind: "patch-equivalent" };
  }>;
  recommendation: string;
}
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function listSubdirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function isEmptyDir(path: string): Promise<boolean> {
  try {
    const entries = await readdir(path);
    return entries.length === 0;
  } catch {
    return false;
  }
}
export async function computeExternalStateHygiene(
  store: Store,
): Promise<ExternalStateHygieneReport> {
  const externalRoot = store.paths.external;
  const dataHome = getDataHome();
  const projectId = externalRoot ? basename(externalRoot) : null;
  const recommendations: string[] = [];

  const nestedAdvDir = externalRoot
    ? await pathExists(join(externalRoot, ".adv"))
    : false;
  const staleDbDir = externalRoot
    ? await pathExists(join(externalRoot, "db"))
    : false;

  const syntheticProjectDirs = (
    await listSubdirs(join(dataHome, "opencode", "plugins", "advance"))
  ).filter((dir) => dir.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX)).length;
  const syntheticWorktreeDirs = (
    await listSubdirs(join(dataHome, "opencode", "worktree"))
  ).filter((dir) => dir.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX)).length;

  const emptyWorktreePrefixDirs: string[] = [];
  if (projectId) {
    const worktreeBase = getWorktreeBase(projectId);
    const prefixDirs = await listSubdirs(worktreeBase);
    for (const prefix of prefixDirs) {
      const fullPath = join(worktreeBase, prefix);
      if (await isEmptyDir(fullPath)) emptyWorktreePrefixDirs.push(fullPath);
    }
  }

  // In-repo .adv/archive/ is valid (addagentmeshandinrepoarchive policy).
  // Only flag .adv/changes/ as a recommendation if present — older
  // migrations may have left stale data there, but the dir itself is the
  // configured changes_dir and expected to exist.
  const repoRoot = store.paths.root;
  const inRepoChanges = repoRoot
    ? await pathExists(join(repoRoot, ".adv", "changes"))
    : false;
  // .adv/archive/ is intentional in-repo state; skip legacy flagging.
  const inRepoArchive = false;

  // rq-hygieneActionableCommands01 (#122): emit concrete shell commands the
  // operator can copy-paste rather than prose "dry-run: X detected". Each
  // recommendation is prefixed with `dry-run:` to preserve the historical
  // grep pattern, then followed by the exact command(s) on subsequent lines.
  // Operator inspects, then runs.
  if (nestedAdvDir && externalRoot) {
    recommendations.push(
      `dry-run: nested external .adv/ detected at ${externalRoot}/.adv\n` +
        `  Inspect: ls -la "${externalRoot}/.adv"\n` +
        `  Backup:  tar -czf /tmp/adv-nested-backup-$(date +%s).tar.gz -C "${externalRoot}" .adv\n` +
        `  Remove:  rm -rf "${externalRoot}/.adv"`,
    );
  }
  if (staleDbDir && externalRoot) {
    recommendations.push(
      `dry-run: stale physical db/ detected at ${externalRoot}/db (legacy SQLite)\n` +
        `  Inspect: du -sh "${externalRoot}/db" && ls "${externalRoot}/db"\n` +
        `  Backup:  tar -czf /tmp/adv-legacy-db-$(date +%s).tar.gz -C "${externalRoot}" db\n` +
        `  Remove:  rm -rf "${externalRoot}/db"`,
    );
  }
  if (emptyWorktreePrefixDirs.length > 0) {
    const list = emptyWorktreePrefixDirs.map((p) => `"${p}"`).join(" ");
    recommendations.push(
      `dry-run: ${emptyWorktreePrefixDirs.length} empty worktree branch-prefix dir(s) detected\n` +
        `  Inspect: ls -la ${list}\n` +
        `  Remove:  rmdir ${list}  # rmdir refuses non-empty; safe`,
    );
  }
  if (syntheticProjectDirs > 0 || syntheticWorktreeDirs > 0) {
    const dataHome = getDataHome();
    const projectsGlob = `"${join(dataHome, "opencode", "plugins", "advance")}/${SYNTHETIC_TEST_PROJECT_ID_PREFIX}*"`;
    const worktreesGlob = `"${join(dataHome, "opencode", "worktree")}/${SYNTHETIC_TEST_PROJECT_ID_PREFIX}*"`;
    recommendations.push(
      `dry-run: ${syntheticProjectDirs} synthetic test project dir(s) + ${syntheticWorktreeDirs} synthetic worktree dir(s) detected (prefix ${SYNTHETIC_TEST_PROJECT_ID_PREFIX})\n` +
        `  Inspect: ls -d ${projectsGlob} ${worktreesGlob}\n` +
        `  Backup:  tar -czf /tmp/adv-synthetic-backup-$(date +%s).tar.gz ${projectsGlob} ${worktreesGlob} 2>/dev/null\n` +
        `  Remove:  rm -rf ${projectsGlob} ${worktreesGlob}`,
    );
  }
  if (inRepoChanges && repoRoot) {
    recommendations.push(
      `dry-run: in-repo .adv/changes/ detected at ${repoRoot}/.adv/changes\n` +
        `  This may be legacy data. Specs (.adv/specs/) are always in-repo and OK.\n` +
        `  Inspect: ls -la "${repoRoot}/.adv/changes"\n` +
        `  Backup:  tar -czf /tmp/adv-repo-changes-backup-$(date +%s).tar.gz -C "${repoRoot}/.adv" changes\n` +
        `  Remove:  rm -rf "${repoRoot}/.adv/changes"  # after confirming specs are preserved`,
    );
  }

  return {
    dry_run_only: true,
    deletion_requires_approval: true,
    external_root: externalRoot,
    nested_adv_dir: nestedAdvDir,
    stale_db_dir: staleDbDir,
    worker_locks_excluded: true,
    synthetic_project_dirs: syntheticProjectDirs,
    synthetic_worktree_dirs: syntheticWorktreeDirs,
    empty_worktree_prefix_dirs: emptyWorktreePrefixDirs.sort((a, b) =>
      a.localeCompare(b),
    ),
    in_repo_changes: inRepoChanges,
    in_repo_archive: inRepoArchive,
    recommendations,
  };
}
export interface OpencodeDebtCounts {
  orphanGhost: number;
  liveInFlight: number;
  idleActiveSession: number;
  repairableToolPart: number;
  liveToolPart: number;
  idleToolPart: number;
}
export function computeAutoManagedCensus(
  recent: ReadonlyArray<{ worktree_auto_managed?: boolean }>,
): { auto: number; legacy: number; unmigrated: number } {
  const census = { auto: 0, legacy: 0, unmigrated: 0 };
  for (const c of recent) {
    const marker = c.worktree_auto_managed;
    if (marker === true) census.auto += 1;
    else if (marker === false) census.legacy += 1;
    else census.unmigrated += 1;
  }
  return census;
}
export function deriveOpencodeDebtCounts(
  snapshot: Awaited<ReturnType<typeof scanOpenCodeSessionDebt>>,
): OpencodeDebtCounts | null {
  if (!snapshot.available) return null;
  return {
    orphanGhost:
      (snapshot.total_orphan_ghost as number | undefined) ??
      snapshot.orphan_ghost.length,
    liveInFlight:
      (snapshot.total_live_in_flight as number | undefined) ??
      snapshot.live_in_flight.length,
    idleActiveSession:
      (snapshot.total_idle_active_session as number | undefined) ??
      snapshot.idle_active_session.length,
    repairableToolPart:
      (snapshot.total_repairable_tool_parts as number | undefined) ??
      snapshot.repairable_tool_parts?.length ??
      0,
    liveToolPart:
      (snapshot.total_live_tool_parts as number | undefined) ??
      snapshot.live_tool_parts?.length ??
      0,
    idleToolPart:
      (snapshot.total_idle_tool_parts as number | undefined) ??
      snapshot.idle_tool_parts?.length ??
      0,
  };
}
/**
 * Detect local change/* branches for archived changes that are already merged
 * into the default branch. Advisory only — no destructive action.
 */
export async function appendArchivedBranchHygieneRecommendations(
  status: StatusRecommendationCarrier & {
    archived_branch_hygiene?: ArchivedBranchHygieneSection;
  },
  store: Store,
  repoRoot: string,
  deps?: { runGit?: GitFinalizeDeps["runGit"] },
): Promise<void> {
  const archivedList = await store.changes.list({
    status: "archived",
    includeArchived: true,
  });
  if (archivedList.changes.length === 0) {
    return;
  }

  let defaultBranch: string;
  try {
    ({ branch: defaultBranch } = detectDefaultBranch(repoRoot, deps));
  } catch {
    return;
  }

  // Best-effort fetch; failure is non-blocking.
  try {
    deps?.runGit?.(repoRoot, ["fetch", "origin", defaultBranch]);
  } catch {
    // proceed with local state
  }

  const archivedChangeIds = archivedList.changes.map((c) => c.id);
  const result = detectArchivedMergedBranches(
    { repoRoot, defaultBranch, archivedChangeIds },
    { runGit: deps?.runGit },
  );
  if (result.status === "blocked" || result.branches.length === 0) {
    return;
  }

  const checkedOut = getCheckedOutChangeBranches(repoRoot, {
    runGit: deps?.runGit,
  });
  if (checkedOut.status === "blocked") {
    return;
  }

  const cleanupReadyBranches = result.branches.filter(
    (branch) => !checkedOut.branches.has(branch.branch),
  );
  if (cleanupReadyBranches.length === 0) {
    return;
  }

  const count = cleanupReadyBranches.length;
  const recommendation =
    `cleanup-ready: ${count} archived-change local branch(es) safely deletable\n` +
    `  Preview: adv_worktree_cleanup mode=archived_branches dryRun=true reason="archived branch cleanup"\n` +
    `  Delete:  adv_worktree_cleanup mode=archived_branches reason="archived branch cleanup"`;

  pushStatusRecommendation(status, {
    kind: "cleanup",
    priority: "medium",
    title: "Archived branch cleanup ready",
    detail: `${count} archived-change local branch(es) safely deletable`,
    action:
      'adv_worktree_cleanup mode=archived_branches dryRun=true reason="archived branch cleanup"',
    source: "branch_hygiene",
    message: recommendation,
  });
  status.archived_branch_hygiene = {
    count,
    branches: cleanupReadyBranches.map((b) => ({
      changeId: b.changeId,
      branch: b.branch,
      mergeProof: b.mergeProof,
    })),
    recommendation,
  };
}
