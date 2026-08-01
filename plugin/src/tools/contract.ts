import { z } from "zod";
import type { Store } from "../storage/store";
import { readArtifact } from "./change/artifacts";
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
  changeStateQuery,
  contractReviewMatrixSetSignal,
  contractSetSignal,
} from "../temporal/messages";
import type { ChangeWorkflowState } from "../temporal/contracts";
import { acceptanceCriteriaFromContract } from "../temporal/change-state";
import {
  coordinateChangeMutation,
  resolveChangeAuthority,
} from "./change-mutation-coordinator";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import { buildContractFromAgreement } from "../validator/contract-mint";
import type { WarrantLookup } from "../validator/warrant";
import {
  RECOVERY_RECONCILIATION_WARNING,
  isFailingContractReviewStatus,
} from "../temporal/recovery-classification";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
import { logRecoveryProbeDiagnostics } from "./recovery-probe";
import { classifyMutationRecoveryDecision } from "./monotonic-recovery";
import { saveRecoveredContractReviewMatrix } from "./_recovery-writers";
import {
  formatTargetProjectContext,
  withTargetPathStore,
} from "./target-project";

const toolRegistryPromise = import("../tool-registry");

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
 * The tool surface is read from the assembled tool registry. A module-level
 * dynamic import promise is kicked off at load time so the registry is already
 * resolving when the handler runs; this avoids the >5s first-call latency under
 * Vitest that produced test timeouts, while still avoiding a static import cycle
 * with tool-registry.ts.
 *
 * Spec ids are collected best-effort from the active store; if specs are
 * unreadable, spec:* warrants simply do not resolve (fail-closed) rather than
 * throwing here.
 */
async function buildWarrantLookup(store: Store): Promise<WarrantLookup> {
  const { getToolSurface } = await toolRegistryPromise;
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

async function saveRecoveredContract(input: {
  store: Store;
  change: Change;
  contract: Change["contract"];
  diskDirect?: boolean;
}): Promise<void> {
  if (!input.contract) {
    throw new Error("Cannot recover contract: no contract is set");
  }
  const contract = input.contract;
  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      kind: input.diskDirect ? "workflow_completed" : "workflow_poisoned",
      evidence: {
        reason: input.diskDirect ? "missing_workflow" : "poisoned_history",
        evidence: "contract recovery after signal classification",
      },
    },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.change.id,
      mutationKind: "contract_set",
      sendSignal: async (_h, _payload) => {},
      refresh: async () => ({}) as never,
      verifyTemporal: () => true,
      mutateLatestProjection: (latest) => ({
        ...latest,
        contract,
        acceptanceCriteria: acceptanceCriteriaFromContract(contract),
      }),
      verifyProjection: (readback) =>
        readback.contract?.version === contract.version &&
        readback.contract?.items.length === contract.items.length,
    },
  });
  switch (outcome.kind) {
    case "recovered_verified":
    case "applied_temporal":
      return;
    case "recovered_unverified":
      throw new Error(
        `Contract recovery for ${input.change.id} wrote the projection but the postcondition could not be verified: ${outcome.reason}`,
      );
    case "stale_revision":
      throw new Error(
        `Contract recovery for ${input.change.id} encountered a stale projection revision: expected ${outcome.expected}, actual ${outcome.actual}`,
      );
    case "operator_required":
      throw new Error(
        `Cannot recover contract for ${input.change.id}: ${outcome.reason}`,
      );
    default: {
      const _exhaustive: never = outcome;
      throw new Error(
        `Unexpected contract recovery outcome: ${String(_exhaustive)}`,
      );
    }
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

function reviewMatrixPostcondition(
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
                  reviewedAt:
                    args.reviewedAt ??
                    args.reviewMatrix?.reviewedAt ??
                    new Date().toISOString(),
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
          const authority = await resolveChangeAuthority({
            changeId: args.changeId,
            handle,
          });
          if (authority.kind === "operator_required") {
            return formatToolOutput({
              error: `Cannot safely set review matrix: ${authority.reason}`,
              code: "CONTRACT_REVIEW_MATRIX_OPERATOR_REQUIRED",
              changeId: args.changeId,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }

          const rowCount = reviewMatrix.rows.length;
          const failingRows = reviewMatrix.rows.filter((row) =>
            isFailingContractReviewStatus(row.status),
          ).length;

          if (authority.kind !== "temporal_live") {
            await logRecoveryProbeDiagnostics(handle, args.changeId);
            await saveRecoveredContractReviewMatrix({
              store: activeStore,
              change,
              reviewMatrix,
              authorization: {
                reason:
                  authority.evidence.reason === "poisoned_history"
                    ? "poisoned_history_contract_review_matrix_recovery"
                    : "completed_workflow_contract_review_matrix_recovery",
                evidence: authority.evidence.evidence,
              },
            });
            return formatToolOutput({
              success: true,
              changeId: args.changeId,
              rowCount,
              failingRows,
              _recoveryMutation: true,
              recovered: true,
              recoveryMode: "poisoned_history",
              reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
              note: `Disk-direct recovery; signal skipped (authority=${authority.kind})`,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }

          const updatedAt = new Date().toISOString();
          const auditedMatrix = {
            ...reviewMatrix,
            recovery_audit: {
              reason: "poisoned_history_contract_review_matrix_recovery",
              evidence: "signal dispatch failed after auto-classification",
              recovered_at: new Date().toISOString(),
            },
          };
          try {
            const outcome = await coordinateChangeMutation<ChangeWorkflowState>(
              {
                authority,
                changesDir: activeStore.paths.changes,
                intent: {
                  changeId: args.changeId,
                  mutationKind: "contract_review_matrix_set",
                  payload: (mutationReceiptId) => ({
                    reviewMatrix,
                    updatedAt,
                    mutationReceiptId,
                  }),
                  sendSignal: async (h, payload) => {
                    await h.signal(contractReviewMatrixSetSignal, payload);
                  },
                  refresh: async (h) =>
                    h.query(changeStateQuery) as Promise<ChangeWorkflowState>,
                  verifyTemporal: (state) =>
                    reviewMatrixPostcondition(
                      state.contract?.reviewMatrix,
                      reviewMatrix,
                    ),
                  mutateLatestProjection: (latest) => ({
                    ...latest,
                    contract: latest.contract
                      ? { ...latest.contract, reviewMatrix }
                      : undefined,
                  }),
                  recoveryMutateLatestProjection: (latest) => ({
                    ...latest,
                    contract: latest.contract
                      ? { ...latest.contract, reviewMatrix: auditedMatrix }
                      : undefined,
                  }),
                  verifyProjection: (readback) =>
                    reviewMatrixPostcondition(
                      readback.contract?.reviewMatrix,
                      reviewMatrix,
                    ),
                },
              },
            );

            switch (outcome.kind) {
              case "applied_temporal":
                return formatToolOutput({
                  success: true,
                  changeId: args.changeId,
                  rowCount,
                  failingRows,
                  ...(projectContext
                    ? { _projectContext: projectContext }
                    : {}),
                });
              case "recovered_verified":
                return formatToolOutput({
                  success: true,
                  changeId: args.changeId,
                  rowCount,
                  failingRows,
                  _recoveryMutation: true,
                  recovered: true,
                  recoveryMode: "poisoned_history",
                  reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                  note: `Disk-direct recovery after signal error (coordinator)`,
                  ...(projectContext
                    ? { _projectContext: projectContext }
                    : {}),
                });
              case "recovered_unverified":
                return formatToolOutput({
                  error: `Review matrix recovery wrote the disk projection but the postcondition could not be verified: ${outcome.reason}`,
                  code: "CONTRACT_REVIEW_MATRIX_RECOVERY_UNVERIFIED",
                  changeId: args.changeId,
                  ...(projectContext
                    ? { _projectContext: projectContext }
                    : {}),
                });
              case "stale_revision":
                return formatToolOutput({
                  error: `Review matrix recovery encountered a stale projection revision: expected ${outcome.expected}, actual ${outcome.actual}`,
                  code: "CONTRACT_REVIEW_MATRIX_STALE_REVISION",
                  changeId: args.changeId,
                  ...(projectContext
                    ? { _projectContext: projectContext }
                    : {}),
                });
              case "operator_required":
                return formatToolOutput({
                  error: `Cannot safely set review matrix: ${outcome.reason}`,
                  code: "CONTRACT_REVIEW_MATRIX_OPERATOR_REQUIRED",
                  changeId: args.changeId,
                  ...(projectContext
                    ? { _projectContext: projectContext }
                    : {}),
                });
              default: {
                const _exhaustive: never = outcome;
                throw new Error(
                  `Unexpected review matrix mutation outcome: ${String(_exhaustive)}`,
                );
              }
            }
          } catch (signalError) {
            const decision = await classifyMutationRecoveryDecision({
              signalError,
              handle,
            });
            if (decision.kind === "recover_via_disk") {
              await logRecoveryProbeDiagnostics(handle, args.changeId);
              await saveRecoveredContractReviewMatrix({
                store: activeStore,
                change,
                reviewMatrix,
                authorization: {
                  reason: decision.reason,
                  evidence: decision.evidence,
                },
              });
              return formatToolOutput({
                success: true,
                changeId: args.changeId,
                rowCount,
                failingRows,
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
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            }
            throw signalError;
          }
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
