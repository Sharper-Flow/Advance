/**
 * Disk + signal wiring for `reconcileTerminalWorkflows`.
 *
 * Kept separate from the sweep logic so the sweep stays pure and testable, and
 * so the storage imports here never enter the worker-bundle graph (only
 * `workflows.ts`'s static imports are constrained; this module is not reachable
 * from it).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listChangeDirs } from "../storage/change-projection-reader";
import { archiveChangeSignal } from "./messages";
import type { TemporalOperations } from "./operations";
import type { TerminalReconcileDeps } from "./reconcile-terminal-workflows";
import { getChangeHandle } from "../tools/_adapters";

/** Change statuses that mean the workflow SHOULD have completed. */
const TERMINAL_STATUSES = new Set(["archived", "closed"]);

/**
 * Status of every change present in the projection directory.
 *
 * Directory PRESENCE is not a liveness signal: the projection retains terminal
 * changes (measured in production: 96 draft, 28 archived, 4 closed all sitting
 * side by side). Reading the authoritative `status` field is the only correct
 * way to tell an active change from a terminal one — inferring it from the
 * directory listing silently vetoes every archived change that has not been
 * pruned yet.
 *
 * Unreadable or unparseable entries map to `"unknown"`, which is treated as
 * ACTIVE downstream so the sweep fails closed.
 */
async function readChangeStatuses(
  changesDir: string | undefined,
): Promise<Map<string, string>> {
  const statuses = new Map<string, string>();
  if (!changesDir) return statuses;
  let dirs: string[];
  try {
    dirs = await listChangeDirs(changesDir);
  } catch {
    return statuses;
  }
  await Promise.all(
    dirs.map(async (changeId) => {
      try {
        const raw = await readFile(
          join(changesDir, changeId, "change.json"),
          "utf8",
        );
        const parsed = JSON.parse(raw) as { status?: unknown };
        statuses.set(
          changeId,
          typeof parsed.status === "string" ? parsed.status : "unknown",
        );
      } catch {
        statuses.set(changeId, "unknown");
      }
    }),
  );
  return statuses;
}

/** True when this projected status means the workflow should be completed. */
export function isTerminalChangeStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

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

/**
 * Change ids that are NOT terminal, from the projection's `status` field.
 *
 * Anything whose status is missing, unreadable or unrecognised counts as
 * active, so ambiguity always vetoes rather than completes a workflow.
 */
export function activeChangeIdsFromStatuses(
  statuses: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const active = new Set<string>();
  for (const [changeId, status] of statuses) {
    if (!isTerminalChangeStatus(status)) active.add(changeId);
  }
  return active;
}

/** Change ids the projection marks terminal (positive evidence). */
export function terminalChangeIdsFromStatuses(
  statuses: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const terminal = new Set<string>();
  for (const [changeId, status] of statuses) {
    if (isTerminalChangeStatus(status)) terminal.add(changeId);
  }
  return terminal;
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
  owner: TemporalOperations;
}): TerminalReconcileDeps {
  // One projection read per sweep, shared by both lookups.
  let statusesPromise: Promise<Map<string, string>> | null = null;
  const statuses = () => {
    statusesPromise ??= readChangeStatuses(input.changesDir);
    return statusesPromise;
  };

  return {
    listArchivedChangeIds: async () => {
      const ids = new Set(
        await listArchivedChangeIdsFromDisk(input.archiveDir),
      );
      // The projection's own `status` is stronger evidence than a bundle
      // directory name: it survives legacy bundle naming, and it is exactly
      // what the workflow itself would have observed had the signal landed.
      for (const id of terminalChangeIdsFromStatuses(await statuses())) {
        ids.add(id);
      }
      return ids;
    },
    listActiveChangeIds: async () =>
      activeChangeIdsFromStatuses(await statuses()),
    fireTerminal: async (changeId: string) => {
      const handle = getChangeHandle(input.owner, input.projectId, changeId);
      await handle.signal(archiveChangeSignal);
    },
  };
}
