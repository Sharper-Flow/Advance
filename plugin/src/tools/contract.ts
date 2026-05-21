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
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import { buildContractFromAgreement } from "../validator/contract-mint";
import { isPoisonedHistoryError } from "../temporal/recovery-classification";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
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

async function readAgreement(store: Store, changeId: string): Promise<string> {
  const text = await readFile(
    join(store.paths.changes, changeId, "agreement.md"),
    "utf-8",
  );
  if (!text.trim()) throw new Error(`Agreement artifact is empty: ${changeId}`);
  return text;
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

const RECOVERY_RECONCILIATION_WARNING =
  "Poisoned-history recovery wrote the disk projection only; the Temporal workflow is not healed and stale workflow state may diverge if it becomes queryable later. Complete recovery in this session and archive or close promptly.";

type RecoveryMarkedChange = Change & {
  _recovery?: { reason?: string };
};

function hasPoisonedHistoryMarker(change: Change): boolean {
  return (
    (change as RecoveryMarkedChange)._recovery?.reason === "poisoned_history"
  );
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
  const updated = {
    ...input.change,
    contract: input.contract,
    acceptanceCriteria: input.contract?.items
      .filter((item) => item.kind === "acceptance_criterion")
      .map((item) => item.text),
  } as Change;
  await input.store.changes.save(updated);
  await bestEffortRefresh(input.store, input.change.id);
}

async function saveRecoveredReviewMatrix(input: {
  store: Store;
  change: Change;
  reviewMatrix: ContractReviewMatrix;
}): Promise<void> {
  const updated = {
    ...input.change,
    contract: input.change.contract
      ? { ...input.change.contract, reviewMatrix: input.reviewMatrix }
      : undefined,
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
  const contractIds = new Set(change.contract?.items.map((item) => item.id));
  for (const row of matrix.rows) {
    if (!contractIds.has(row.contractId)) {
      return `Review matrix references unknown contract item: ${row.contractId}`;
    }
  }
  return undefined;
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
          const agreement = await readAgreement(activeStore, args.changeId);
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
          if (
            args.recoveryMode === "poisoned_history" &&
            hasPoisonedHistoryMarker(change)
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
          try {
            const handle = await healthySignalHandle(
              activeStore,
              args.changeId,
            );
            await fireSignalAndRefresh(
              handle,
              activeStore,
              args.changeId,
              contractSetSignal,
              { contract, updatedAt: new Date().toISOString() },
            );
          } catch (signalError) {
            if (
              args.recoveryMode === "poisoned_history" &&
              isPoisonedHistoryError(signalError)
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
          if (args.rows && args.reviewMatrix) {
            return formatToolOutput({
              error:
                "Provide either rows or reviewMatrix, not both, for contract review matrix persistence",
              changeId: args.changeId,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          if (!args.rows && !args.reviewMatrix) {
            return formatToolOutput({
              error:
                "adv_contract_review_matrix_set requires either rows or reviewMatrix",
              changeId: args.changeId,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          const reviewMatrix = ContractReviewMatrixSchema.parse(
            args.reviewMatrix ?? {
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
          if (
            args.recoveryMode === "poisoned_history" &&
            hasPoisonedHistoryMarker(change)
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
                ["fail", "violated", "unknown"].includes(row.status),
              ).length,
              _recoveryMutation: true,
              reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          try {
            const handle = await healthySignalHandle(
              activeStore,
              args.changeId,
            );
            await fireSignalAndRefresh(
              handle,
              activeStore,
              args.changeId,
              contractReviewMatrixSetSignal,
              { reviewMatrix, updatedAt: new Date().toISOString() },
            );
          } catch (signalError) {
            if (
              args.recoveryMode === "poisoned_history" &&
              isPoisonedHistoryError(signalError)
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
                  ["fail", "violated", "unknown"].includes(row.status),
                ).length,
                _recoveryMutation: true,
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            }
            throw signalError;
          }
          return formatToolOutput({
            success: true,
            changeId: args.changeId,
            rowCount: reviewMatrix.rows.length,
            failingRows: reviewMatrix.rows.filter((row) =>
              ["fail", "violated", "unknown"].includes(row.status),
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
