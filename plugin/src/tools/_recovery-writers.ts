/**
 * Disk-projection recovery writers for poisoned-history fallback.
 *
 * These helpers write poisoned/completed-workflow recovery mutations to the
 * disk projection. Task mutation writers route through `store.changes.save`;
 * gate-completion and status-transition writers use disk-direct `saveChange`
 * because the Temporal-backed store path can re-invoke a completed workflow.
 * Every recovery write must be authorized by an explicit
 * `recoveryMode: "poisoned_history"` (with evidence), completed-workflow
 * evidence, or `compatibilityReason` at the calling tool.
 *
 * The disk-direct writers structurally require an authorization reason and
 * evidence. Callers remain responsible for proving that evidence before
 * invoking the writer; the writers ensure the disk write is atomic.
 *
 * Cache refresh policy:
 * - Task writers (mutation/add) use `store.changes.save` + `bestEffortRefresh`.
 *   `store.changes.save` already routes through Temporal on the regular path.
 * - Gate completion (`saveRecoveredGateCompletion`) and artifact metadata
 *   (`saveRecoveredArtifactMetadata`) use disk-direct `saveChange` WITHOUT
 *   `bestEffortRefresh`. These target workflows that may still be actively
 *   processing; refreshing could pull in an intermediate state that overwrites
 *   the disk repair.
 * - Status transition (`saveRecoveredChangeStatus`) uses disk-direct
 *   `saveChange` only. `store.changes.refresh()` re-queries Temporal, which can
 *   still contain stale non-terminal state for a wedged release workflow and
 *   overwrite the disk repair. The Temporal read path treats archive bundles as
 *   terminal/dominant and invalidates stale active cache entries there.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../storage/store-types";
import type {
  Change,
  DesignConcernDisposition,
  Gates,
  VerificationEvidenceDisposition,
} from "../types";
import { saveChange } from "../storage/json";
import type { ArtifactMetadata } from "../temporal/contracts";
import {
  subagentReportImplementationCycleId,
  subagentReportKey,
} from "../types/subagent-reports";
import { findArchiveBundle, bundleJsonStringify } from "../archive/archive";
import { atomicWriteFile } from "../utils/fs";

interface RecoveryWriteAuthorization {
  reason: string;
  evidence: string;
}

function assertRecoveryAuthorization(
  authorization: RecoveryWriteAuthorization | undefined,
): asserts authorization is RecoveryWriteAuthorization {
  if (!authorization?.reason.trim() || !authorization.evidence.trim()) {
    throw new Error(
      "disk-projection recovery authorization with reason and evidence is required",
    );
  }
}

async function bestEffortRefresh(
  store: Store,
  changeId: string,
): Promise<void> {
  try {
    await store.changes.refresh(changeId);
  } catch {
    // Recovery writes are disk-projection repairs. A poisoned workflow may
    // still make refresh fail; the disk save above is the important effect.
  }
}

/**
 * Replace a task's fields in-place inside `change.tasks` and persist the
 * change to disk. Throws if the task is not present in the change.
 */
export async function saveRecoveredTaskMutation(input: {
  store: Store;
  change: Change;
  taskId: string;
  mutate: (task: Change["tasks"][number]) => Change["tasks"][number];
}): Promise<Change> {
  const idx = input.change.tasks.findIndex((t) => t.id === input.taskId);
  if (idx < 0) {
    throw new Error(
      `Cannot recover task ${input.taskId}: not present in change ${input.change.id}`,
    );
  }
  const updatedTasks = [...input.change.tasks];
  updatedTasks[idx] = input.mutate(updatedTasks[idx]);
  const updated = { ...input.change, tasks: updatedTasks } as Change;
  await input.store.changes.save(updated);
  await bestEffortRefresh(input.store, input.change.id);
  return updated;
}

/**
 * Append a new task to `change.tasks` and persist the change to disk.
 */
export async function saveRecoveredTaskAdd(input: {
  store: Store;
  change: Change;
  task: Change["tasks"][number];
}): Promise<Change> {
  if (input.change.tasks.some((t) => t.id === input.task.id)) {
    throw new Error(
      `Cannot recover-add task ${input.task.id}: already present in change ${input.change.id}`,
    );
  }
  const updated = {
    ...input.change,
    tasks: [...input.change.tasks, input.task],
  } as Change;
  await input.store.changes.save(updated);
  await bestEffortRefresh(input.store, input.change.id);
  return updated;
}

/**
 * Replace the gate completion fields for a specific gate and persist through
 * disk-direct saveChange. This bypasses store.changes.save because archived
 * workflow recovery often happens after the workflow has already completed;
 * calling store.changes.save would route through Temporal again.
 *
 * A recovery authorization object is required so future call sites cannot use
 * this bypass without structurally carrying the recovery reason/evidence.
 * The caller supplies the full completion record (status + completed_at +
 * completed_by + approval_evidence + optional artifact_evidence).
 */
export async function saveRecoveredGateCompletion(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  gateId: keyof Gates;
  completion: Gates[keyof Gates];
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const gates = (input.change.gates ?? {}) as Gates;
  const auditedCompletion = {
    ...input.completion,
    recovery_audit: {
      reason: input.authorization.reason,
      evidence: input.authorization.evidence,
      recovered_at: new Date().toISOString(),
    },
  } as Gates[keyof Gates];
  const updatedGates = { ...gates, [input.gateId]: auditedCompletion } as Gates;
  const updated = { ...input.change, gates: updatedGates } as Change;
  await saveChange(input.store.paths.changes, updated);
  return updated;
}

/**
 * Repair workflow artifact metadata on the disk projection when a completed or
 * poisoned workflow cannot accept `updateArtifactMetadataSignal`.
 */
export async function saveRecoveredArtifactMetadata(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  kind: string;
  metadata: ArtifactMetadata;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const updated = {
    ...input.change,
    artifacts: {
      ...(input.change.artifacts ?? {}),
      [input.kind]: input.metadata,
    },
  } as Change;
  await saveChange(input.store.paths.changes, updated);
  return updated;
}

/**
 * Transition the change's `status` field (typically draft → archived) on
 * disk projection when the terminating workflow signal cannot be processed.
 *
 * rq-fix-archive-recovery-disk-write: bypass `store.changes.save` because
 * for `status: "archived"` the temporal store routes through
 * `archiveChangeSignal` on the workflow — which is exactly what we are
 * recovering from. Write the disk projection directly via `saveChange`
 * without refreshing stale workflow state back over the disk repair.
 *
 * rq-shippedWorkflowTermination01 D5: when the recovery path converges
 * terminal authority (e.g. adv_change_workflow_terminate after a pinned
 * run is terminated), the caller MUST also pass `lifecycleState` so the
 * disk projection carries an authoritative terminal lifecycle value.
 * Without this, a stale literal `lifecycleState:"open"` on disk would
 * survive `status:"archived"` writes because `normalizeChangeLifecycleState`
 * trusts the stored literal before deriving from status. Existing status-only
 * callers (adv_change_status_repair) continue to omit `lifecycleState` and
 * remain compatible; their recovery does not converge live-workflow
 * authority.
 */
export async function saveRecoveredChangeStatus(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  status: Change["status"];
  lifecycleState?: Change["lifecycleState"];
  closure?: Change["closure"];
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const updated = {
    ...input.change,
    status: input.status,
    ...(input.lifecycleState
      ? { lifecycleState: input.lifecycleState }
      : {}),
    ...(input.closure ? { closure: input.closure } : {}),
  } as Change;
  await saveChange(input.store.paths.changes, updated);
  return updated;
}

/**
 * Record a typed design-concern disposition on the disk projection when the
 * owning change workflow is already completed and cannot accept the normal
 * `designConcernDispositionedSignal`.
 *
 * The same latest-wins semantics as `applyDesignConcernDispositionedToState`
 * are preserved for `(taskId, concernKey)`. This is intentionally disk-direct:
 * completed-workflow recovery must not call `store.changes.save` because that
 * can route back through the workflow being recovered.
 */
export async function saveRecoveredDesignConcernDisposition(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  disposition: DesignConcernDisposition;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const existing = input.change.design_concern_dispositions ?? [];
  const next = existing.filter(
    (d) =>
      !(
        d.taskId === input.disposition.taskId &&
        d.concernKey === input.disposition.concernKey
      ),
  );
  const updated = {
    ...input.change,
    design_concern_dispositions: [
      ...next,
      {
        ...input.disposition,
        recovery_audit: {
          reason: input.authorization.reason,
          evidence: input.authorization.evidence,
          recovered_at: new Date().toISOString(),
        },
      },
    ],
  } as Change;
  await saveChange(input.store.paths.changes, updated);
  return updated;
}

/**
 * Record a typed verification-evidence disposition on the disk projection when
 * the owning change workflow is already completed and cannot accept the normal
 * `verificationEvidenceDispositionedSignal`.
 *
 * The same latest-wins semantics as
 * `applyVerificationEvidenceDispositionedToState` are preserved for
 * `(taskId, concernKey)`. This is intentionally disk-direct: completed-workflow
 * recovery must not call `store.changes.save` because that can route back
 * through the workflow being recovered.
 */
export async function saveRecoveredVerificationEvidenceDisposition(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  disposition: VerificationEvidenceDisposition;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const existing = input.change.verification_evidence_dispositions ?? [];
  const next = existing.filter(
    (d) =>
      !(
        d.taskId === input.disposition.taskId &&
        d.concernKey === input.disposition.concernKey
      ),
  );
  const updated = {
    ...input.change,
    verification_evidence_dispositions: [
      ...next,
      {
        ...input.disposition,
        recovery_audit: {
          reason: input.authorization.reason,
          evidence: input.authorization.evidence,
          recovered_at: new Date().toISOString(),
        },
      },
    ],
  } as Change;
  await saveChange(input.store.paths.changes, updated);
  return updated;
}

/**
 * Structural shape of a sub-agent report sufficient for key computation and
 * persistence. Accepts the full ScopedSubagentReport without tight coupling.
 */
interface RecoverySubagentReport {
  change_id: string;
  attempt: number;
  agent: string;
  scope?:
    | { kind: "task"; task_id: string }
    | { kind: "change"; scope_key: string }
    | string;
  task_id?: string;
  [key: string]: unknown;
}

/**
 * Report task ID for key computation: task-scoped reports carry a task_id
 * (either in scope or legacy top-level); change-scoped reports do not.
 */
function recoveryReportTaskId(
  report: RecoverySubagentReport,
): string | undefined {
  if (typeof report.scope !== "string" && report.scope?.kind === "task") {
    return report.scope.task_id;
  }
  return report.task_id;
}

/**
 * Load the AUTHORITATIVE change projection from an archive bundle manifest.
 *
 * The bundle change.json is the durable terminal record
 * (rq-terminalProjectionTruth01). During an active→archived race the caller's
 * in-memory change may be a stale pre-archive shadow missing terminal
 * status/gates/reports/archive-only fields; recovery mutations MUST therefore
 * be computed from this projection, never from the shadow.
 *
 * Validation is deliberately structural (parseable JSON object + canonical id
 * match + array-typed task/report carriers) rather than ChangeSchema. As of
 * issue #258 (fixRecoverySchemaDrift), the strict ingest schemas
 * (`DesignConcernDispositionSchema`, `VerificationEvidenceDispositionSchema`,
 * `TaskScopedBaseSubagentReportSchema`, `ChangeScopedBaseSubagentReportSchema`)
 * include `recovery_audit` as an optional typed field, so new bundles with
 * recovery-audited reports DO round-trip through `ChangeSchema.parse`. This
 * structural-only validation remains as defense-in-depth for older bundles
 * that pre-date the schema extension and would otherwise fail closed on the
 * very bundles this writer maintains. Every manifest field is preserved
 * verbatim — no stripping.
 *
 * Fails closed on unreadable, unparseable, structurally-invalid, or
 * id-mismatched manifests: rewriting a terminal bundle from a stale shadow
 * would clobber terminal state (rq-subagentReports12 durability).
 */
async function loadAuthoritativeBundleProjection(
  bundleDir: string,
  changeId: string,
): Promise<Change> {
  const manifestPath = join(bundleDir, "change.json");
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch (error) {
    throw new Error(
      `Cannot persist recovered sub-agent report: archive bundle manifest unreadable at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Cannot persist recovered sub-agent report: archive bundle manifest at ${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Cannot persist recovered sub-agent report: archive bundle manifest at ${manifestPath} is not a change object`,
    );
  }
  const manifest = parsed as Record<string, unknown>;
  const assertReportCarrier = (reports: unknown, carrier: string): void => {
    if (!Array.isArray(reports)) {
      throw new Error(
        `Cannot persist recovered sub-agent report: archive bundle manifest at ${manifestPath} has non-array ${carrier}`,
      );
    }
    if (
      reports.some(
        (report) =>
          !report || typeof report !== "object" || Array.isArray(report),
      )
    ) {
      throw new Error(
        `Cannot persist recovered sub-agent report: archive bundle manifest at ${manifestPath} has an invalid ${carrier} entry`,
      );
    }
  };
  if (manifest.id !== changeId) {
    throw new Error(
      `Cannot persist recovered sub-agent report: archive bundle manifest at ${manifestPath} belongs to change ${String(manifest.id)}, not ${changeId}`,
    );
  }
  if (!Array.isArray(manifest.tasks)) {
    throw new Error(
      `Cannot persist recovered sub-agent report: archive bundle manifest at ${manifestPath} has no array tasks carrier`,
    );
  }
  for (const task of manifest.tasks) {
    if (
      !task ||
      typeof task !== "object" ||
      Array.isArray(task) ||
      typeof (task as Record<string, unknown>).id !== "string"
    ) {
      throw new Error(
        `Cannot persist recovered sub-agent report: archive bundle manifest at ${manifestPath} has an invalid task carrier`,
      );
    }
    const taskReports = (task as Record<string, unknown>).subagent_reports;
    if (taskReports !== undefined) {
      assertReportCarrier(taskReports, "task subagent_reports");
    }
  }
  if (manifest.subagent_reports !== undefined) {
    assertReportCarrier(manifest.subagent_reports, "subagent_reports");
  }
  return manifest as unknown as Change;
}

/**
 * Persist a sub-agent report to a TERMINAL (archived/closed) change's disk
 * projection when the workflow can no longer accept `subagentReportSubmittedSignal`.
 *
 * Split write by terminal status (validator-confirmed):
 * - ARCHIVED → write the archive BUNDLE change.json (resolved via
 *   `findArchiveBundle`). The active-changes-dir write used by sibling writers
 *   is INVISIBLE for archived changes because the read path
 *   (`loadArchiveBundleDominantProjection`) reads the bundle, not the active dir.
 * - CLOSED → `saveChange(paths.changes, …)` (what `loadDiskTerminalProjection`
 *   reads).
 *
 * No `store.changes.refresh()` — `getTemporalChange` calls
 * `loadTerminalProjection` FIRST (re-reads disk every call), so a stale cache
 * cannot shadow the disk write; refresh re-queries Temporal and can clobber
 * the repair (rq-fix-archive-recovery-disk-write discipline).
 *
 * Dedupe by report key (change_id, scope/task, agent, attempt) — idempotent,
 * matching active-workflow semantics.
 *
 * Mutation base: when an archive bundle exists, the mutation is computed from
 * the AUTHORITATIVE bundle projection (loadAuthoritativeBundleProjection),
 * never from the possibly-stale `input.change` shadow — the bundle carries
 * terminal status/gates/reports/archive-only fields that the shadow may not.
 */
export async function saveRecoveredSubagentReport(input: {
  store: Store;
  change: Change;
  report: RecoverySubagentReport;
  authorization: RecoveryWriteAuthorization;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);

  // Determine the ACTUAL terminal write target by checking the filesystem
  // (bundle existence), NOT the possibly-stale in-memory change.status.
  // An active→archived race can leave change.status stale ("active") while
  // the archive bundle already exists on disk. The read path
  // (loadArchiveBundleDominantProjection) reads the bundle regardless of the
  // in-memory status, so the write target MUST match the real filesystem
  // state (P33: structural correctness over heuristic inference).
  const bundleDir = input.store.paths.archive
    ? await findArchiveBundle(input.store.paths.archive, input.change.id)
    : null;
  const persistedVia = bundleDir ? "archive-sidecar" : "active-projection";

  // Mutate from the AUTHORITATIVE projection for the resolved write target.
  // With a bundle on disk, that is the bundle manifest (terminal record);
  // otherwise it is the caller's change (active/closed changes-dir path).
  const base = bundleDir
    ? await loadAuthoritativeBundleProjection(bundleDir, input.change.id)
    : input.change;

  const taskId = recoveryReportTaskId(input.report);
  const key = subagentReportKey({
    changeId: input.report.change_id,
    taskId,
    scope:
      typeof input.report.scope === "string" ? undefined : input.report.scope,
    agent: input.report.agent as never,
    attempt: input.report.attempt,
    implementationCycleId: subagentReportImplementationCycleId(
      input.report as never,
    ),
  });

  const auditedReport = {
    ...input.report,
    recovery_audit: {
      persisted_via: persistedVia,
      reason: input.authorization.reason,
      evidence: input.authorization.evidence,
      recovered_at: new Date().toISOString(),
    },
  };

  // Resolve target array + dedupe
  if (taskId) {
    const idx = base.tasks.findIndex((t) => t.id === taskId);
    if (idx < 0) {
      throw new Error(
        `Cannot persist task-scoped report: task ${taskId} not in change ${base.id}`,
      );
    }
    const existing = base.tasks[idx].subagent_reports ?? [];
    if (
      existing.some((r) => recoveryReportKey(r, input.report.change_id) === key)
    ) {
      return base;
    }
    const updatedTasks = [...base.tasks];
    updatedTasks[idx] = {
      ...updatedTasks[idx],
      subagent_reports: [...existing, auditedReport] as never,
    };
    const updated = { ...base, tasks: updatedTasks } as Change;
    await persistTerminalProjection(input, updated, bundleDir);
    return updated;
  }

  const existingSidecar = base.subagent_reports ?? [];
  if (
    existingSidecar.some(
      (r) => recoveryReportKey(r, input.report.change_id) === key,
    )
  ) {
    return base;
  }
  const updated = {
    ...base,
    subagent_reports: [...existingSidecar, auditedReport] as never,
  } as Change;
  await persistTerminalProjection(input, updated, bundleDir);
  return updated;
}

/** Compute the report key for an existing persisted report. */
function recoveryReportKey(
  report: { [key: string]: unknown },
  fallbackChangeId: string,
): string {
  const scope = report.scope as
    | { kind?: string; task_id?: string }
    | string
    | undefined;
  return subagentReportKey({
    changeId: (report.change_id as string | undefined) ?? fallbackChangeId,
    taskId:
      typeof scope !== "string" && scope?.kind === "task"
        ? scope.task_id
        : (report.task_id as string | undefined),
    scope: typeof scope === "string" ? undefined : (scope as never),
    agent: report.agent as never,
    attempt: (report.attempt as number | undefined) ?? 1,
    implementationCycleId: subagentReportImplementationCycleId(report as never),
  });
}

/**
 * Write the updated change to the correct terminal disk projection.
 * Uses the pre-resolved bundleDir (filesystem truth) rather than the
 * possibly-stale change.status to select the write target. Archived changes
 * (bundle exists) → bundle change.json; closed (no bundle) → active changes dir.
 */
async function persistTerminalProjection(
  input: { store: Store; change: Change },
  updated: Change,
  bundleDir: string | null,
): Promise<void> {
  if (bundleDir) {
    await atomicWriteFile(
      join(bundleDir, "change.json"),
      bundleJsonStringify(updated),
    );
    return;
  }
  // No archive bundle → closed or terminal-without-bundle → active changes dir
  await saveChange(input.store.paths.changes, updated);
}
