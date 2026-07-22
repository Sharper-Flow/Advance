import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Store } from "../storage/store";
import { readArtifact } from "./change/artifacts";
import { saveChange } from "../storage/json";
import {
  ContractEvidencePolicySchema,
  ContractEvidenceStatusSchema,
  ContractItemKindSchema,
  ContractReviewMatrixSchema,
  ContractRigorSchema,
  type Change,
  type ContractReviewMatrix,
} from "../types";
import {
  contractReviewMatrixSetSignal,
  contractSetSignal,
} from "../temporal/messages";
import { acceptanceCriteriaFromContract } from "../temporal/change-state";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import { buildContractFromAgreement } from "../validator/contract-mint";
import type { WarrantLookup } from "../validator/warrant";
import {
  RECOVERY_RECONCILIATION_WARNING,
  isFailingContractReviewStatus,
} from "../temporal/recovery-classification";
import {
  fireSignalAndRefresh,
  getChangeHandle,
  MutationApplicationUnconfirmedError,
} from "./_adapters";
import { logRecoveryProbeDiagnostics } from "./recovery-probe";
import { classifyMutationRecoveryDecision } from "./monotonic-recovery";
import {
  formatTargetProjectContext,
  withTargetPathStore,
} from "./target-project";

const targetArgs = {
  target_path: z.string().optional(),
  target_confirmed: z.literal(true).optional(),
  confirmationEvidence: z.string().optional(),
};

const priorApprovalEvidenceArg = {
  priorApprovalEvidence: z
    .string()
    .optional()
    .describe(
      "Optional prior approval evidence for audit continuity when recovery follows a gate/acceptance approval.",
    ),
};

async function withContractStore<T>(
  store: Store,
  input: {
    target_path?: string;
    target_confirmed?: true;
    confirmationEvidence?: string;
  },
  fn: (
    activeStore: Store,
    projectContext?: ReturnType<typeof formatTargetProjectContext>,
  ) => Promise<T>,
): Promise<T> {
  if (!input.target_path) return fn(store);
  return withTargetPathStore(
    {
      currentProjectPath: store.paths.root,
      target_path: input.target_path,
      target_confirmed: input.target_confirmed,
      confirmationEvidence: input.confirmationEvidence,
      stateRequirement: "temporal-required",
    },
    async ({ context, store: targetStore }) =>
      fn(targetStore, formatTargetProjectContext(context)),
  );
}

async function loadChange(store: Store, changeId: string): Promise<Change> {
  const result = await store.changes.get(changeId);
  if (!result.success) throw new Error(result.error);
  if (!result.data) throw new Error(`Change not found: ${changeId}`);
  return result.data;
}

/**
 * Build the live capability-warrant lookup (addAcWarrantGuard).
 *
 * Tool surface is read from the assembled tool registry via a RUNTIME dynamic
 * import so the pure validator stays cycle-free (DDC2). Spec ids are collected
 * best-effort from the active store; if specs are unreadable, spec:* warrants
 * simply do not resolve (fail-closed) rather than throwing here.
 */
async function buildWarrantLookup(store: Store): Promise<WarrantLookup> {
  const { getToolSurface } = await import("../tool-registry");
  const toolSurface = getToolSurface();
  const specIds = new Set<string>();
  try {
    const specList = await store.specs.list();
    for (const info of specList.specs) {
      const res = await store.specs.get(info.name);
      if (res.success && res.data) {
        for (const req of res.data.requirements ?? []) {
          if (req.id) specIds.add(req.id);
        }
      }
    }
  } catch {
    // best-effort: spec-ref warrants fail-closed if specs cannot be read.
  }
  return { toolSurface, specIds };
}

function assertSafeChangeId(changeId: string): void {
  if (/\.\.|[\\/\0]/.test(changeId)) {
    throw new Error(
      `Invalid changeId for agreement artifact path: ${changeId}`,
    );
  }
}

async function readAgreement(store: Store, change: Change): Promise<string> {
  assertSafeChangeId(change.id);
  // AC8 (completeStateBackedGate): Temporal-first ordering, matching the
  // canonical readArtifact (tools/change.ts): state.documents.agreement →
  // disk active dir → archive bundle. Previously this reader was disk-first,
  // the lone outlier among artifact readers; in the Temporal-canonical
  // architecture state.documents is the source of truth and disk is the legacy
  // fallback. readArtifact already encodes the full fallback chain, so we
  // delegate to it. change.ts does not import from contract.ts, so this is a
  // one-directional dependency with no import cycle.
  const content = await readArtifact(store, change.id, "agreement");
  if (content?.trim()) return content;
  throw new Error(`Agreement artifact is empty: ${change.id}`);
}

function contractApprovedAt(input: {
  change: Change;
  approvedAt?: string;
}): string {
  const approvedAt = input.approvedAt?.trim();
  if (approvedAt) return approvedAt;
  return (
    input.change.gates?.discovery?.completed_at ?? new Date().toISOString()
  );
}

async function healthySignalHandle(store: Store, changeId: string) {
  const bundle = getService();
  if (!bundle) throw new Error("Temporal service not available");
  const projectId = await getProjectId(store.paths.root);
  if (!projectId) throw new Error("Could not resolve project ID");
  return getChangeHandle(bundle.client, projectId, changeId);
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

async function saveRecoveredContract(input: {
  store: Store;
  change: Change;
  contract: Change["contract"];
  diskDirect?: boolean;
}): Promise<void> {
  if (!input.contract) {
    throw new Error("Cannot recover contract: no contract is set");
  }
  const updated = {
    ...input.change,
    contract: input.contract,
    acceptanceCriteria: acceptanceCriteriaFromContract(input.contract),
  } as Change;
  if (input.diskDirect) {
    await saveChange(input.store.paths.changes, updated);
  } else {
    await input.store.changes.save(updated);
    await bestEffortRefresh(input.store, input.change.id);
  }
}

async function saveRecoveredReviewMatrix(input: {
  store: Store;
  change: Change;
  reviewMatrix: ContractReviewMatrix;
  authorization: { reason: string; evidence: string };
  diskDirect?: boolean;
}): Promise<void> {
  if (
    !input.authorization.reason.trim() ||
    !input.authorization.evidence.trim()
  ) {
    throw new Error(
      "contract review matrix recovery requires reason and evidence",
    );
  }
  if (!input.change.contract) {
    throw new Error(
      "Cannot recover contract review matrix: no contract is set",
    );
  }
  const updated = {
    ...input.change,
    contract: { ...input.change.contract, reviewMatrix: input.reviewMatrix },
  } as Change;
  if (input.diskDirect) {
    await saveChange(input.store.paths.changes, updated);
  } else {
    await input.store.changes.save(updated);
    await bestEffortRefresh(input.store, input.change.id);
  }
}

const reviewMatrixRowSchema = z.object({
  contractId: z.string(),
  kind: ContractItemKindSchema,
  status: ContractEvidenceStatusSchema,
  evidencePolicy: ContractEvidencePolicySchema,
  evidence: z.string().min(1),
  notes: z.string().optional(),
});

function ensureRowsReferenceContract(
  change: Change,
  matrix: ContractReviewMatrix,
): string | undefined {
  if (!change.contract) {
    return "Cannot validate review matrix rows: no contract is set";
  }
  const contractIds = new Set(change.contract.items.map((item) => item.id));
  for (const row of matrix.rows) {
    if (!contractIds.has(row.contractId)) {
      return `Review matrix references unknown contract item: ${row.contractId}`;
    }
  }
  return undefined;
}

function hasSuppliedRows(
  rows?: z.infer<typeof reviewMatrixRowSchema>[],
): rows is z.infer<typeof reviewMatrixRowSchema>[] {
  return Array.isArray(rows) && rows.length > 0;
}

function hasSuppliedReviewMatrix(
  reviewMatrix?: ContractReviewMatrix,
): reviewMatrix is ContractReviewMatrix {
  return (
    Boolean(reviewMatrix?.reviewedAt?.trim()) &&
    Boolean(reviewMatrix?.rows?.length)
  );
}

export const contractTools = {
  adv_contract_mint: {
    description:
      "Mint a typed ChangeContract from the approved agreement artifact and persist it through the contractSetSignal path. Recovery is classified internally from machine evidence (D4/AC5).",
    args: {
      changeId: z.string().describe("Change ID to mint a contract for"),
      rigor: ContractRigorSchema.optional().describe(
        "Contract rigor to use. Defaults to standard.",
      ),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview the parsed contract without writing or signaling."),
      force: z
        .boolean()
        .optional()
        .describe(
          "Overwrite an existing contract. Required when a contract already exists because re-minting invalidates any review matrix.",
        ),
      approvedAt: z
        .string()
        .optional()
        .describe(
          "Optional ISO approval timestamp for the approved agreement. Defaults to discovery completion timestamp, or now when minting before discovery completion.",
        ),
      ...priorApprovalEvidenceArg,
      ...targetArgs,
    },
    execute: async (
      args: {
        changeId: string;
        rigor?: "minimal" | "standard" | "strict";
        dryRun?: boolean;
        force?: boolean;
        approvedAt?: string;
        priorApprovalEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) =>
      withContractStore(store, args, async (activeStore, projectContext) => {
        try {
          const change = await loadChange(activeStore, args.changeId);
          if (change.contract && !args.dryRun && !args.force) {
            return formatToolOutput({
              error:
                "Change already has a contract. Pass force: true to overwrite it and invalidate any existing review matrix.",
              changeId: args.changeId,
              existingItemCount: change.contract.items.length,
              hasReviewMatrix: Boolean(change.contract.reviewMatrix),
            });
          }
          const agreement = await readAgreement(activeStore, change);
          const warrantLookup = await buildWarrantLookup(activeStore);
          const contract = buildContractFromAgreement({
            agreement,
            approvedAt: contractApprovedAt({
              change,
              approvedAt: args.approvedAt,
            }),
            rigor: args.rigor,
            warrantLookup,
          });
          if (args.dryRun) {
            return formatToolOutput({
              success: true,
              dryRun: true,
              itemCount: contract.items.length,
              contract,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          const handle = await healthySignalHandle(activeStore, args.changeId);
          // D4 internal classification (rq-internalMonotonicRecovery01):
          // probe describe() to auto-classify poison/missing workflow without
          // operator-supplied recoveryMode/evidence (AC5/SC3).
          {
            const internalDecision = await classifyMutationRecoveryDecision({
              handle,
            });
            if (internalDecision.kind === "recover_via_disk") {
              await logRecoveryProbeDiagnostics(handle, args.changeId);
              await saveRecoveredContract({
                store: activeStore,
                change,
                contract,
                diskDirect: internalDecision.authority === "workflow_completed",
              });
              return formatToolOutput({
                success: true,
                changeId: args.changeId,
                itemCount: contract.items.length,
                contractIds: contract.items.map((item) => item.id),
                _recoveryMutation: true,
                recovered: true,
                recoveryMode: "poisoned_history",
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                note: `Disk-direct recovery; signal skipped (D4 auto-classified, authority=${internalDecision.authority})`,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            }
            if (internalDecision.kind === "operator_required") {
              return formatToolOutput({
                error: `Cannot safely mint contract: ${internalDecision.detail}`,
                code: "CONTRACT_MINT_OPERATOR_REQUIRED",
                cause: internalDecision.cause,
                changeId: args.changeId,
              });
            }
          }
          try {
            await fireSignalAndRefresh(
              handle,
              activeStore,
              args.changeId,
              contractSetSignal,
              { contract, updatedAt: new Date().toISOString() },
            );
          } catch (signalError) {
            // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
            // signal-error recovery is classified internally from the signal
            // error + describe() evidence via the unified classifier — no
            // operator-supplied recovery args.
            const decision = await classifyMutationRecoveryDecision({
              signalError,
              handle,
            });
            if (decision.kind === "recover_via_disk") {
              await saveRecoveredContract({
                store: activeStore,
                change,
                contract,
                diskDirect: decision.authority === "workflow_completed",
              });
              return formatToolOutput({
                success: true,
                changeId: args.changeId,
                itemCount: contract.items.length,
                contractIds: contract.items.map((item) => item.id),
                _recoveryMutation: true,
                recovered: true,
                recoveryMode: "poisoned_history",
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                note: `Disk-direct recovery after signal error (D4 auto-classified, authority=${decision.authority})`,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            }
            if (decision.kind === "operator_required") {
              return formatToolOutput({
                error: `Cannot safely mint contract: ${decision.detail}`,
                code: "CONTRACT_MINT_OPERATOR_REQUIRED",
                cause: decision.cause,
                changeId: args.changeId,
              });
            }
            throw signalError;
          }
          return formatToolOutput({
            success: true,
            changeId: args.changeId,
            itemCount: contract.items.length,
            contractIds: contract.items.map((item) => item.id),
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        } catch (error) {
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
            changeId: args.changeId,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
      }),
  },

  adv_contract_review_matrix_set: {
    description:
      "Persist a typed contract.reviewMatrix through the contractReviewMatrixSetSignal path. Missing/failing rows still block acceptance.",
    args: {
      changeId: z.string().describe("Change ID to review"),
      reviewedAt: z
        .string()
        .optional()
        .describe("ISO timestamp for the review matrix. Defaults to now."),
      rows: z
        .array(reviewMatrixRowSchema)
        .optional()
        .describe("Rows keyed to existing ChangeContract item IDs."),
      reviewMatrix: ContractReviewMatrixSchema.optional().describe(
        "Complete review matrix object. Use this instead of rows when the caller already has reviewedAt + rows.",
      ),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview the review matrix without writing or signaling."),
      ...priorApprovalEvidenceArg,
      ...targetArgs,
    },
    execute: async (
      args: {
        changeId: string;
        reviewedAt?: string;
        rows?: z.infer<typeof reviewMatrixRowSchema>[];
        reviewMatrix?: ContractReviewMatrix;
        dryRun?: boolean;
        priorApprovalEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) =>
      withContractStore(store, args, async (activeStore, projectContext) => {
        try {
          const change = await loadChange(activeStore, args.changeId);
          if (!change.contract) {
            return formatToolOutput({
              error: "Cannot set contract review matrix: no contract is set",
              changeId: args.changeId,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          const hasRows = hasSuppliedRows(args.rows);
          const hasReviewMatrix = hasSuppliedReviewMatrix(args.reviewMatrix);
          if (hasRows && hasReviewMatrix) {
            return formatToolOutput({
              error:
                "Provide either rows or reviewMatrix, not both, for contract review matrix persistence",
              changeId: args.changeId,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          if (!hasRows && !hasReviewMatrix) {
            return formatToolOutput({
              error:
                "adv_contract_review_matrix_set requires either rows or reviewMatrix with at least one row",
              changeId: args.changeId,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          const reviewMatrix = ContractReviewMatrixSchema.parse(
            hasReviewMatrix
              ? args.reviewMatrix
              : {
                  reviewedAt: args.reviewedAt ?? new Date().toISOString(),
                  rows: args.rows,
                },
          );
          const rowError = ensureRowsReferenceContract(change, reviewMatrix);
          if (rowError) {
            return formatToolOutput({
              error: rowError,
              changeId: args.changeId,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          if (args.dryRun) {
            return formatToolOutput({
              success: true,
              dryRun: true,
              rowCount: reviewMatrix.rows.length,
              reviewMatrix,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          const handle = await healthySignalHandle(activeStore, args.changeId);
          const mutationReceiptId = `mrec_${randomUUID()}`;
          // D4 internal classification (rq-internalMonotonicRecovery01).
          {
            const internalDecision = await classifyMutationRecoveryDecision({
              handle,
            });
            if (internalDecision.kind === "recover_via_disk") {
              await logRecoveryProbeDiagnostics(handle, args.changeId);
              await saveRecoveredReviewMatrix({
                store: activeStore,
                change,
                reviewMatrix,
                authorization: {
                  reason: internalDecision.reason,
                  evidence: internalDecision.evidence,
                },
                diskDirect: internalDecision.authority === "workflow_completed",
              });
              return formatToolOutput({
                success: true,
                changeId: args.changeId,
                rowCount: reviewMatrix.rows.length,
                failingRows: reviewMatrix.rows.filter((row) =>
                  isFailingContractReviewStatus(row.status),
                ).length,
                _recoveryMutation: true,
                recovered: true,
                recoveryMode: "poisoned_history",
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                note: `Disk-direct recovery; signal skipped (D4 auto-classified, authority=${internalDecision.authority})`,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            }
            if (internalDecision.kind === "operator_required") {
              return formatToolOutput({
                error: `Cannot safely set review matrix: ${internalDecision.detail}`,
                code: "CONTRACT_REVIEW_MATRIX_OPERATOR_REQUIRED",
                cause: internalDecision.cause,
                changeId: args.changeId,
              });
            }
          }
          try {
            await fireSignalAndRefresh(
              handle,
              activeStore,
              args.changeId,
              contractReviewMatrixSetSignal,
              {
                reviewMatrix,
                updatedAt: new Date().toISOString(),
                mutationReceiptId,
              },
            );
          } catch (signalError) {
            if (signalError instanceof MutationApplicationUnconfirmedError) {
              return formatToolOutput({
                error: signalError.message,
                code: signalError.code,
                changeId: args.changeId,
                mutationReceiptId,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            }
            // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
            // signal-error recovery is classified internally from the signal
            // error + describe() evidence via the unified classifier.
            const decision = await classifyMutationRecoveryDecision({
              signalError,
              handle,
            });
            if (decision.kind === "recover_via_disk") {
              await saveRecoveredReviewMatrix({
                store: activeStore,
                change,
                reviewMatrix,
                authorization: {
                  reason: decision.reason,
                  evidence: decision.evidence,
                },
                diskDirect: decision.authority === "workflow_completed",
              });
              return formatToolOutput({
                success: true,
                changeId: args.changeId,
                rowCount: reviewMatrix.rows.length,
                failingRows: reviewMatrix.rows.filter((row) =>
                  isFailingContractReviewStatus(row.status),
                ).length,
                _recoveryMutation: true,
                recovered: true,
                recoveryMode: "poisoned_history",
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                note: `Disk-direct recovery after signal error (D4 auto-classified, authority=${decision.authority})`,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            }
            if (decision.kind === "operator_required") {
              return formatToolOutput({
                error: `Cannot safely set review matrix: ${decision.detail}`,
                code: "CONTRACT_REVIEW_MATRIX_OPERATOR_REQUIRED",
                cause: decision.cause,
                changeId: args.changeId,
              });
            }
            throw signalError;
          }
          return formatToolOutput({
            success: true,
            changeId: args.changeId,
            rowCount: reviewMatrix.rows.length,
            failingRows: reviewMatrix.rows.filter((row) =>
              isFailingContractReviewStatus(row.status),
            ).length,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        } catch (error) {
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
            changeId: args.changeId,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
      }),
  },
};
