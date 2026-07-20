import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Store } from "../storage/store-types";
import { getService } from "../temporal/service";
import { verificationEvidenceDispositionedSignal } from "../temporal/messages";
import { VerificationEvidenceDispositionSchema, type Change } from "../types";
import {
  isPreciseWorkflowRecoveryEvidence,
  RECOVERY_RECONCILIATION_WARNING,
} from "../temporal/recovery-classification";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import {
  fireSignalAndRefresh,
  getChangeHandle,
  MutationApplicationUnconfirmedError,
} from "./_adapters";
import { saveRecoveredVerificationEvidenceDisposition } from "./_recovery-writers";
import {
  classifyCompletedOrPoisonedRecovery,
  logRecoveryProbeDiagnostics,
  shouldTakeRecoveryBranch,
} from "./recovery-probe";
import {
  formatTargetProjectContext,
  withTargetPathStore,
  type TargetProjectOutputContext,
} from "./target-project";

const targetArgs = {
  target_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute path to another ADV project. When provided, routes the operation through that project's target store.",
    ),
  target_confirmed: z
    .literal(true)
    .optional()
    .describe(
      "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
    ),
  confirmationEvidence: z
    .string()
    .optional()
    .describe(
      "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
    ),
};

// Disposition vocabulary deliberately excludes any accepted_debt verb: an
// unresolved verification-evidence gap is never a terminal accepted state.
const VERIFICATION_EVIDENCE_DISPOSITIONS = [
  "fixed",
  "rejected_with_evidence",
  "split",
  "fast_follow",
] as const;

interface DispositionArgs {
  changeId: string;
  taskId: string;
  concernKey: string;
  disposition: (typeof VERIFICATION_EVIDENCE_DISPOSITIONS)[number];
  evidence: string;
  dryRun?: boolean;
  recoveryMode?: "normal" | "poisoned_history";
  recoveryEvidence?: string;
  recoveryReason?: string;
  priorApprovalEvidence?: string;
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
}

function recoveryEvidenceError(args: DispositionArgs): string | undefined {
  if (args.recoveryMode !== "poisoned_history") return undefined;
  if (!args.recoveryEvidence?.trim()) {
    return "verification-evidence disposition recovery requires non-empty recoveryEvidence";
  }
  if (!isPreciseWorkflowRecoveryEvidence(args.recoveryEvidence)) {
    return "verification-evidence disposition recoveryEvidence must cite precise poisoned-history or completed-workflow evidence";
  }
  if (!args.recoveryReason?.trim()) {
    return "verification-evidence disposition recovery requires recoveryReason";
  }
  return undefined;
}

async function getChangeHandleForChangeId(store: Store, changeId: string) {
  const bundle = getService();
  if (!bundle) throw new Error("Temporal service not available");
  const projectId =
    store.productContext?.productProjectId ??
    (await getProjectId(store.paths.root));
  if (!projectId) throw new Error("Could not resolve project ID");
  return getChangeHandle(bundle.client, projectId, changeId);
}

async function loadChange(store: Store, changeId: string): Promise<Change> {
  const result = await store.changes.get(changeId);
  if (!result.success) throw new Error(result.error);
  if (!result.data) throw new Error(`Change not found: ${changeId}`);
  return result.data;
}

async function executeDisposition(
  args: DispositionArgs,
  store: Store,
  projectContext?: TargetProjectOutputContext,
): Promise<string> {
  const proj = projectContext ? { _projectContext: projectContext } : {};

  const recoveryError = recoveryEvidenceError(args);
  if (recoveryError) {
    return formatToolOutput({ error: recoveryError, changeId: args.changeId });
  }

  const change = await loadChange(store, args.changeId);
  const taskExists = (change.tasks ?? []).some((t) => t.id === args.taskId);
  if (!taskExists) {
    return formatToolOutput({
      error: `Task not found in change ${args.changeId}: ${args.taskId}`,
      changeId: args.changeId,
      ...proj,
    });
  }

  // Structural validation owns correctness: the typed schema rejects blank
  // evidence/keys and any non-enumerated disposition verb.
  const parsed = VerificationEvidenceDispositionSchema.safeParse({
    taskId: args.taskId,
    concernKey: args.concernKey,
    disposition: args.disposition,
    evidence: args.evidence,
    dispositionedAt: new Date().toISOString(),
  });
  if (!parsed.success) {
    return formatToolOutput({
      error: `Invalid verification-evidence disposition: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      changeId: args.changeId,
      ...proj,
    });
  }
  const disposition = parsed.data;

  if (args.dryRun) {
    return formatToolOutput({
      success: true,
      dryRun: true,
      changeId: args.changeId,
      disposition,
      ...proj,
    });
  }

  const handle = await getChangeHandleForChangeId(store, args.changeId);

  // Probe-first recovery: when the operator supplies precise evidence, take the
  // disk-direct path WITHOUT firing the signal. Temporal signals are
  // fire-and-forget (server acceptance, not workflow processing); on a
  // poisoned replay the signal silently resolves, so the existing catch-branch
  // is unreachable for the common poison case. shouldTakeRecoveryBranch
  // already enforces recoveryMode=poisoned_history AND precise evidence via
  // isPreciseWorkflowRecoveryEvidence; recoveryEvidenceError validated the
  // reason above. SaveRecoveredVerificationEvidenceDisposition is the SAME
  // writer the catch-branch uses; reusing it preserves audit + idempotency.
  if (shouldTakeRecoveryBranch(args)) {
    await logRecoveryProbeDiagnostics(handle, args.changeId);
    await saveRecoveredVerificationEvidenceDisposition({
      store,
      change,
      authorization: {
        reason: args.recoveryReason?.trim() ?? "",
        evidence: args.recoveryEvidence?.trim() ?? "",
      },
      disposition,
    });
    return formatToolOutput({
      success: true,
      changeId: args.changeId,
      disposition,
      _recoveryMutation: true,
      recovered: true,
      recoveryMode: args.recoveryMode,
      reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
      note: "Disk-direct recovery; signal skipped (operator-supplied precise evidence)",
      ...proj,
    });
  }

  const mutationReceiptId = `mrec_${randomUUID()}`;
  try {
    await fireSignalAndRefresh(
      handle,
      store,
      args.changeId,
      verificationEvidenceDispositionedSignal,
      { ...disposition, mutationReceiptId },
    );
  } catch (signalError) {
    if (signalError instanceof MutationApplicationUnconfirmedError) {
      return formatToolOutput({
        error: signalError.message,
        code: signalError.code,
        changeId: args.changeId,
        mutationReceiptId,
      });
    }
    // Poisoned-history recovery must remain explicit, typed, audited, and gated
    // on completed/poisoned workflow evidence.
    if (args.recoveryMode === "poisoned_history") {
      const { recover } = await classifyCompletedOrPoisonedRecovery(
        handle,
        signalError,
      );
      if (recover) {
        await saveRecoveredVerificationEvidenceDisposition({
          store,
          change,
          authorization: {
            reason: args.recoveryReason?.trim() ?? "",
            evidence: args.recoveryEvidence?.trim() ?? "",
          },
          disposition,
        });
        return formatToolOutput({
          success: true,
          changeId: args.changeId,
          disposition,
          _recoveryMutation: true,
          recovered: true,
          recoveryMode: args.recoveryMode,
          reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
          ...proj,
        });
      }
    }
    throw signalError;
  }

  return formatToolOutput({
    success: true,
    changeId: args.changeId,
    disposition,
    ...proj,
  });
}

export const verificationEvidenceTools = {
  adv_verification_evidence_disposition: {
    description:
      "Record a typed disposition for a verification-evidence gap on a completed task with a proof-bearing evidence policy (test, static_check, review, artifact_reference) — an unresolved verification_missing / verification_mismatch warning that would otherwise produce a VERIFICATION_EVIDENCE_MISSING acceptance/release blocker. Clears the structural block for that (taskId, concernKey). Disposition verbs: fixed | rejected_with_evidence | split | fast_follow — there is no accepted_debt path.",
    args: {
      changeId: z.string().describe("Change ID that owns the task."),
      taskId: z
        .string()
        .describe("Task ID the verification-evidence gap was raised against."),
      concernKey: z
        .string()
        .describe(
          "Stable concern key from the structural blocker; use 'verification' for the per-task verification-evidence gap.",
        ),
      disposition: z
        .enum(VERIFICATION_EVIDENCE_DISPOSITIONS)
        .describe(
          "How the gap is resolved. No accepted_debt: use fixed, rejected_with_evidence, split, or fast_follow.",
        ),
      evidence: z
        .string()
        .describe(
          "Required non-blank evidence/rationale for the disposition (e.g. adv_run_test run id, PR link, fast-follow change ID, reasoning).",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview the disposition without firing the signal."),
      recoveryMode: z
        .enum(["normal", "poisoned_history"])
        .optional()
        .describe(
          "Optional recovery mode. Default 'normal'. 'poisoned_history' authorizes an audited disk-projection fallback when the normal signal path fails with poisoned/completed-workflow evidence.",
        ),
      recoveryEvidence: z
        .string()
        .optional()
        .describe(
          "Required when recoveryMode='poisoned_history'. Must cite precise poisoned-history or completed-workflow evidence.",
        ),
      recoveryReason: z
        .string()
        .optional()
        .describe(
          "Required when recoveryMode='poisoned_history'. Explains why disk-projection recovery is appropriate.",
        ),
      priorApprovalEvidence: z
        .string()
        .optional()
        .describe(
          "Optional prior approval evidence for audit continuity when recovery follows a gate/acceptance approval.",
        ),
      ...targetArgs,
    },
    execute: async (args: DispositionArgs, store: Store): Promise<string> => {
      try {
        if (args.target_path) {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path: args.target_path,
              target_confirmed: args.target_confirmed,
              confirmationEvidence: args.confirmationEvidence,
              stateRequirement: "temporal-required",
            },
            async ({ context, store: targetStore }) =>
              executeDisposition(
                { ...args, target_path: undefined },
                targetStore,
                formatTargetProjectContext(context),
              ),
          );
        }
        return await executeDisposition(args, store);
      } catch (error) {
        return formatToolOutput({
          error:
            error instanceof Error
              ? error.message
              : "Failed to record verification-evidence disposition",
        });
      }
    },
  },
};
