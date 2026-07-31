/**
 * Acceptance remediation reconciliation.
 *
 * Before a normal acceptance gate completion signal is fired, any recovered
 * (disk-only) design-concern or verification-evidence dispositions must be
 * re-delivered to the reachable workflow so acceptance readiness is evaluated
 * from reconciled state. Confirmed re-deliveries clear their recovery markers;
 * failures return a single typed actionable reconciliation block instead of
 * allowing stale blockers to be replayed.
 */

import { loadChange } from "../storage/change-projection-reader";
import { commitChangeProjection } from "../storage/change-projection-transaction";
import type { Change } from "../types";
import type { GateRecoveryAudit } from "../types/gates";
import type { ProjectionCommitOutcome } from "../storage/change-projection-transaction";
import type { Store } from "../storage/store-types";
import {
  changeStateQuery,
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
    family: "design_concern" | "verification_evidence";
    taskId: string;
    concernKey: string;
    disposition: string;
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

interface PendingReconciliationItem {
  family: "design_concern" | "verification_evidence";
  disposition: RecoveryAuditedDisposition;
}

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
  return items;
}

function dispositionPostcondition(
  state: ChangeWorkflowState,
  item: PendingReconciliationItem,
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

async function redeliverDisposition(
  handle: WorkflowHandleLike,
  changeId: string,
  item: PendingReconciliationItem,
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

function stripRecoveryAuditMarkers(
  change: Change,
  items: PendingReconciliationItem[],
): Change {
  const keys = items.map((item) => ({
    family: item.family,
    taskId: item.disposition.taskId,
    concernKey: item.disposition.concernKey,
  }));

  const next: Change = { ...change };

  for (const family of ["design_concern", "verification_evidence"] as const) {
    const arrayKey =
      family === "design_concern"
        ? "design_concern_dispositions"
        : "verification_evidence_dispositions";
    const array = next[arrayKey];
    if (!array) continue;
    next[arrayKey] = array.map((d) => {
      const match = keys.some(
        (k) =>
          k.family === family &&
          k.taskId === d.taskId &&
          k.concernKey === d.concernKey,
      );
      if (!match) return d;
      const { recovery_audit: _, ...rest } = d;
      return rest;
    }) as typeof array;
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
    .map(
      (item) =>
        `${item.family}:${item.disposition.taskId}:${item.disposition.concernKey}`,
    )
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
        if (found.recovery_audit !== undefined) return false;
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

/**
 * Reconcile recovered acceptance-affecting dispositions back into a reachable
 * workflow. Returns `reconciled` with an updated in-memory change when every
 * pending marker is confirmed in the workflow and cleared from disk. Returns a
 * single `blocked` result with failed item details if any redelivery or marker
 * clear fails, so callers can surface one actionable reconciliation block
 * instead of replaying stale acceptance blockers.
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
    const outcome = await redeliverDisposition(handle, changeId, item);
    if (outcome.kind !== "applied_temporal") {
      failedItems.push({
        family: item.family,
        taskId: item.disposition.taskId,
        concernKey: item.disposition.concernKey,
        disposition: item.disposition.disposition,
        reason: failureReason(outcome),
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
        taskId: item.disposition.taskId,
        concernKey: item.disposition.concernKey,
        disposition: item.disposition.disposition,
        reason: "marker clear not confirmed",
      })),
    };
  }

  return {
    kind: "reconciled",
    clearedCount: pendingItems.length,
    change: stripRecoveryAuditMarkers(change, pendingItems),
  };
}
