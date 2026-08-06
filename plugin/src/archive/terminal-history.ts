/**
 * Terminal History Rendering
 *
 * Non-authoritative archived/closed history projection. Reads versioned
 * lightweight terminal summaries (`summary.v1.json`) from archive bundles when
 * available, falls back once to the durable legacy `change.json`, and produces
 * typed degradation when neither source yields a valid terminal row.
 *
 * This path runs under a separate fixed 20-second aggregate deadline; it does
 * not participate in active conflict authority and does not depend on memo or
 * cache warmth for correctness.
 *
 * rq-terminalSummary01 rq-terminalHistoryBudget01
 */

// rq-terminalHistoryBudget01

import { createHash } from "node:crypto";
import { join } from "node:path";
import { listChangeDirs, loadChange, isSchemaError } from "../storage/json";
import { readBoundedProjectionDocument } from "../storage/change-projection-reader";
import { computeLastActivity, firstOpenGate } from "../storage/store-types";
import {
  TERMINAL_SUMMARY_FILE,
  type TerminalArchiveSummary,
  validateTerminalArchiveSummary,
  verifyTerminalArchiveSummaryHash,
} from "./terminal-summary";
import { createLogger } from "../utils/debug-log";
import type {
  Change,
  ChangeLifecycleState,
  FastFollowOf,
  GateId,
  HydrationStats,
  OpsFollowupLink,
  OpsFollowupProfile,
  TerminalSource,
  TerminalWarning,
} from "../types";
import type { EpicMembership } from "../types/epics";
import type { ProjectionDocumentReadOutcome } from "../storage/change-projection-reader";

export const TERMINAL_HISTORY_DEADLINE_BUDGET_MS = 20_000;

interface ReadDeadline {
  readonly budgetMs: number;
  readonly deadlineAt: number;
}

class ReadDeadlineExceededError extends Error {
  override readonly name = "ReadDeadlineExceeded";

  constructor(public readonly timeoutMs: number) {
    super(`Disk terminal history read exceeded ${timeoutMs}ms budget`);
  }
}

function createReadDeadline(budgetMs: number): ReadDeadline {
  return { budgetMs, deadlineAt: Date.now() + budgetMs };
}

function remainingReadDeadlineMs(deadline: ReadDeadline): number {
  return deadline.deadlineAt - Date.now();
}

function projectionReadError(
  outcome: Exclude<ProjectionDocumentReadOutcome, { kind: "ok" }>,
  label: string,
): string {
  if (outcome.kind === "not_found") return `${label} not found`;
  if (outcome.kind === "oversized")
    return `${label} oversized: ${outcome.actual} > ${outcome.limit} bytes`;
  return `${label} ${outcome.kind}: ${outcome.error}`;
}

const logger = createLogger("terminal-history");

export interface TerminalHistoryRow {
  id: string;
  title: string;
  status: "archived" | "closed";
  currentGate: GateId | "done";
  lifecycleState?: ChangeLifecycleState;
  created_at: string;
  lastActivityAt: string;
  taskCount: number;
  completedTasks: number;
  capabilities: string[];
  fast_follow_of?: FastFollowOf;
  ops_followup?: OpsFollowupProfile;
  ops_followup_links?: OpsFollowupLink[];
  epic_membership?: EpicMembership;
}

export interface RenderTerminalHistoryOptions {
  archivePath?: string;
  changesPath?: string;
  includeArchived?: boolean;
  includeClosed?: boolean;
  deadline?: ReadDeadline;
}

export interface TerminalHistoryRenderResult {
  changes: TerminalHistoryRow[];
  warnings: TerminalWarning[];
  hydrationStats: HydrationStats;
}

async function raceWithDeadline<T>(
  op: Promise<T>,
  deadline: ReadDeadline,
): Promise<T> {
  const remaining = remainingReadDeadlineMs(deadline);
  if (remaining <= 0) {
    throw new ReadDeadlineExceededError(deadline.budgetMs);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new ReadDeadlineExceededError(deadline.budgetMs)),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseSummary(raw: string): TerminalArchiveSummary | undefined {
  try {
    return validateTerminalArchiveSummary(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function summaryToRow(summary: TerminalArchiveSummary): TerminalHistoryRow {
  return {
    id: summary.change_id,
    title: summary.title,
    status: summary.status,
    currentGate: summary.current_gate,
    lifecycleState: summary.lifecycle_state,
    created_at: summary.created_at,
    lastActivityAt: summary.last_activity_at,
    taskCount: summary.task_count,
    completedTasks: summary.completed_tasks,
    capabilities: summary.capabilities,
    fast_follow_of: summary.fast_follow_of,
    ops_followup: summary.ops_followup,
    ops_followup_links: summary.ops_followup_links,
    epic_membership: summary.epic_membership,
  };
}

function changeToRow(change: Change): TerminalHistoryRow {
  const status = change.status === "closed" ? "closed" : "archived";
  return {
    id: change.id,
    title: change.title,
    status,
    currentGate: firstOpenGate(change.gates),
    lifecycleState: change.lifecycleState,
    created_at: change.created_at,
    lastActivityAt: computeLastActivity(change),
    taskCount: change.tasks.length,
    completedTasks: change.tasks.filter((t) => t.status === "done").length,
    capabilities: Object.keys(change.deltas).sort((a, b) => a.localeCompare(b)),
    fast_follow_of: change.fast_follow_of,
    ops_followup: change.ops_followup,
    ops_followup_links: change.ops_followup_links,
    epic_membership: change.epic_membership,
  };
}

async function loadArchiveBundleRow(
  archivePath: string,
  bundleDir: string,
  deadline: ReadDeadline,
): Promise<TerminalHistoryRow | null> {
  const bundlePath = join(archivePath, bundleDir);

  try {
    const summaryRead = await raceWithDeadline(
      readBoundedProjectionDocument(join(bundlePath, TERMINAL_SUMMARY_FILE)),
      deadline,
    );
    if (summaryRead.kind !== "ok") {
      throw new Error(
        projectionReadError(summaryRead, `Terminal summary for ${bundleDir}`),
      );
    }
    const summary = parseSummary(summaryRead.content);
    if (summary && verifyTerminalArchiveSummaryHash(summary)) {
      const changeJsonRead = await raceWithDeadline(
        readBoundedProjectionDocument(join(bundlePath, "change.json")),
        deadline,
      );
      if (changeJsonRead.kind !== "ok") {
        throw new Error(
          projectionReadError(
            changeJsonRead,
            `Bundle change.json for ${bundleDir}`,
          ),
        );
      }
      const changeHash = createHash("sha256")
        .update(changeJsonRead.content, "utf-8")
        .digest("hex");
      if (summary.change_hash !== changeHash) {
        throw new Error(
          "Terminal summary change_hash does not match change.json",
        );
      }
      return summaryToRow(summary);
    }
  } catch (err) {
    if (err instanceof ReadDeadlineExceededError) throw err;
    // Fall through to legacy change.json exactly once.
  }

  try {
    const loaded = await raceWithDeadline(
      loadChange(archivePath, bundleDir),
      deadline,
    );
    if (isSchemaError(loaded)) {
      throw new Error(loaded.error);
    }
    if (
      loaded.success &&
      loaded.data &&
      (loaded.data.status === "archived" || loaded.data.status === "closed")
    ) {
      return changeToRow(loaded.data);
    }
  } catch (err) {
    if (err instanceof ReadDeadlineExceededError) throw err;
  }

  return null;
}

async function loadDiskTerminalRow(
  changesPath: string,
  dir: string,
  deadline: ReadDeadline,
  archivePath: string | undefined,
  archiveBundleDirs: string[],
): Promise<TerminalHistoryRow | null> {
  const loaded = await raceWithDeadline(loadChange(changesPath, dir), deadline);
  if (isSchemaError(loaded)) {
    throw new Error(loaded.error);
  }
  if (!loaded.success || !loaded.data) return null;
  const change = loaded.data;
  if (change.status !== "archived" && change.status !== "closed") {
    return null;
  }

  if (change.status === "archived" && archivePath) {
    const latestBundle = findLatestMatchingBundle(archiveBundleDirs, change.id);
    if (latestBundle) {
      try {
        const fromArchive = await loadArchiveBundleRow(
          archivePath,
          latestBundle,
          deadline,
        );
        if (fromArchive) return fromArchive;
      } catch (err) {
        if (err instanceof ReadDeadlineExceededError) throw err;
      }
    }
  }

  return changeToRow(change);
}

function findLatestMatchingBundle(
  archiveBundleDirs: string[],
  changeId: string,
): string | null {
  const matches = archiveBundleDirs
    .filter((dir) => dir === changeId || dir.endsWith(`-${changeId}`))
    .sort((a, b) => b.localeCompare(a));
  return matches[0] ?? null;
}

export function extractCandidateIdFromArchiveDir(dir: string): string {
  const datePrefixMatch = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(dir);
  if (datePrefixMatch?.[1]) return datePrefixMatch[1];
  return dir;
}

/**
 * Render a non-authoritative archived/closed history from durable disk/archive
 * projections without full Change hydration.
 *
 * The caller is responsible for selecting a status filter; this function only
 * returns terminal rows. Active candidates are ignored.
 */
export async function renderTerminalHistory(
  options: RenderTerminalHistoryOptions,
): Promise<TerminalHistoryRenderResult> {
  const deadline =
    options.deadline ?? createReadDeadline(TERMINAL_HISTORY_DEADLINE_BUDGET_MS);
  const expired = (): boolean => remainingReadDeadlineMs(deadline) <= 0;

  const rows = new Map<string, TerminalHistoryRow>();
  const archiveOmittedIds: string[] = [];
  const diskOmittedIds: string[] = [];
  const degradedSources = new Set<TerminalSource>();
  const deadlineSources = new Set<TerminalSource>();
  let deadlineExceeded = false;

  const markDeadline = (source: TerminalSource): void => {
    deadlineExceeded = true;
    deadlineSources.add(source);
  };

  let archiveBundleDirs: string[] = [];
  if (options.includeArchived && options.archivePath) {
    try {
      archiveBundleDirs = await raceWithDeadline(
        listChangeDirs(options.archivePath),
        deadline,
      );
    } catch (err) {
      const hitDeadline = err instanceof ReadDeadlineExceededError || expired();
      degradedSources.add("archive");
      if (hitDeadline) markDeadline("archive");
      logger.warn(
        `Archive directory enumeration failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  archiveBundleDirs.sort((a, b) => b.localeCompare(a));

  for (let i = 0; i < archiveBundleDirs.length; i++) {
    const dir = archiveBundleDirs[i];
    if (expired()) {
      markDeadline("archive");
      archiveOmittedIds.push(
        ...archiveBundleDirs.slice(i).map(extractCandidateIdFromArchiveDir),
      );
      break;
    }
    try {
      const row = await loadArchiveBundleRow(
        options.archivePath!,
        dir,
        deadline,
      );
      if (row && !rows.has(row.id)) {
        rows.set(row.id, row);
      } else if (!row) {
        archiveOmittedIds.push(extractCandidateIdFromArchiveDir(dir));
      }
    } catch (err) {
      if (err instanceof ReadDeadlineExceededError || expired()) {
        markDeadline("archive");
        archiveOmittedIds.push(
          ...archiveBundleDirs.slice(i).map(extractCandidateIdFromArchiveDir),
        );
        break;
      }
      archiveOmittedIds.push(extractCandidateIdFromArchiveDir(dir));
    }
  }

  let activeDiskDirs: string[] = [];
  if (options.includeClosed && options.changesPath) {
    try {
      activeDiskDirs = await raceWithDeadline(
        listChangeDirs(options.changesPath),
        deadline,
      );
    } catch (err) {
      const hitDeadline = err instanceof ReadDeadlineExceededError || expired();
      degradedSources.add("active_disk");
      if (hitDeadline) markDeadline("active_disk");
      logger.warn(
        `Active disk directory enumeration failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  for (let i = 0; i < activeDiskDirs.length; i++) {
    const dir = activeDiskDirs[i];
    if (expired()) {
      markDeadline("active_disk");
      diskOmittedIds.push(...activeDiskDirs.slice(i));
      break;
    }
    try {
      const row = await loadDiskTerminalRow(
        options.changesPath!,
        dir,
        deadline,
        options.archivePath,
        archiveBundleDirs,
      );
      if (row && !rows.has(row.id)) {
        rows.set(row.id, row);
      }
      // Non-terminal active rows are not omissions.
    } catch (err) {
      if (err instanceof ReadDeadlineExceededError || expired()) {
        markDeadline("active_disk");
        diskOmittedIds.push(...activeDiskDirs.slice(i));
        break;
      }
      diskOmittedIds.push(dir);
    }
  }

  const resultRows = Array.from(rows.values());
  const terminalFromArchive = resultRows.filter(
    (r) => r.status === "archived",
  ).length;
  const terminalFromDisk = resultRows.filter(
    (r) => r.status === "closed",
  ).length;
  const omitted = archiveOmittedIds.length + diskOmittedIds.length;
  const terminalCandidates = archiveBundleDirs.length + activeDiskDirs.length;

  const warnings: TerminalWarning[] = [];
  for (const source of degradedSources) {
    warnings.push({
      code: "TERMINAL_SOURCE_DEGRADED",
      source,
      message: `Terminal ${source} source could not be enumerated; rows may be incomplete.`,
    });
  }
  if (deadlineExceeded) {
    const sources =
      deadlineSources.size > 0
        ? Array.from(deadlineSources)
        : (["archive"] as TerminalSource[]);
    for (const source of sources) {
      warnings.push({
        code: "SOURCE_DEADLINE_EXCEEDED",
        source,
        message: `Terminal history deadline (${deadline.budgetMs}ms) exceeded while resolving ${source}; results are incomplete.`,
        omittedCount:
          source === "archive"
            ? archiveOmittedIds.length
            : diskOmittedIds.length,
        omittedIds:
          source === "archive"
            ? archiveOmittedIds.slice(0, 20)
            : diskOmittedIds.slice(0, 20),
      });
    }
  }
  if (archiveOmittedIds.length > 0) {
    warnings.push({
      code: "TERMINAL_CANDIDATE_OMITTED",
      source: "archive",
      message: `${archiveOmittedIds.length} terminal archive candidate(s) could not be loaded from any available source.`,
      omittedCount: archiveOmittedIds.length,
      omittedIds: archiveOmittedIds.slice(0, 20),
    });
  }
  if (diskOmittedIds.length > 0) {
    warnings.push({
      code: "TERMINAL_CANDIDATE_OMITTED",
      source: "active_disk",
      message: `${diskOmittedIds.length} terminal active-disk candidate(s) could not be loaded from any available source.`,
      omittedCount: diskOmittedIds.length,
      omittedIds: diskOmittedIds.slice(0, 20),
    });
  }

  const hydrationStats: HydrationStats = {
    terminalCandidates,
    terminalFromArchive,
    terminalFromDisk,
    omitted,
    ...(deadlineExceeded ? { deadlineExceeded: true } : {}),
  };

  return {
    changes: resultRows,
    warnings,
    hydrationStats,
  };
}
