import { readFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import type { Store } from "../storage/store";
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
import {
  RECOVERY_RECONCILIATION_WARNING,
  isFailingContractReviewStatus,
  isPrecisePoisonedHistoryEvidence,
} from "../temporal/recovery-classification";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
import { workflowHasPoisonedRecoveryEvidence } from "./recovery-probe";
import {
  formatTargetProjectContext,
  withTargetPathStore,
} from "./target-project";

const targetArgs = {
  target_path: z.string().optional(),
  target_confirmed: z.literal(true).optional(),
  confirmationEvidence: z.string().optional(),
};

const recoveryArgs = {
  recoveryMode: z.enum(["normal", "poisoned_history"]).optional(),
  recoveryEvidence: z.string().optional(),
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

function assertSafeChangeId(changeId: string): void {
  if (/\.\.|[\\/\0]/.test(changeId)) {
    throw new Error(
      `Invalid changeId for agreement artifact path: ${changeId}`,
    );
  }
}

async function readAgreement(store: Store, change: Change): Promise<string> {
  assertSafeChangeId(change.id);
  const cached = change.documents?.agreement;
  try {
    const text = await readFile(
      join(store.paths.changes, change.id, "agreement.md"),
      "utf-8",
    );
    if (text.trim()) return text;
    if (cached?.trim()) return cached;
    throw new Error(`Agreement artifact is empty: ${change.id}`);
  } catch (error) {
    if (cached?.trim()) return cached;
    throw error;
  }
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

function recoveryEvidenceError(input: {
  recoveryMode?: "normal" | "poisoned_history";
  recoveryEvidence?: string;
}): string | undefined {
  if (
    input.recoveryMode === "poisoned_history" &&
    !input.recoveryEvidence?.trim()
  ) {
    return "poisoned_history recovery requires non-empty recoveryEvidence";
  }
  if (
    input.recoveryMode === "poisoned_history" &&
    input.recoveryEvidence &&
    !isPrecisePoisonedHistoryEvidence(input.recoveryEvidence)
  ) {
    return "poisoned_history recoveryEvidence must cite precise poisoned-history evidence";
  }
  return undefined;
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
}): Promise<void> {
  if (!input.contract) {
    throw new Error("Cannot recover contract: no contract is set");
  }
  const updated = {
    ...input.change,
    contract: input.contract,
    acceptanceCriteria: acceptanceCriteriaFromContract(input.contract),
  } as Change;
  await input.store.changes.save(updated);
  await bestEffortRefresh(input.store, input.change.id);
}

async function saveRecoveredReviewMatrix(input: {
  store: Store;
  change: Change;
  reviewMatrix: ContractReviewMatrix;
}): Promise<void> {
  if (!input.change.contract) {
    throw new Error(
      "Cannot recover contract review matrix: no contract is set",
    );
  }
  const updated = {
    ...input.change,
    contract: { ...input.change.contract, reviewMatrix: input.reviewMatrix },
  } as Change;
  await input.store.changes.save(updated);
  await bestEffortRefresh(input.store, input.change.id);
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
      "Mint a typed ChangeContract from the approved agreement artifact and persist it through the contractSetSignal path. Recovery mode is explicit/audited and reserved for poisoned-history repair.",
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
      ...recoveryArgs,
      ...targetArgs,
    },
    execute: async (
      args: {
        changeId: string;
        rigor?: "minimal" | "standard" | "strict";
        dryRun?: boolean;
        force?: boolean;
        approvedAt?: string;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) =>
      withContractStore(store, args, async (activeStore, projectContext) => {
        try {
          const recoveryError = recoveryEvidenceError(args);
          if (recoveryError) return formatToolOutput({ error: recoveryError });
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
          const contract = buildContractFromAgreement({
            agreement,
            approvedAt: contractApprovedAt({
              change,
              approvedAt: args.approvedAt,
            }),
            rigor: args.rigor,
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
          try {
            await fireSignalAndRefresh(
              handle,
              activeStore,
              args.changeId,
              contractSetSignal,
              { contract, updatedAt: new Date().toISOString() },
            );
          } catch (signalError) {
            // rq-fix-gate-tools-recovery AC3: poisoned-history mint recovers
            // when EITHER the signal error matches the legacy regex OR the
            // workflow's own describe carries poisoned evidence.
            if (
              args.recoveryMode === "poisoned_history" &&
              (await workflowHasPoisonedRecoveryEvidence(handle, {
                signalError,
              }))
            ) {
              await saveRecoveredContract({
                store: activeStore,
                change,
                contract,
              });
              return formatToolOutput({
                success: true,
                changeId: args.changeId,
                itemCount: contract.items.length,
                contractIds: contract.items.map((item) => item.id),
                _recoveryMutation: true,
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            }
            throw signalError;
          }
          // rq-fix-gate-tools-recovery AC3: if signal "succeeded" but the
          // workflow is in fact poisoned (signal silently ignored), persist
          // the contract to the disk projection so subsequent reads see it.
          if (
            args.recoveryMode === "poisoned_history" &&
            (await workflowHasPoisonedRecoveryEvidence(handle))
          ) {
            await saveRecoveredContract({
              store: activeStore,
              change,
              contract,
            });
            return formatToolOutput({
              success: true,
              changeId: args.changeId,
              itemCount: contract.items.length,
              contractIds: contract.items.map((item) => item.id),
              _recoveryMutation: true,
              reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
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
      ...recoveryArgs,
      ...targetArgs,
    },
    execute: async (
      args: {
        changeId: string;
        reviewedAt?: string;
        rows?: z.infer<typeof reviewMatrixRowSchema>[];
        reviewMatrix?: ContractReviewMatrix;
        dryRun?: boolean;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) =>
      withContractStore(store, args, async (activeStore, projectContext) => {
        try {
          const recoveryError = recoveryEvidenceError(args);
          if (recoveryError) return formatToolOutput({ error: recoveryError });
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
          try {
            await fireSignalAndRefresh(
              handle,
              activeStore,
              args.changeId,
              contractReviewMatrixSetSignal,
              { reviewMatrix, updatedAt: new Date().toISOString() },
            );
          } catch (signalError) {
            // rq-fix-gate-tools-recovery AC4: review-matrix poisoned recovery
            // also runs when describe carries poisoned evidence.
            if (
              args.recoveryMode === "poisoned_history" &&
              (await workflowHasPoisonedRecoveryEvidence(handle, {
                signalError,
              }))
            ) {
              await saveRecoveredReviewMatrix({
                store: activeStore,
                change,
                reviewMatrix,
              });
              return formatToolOutput({
                success: true,
                changeId: args.changeId,
                rowCount: reviewMatrix.rows.length,
                failingRows: reviewMatrix.rows.filter((row) =>
                  isFailingContractReviewStatus(row.status),
                ).length,
                _recoveryMutation: true,
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            }
            throw signalError;
          }
          // rq-fix-gate-tools-recovery AC4: persist when signal "succeeded"
          // but workflow is in fact poisoned.
          if (
            args.recoveryMode === "poisoned_history" &&
            (await workflowHasPoisonedRecoveryEvidence(handle))
          ) {
            await saveRecoveredReviewMatrix({
              store: activeStore,
              change,
              reviewMatrix,
            });
            return formatToolOutput({
              success: true,
              changeId: args.changeId,
              rowCount: reviewMatrix.rows.length,
              failingRows: reviewMatrix.rows.filter((row) =>
                isFailingContractReviewStatus(row.status),
              ).length,
              _recoveryMutation: true,
              reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
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
