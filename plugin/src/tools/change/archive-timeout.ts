/**
 * Typed timeout classifier for adv_change_archive.
 *
 * fixArchiveTerminalProjection SC3/AC4: adv_change_archive is bundle-first
 * (rq-archiveRetirement01 / rq-archiveOrdering01). When the safety-net tool
 * timeout fires AFTER the archive bundle is durable on disk, the only work
 * remaining work includes immutable spec projection proof before terminal
 * state. An idempotent re-run routes through that shared proof gate. The caller
 * must receive a typed "still_finalizing / re-run to reconcile" result
 * instead of a bare ToolExecutionTimeout (aligns rq-terminalAggregateRead01:
 * structural degradation, not an unclassified whole-tool timeout).
 *
 * When no durable bundle is found, the classifier declines (undefined) so
 * the generic timeout response surfaces the real failure (DONT2: never
 * mask a genuine archive failure as recoverable).
 *
 * Probe discipline: disk-only. After a timeout the underlying operation may be
 * the thing that hung; the classifier must not issue workflow queries or
 * git operations that could hang a second time.
 */

import { join } from "path";
import { findArchiveBundle } from "../../archive/archive";
import type { Store } from "../../storage/store-types";
import { formatToolOutput } from "../../utils/tool-output";

/** Loose arg shape — the classifier must tolerate malformed tool args. */
export interface ArchiveTimeoutArgs {
  changeId?: unknown;
  worktreePath?: unknown;
  target_path?: unknown;
}

export interface FormatArchiveTimeoutInput {
  store: Store;
  args: ArchiveTimeoutArgs;
  /** The expired safety-net budget, echoed back for diagnosis. */
  timeoutMs: number;
}

/**
 * Candidate archive roots a durable bundle may live under, in priority
 * order. Covers both native and target_path routing:
 *
 *   1. External archive root of the active store (native archive).
 *   2. In-repo mirror under an explicit worktreePath (phase-9 worktree
 *      archives; also correct for target_path when worktreePath points
 *      into the target repo).
 *   3. In-repo mirror under target_path (cross-project archive routed
 *      through the caller's session).
 *   4. In-repo mirror under the store root (native main checkout).
 */
function candidateArchiveDirs(
  store: Store,
  args: ArchiveTimeoutArgs,
): string[] {
  const dirs: string[] = [];
  const externalArchive = store.paths?.archive;
  if (typeof externalArchive === "string" && externalArchive.length > 0) {
    dirs.push(externalArchive);
  }
  if (typeof args.worktreePath === "string" && args.worktreePath.length > 0) {
    dirs.push(join(args.worktreePath, ".adv", "archive"));
  }
  if (typeof args.target_path === "string" && args.target_path.length > 0) {
    dirs.push(join(args.target_path, ".adv", "archive"));
  }
  const root = store.paths?.root;
  if (typeof root === "string" && root.length > 0) {
    dirs.push(join(root, ".adv", "archive"));
  }
  return [...new Set(dirs)];
}

export async function formatArchiveTimeoutResult(
  input: FormatArchiveTimeoutInput,
): Promise<string | undefined> {
  const { store, args, timeoutMs } = input;
  const changeId =
    typeof args.changeId === "string" && args.changeId.length > 0
      ? args.changeId
      : undefined;
  if (!changeId) return undefined;

  let archivePath: string | null = null;
  for (const dir of candidateArchiveDirs(store, args)) {
    try {
      archivePath = await findArchiveBundle(dir, changeId);
    } catch {
      archivePath = null;
    }
    if (archivePath) break;
  }
  if (!archivePath) return undefined;

  return formatToolOutput({
    success: false,
    error:
      `Archive interrupted: adv_change_archive exceeded its ${timeoutMs}ms ` +
      `safety-net budget after the archive bundle for '${changeId}' was ` +
      "written. The bundle is durable, but accepted delta projection and " +
      "terminal state may still require immutable proof.",
    errorClass: "ToolExecutionTimeout",
    tool: "adv_change_archive",
    changeId,
    archiveStatus: "still_finalizing",
    bundleDurable: true,
    projectionStatus: "unverified_after_timeout",
    archivePath,
    timeoutMs,
    retrySafe: true,
    retryRoute: "through_shared_projection_proof_gate",
    requirement: "rq-archiveDeltaReconciliation01",
    remediation:
      "Re-run adv_change_archive with the same arguments. The archive " +
      "bundle is durable on disk, so the idempotent re-run reuses it, reconciles any " +
      "proven-safe missing projection in the trusted worktree, verifies the " +
      "immutable released commit, then re-drives terminal state. If the change already reads as " +
      "archived, the re-run is a bounded metadata reconcile.",
    hint: "Re-run adv_change_archive (same changeId, worktreePath, and target_path if used). Do not start a new archive or delete the bundle.",
  });
}
