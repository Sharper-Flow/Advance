import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Store } from "../storage/store-types";
import { getService } from "../temporal/service";
import { verificationEvidenceDispositionedSignal } from "../temporal/messages";
import { VerificationEvidenceDispositionSchema, type Change } from "../types";
import { RECOVERY_RECONCILIATION_WARNING } from "../temporal/recovery-classification";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import {
  fireSignalAndRefresh,
  getChangeHandle,
  MutationApplicationUnconfirmedError,
} from "./_adapters";
import { saveRecoveredVerificationEvidenceDisposition } from "./_recovery-writers";
import { logRecoveryProbeDiagnostics } from "./recovery-probe";
import { classifyMutationRecoveryDecision } from "./monotonic-recovery";
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
  priorApprovalEvidence?: string;
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
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

  // D4 internal classification (rq-internalMonotonicRecovery01): probe
  // describe() to auto-detect poisoned/completed workflows without operator
  // evidence-copy ceremony (AC5/SC3).
  {
    const internalDecision = await classifyMutationRecoveryDecision({ handle });
    if (internalDecision.kind === "recover_via_disk") {
      await logRecoveryProbeDiagnostics(handle, args.changeId);
      await saveRecoveredVerificationEvidenceDisposition({
        store,
        change,
        authorization: {
          reason: internalDecision.reason,
          evidence: internalDecision.evidence,
        },
        disposition,
      });
      return formatToolOutput({
        success: true,
        changeId: args.changeId,
        disposition,
        _recoveryMutation: true,
        recovered: true,
        recoveryMode: "poisoned_history",
        reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
        note: `Disk-direct recovery; signal skipped (D4 auto-classified, authority=${internalDecision.authority})`,
        ...proj,
      });
    }
    if (internalDecision.kind === "operator_required") {
      return formatToolOutput({
        error: `Cannot safely record verification evidence disposition: ${internalDecision.detail}`,
        code: "VERIFICATION_EVIDENCE_MUTATION_OPERATOR_REQUIRED",
        cause: internalDecision.cause,
        changeId: args.changeId,
      });
    }
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
    // D4 internal classification (rq-internalMonotonicRecovery01 / AC5):
    // signal-error recovery is classified internally from the signal error +
    // describe() evidence via the unified classifier — no operator-supplied
    // recovery args.
    const decision = await classifyMutationRecoveryDecision({
      signalError,
      handle,
    });
    if (decision.kind === "recover_via_disk") {
      await saveRecoveredVerificationEvidenceDisposition({
        store,
        change,
        authorization: {
          reason: decision.reason,
          evidence: decision.evidence,
        },
        disposition,
      });
      return formatToolOutput({
        success: true,
        changeId: args.changeId,
        disposition,
        _recoveryMutation: true,
        recovered: true,
        recoveryMode: "poisoned_history",
        reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
        note: `Disk-direct recovery after signal error (D4 auto-classified, authority=${decision.authority})`,
        ...proj,
      });
    }
    if (decision.kind === "operator_required") {
      return formatToolOutput({
        error: `Cannot safely record verification evidence disposition: ${decision.detail}`,
        code: "VERIFICATION_EVIDENCE_MUTATION_OPERATOR_REQUIRED",
        cause: decision.cause,
        changeId: args.changeId,
      });
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
