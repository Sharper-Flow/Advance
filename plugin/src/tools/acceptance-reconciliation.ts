/**
 * Acceptance remediation reconciliation.
 *
 * Before a normal acceptance gate completion signal is fired, any recovered
 * (disk-only) design-concern dispositions, verification-evidence dispositions,
 * or contract review matrices must be re-delivered to the reachable workflow so
 * acceptance readiness is evaluated from reconciled state. Confirmed re-deliveries
 * clear their recovery markers; failures return a single typed actionable
 * reconciliation block instead of allowing stale blockers to be replayed.
 */

import { loadChange } from "../storage/change-projection-reader";
import { commitChangeProjection } from "../storage/change-projection-transaction";
import type { Change, ContractReviewMatrix } from "../types";
import type { GateRecoveryAudit } from "../types/gates";
import type { ProjectionCommitOutcome } from "../storage/change-projection-transaction";
import type { Store } from "../storage/store-types";
import {
  changeStateQuery,
  contractReviewMatrixSetSignal,
  designConcernDispositionedSignal,
  verificationEvidenceDispositionedSignal,
} from "../temporal/messages";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
import type { ChangeWorkflowState } from "../temporal/contracts";
import type { WorkflowHandleLike } from "./change-mutation-coordinator";
import type { MutationOutcome } from "./change-mutation-coordinator";

export interface ReconciledAcceptanceRemediation {
  kind: "reconciled";
  clearedCount: number;
  change: Change;
}

export interface AcceptanceReconciliationBlocker {
  kind: "blocked";
  code: string;
  message: string;
  remediation: string;
  failedItems: Array<{
    family:
      | "design_concern"
      | "verification_evidence"
      | "contract_review_matrix";
    taskId?: string;
    concernKey?: string;
    disposition?: string;
    reason: string;
  }>;
}

export type ReconcileRecoveredAcceptanceRemediationResult =
  | ReconciledAcceptanceRemediation
  | AcceptanceReconciliationBlocker;

interface RecoveryAuditedDisposition {
  taskId: string;
  concernKey: string;
  disposition: string;
  evidence: string;
  dispositionedAt: string;
  recovery_audit: GateRecoveryAudit;
}

interface RecoveryAuditedMatrix {
  reviewedAt: string;
  rows: ContractReviewMatrix["rows"];
  recovery_audit: GateRecoveryAudit;
}

type PendingReconciliationItem =
  | {
      family: "design_concern" | "verification_evidence";
      disposition: RecoveryAuditedDisposition;
    }
  | { family: "contract_review_matrix"; matrix: RecoveryAuditedMatrix };

function collectPendingReconciliationItems(
  change: Change,
): PendingReconciliationItem[] {
  const items: PendingReconciliationItem[] = [];
  for (const d of change.design_concern_dispositions ?? []) {
    if (d.recovery_audit) {
      items.push({
        family: "design_concern",
        disposition: d as unknown as RecoveryAuditedDisposition,
      });
    }
  }
  for (const d of change.verification_evidence_dispositions ?? []) {
    if (d.recovery_audit) {
      items.push({
        family: "verification_evidence",
        disposition: d as unknown as RecoveryAuditedDisposition,
      });
    }
  }
  const reviewMatrix = change.contract?.reviewMatrix;
  if (reviewMatrix?.recovery_audit) {
    items.push({
      family: "contract_review_matrix",
      matrix: reviewMatrix as unknown as RecoveryAuditedMatrix,
    });
  }
  return items;
}

function dispositionPostcondition(
  state: ChangeWorkflowState,
  item: Extract<
    PendingReconciliationItem,
    { family: "design_concern" | "verification_evidence" }
  >,
): boolean {
  const list =
    item.family === "design_concern"
      ? state.design_concern_dispositions
      : state.verification_evidence_dispositions;
  const found = (list ?? []).find(
    (d) =>
      d.taskId === item.disposition.taskId &&
      d.concernKey === item.disposition.concernKey,
  );
  if (!found) return false;
  return (
    found.disposition === item.disposition.disposition &&
    found.evidence === item.disposition.evidence
  );
}

function matrixPostcondition(
  state: ChangeWorkflowState,
  item: Extract<
    PendingReconciliationItem,
    { family: "contract_review_matrix" }
  >,
): boolean {
  const actual = state.contract?.reviewMatrix;
  const expected = item.matrix;
  return reviewMatrixMatches(actual, expected);
}

function reviewMatrixMatches(
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
 * A marker clear must target the exact recovered disposition that was
 * confirmed in Temporal. Matching only its logical latest-wins key could
 * erase a newer recovered disposition committed while reconciliation was in
 * flight, leaving that newer state absent from the workflow.
 */
function matchesPendingRecoveredDisposition(
  disposition: RecoveryAuditedDisposition,
  item: Extract<
    PendingReconciliationItem,
    { family: "design_concern" | "verification_evidence" }
  >,
  requireRecoveryAudit = true,
): boolean {
  const expected = item.disposition;
  const matchesDisposition =
    disposition.taskId === expected.taskId &&
    disposition.concernKey === expected.concernKey &&
    disposition.disposition === expected.disposition &&
    disposition.evidence === expected.evidence &&
    disposition.dispositionedAt === expected.dispositionedAt;
  if (!matchesDisposition || !requireRecoveryAudit) {
    return matchesDisposition;
  }
  return (
    disposition.recovery_audit?.reason === expected.recovery_audit.reason &&
    disposition.recovery_audit?.evidence === expected.recovery_audit.evidence &&
    disposition.recovery_audit?.recovered_at ===
      expected.recovery_audit.recovered_at
  );
}

function matchesPendingRecoveredMatrix(
  matrix: RecoveryAuditedMatrix,
  item: Extract<
    PendingReconciliationItem,
    { family: "contract_review_matrix" }
  >,
  requireRecoveryAudit = true,
): boolean {
  const expected = item.matrix;
  if (!reviewMatrixMatches(matrix, expected)) return false;
  if (!requireRecoveryAudit) return true;
  return (
    matrix.recovery_audit.reason === expected.recovery_audit.reason &&
    matrix.recovery_audit.evidence === expected.recovery_audit.evidence &&
    matrix.recovery_audit.recovered_at === expected.recovery_audit.recovered_at
  );
}

async function redeliverDisposition(
  handle: WorkflowHandleLike,
  changeId: string,
  item: Extract<
    PendingReconciliationItem,
    { family: "design_concern" | "verification_evidence" }
  >,
): Promise<MutationOutcome<ChangeWorkflowState>> {
  const signal =
    item.family === "design_concern"
      ? designConcernDispositionedSignal
      : verificationEvidenceDispositionedSignal;
  const { taskId, concernKey, disposition, evidence, dispositionedAt } =
    item.disposition;

  return coordinateChangeMutation<ChangeWorkflowState>({
    authority: { kind: "temporal_live", handle, changeId },
    intent: {
      changeId,
      mutationKind: `${item.family}_reconciliation_redelivery`,
      payload: (mutationReceiptId) => ({
        taskId,
        concernKey,
        disposition,
        evidence,
        dispositionedAt,
        mutationReceiptId,
      }),
      sendSignal: async (h, payload) => {
        await h.signal(signal, payload);
      },
      refresh: async (h) =>
        h.query(changeStateQuery) as Promise<ChangeWorkflowState>,
      verifyTemporal: (state) => dispositionPostcondition(state, item),
      mutateLatestProjection: (latest) => latest,
      verifyProjection: () => true,
    },
  });
}

async function redeliverMatrix(
  handle: WorkflowHandleLike,
  changeId: string,
  item: Extract<
    PendingReconciliationItem,
    { family: "contract_review_matrix" }
  >,
): Promise<MutationOutcome<ChangeWorkflowState>> {
  // Strip recovery_audit before signaling so the shared matrix signal schema
  // never carries disk-only recovery metadata into workflow state.
  const { recovery_audit: _, ...reviewMatrix } = item.matrix;

  return coordinateChangeMutation<ChangeWorkflowState>({
    authority: { kind: "temporal_live", handle, changeId },
    intent: {
      changeId,
      mutationKind: "contract_review_matrix_reconciliation_redelivery",
      payload: (mutationReceiptId) => ({
        reviewMatrix,
        updatedAt: new Date().toISOString(),
        mutationReceiptId,
      }),
      sendSignal: async (h, payload) => {
        await h.signal(contractReviewMatrixSetSignal, payload);
      },
      refresh: async (h) =>
        h.query(changeStateQuery) as Promise<ChangeWorkflowState>,
      verifyTemporal: (state) => matrixPostcondition(state, item),
      mutateLatestProjection: (latest) => latest,
      verifyProjection: () => true,
    },
  });
}

function stripRecoveryAuditMarkers(
  change: Change,
  items: PendingReconciliationItem[],
): Change {
  const next: Change = { ...change };

  for (const family of ["design_concern", "verification_evidence"] as const) {
    const arrayKey =
      family === "design_concern"
        ? "design_concern_dispositions"
        : "verification_evidence_dispositions";
    const array = next[arrayKey];
    if (!array) continue;
    next[arrayKey] = array.map((d) => {
      const match = items.some(
        (item) =>
          item.family === family &&
          matchesPendingRecoveredDisposition(
            d as unknown as RecoveryAuditedDisposition,
            item,
          ),
      );
      if (!match) return d;
      const { recovery_audit: _, ...rest } = d;
      return rest;
    }) as typeof array;
  }

  const pendingMatrix = items.find(
    (
      item,
    ): item is Extract<
      PendingReconciliationItem,
      { family: "contract_review_matrix" }
    > => item.family === "contract_review_matrix",
  );
  if (pendingMatrix) {
    const matrix = next.contract?.reviewMatrix;
    const recoveredMatrix = matrix as RecoveryAuditedMatrix | undefined;
    if (
      recoveredMatrix &&
      matchesPendingRecoveredMatrix(recoveredMatrix, pendingMatrix)
    ) {
      const { recovery_audit: _, ...rest } = recoveredMatrix;
      next.contract = next.contract
        ? { ...next.contract, reviewMatrix: rest }
        : undefined;
    }
  }

  return next;
}

async function clearRecoveryAuditMarkers(
  store: Store,
  changeId: string,
  items: PendingReconciliationItem[],
): Promise<ProjectionCommitOutcome> {
  const mutationReceiptId = `mrec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const operationId = `acceptance-reconciliation-clear:${changeId}:${items
    .map((item) => {
      if (
        item.family === "design_concern" ||
        item.family === "verification_evidence"
      ) {
        return `${item.family}:${item.disposition.taskId}:${item.disposition.concernKey}`;
      }
      return `${item.family}:reviewMatrix`;
    })
    .join(",")}`;

  return commitChangeProjection({
    changesDir: store.paths.changes,
    changeId,
    authority: { kind: "temporal", mutationReceiptId },
    mutationKind: "acceptance_remediation_reconciliation",
    operationId,
    mutateLatest: (latest) => stripRecoveryAuditMarkers(latest, items),
    verify: ({ readback }) => {
      for (const item of items) {
        if (
          item.family === "design_concern" ||
          item.family === "verification_evidence"
        ) {
          const arrayKey =
            item.family === "design_concern"
              ? "design_concern_dispositions"
              : "verification_evidence_dispositions";
          const found = (readback[arrayKey] ?? []).find(
            (d) =>
              d.taskId === item.disposition.taskId &&
              d.concernKey === item.disposition.concernKey,
          );
          if (!found) return false;
          if (
            !matchesPendingRecoveredDisposition(
              found as unknown as RecoveryAuditedDisposition,
              item,
              false,
            )
          ) {
            return false;
          }
          if (found.recovery_audit !== undefined) return false;
        } else {
          const found = readback.contract?.reviewMatrix;
          if (!found) return false;
          if (
            !matchesPendingRecoveredMatrix(
              found as RecoveryAuditedMatrix,
              item as Extract<
                PendingReconciliationItem,
                { family: "contract_review_matrix" }
              >,
              false,
            )
          )
            return false;
          if (found.recovery_audit !== undefined) return false;
        }
      }
      return true;
    },
  });
}

function failureReason(outcome: MutationOutcome<ChangeWorkflowState>): string {
  switch (outcome.kind) {
    case "operator_required":
      return outcome.reason;
    case "stale_revision":
      return `stale projection revision: expected ${outcome.expected}, actual ${outcome.actual}`;
    case "recovered_unverified":
      return `recovery postcondition unverified: ${outcome.reason}`;
    default:
      return `unexpected outcome kind: ${outcome.kind}`;
  }
}

function itemFailureDetail(
  item: PendingReconciliationItem,
): Pick<
  AcceptanceReconciliationBlocker["failedItems"][number],
  "taskId" | "concernKey" | "disposition"
> {
  if (item.family === "contract_review_matrix") {
    return {};
  }
  return {
    taskId: item.disposition.taskId,
    concernKey: item.disposition.concernKey,
    disposition: item.disposition.disposition,
  };
}

/**
 * Reconcile recovered acceptance-affecting dispositions and contract review
 * matrices back into a reachable workflow. Returns `reconciled` with an updated
 * in-memory change when every pending marker is confirmed in the workflow and
 * cleared from disk. Returns a single `blocked` result with failed item details
 * if any redelivery or marker clear fails, so callers can surface one actionable
 * reconciliation block instead of replaying stale acceptance blockers.
 */
export async function reconcileRecoveredAcceptanceRemediation(input: {
  store: Store;
  changeId: string;
  handle: WorkflowHandleLike;
}): Promise<ReconcileRecoveredAcceptanceRemediationResult> {
  const { store, changeId, handle } = input;

  const loaded = await loadChange(store.paths.changes, changeId);
  if (!loaded.success || !loaded.data) {
    return {
      kind: "blocked",
      code: "ACCEPTANCE_RECONCILIATION_READ_FAILED",
      message: loaded.success
        ? `Change ${changeId} not found for acceptance reconciliation.`
        : `Failed to read change ${changeId} for acceptance reconciliation: ${loaded.error}`,
      remediation:
        "Verify the change projection exists and is readable, then retry acceptance.",
      failedItems: [],
    };
  }

  const change = loaded.data;
  const pendingItems = collectPendingReconciliationItems(change);

  if (pendingItems.length === 0) {
    return { kind: "reconciled", clearedCount: 0, change };
  }

  const failedItems: AcceptanceReconciliationBlocker["failedItems"] = [];

  for (const item of pendingItems) {
    const outcome =
      item.family === "contract_review_matrix"
        ? await redeliverMatrix(handle, changeId, item)
        : await redeliverDisposition(handle, changeId, item);
    if (outcome.kind !== "applied_temporal") {
      failedItems.push({
        family: item.family,
        reason: failureReason(outcome),
        ...itemFailureDetail(item),
      });
    }
  }

  if (failedItems.length > 0) {
    return {
      kind: "blocked",
      code: "ACCEPTANCE_RECONCILIATION_SIGNAL_FAILED",
      message: `Reconciliation of ${pendingItems.length} recovered acceptance remediation(s) failed for ${failedItems.length} item(s).`,
      remediation:
        "Retry acceptance after the workflow is reachable and the recovered disposition signals can be processed.",
      failedItems,
    };
  }

  const clearResult = await clearRecoveryAuditMarkers(
    store,
    changeId,
    pendingItems,
  );
  if (clearResult.kind !== "committed") {
    return {
      kind: "blocked",
      code: "ACCEPTANCE_RECONCILIATION_CLEAR_FAILED",
      message: `Reconciliation signals succeeded but clearing recovery markers failed: ${clearResult.kind}`,
      remediation:
        "Retry acceptance gate completion; if this persists, run adv_doctor to inspect the projection lock.",
      failedItems: pendingItems.map((item) => ({
        family: item.family,
        reason: "marker clear not confirmed",
        ...itemFailureDetail(item),
      })),
    };
  }

  return {
    kind: "reconciled",
    clearedCount: pendingItems.length,
    change: stripRecoveryAuditMarkers(change, pendingItems),
  };
}
