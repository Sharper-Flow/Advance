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
import type { ContractEvidenceStatus } from "../types";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
import { formatToolOutput } from "../utils/tool-output";
import { buildContractFromAgreement } from "../validator/contract-mint";
import type { WarrantLookup } from "../validator/warrant";
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
      stateRequirement: "authoritative",
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
 * The tool surface is read from the assembled tool registry only when the
 * approved agreement declares a warrant. Behavioral-only agreements have no
 * capability reference to resolve, so they must not wait for the registry's
 * cycle-breaking dynamic import.
 *
 * Spec ids are collected best-effort from the active store; if specs are
 * unreadable, spec:* warrants simply do not resolve (fail-closed) rather than
 * throwing here.
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
  // AC8 (completeStateBackedGate): persisted-state-first ordering, matching the
  // canonical readArtifact (tools/change.ts): state.documents.agreement →
  // disk active dir → archive bundle. Previously this reader was disk-first,
  // the lone outlier among artifact readers; in the persisted-state-canonical
  // architecture state.documents is the source of truth and disk is the legacy
  // fallback. readArtifact already encodes the full fallback chain, so we
  // delegate to it. change.ts does not import from contract.ts, so this is a
  // one-directional dependency with no import cycle.
  const content = (await readArtifact(store, change.id, "agreement"))?.content;
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

function isFailingContractReviewStatus(
  status: ContractEvidenceStatus,
): boolean {
  return ["fail", "violated", "unknown"].includes(status);
}

const contractToolDefinitions = {
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
          const warrantLookup = /\[warrant:/i.test(agreement)
            ? await buildWarrantLookup(activeStore)
            : undefined;
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
          const outcome = await coordinateChangeMutation<Change>({
            authority: {
              reason: "mint contract from approved agreement",
              evidence:
                args.priorApprovalEvidence ?? "approved agreement artifact",
            },
            changesDir: activeStore.paths.changes,
            intent: {
              changeId: args.changeId,
              mutationKind: "contract_set",
              mutateLatestProjection: (latest) => ({
                ...latest,
                contract,
                acceptanceCriteria: contract.items
                  .filter((item) => item.kind === "acceptance_criterion")
                  .map((item) => item.text),
              }),
              verifyProjection: (readback) =>
                readback.contract?.version === contract.version &&
                readback.contract.items.length === contract.items.length,
            },
          });
          if (outcome.kind === "unverified") {
            return formatToolOutput({
              error: `Contract projection was written but could not be verified: ${outcome.reason}`,
              code: "CONTRACT_MINT_UNVERIFIED",
              changeId: args.changeId,
            });
          }
          if (outcome.kind !== "verified") {
            return formatToolOutput({
              error: `Cannot safely mint contract: ${outcome.kind === "stale_revision" ? `stale revision (expected ${outcome.expected}, actual ${outcome.actual})` : outcome.reason}`,
              code: "CONTRACT_MINT_OPERATOR_REQUIRED",
              changeId: args.changeId,
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
          const rowCount = reviewMatrix.rows.length;
          const failingRows = reviewMatrix.rows.filter((row) =>
            isFailingContractReviewStatus(row.status),
          ).length;

          const outcome = await coordinateChangeMutation<Change>({
            authority: {
              reason: "record contract review matrix",
              evidence:
                args.priorApprovalEvidence ??
                "review matrix supplied by caller",
            },
            changesDir: activeStore.paths.changes,
            intent: {
              changeId: args.changeId,
              mutationKind: "contract_review_matrix_set",
              mutateLatestProjection: (latest) => ({
                ...latest,
                contract: latest.contract
                  ? { ...latest.contract, reviewMatrix }
                  : undefined,
              }),
              verifyProjection: (readback) =>
                reviewMatrixPostcondition(
                  readback.contract?.reviewMatrix,
                  reviewMatrix,
                ),
            },
          });

          switch (outcome.kind) {
            case "verified":
              return formatToolOutput({
                success: true,
                changeId: args.changeId,
                rowCount,
                failingRows,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            case "unverified":
              return formatToolOutput({
                error: `Review matrix wrote the disk projection but the postcondition could not be verified: ${outcome.reason}`,
                code: "CONTRACT_REVIEW_MATRIX_UNVERIFIED",
                changeId: args.changeId,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            case "stale_revision":
              return formatToolOutput({
                error: `Review matrix encountered a stale projection revision: expected ${outcome.expected}, actual ${outcome.actual}`,
                code: "CONTRACT_REVIEW_MATRIX_STALE_REVISION",
                changeId: args.changeId,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
            case "operator_required":
              return formatToolOutput({
                error: `Cannot safely set review matrix: ${outcome.reason}`,
                code: "CONTRACT_REVIEW_MATRIX_OPERATOR_REQUIRED",
                changeId: args.changeId,
                ...(projectContext ? { _projectContext: projectContext } : {}),
              });
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

const {
  adv_contract_mint: _contractMintDefinition,
  adv_contract_review_matrix_set: _contractReviewMatrixSetDefinition,
  ...contractPublicTools
} = contractToolDefinitions;

export { contractPublicTools };
