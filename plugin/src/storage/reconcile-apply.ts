/**
 * Store reconcile mutation dispatcher.
 *
 * Exit-code mapping: 0 complete; 2 target/usage resolution; 3 corrupt input;
 * 4 live worker/reconcile lock; 5 partial record failure; 6 stale plan.
 * Concrete class executors are wired into ACTION_EXECUTORS as they are
 * delivered; undelivered entries fall back to notImplementedExecutor while
 * retaining this seam and its guards.
 */

import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { coordinateChangeMutation } from "../tools/change-mutation-coordinator";
import { isProcessAlive } from "../utils/process-liveness";
import { acquireFileLock } from "../utils/fs";
import {
  advanceLegacyToCanonicalExecutor,
  reportOnlyExecutor,
} from "./reconcile-action-legacy-envelope";
import {
  migrateRecordExecutor,
  classifyTerminalNoopExecutor,
  setMarkerAutoExecutor,
  setMarkerLegacyExecutor,
} from "./reconcile-action-artifact-metadata";
import {
  reconstructFromChildFragmentsExecutor,
  formallyLostReportExecutor,
  clearDanglingMembershipExecutor,
  backfillEpicEntryFromFragmentExecutor,
} from "./reconcile-action-epic-recovery";
import {
  normalizeAndRestoreExecutor,
  remainQuarantinedReportedExecutor,
  quarantineToTrashExecutor,
} from "./reconcile-action-quarantine";
import {
  normalizeEnumMappingExecutor,
  quarantineRecordExecutor,
} from "./reconcile-action-schema-drift";
import {
  rebuildFromChangesExecutor,
  rebuildSummaryShardExecutor,
} from "./reconcile-action-summary";
import {
  appendReconcileAudit,
  type ReconcileAuditEvent,
  type ReconcileAuditResult,
} from "./reconcile-audit";
import {
  buildReconcilePlan,
  type ReconcileAction,
  type ReconcilePlan,
  type ReconcilePlanRecord,
  type ReconcileReceipt,
  type ReconcileRunReport,
  detectFollowUpRuns,
  type StoreResidueScan,
} from "./reconcile-plan";
import {
  computeReconcileCompletionProof,
  runUnboundedProjectionDivergenceScan,
  type ReconcileCompletionProof,
} from "./reconcile-proof";
import type { ProjectionDivergenceScan } from "./projection-health";
import type { SummaryIndexPaths } from "./change-summary-shard";
import { runStoreResidueScan } from "./store-residue-scan";
import {
  deriveRunStatus,
  readReconcileProgress,
  readReconcileReceipts,
  rebuildProgressFromReceipts,
  writeReconcileProgress,
  writeReconcileReceipt,
  writeReconcileRunReport,
} from "./reconcile-report";
import type { ProjectPaths } from "./json";
import {
  loadActiveEpicProjection,
  saveActiveEpicProjection,
} from "./epic-projection";
import { createEpicDiskOps } from "./epics-disk";
import type { Epic } from "../types";
import type {
  ActionContext,
  ActionExecutor,
  ActionOutcome,
  EpicSaveResult,
} from "./reconcile-action-types";
export const RECONCILE_BATCH_SIZE = 50;
export const RECONCILE_LOCK_TIMEOUT_MS = 100;

export type ReconcileErrorClass =
  | "target_store_resolution"
  | "stale_plan"
  | "worker_lock_live"
  | "reconcile_lock_contention"
  | "corrupt_input"
  | "budget_exceeded"
  | "resume_cursor_invalid";

export class ReconcileRefusalError extends Error {
  readonly error_class: ReconcileErrorClass;
  readonly exit_code: 2 | 3 | 4 | 5 | 6;
  readonly resume_from?: string;
  readonly continuation_cursor?: string;
  readonly report?: ReconcileRunReport;
  constructor(
    errorClass: ReconcileErrorClass,
    message: string,
    details: {
      resume_from?: string;
      continuation_cursor?: string;
      report?: ReconcileRunReport;
    } = {},
  ) {
    super(message);
    this.name = "ReconcileRefusalError";
    this.error_class = errorClass;
    this.resume_from = details.resume_from;
    this.continuation_cursor = details.continuation_cursor;
    this.report = details.report;
    this.exit_code =
      errorClass === "target_store_resolution"
        ? 2
        : errorClass === "corrupt_input"
          ? 3
          : errorClass === "stale_plan"
            ? 6
            : errorClass === "budget_exceeded"
              ? 5
              : 4;
  }
}

export class ReconcilePartialFailureError extends Error {
  readonly error_class = "partial_failure" as const;
  readonly exit_code = 5 as const;

  constructor(message: string) {
    super(message);
    this.name = "ReconcilePartialFailureError";
  }
}

export const notImplementedExecutor: ActionExecutor = async () => ({
  status: "failed",
  error_class: "executor_not_registered",
});

const ACTION_NAMES = [
  "normalize_enum_mapping",
  "quarantine_record",
  "rebuild_summary_shard",
  "advance_legacy_to_canonical",
  "report_only",
  "migrate_record",
  "classify_terminal_noop",
  "set_marker_auto",
  "set_marker_legacy",
  "reconstruct_from_child_fragments",
  "formally_lost_report",
  "clear_dangling_membership",
  "backfill_epic_entry_from_fragment",
  "normalize_and_restore",
  "remain_quarantined_reported",
  "quarantine_to_trash",
  "rebuild_from_changes",
] as const;

const STUB_ACTION_EXECUTORS = Object.fromEntries(
  ACTION_NAMES.map((name) => [name, notImplementedExecutor]),
) as Record<ReconcileAction["action"], ActionExecutor>;

export const ACTION_EXECUTORS: Record<
  ReconcileAction["action"],
  ActionExecutor
> = {
  ...STUB_ACTION_EXECUTORS,
  normalize_enum_mapping: normalizeEnumMappingExecutor,
  quarantine_record: quarantineRecordExecutor,
  rebuild_summary_shard: rebuildSummaryShardExecutor,
  rebuild_from_changes: rebuildFromChangesExecutor,
  advance_legacy_to_canonical: advanceLegacyToCanonicalExecutor,
  report_only: reportOnlyExecutor,
  migrate_record: migrateRecordExecutor,
  classify_terminal_noop: classifyTerminalNoopExecutor,
  set_marker_auto: setMarkerAutoExecutor,
  set_marker_legacy: setMarkerLegacyExecutor,
  reconstruct_from_child_fragments: reconstructFromChildFragmentsExecutor,
  formally_lost_report: formallyLostReportExecutor,
  clear_dangling_membership: clearDanglingMembershipExecutor,
  backfill_epic_entry_from_fragment: backfillEpicEntryFromFragmentExecutor,
  normalize_and_restore: normalizeAndRestoreExecutor,
  remain_quarantined_reported: remainQuarantinedReportedExecutor,
  quarantine_to_trash: quarantineToTrashExecutor,
};

export async function executeRecordAction(
  record: ReconcilePlanRecord,
  action: ReconcileAction,
  ctx: ActionContext,
): Promise<ActionOutcome> {
  const executor =
    ctx.executorRegistry?.[action.action] ?? ACTION_EXECUTORS[action.action];
  return executor(record, action, ctx);
}

function hashBytes(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function storeRoot(paths: ProjectPaths): string {
  return paths.external ?? dirname(paths.changes);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function probeWorkerLock(
  paths: ProjectPaths,
): Promise<{ present: boolean; live: boolean | null; pid: number | null }> {
  const path = join(storeRoot(paths), "worker.lock");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { present: false, live: null, pid: null };
  }
  try {
    const parsed = JSON.parse(raw) as { pid?: unknown };
    const pid = typeof parsed.pid === "number" ? parsed.pid : null;
    return {
      present: true,
      live: pid === null ? null : isProcessAlive(pid),
      pid,
    };
  } catch {
    return { present: true, live: null, pid: null };
  }
}

async function validateInputArtifacts(paths: ProjectPaths): Promise<void> {
  const candidates = [
    paths.artifactMetadataMigrationMarker,
    join(dirname(paths.quarantineChanges), "manifest.json"),
    join(paths.quarantineChanges, "manifest.json"),
  ];
  for (const path of candidates) {
    if (!(await fileExists(path))) continue;
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (value === null || typeof value !== "object")
        throw new Error("root must be an object or array");
      if (
        path === paths.artifactMetadataMigrationMarker &&
        (value as { version?: unknown }).version !== 1
      ) {
        throw new Error("unsupported migration marker version");
      }
    } catch (error) {
      throw new ReconcileRefusalError(
        "corrupt_input",
        `corrupt reconcile input ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export async function saveEpicOptimistic(
  activeEpicsDir: string | undefined,
  epicId: string,
  nextEpic: Epic,
  expectedVersion?: number,
): Promise<EpicSaveResult> {
  if (!activeEpicsDir)
    return {
      status: "skipped",
      reason: "active Epic projection directory is unavailable",
    };
  const first = await loadActiveEpicProjection(activeEpicsDir, epicId);
  if (!first.success) return { status: "skipped", reason: first.error };
  if (
    first.data &&
    expectedVersion !== undefined &&
    first.data.version !== expectedVersion
  ) {
    return { status: "skipped", reason: "Epic version changed before save" };
  }
  const second = await loadActiveEpicProjection(activeEpicsDir, epicId);
  if ((first.data === null) !== (second.success && second.data === null)) {
    return {
      status: "skipped",
      reason: "live Epic projection appeared during create-if-absent re-check",
    };
  }
  if (
    second.success &&
    second.data &&
    first.data &&
    second.data.version !== first.data.version
  ) {
    return {
      status: "skipped",
      reason: "Epic version changed during optimistic re-check",
    };
  }
  await saveActiveEpicProjection(activeEpicsDir, nextEpic);
  const after = await loadActiveEpicProjection(activeEpicsDir, epicId);
  if (!after.success || !after.data)
    return { status: "skipped", reason: "Epic save could not be verified" };
  return { status: "saved", epic: after.data };
}

export function reconcileExitCode(report: ReconcileRunReport): 0 | 5 {
  return report.counters.failed > 0 || report.proof?.complete !== true ? 5 : 0;
}

function runDir(paths: ProjectPaths, runId: string): string {
  return join(paths.reconcileDir, "runs", runId);
}

function freshPlan(scan: StoreResidueScan): ReconcilePlan {
  return buildReconcilePlan(scan);
}

export interface ReconcileApplyDeps {
  scan?: (
    paths: ProjectPaths,
    options?: {
      resumeAfter?: string;
      localProjectId?: string | null;
    },
  ) => Promise<StoreResidueScan>;
  localProjectId?: string | null;
  actionExecutors?: Partial<Record<ReconcileAction["action"], ActionExecutor>>;
  auditWriter?: (
    event: ReconcileAuditEvent,
  ) => Promise<ReconcileAuditResult | void>;
  runId?: () => string;
  now?: () => string;
  completionProof?: (
    paths: SummaryIndexPaths,
    before?: ProjectionDivergenceScan,
  ) => Promise<ReconcileCompletionProof>;
}

export interface RunReconcileApplyOptions {
  storePaths: ProjectPaths;
  plan: ReconcilePlan;
  planHash: string;
  confirmPlanHash: string;
  mode: "apply";
  resumeFromRunId?: string;
  deps?: ReconcileApplyDeps;
}

export async function runReconcileApply({
  storePaths,
  plan,
  planHash,
  confirmPlanHash,
  mode,
  resumeFromRunId,
  deps = {},
}: RunReconcileApplyOptions): Promise<ReconcileRunReport> {
  const requiredPathKeys = [
    "changes",
    "reconcileDir",
    "artifactMetadataMigrationMarker",
    "quarantineChanges",
    "activeEpics",
  ] as const;
  if (
    !storePaths ||
    requiredPathKeys.some(
      (key) =>
        typeof storePaths[key] !== "string" || storePaths[key].length === 0,
    )
  ) {
    throw new ReconcileRefusalError(
      "target_store_resolution",
      "target store paths are unresolved",
    );
  }
  if (
    mode !== "apply" ||
    planHash !== plan.plan_hash ||
    confirmPlanHash !== plan.plan_hash
  ) {
    throw new ReconcileRefusalError(
      "stale_plan",
      "apply requires confirmation of the supplied plan_hash",
    );
  }

  const resumeDir = resumeFromRunId
    ? runDir(storePaths, resumeFromRunId)
    : null;
  const resumeProgress = resumeDir
    ? await readReconcileProgress(resumeDir)
    : null;
  const resumeAfter =
    typeof resumeProgress?.continuation_cursor === "string"
      ? resumeProgress.continuation_cursor
      : undefined;
  let scan: StoreResidueScan;
  try {
    scan = await (
      deps.scan ??
      ((paths, options) =>
        runStoreResidueScan({
          paths,
          ...options,
          localProjectId: deps.localProjectId,
        }))
    )(storePaths, resumeAfter !== undefined ? { resumeAfter } : undefined);
  } catch (error) {
    throw new ReconcileRefusalError(
      "target_store_resolution",
      `target store scan failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const verifiedPlan = freshPlan(scan);
  // Derived from the same verified scan the plan is, so every report of this
  // run agrees on whether a second run is required.
  const followUpRuns = detectFollowUpRuns(scan);
  if (verifiedPlan.plan_hash !== confirmPlanHash) {
    throw new ReconcileRefusalError(
      "stale_plan",
      "fresh residue scan no longer matches the confirmed plan_hash",
    );
  }
  if (scan.resume_cursor_found === false) {
    throw new ReconcileRefusalError(
      "resume_cursor_invalid",
      "resume cursor was not found in the current store scan",
    );
  }
  const now = deps.now ?? (() => new Date().toISOString());
  const runId = deps.runId?.() ?? `reconcile-${randomUUID()}`;
  const currentRunDir = runDir(storePaths, runId);
  if ((scan.truncated || scan.budget_exceeded) && !scan.continuation_cursor) {
    throw new ReconcileRefusalError(
      "budget_exceeded",
      "bounded reconcile scan exceeded its budget without a continuation cursor",
      { resume_from: runId },
    );
  }

  const worker = await probeWorkerLock(storePaths);
  if (worker.live === true) {
    throw new ReconcileRefusalError(
      "worker_lock_live",
      `worker.lock is live for pid ${worker.pid ?? "unknown"}`,
    );
  }
  await validateInputArtifacts(storePaths);

  const reconcileTarget = join(storePaths.changes, ".reconcile");
  let releaseLock: (() => Promise<void>) | undefined;
  try {
    await mkdir(storePaths.changes, { recursive: true });
    releaseLock = await acquireFileLock(
      reconcileTarget,
      RECONCILE_LOCK_TIMEOUT_MS,
    );
  } catch (error) {
    throw new ReconcileRefusalError(
      "reconcile_lock_contention",
      `reconcile lock unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const completed = resumeDir
    ? new Set((await rebuildProgressFromReceipts(resumeDir)).applied)
    : new Set<string>();
  const beforeHashes = new Map<string, string>();
  const residuals: string[] = [];
  const records: ReconcileReceipt[] = [];
  const startedAt = now();
  let mutated = 0;
  let skipped = 0;
  let failed = 0;
  try {
    const proofPaths: SummaryIndexPaths = {
      changesDir: storePaths.changes,
      summariesDir: storePaths.summariesDir,
    };
    let beforeProof: ProjectionDivergenceScan;
    try {
      // Capture the baseline while the reconcile lock is held. Passing this
      // exact scan into the final proof makes its before/after counts describe
      // the mutation window, rather than two post-apply observations.
      beforeProof = await runUnboundedProjectionDivergenceScan(proofPaths);
    } catch (error) {
      const failure = await computeReconcileCompletionProof({
        paths: proofPaths,
        deps: {
          scan: async () => {
            throw error;
          },
        },
      });
      const report: ReconcileRunReport = {
        schema_version: 1,
        run_id: runId,
        mode: "execute",
        started_at: startedAt,
        finished_at: now(),
        interrupted: false,
        records: [],
        counters: { mutated, skipped, failed },
        residuals: [failure.error ?? "before proof scan failed"],
        proof: failure,
        ...(followUpRuns && { follow_up_runs_required: followUpRuns }),
      };
      await writeReconcileRunReport(currentRunDir, report);
      return report;
    }
    const auditWriter =
      deps.auditWriter ??
      ((event: ReconcileAuditEvent) =>
        appendReconcileAudit(join(storePaths.reconcileDir, "audit"), event));
    const ctx: ActionContext = {
      storePaths,
      localProjectId: deps.localProjectId,
      locksHeld: [reconcileTarget],
      runId,
      writeBeforeState: async (recordId, bytes) => {
        const path = join(
          currentRunDir,
          "before",
          `${recordId.replace(/[^A-Za-z0-9._:-]/g, "_")}.bin`,
        );
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes);
        beforeHashes.set(recordId, hashBytes(bytes));
        return path;
      },
      auditWriter,
      coordinateChangeMutation: (intent) =>
        coordinateChangeMutation({
          authority: {
            reason: `store reconcile ${runId}`,
            evidence: `approved plan ${confirmPlanHash}`,
          },
          intent,
          changesDir: storePaths.changes,
        }),
      saveEpicOptimistic: (epicId, nextEpic, expectedVersion) =>
        saveEpicOptimistic(
          storePaths.activeEpics,
          epicId,
          nextEpic,
          expectedVersion,
        ),
      linkEpicChange: createEpicDiskOps({
        activeEpicsDir: storePaths.activeEpics,
        retiredEpicsDir: storePaths.retiredEpics,
      }).linkChange,
      executorRegistry: deps.actionExecutors,
    };

    for (
      let offset = 0;
      offset < verifiedPlan.records.length;
      offset += RECONCILE_BATCH_SIZE
    ) {
      const batch = verifiedPlan.records.slice(
        offset,
        offset + RECONCILE_BATCH_SIZE,
      );
      for (const record of batch) {
        if (completed.has(record.record_id)) continue;
        const outcomes: ActionOutcome[] = [];
        const attemptedActions: ReconcileAction[] = [];
        let skippedFallbackClass: ReconcileAction["class"] | null = null;
        for (const action of record.actions) {
          if (skippedFallbackClass === action.class) continue;
          try {
            attemptedActions.push(action);
            const actionRecord =
              action.class === record.class
                ? record
                : { ...record, class: action.class, actions: [action] };
            if (
              action.class === "unmigrated_worktree_marker" &&
              !(await fileExists(actionRecord.source_path))
            ) {
              const activeSource = join(
                storePaths.changes,
                record.record_id,
                "change.json",
              );
              if (await fileExists(activeSource)) {
                actionRecord.source_path = activeSource;
              }
            }
            const actionOutcome = await executeRecordAction(
              actionRecord,
              action,
              ctx,
            );
            outcomes.push(actionOutcome);
            // Action lists are ordered fallbacks. Once one action durably
            // mutates the record, later fallbacks must not reinterpret the
            // post-mutation state as a failure (for example, a quarantine
            // report observing the source removed by a successful restore).
            if (
              actionOutcome.status === "mutated" &&
              record.actions[attemptedActions.length]?.class === action.class
            ) {
              skippedFallbackClass = action.class;
            }
          } catch (error) {
            outcomes.push({
              status: "failed",
              error_class: "executor_error",
              residual: `${record.record_id}: executor threw: ${error instanceof Error ? error.message : String(error)}`,
            });
            break;
          }
        }
        for (const item of outcomes) {
          if (item.before_bytes && !beforeHashes.has(record.record_id)) {
            await ctx.writeBeforeState(record.record_id, item.before_bytes);
          }
        }
        const outcome = outcomes.find((item) => item.status === "failed") ??
          outcomes.find((item) => item.status === "mutated") ??
          outcomes[0] ?? { status: "skipped" as const };
        if (outcome.status === "mutated") mutated += 1;
        else if (outcome.status === "failed") failed += 1;
        else skipped += 1;
        if (outcome.residual) residuals.push(outcome.residual);
        const receipt: ReconcileReceipt = {
          record_id: record.record_id,
          class: record.class,
          action: attemptedActions.at(-1)?.action ?? "none",
          status: outcome.status,
          ...(outcome.error_class && { error_class: outcome.error_class }),
          ...(beforeHashes.has(record.record_id) && {
            before_hash: beforeHashes.get(record.record_id),
          }),
          ...(outcome.after_bytes && {
            after_hash: hashBytes(outcome.after_bytes),
          }),
          ts: now(),
        };
        records.push(receipt);
        await writeReconcileReceipt(currentRunDir, receipt);
        const event: ReconcileAuditEvent = {
          event: "store_reconcile",
          run_id: runId,
          record_id: record.record_id,
          class: record.class,
          action: receipt.action,
          ts: receipt.ts,
          ...(receipt.before_hash && { before_hash: receipt.before_hash }),
          ...(receipt.after_hash && { after_hash: receipt.after_hash }),
        };
        let auditResult: ReconcileAuditResult | void;
        try {
          auditResult = await auditWriter(event);
        } catch (error) {
          auditResult = {
            ok: false,
            warning: `reconcile audit append failed: ${error instanceof Error ? error.message : String(error)}`,
            path: join(storePaths.reconcileDir, "audit"),
          };
        }
        if (auditResult && !auditResult.ok)
          residuals.push(`${record.record_id}: ${auditResult.warning}`);
      }
      await writeReconcileProgress(currentRunDir, {
        ...(await rebuildProgressFromReceipts(currentRunDir)),
        continuation_cursor: null,
        budget_exceeded: false,
      });
    }
    if (scan.truncated || scan.budget_exceeded) {
      const continuationCursor = scan.continuation_cursor;
      // The cursor was validated before acquiring the mutation lock. Keep
      // this guard for type narrowing if scan implementations are injected.
      if (!continuationCursor) {
        throw new ReconcileRefusalError(
          "budget_exceeded",
          "bounded reconcile scan exceeded its budget without a continuation cursor",
          { resume_from: runId },
        );
      }
      const progress = await rebuildProgressFromReceipts(currentRunDir);
      await writeReconcileProgress(currentRunDir, {
        ...progress,
        run_id: runId,
        continuation_cursor: continuationCursor,
        budget_exceeded: true,
      });
      const report: ReconcileRunReport = {
        schema_version: 1,
        run_id: runId,
        mode: "execute",
        started_at: startedAt,
        finished_at: now(),
        interrupted: true,
        records: await readReconcileReceipts(currentRunDir),
        counters: { mutated, skipped, failed },
        residuals: [
          ...residuals,
          `bounded reconcile scan exceeded its budget after ${continuationCursor}`,
        ],
        continuation_cursor: continuationCursor,
        ...(followUpRuns && { follow_up_runs_required: followUpRuns }),
      };
      await writeReconcileRunReport(currentRunDir, report);
      throw new ReconcileRefusalError(
        "budget_exceeded",
        `bounded reconcile scan exceeded its budget; resume from ${runId}`,
        {
          resume_from: runId,
          continuation_cursor: continuationCursor,
          report,
        },
      );
    }
    const completionProof = await (
      deps.completionProof ??
      ((paths, before) => computeReconcileCompletionProof({ paths, before }))
    )(
      {
        ...proofPaths,
      },
      beforeProof,
    );
    const report: ReconcileRunReport = {
      schema_version: 1,
      run_id: runId,
      mode: "execute",
      started_at: startedAt,
      finished_at: now(),
      interrupted: false,
      records: await readReconcileReceipts(currentRunDir),
      counters: { mutated, skipped, failed },
      residuals: [
        ...residuals,
        ...(completionProof.error ? [completionProof.error] : []),
      ],
      proof: completionProof,
      ...(followUpRuns && { follow_up_runs_required: followUpRuns }),
    };
    await writeReconcileRunReport(currentRunDir, report);
    return report;
  } finally {
    await releaseLock();
  }
}

export { deriveRunStatus };
