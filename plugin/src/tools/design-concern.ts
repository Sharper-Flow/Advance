import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Store } from "../storage/store-types";
import { getService } from "../temporal/service";
import { designConcernDispositionedSignal } from "../temporal/messages";
import { DesignConcernDispositionSchema, type Change } from "../types";
import { RECOVERY_RECONCILIATION_WARNING } from "../temporal/recovery-classification";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import {
  fireSignalAndRefresh,
  getChangeHandle,
  MutationApplicationUnconfirmedError,
} from "./_adapters";
import { saveRecoveredDesignConcernDisposition } from "./_recovery-writers";
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
// unresolved design concern is never a terminal accepted state.
const DESIGN_CONCERN_DISPOSITIONS = [
  "fixed",
  "rejected_with_evidence",
  "split",
  "fast_follow",
] as const;

interface DispositionArgs {
  changeId: string;
  taskId: string;
  concernKey: string;
  disposition: (typeof DESIGN_CONCERN_DISPOSITIONS)[number];
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
  const parsed = DesignConcernDispositionSchema.safeParse({
    taskId: args.taskId,
    concernKey: args.concernKey,
    disposition: args.disposition,
    evidence: args.evidence,
    dispositionedAt: new Date().toISOString(),
  });
  if (!parsed.success) {
    return formatToolOutput({
      error: `Invalid design-concern disposition: ${parsed.error.issues
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
  const mutationReceiptId = `mrec_${randomUUID()}`;
  // D4 internal classification (rq-internalMonotonicRecovery01): probe
  // describe() to auto-detect poisoned/completed workflows without operator
  // evidence-copy ceremony (AC5/SC3).
  {
    const internalDecision = await classifyMutationRecoveryDecision({ handle });
    if (internalDecision.kind === "recover_via_disk") {
      await logRecoveryProbeDiagnostics(handle, args.changeId);
      await saveRecoveredDesignConcernDisposition({
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
        error: `Cannot safely record design concern disposition: ${internalDecision.detail}`,
        code: "DESIGN_CONSENT_MUTATION_OPERATOR_REQUIRED",
        cause: internalDecision.cause,
        changeId: args.changeId,
      });
    }
  }
  try {
    await fireSignalAndRefresh(
      handle,
      store,
      args.changeId,
      designConcernDispositionedSignal,
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
      await saveRecoveredDesignConcernDisposition({
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
        error: `Cannot safely record design concern disposition: ${decision.detail}`,
        code: "DESIGN_CONSENT_MUTATION_OPERATOR_REQUIRED",
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

export const designConcernTools = {
  adv_design_concern_disposition: {
    description:
      "Record a typed disposition for a design-quality concern raised by an adv-designer report (a design_dimensions concern or neighboring recommendation). Clears the structural acceptance/release block for that (taskId, concernKey). Disposition verbs: fixed | rejected_with_evidence | split | fast_follow — there is no accepted_debt path.",
    args: {
      changeId: z.string().describe("Change ID that owns the concern."),
      taskId: z
        .string()
        .describe("Task ID the design concern was raised against."),
      concernKey: z
        .string()
        .describe(
          "Stable concern key from the structural blocker, e.g. 'dimension:site_design_consistency' or 'neighbor:0'.",
        ),
      disposition: z
        .enum(DESIGN_CONCERN_DISPOSITIONS)
        .describe(
          "How the concern is resolved. No accepted_debt: use fixed, rejected_with_evidence, split, or fast_follow.",
        ),
      evidence: z
        .string()
        .describe(
          "Required non-blank evidence/rationale for the disposition (e.g. PR link, fast-follow change ID, reasoning).",
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
              : "Failed to record design-concern disposition",
        });
      }
    },
  },
};
