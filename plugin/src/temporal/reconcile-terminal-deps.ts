/**
 * Disk + signal wiring for `reconcileTerminalWorkflows`.
 *
 * Kept separate from the sweep logic so the sweep stays pure and testable, and
 * so the storage imports here never enter the worker-bundle graph (only
 * `workflows.ts`'s static imports are constrained; this module is not reachable
 * from it).
 */

import { listChangeDirs } from "../storage/change-projection-reader";
import { CHANGE_WORKFLOW_PREFIX } from "./contracts";
import { archiveChangeSignal } from "./messages";
import type { TerminalReconcileDeps } from "./reconcile-terminal-workflows";

/** Archive bundle directories are `YYYY-MM-DD-<changeId>`. */
const ARCHIVE_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;

/**
 * Recover the change id from an archive bundle directory name.
 *
 * Returns null only when the name carries no date prefix at all.
 *
 * Legacy slug-style bundles (`2026-01-26-add-runtime-enf-qzFE`) yield their
 * truncated slug-plus-hash rather than a real change id. That string never
 * matches a running workflow id, so those bundles contribute no evidence and
 * their workflows are left alone. Membership is therefore exact, never fuzzy —
 * a near-match must not be able to complete a workflow.
 */
export function archiveDirToChangeId(dir: string): string | null {
  if (!ARCHIVE_DATE_PREFIX.test(dir)) return null;
  const rest = dir.replace(ARCHIVE_DATE_PREFIX, "");
  return rest.length > 0 ? rest : null;
}

/** Change ids with an archive bundle on disk (positive terminal evidence). */
export async function listArchivedChangeIdsFromDisk(
  archiveDir: string | undefined,
): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();
  if (!archiveDir) return ids;
  try {
    for (const dir of await listChangeDirs(archiveDir)) {
      const id = archiveDirToChangeId(dir);
      if (id) ids.add(id);
    }
  } catch {
    // Unreadable archive dir yields NO evidence, so nothing is reconciled.
    // Failing closed is the only safe direction here.
    return new Set();
  }
  return ids;
}

/** Change ids still present as active changes (absolute veto). */
export async function listActiveChangeIdsFromDisk(
  changesDir: string | undefined,
): Promise<ReadonlySet<string>> {
  if (!changesDir) return new Set();
  try {
    return new Set(await listChangeDirs(changesDir));
  } catch {
    // Unknown active set — treat as "cannot prove inactive" by vetoing all.
    return new Set();
  }
}

export interface TerminalSignalClient {
  workflow: {
    getHandle: (workflowId: string) => {
      signal: (sig: unknown) => Promise<void>;
    };
  };
}

export function buildChangeWorkflowId(
  projectId: string,
  changeId: string,
): string {
  return `${CHANGE_WORKFLOW_PREFIX}${projectId}/${changeId}`;
}

/**
 * Build the deps for a real sweep.
 *
 * `fireTerminal` sends the reducer-only `archiveChangeSignal`: it flips
 * `state.status` to `"archived"` and runs no activity, which is exactly what
 * the workflow's terminal `wf.condition` predicate is waiting for. Signals are
 * accepted by the server without a live poller, so this also settles workflows
 * on queues that adoption has not reached yet.
 */
export function buildTerminalReconcileDeps(input: {
  projectId: string;
  archiveDir: string | undefined;
  changesDir: string | undefined;
  client: TerminalSignalClient;
}): TerminalReconcileDeps {
  return {
    listArchivedChangeIds: () =>
      listArchivedChangeIdsFromDisk(input.archiveDir),
    listActiveChangeIds: () => listActiveChangeIdsFromDisk(input.changesDir),
    fireTerminal: async (changeId: string) => {
      const handle = input.client.workflow.getHandle(
        buildChangeWorkflowId(input.projectId, changeId),
      );
      await handle.signal(archiveChangeSignal);
    },
  };
}
