/**
 * Disk-projection repair writers for exceptional mutations.
 *
 * These helpers write exceptional mutations to the disk projection through
 * the shared typed mutation coordinator and the
 * storage-owned conditional commit primitive. Every active-projection write
 * now acquires the per-change lock, re-reads the latest projection, applies
 * a family-specific field-local mutation, increments the projection revision,
 * and verifies the postcondition before returning.
 *
 * Every exceptional write must be authorized by an explicit reason and
 * evidence at the calling tool.
 *
 * The disk-direct writers structurally require an authorization reason and
 * evidence. Callers remain responsible for proving that evidence before
 * invoking the writer; the writers ensure the disk write is conditional,
 * audited, and postcondition-verified.
 *
 * Terminal/archive bundle writes (sub-agent reports for archived changes)
 * remain direct atomic writes to the bundle manifest; they are enumerated in
 * the active-projection saveChange exception inventory.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../storage/store-types";
import type {
  Change,
  ContractReviewMatrix,
  DesignConcernDisposition,
  Gates,
  VerificationEvidenceDisposition,
} from "../types";
import { saveChange } from "../storage/json";
import type { ArtifactMetadata } from "../types/artifacts";
import {
  subagentReportImplementationCycleId,
  subagentReportKey,
} from "../types/subagent-reports";
import { findArchiveBundle, bundleJsonStringify } from "../archive/archive";
import { atomicWriteFile } from "../utils/fs";
import {
  coordinateChangeMutation,
  type MutationOutcome,
} from "./change-mutation-coordinator";

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

function requireRecoveredChange(
  mutationKind: string,
  changeId: string,
  outcome: MutationOutcome<Change>,
): Change {
  switch (outcome.kind) {
    case "verified":
      return outcome.value;
    case "unverified":
      throw new Error(
        `${mutationKind} recovery for ${changeId} wrote the projection but the postcondition could not be verified: ${outcome.reason}`,
      );
    case "stale_revision":
      throw new Error(
        `${mutationKind} recovery for ${changeId} encountered a stale projection revision: expected ${outcome.expected}, actual ${outcome.actual}`,
      );
    case "operator_required":
      throw new Error(
        `${mutationKind} recovery for ${changeId} requires operator intervention: ${outcome.reason}`,
      );
    default: {
      const _exhaustive: never = outcome;
      throw new Error(
        `Unexpected ${mutationKind} outcome for ${changeId}: ${String(_exhaustive)}`,
      );
    }
  }
}

async function bestEffortRefresh(
  store: Store,
  changeId: string,
): Promise<void> {
  try {
    await store.changes.refresh(changeId);
  } catch {
    // The disk save above is durable even when cache refresh cannot complete.
  }
}

/**
 * Replace a task's fields in-place inside `change.tasks` and persist the
 * change through the conditional projection commit. Throws if the task is not
 * present in the change.
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
  const mutate = input.mutate;
  const taskId = input.taskId;
  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      kind: "recovery",
      reason: "task recovery",
      evidence: "disk projection mutation",
    },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.change.id,
      mutationKind: "task_mutation",
      mutateLatestProjection: (latest) => {
        const taskIdx = latest.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx < 0) {
          throw new Error(
            `Cannot recover task ${taskId}: not present in change ${latest.id}`,
          );
        }
        const updatedTasks = [...latest.tasks];
        updatedTasks[taskIdx] = mutate(updatedTasks[taskIdx]);
        return { ...latest, tasks: updatedTasks };
      },
      verifyProjection: (readback) => {
        const task = readback.tasks.find((t) => t.id === taskId);
        if (!task) return false;
        const expected = mutate(task);
        return JSON.stringify(task) === JSON.stringify(expected);
      },
    },
  });
  const updated = requireRecoveredChange(
    "task_mutation",
    input.change.id,
    outcome,
  );
  await bestEffortRefresh(input.store, input.change.id);
  return updated;
}

/**
 * Append a new task to `change.tasks` and persist through the conditional
 * projection commit.
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
  const task = input.task;
  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      kind: "recovery",
      reason: "task add recovery",
      evidence: "disk projection mutation",
    },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.change.id,
      mutationKind: "task_add",
      mutateLatestProjection: (latest) => {
        if (latest.tasks.some((t) => t.id === task.id)) {
          throw new Error(
            `Cannot recover-add task ${task.id}: already present in change ${latest.id}`,
          );
        }
        return { ...latest, tasks: [...latest.tasks, task] };
      },
      verifyProjection: (readback) =>
        readback.tasks.some((t) => t.id === task.id),
    },
  });
  const updated = requireRecoveredChange("task_add", input.change.id, outcome);
  await bestEffortRefresh(input.store, input.change.id);
  return updated;
}

/**
 * Replace the gate completion fields for a specific gate and persist through
 * the conditional projection commit.
 *
 * A recovery authorization object is required so future call sites cannot use
 * this bypass without structurally carrying the recovery reason/evidence.
 * The caller supplies the full completion record (status + completed_at +
 * completed_by + approval_evidence + optional artifact_evidence).
 */
// rq-releaseRepairRecovery01: disk-direct gate completion write with audited recovery authorization.
export async function saveRecoveredGateCompletion(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  gateId: keyof Gates;
  completion: Gates[keyof Gates];
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const gateId = input.gateId;
  const completion = input.completion;
  const completedAt = new Date().toISOString();
  const auditedCompletion = {
    ...completion,
    recovery_audit: {
      reason: input.authorization.reason,
      evidence: input.authorization.evidence,
      recovered_at: completedAt,
    },
  } as Gates[keyof Gates];
  const outcome = await coordinateChangeMutation<Change>({
    authority: { ...input.authorization, kind: "recovery" },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.change.id,
      mutationKind: "gate_completion",
      mutateLatestProjection: (latest) => ({
        ...latest,
        gates: {
          ...(latest.gates ?? {}),
          [gateId]: auditedCompletion,
        } as Gates,
      }),
      verifyProjection: (readback) => {
        const actual = readback.gates?.[gateId];
        if (!actual) return false;
        return (
          actual.status === auditedCompletion.status &&
          actual.completed_at === auditedCompletion.completed_at &&
          actual.completed_by === auditedCompletion.completed_by &&
          actual.approval_evidence === auditedCompletion.approval_evidence
        );
      },
    },
  });
  return requireRecoveredChange("gate_completion", input.change.id, outcome);
}

/**
 * Repair workflow artifact metadata on the disk projection.
 */
export async function saveRecoveredArtifactMetadata(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  kind: string;
  metadata: ArtifactMetadata;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const kind = input.kind;
  const metadata = input.metadata;
  const outcome = await coordinateChangeMutation<Change>({
    authority: { ...input.authorization, kind: "recovery" },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.change.id,
      mutationKind: "artifact_metadata",
      mutateLatestProjection: (latest) => ({
        ...latest,
        artifacts: { ...(latest.artifacts ?? {}), [kind]: metadata },
      }),
      verifyProjection: (readback) => {
        const actual = readback.artifacts?.[kind] as
          | ArtifactMetadata
          | undefined;
        if (!actual) return false;
        return actual.contentHash === metadata.contentHash;
      },
    },
  });
  return requireRecoveredChange("artifact_metadata", input.change.id, outcome);
}

/**
 * Transition the change's `status` field (typically draft → archived) on
 * disk projection through the conditional commit.
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
  const status = input.status;
  const lifecycleState = input.lifecycleState;
  const closure = input.closure;
  const outcome = await coordinateChangeMutation<Change>({
    authority: { ...input.authorization, kind: "recovery" },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.change.id,
      mutationKind: "status_transition",
      mutateLatestProjection: (latest) => ({
        ...latest,
        status,
        ...(lifecycleState ? { lifecycleState } : {}),
        ...(closure ? { closure } : {}),
      }),
      verifyProjection: (readback) => {
        if (readback.status !== status) return false;
        if (lifecycleState && readback.lifecycleState !== lifecycleState) {
          return false;
        }
        if (closure && readback.closure !== closure) return false;
        return true;
      },
    },
  });
  return requireRecoveredChange("status_transition", input.change.id, outcome);
}

/**
 * Record a typed design-concern disposition on the disk projection.
 *
 * The same latest-wins semantics as `applyDesignConcernDispositionedToState`
 * are preserved for `(taskId, concernKey)`.
 */
export async function saveRecoveredDesignConcernDisposition(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  disposition: DesignConcernDisposition;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const disposition = {
    ...input.disposition,
    recovery_audit: {
      reason: input.authorization.reason,
      evidence: input.authorization.evidence,
      recovered_at: new Date().toISOString(),
    },
  };
  const outcome = await coordinateChangeMutation<Change>({
    authority: { ...input.authorization, kind: "recovery" },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.change.id,
      mutationKind: "design_concern_disposition",
      mutateLatestProjection: (latest) => {
        const existing = latest.design_concern_dispositions ?? [];
        const next = existing.filter(
          (d) =>
            !(
              d.taskId === disposition.taskId &&
              d.concernKey === disposition.concernKey
            ),
        );
        return {
          ...latest,
          design_concern_dispositions: [...next, disposition],
        };
      },
      verifyProjection: (readback) => {
        const found = readback.design_concern_dispositions?.find(
          (d) =>
            d.taskId === disposition.taskId &&
            d.concernKey === disposition.concernKey,
        );
        if (!found) return false;
        return found.disposition === disposition.disposition;
      },
    },
  });
  return requireRecoveredChange(
    "design_concern_disposition",
    input.change.id,
    outcome,
  );
}

/**
 * Record a typed verification-evidence disposition on the disk projection.
 *
 * The same latest-wins semantics as
 * `applyVerificationEvidenceDispositionedToState` are preserved for
 * `(taskId, concernKey)`.
 */
export async function saveRecoveredVerificationEvidenceDisposition(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  disposition: VerificationEvidenceDisposition;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const disposition = {
    ...input.disposition,
    recovery_audit: {
      reason: input.authorization.reason,
      evidence: input.authorization.evidence,
      recovered_at: new Date().toISOString(),
    },
  };
  const outcome = await coordinateChangeMutation<Change>({
    authority: { ...input.authorization, kind: "recovery" },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.change.id,
      mutationKind: "verification_evidence_disposition",
      mutateLatestProjection: (latest) => {
        const existing = latest.verification_evidence_dispositions ?? [];
        const next = existing.filter(
          (d) =>
            !(
              d.taskId === disposition.taskId &&
              d.concernKey === disposition.concernKey
            ),
        );
        return {
          ...latest,
          verification_evidence_dispositions: [...next, disposition],
        };
      },
      verifyProjection: (readback) => {
        const found = readback.verification_evidence_dispositions?.find(
          (d) =>
            d.taskId === disposition.taskId &&
            d.concernKey === disposition.concernKey,
        );
        if (!found) return false;
        return found.disposition === disposition.disposition;
      },
    },
  });
  return requireRecoveredChange(
    "verification_evidence_disposition",
    input.change.id,
    outcome,
  );
}

/**
 * Repair a contract review matrix on the disk projection.
 *
 * The matrix carries a recovery_audit marker so operators can distinguish a
 * repaired projection from an ordinary mutation.
 */
export async function saveRecoveredContractReviewMatrix(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  reviewMatrix: ContractReviewMatrix;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  if (!input.change.contract) {
    throw new Error(
      `Cannot recover contract review matrix for ${input.change.id}: no contract is set`,
    );
  }
  const reviewMatrix = input.reviewMatrix;
  const auditedMatrix = {
    ...reviewMatrix,
    recovery_audit: {
      reason: input.authorization.reason,
      evidence: input.authorization.evidence,
      recovered_at: new Date().toISOString(),
    },
  };
  const outcome = await coordinateChangeMutation<Change>({
    authority: { ...input.authorization, kind: "recovery" },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.change.id,
      mutationKind: "contract_review_matrix_set",
      mutateLatestProjection: (latest) => ({
        ...latest,
        contract: latest.contract
          ? { ...latest.contract, reviewMatrix: auditedMatrix }
          : undefined,
      }),
      verifyProjection: (readback) =>
        contractReviewMatrixPostcondition(
          readback.contract?.reviewMatrix,
          reviewMatrix,
        ),
    },
  });
  return requireRecoveredChange(
    "contract_review_matrix_set",
    input.change.id,
    outcome,
  );
}

function contractReviewMatrixPostcondition(
  actual: ContractReviewMatrix | undefined,
  expected: ContractReviewMatrix,
): boolean {
  if (!actual) return false;
  if (actual.reviewedAt !== expected.reviewedAt) return false;
  if (actual.rows.length !== expected.rows.length) return false;
  const expectedById = new Map(
    expected.rows.map((row) => [row.contractId, row]),
  );
  return actual.rows.every((row) => {
    const exp = expectedById.get(row.contractId);
    if (!exp) return false;
    return (
      row.kind === exp.kind &&
      row.status === exp.status &&
      row.evidencePolicy === exp.evidencePolicy &&
      row.evidence === exp.evidence &&
      row.notes === exp.notes
    );
  });
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
 * Persist a sub-agent report to a terminal (archived/closed) change's disk
 * projection.
 *
 * Split write by terminal status (validator-confirmed):
 * - ARCHIVED → write the archive BUNDLE change.json (resolved via
 *   `findArchiveBundle`). The active-changes-dir write used by sibling writers
 *   is INVISIBLE for archived changes because the read path
 *   (`loadArchiveBundleDominantProjection`) reads the bundle, not the active dir.
 * - CLOSED → route through the conditional projection commit so concurrent
 *   writes remain safe.
 *
 * No `store.changes.refresh()` is needed for terminal projections: the read
 * path re-reads the durable terminal record before returning it.
 *
 * Dedupe by report key (change_id, scope/task, agent, attempt) — idempotent,
 * matching active-projection semantics.
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

  // Active/closed changes route through the conditional projection commit.
  if (!bundleDir) {
    const outcome = await coordinateChangeMutation<Change>({
      authority: { ...input.authorization, kind: "recovery" },
      changesDir: input.store.paths.changes,
      intent: {
        changeId: input.change.id,
        mutationKind: "subagent_report",
        mutateLatestProjection: (latest) => {
          if (taskId) {
            const idx = latest.tasks.findIndex((t) => t.id === taskId);
            if (idx < 0) {
              throw new Error(
                `Cannot persist task-scoped report: task ${taskId} not in change ${latest.id}`,
              );
            }
            const existing = latest.tasks[idx].subagent_reports ?? [];
            if (
              existing.some(
                (r) => recoveryReportKey(r, input.report.change_id) === key,
              )
            ) {
              return latest;
            }
            const updatedTasks = [...latest.tasks];
            updatedTasks[idx] = {
              ...updatedTasks[idx],
              subagent_reports: [...existing, auditedReport] as never,
            };
            return { ...latest, tasks: updatedTasks };
          }
          const existingSidecar = latest.subagent_reports ?? [];
          if (
            existingSidecar.some(
              (r) => recoveryReportKey(r, input.report.change_id) === key,
            )
          ) {
            return latest;
          }
          return {
            ...latest,
            subagent_reports: [...existingSidecar, auditedReport] as never,
          };
        },
        verifyProjection: (readback) => {
          if (taskId) {
            const task = readback.tasks.find((t) => t.id === taskId);
            return (
              task?.subagent_reports?.some(
                (r) => recoveryReportKey(r, input.report.change_id) === key,
              ) ?? false
            );
          }
          return (
            readback.subagent_reports?.some(
              (r) => recoveryReportKey(r, input.report.change_id) === key,
            ) ?? false
          );
        },
      },
    });
    return requireRecoveredChange("subagent_report", input.change.id, outcome);
  }

  // Mutate from the AUTHORITATIVE projection for the resolved write target.
  // With a bundle on disk, that is the bundle manifest (terminal record);
  // otherwise it is the caller's change (active/closed changes-dir path).
  const base = await loadAuthoritativeBundleProjection(
    bundleDir,
    input.change.id,
  );

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
 *
 * Active writes are no longer reachable through this helper; they route
 * through the conditional projection commit above.
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
