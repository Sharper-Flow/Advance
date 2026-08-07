import { z } from "zod";
import type { Store } from "../storage/store-types";
import {
  VerificationEvidenceDispositionSchema,
  type Change,
  type VerificationEvidenceDisposition,
} from "../types";
import { formatToolOutput } from "../utils/tool-output";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
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

async function loadChange(store: Store, changeId: string): Promise<Change> {
  const result = await store.changes.get(changeId);
  if (!result.success) throw new Error(result.error);
  if (!result.data) throw new Error(`Change not found: ${changeId}`);
  return result.data;
}

function upsertVerificationEvidenceDisposition(
  existing: VerificationEvidenceDisposition[] | undefined,
  disposition: VerificationEvidenceDisposition,
): VerificationEvidenceDisposition[] {
  const next = (existing ?? []).filter(
    (d) =>
      !(
        d.taskId === disposition.taskId &&
        d.concernKey === disposition.concernKey
      ),
  );
  next.push(disposition);
  return next;
}

function dispositionPostcondition(
  list: VerificationEvidenceDisposition[] | undefined,
  expected: VerificationEvidenceDisposition,
): boolean {
  const found = (list ?? []).find(
    (d) => d.taskId === expected.taskId && d.concernKey === expected.concernKey,
  );
  if (!found) return false;
  return (
    found.disposition === expected.disposition &&
    found.evidence === expected.evidence
  );
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

  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      reason: "record verification-evidence disposition",
      evidence: args.evidence,
    },
    changesDir: store.paths.changes,
    intent: {
      changeId: args.changeId,
      mutationKind: "verification_evidence_disposition",
      mutateLatestProjection: (latest) => ({
        ...latest,
        verification_evidence_dispositions:
          upsertVerificationEvidenceDisposition(
            latest.verification_evidence_dispositions,
            disposition,
          ),
      }),
      verifyProjection: (readback) =>
        dispositionPostcondition(
          readback.verification_evidence_dispositions,
          disposition,
        ),
    },
  });

  switch (outcome.kind) {
    case "verified": {
      return formatToolOutput({
        success: true,
        changeId: args.changeId,
        disposition,
        ...proj,
      });
    }
    case "unverified":
      return formatToolOutput({
        error: `Verification-evidence disposition recovery wrote the disk projection but the postcondition could not be verified: ${outcome.reason}`,
        code: "VERIFICATION_EVIDENCE_DISPOSITION_RECOVERY_UNVERIFIED",
        changeId: args.changeId,
        ...proj,
      });
    case "stale_revision":
      return formatToolOutput({
        error: `Verification-evidence disposition recovery encountered a stale projection revision: expected ${outcome.expected}, actual ${outcome.actual}`,
        code: "VERIFICATION_EVIDENCE_DISPOSITION_STALE_REVISION",
        changeId: args.changeId,
        ...proj,
      });
    case "operator_required":
      return formatToolOutput({
        error: `Cannot safely record verification evidence disposition: ${outcome.reason}`,
        code: "VERIFICATION_EVIDENCE_MUTATION_OPERATOR_REQUIRED",
        changeId: args.changeId,
        ...proj,
      });
    default: {
      const _exhaustive: never = outcome;
      throw new Error(
        `Unexpected verification evidence disposition mutation outcome: ${String(_exhaustive)}`,
      );
    }
  }
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
              stateRequirement: "authoritative",
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
