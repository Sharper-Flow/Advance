import {
  VerificationEvidenceDispositionSchema,
  type VerificationEvidenceDisposition,
} from "../types";
import {
  createDispositionTool,
  DISPOSITION_VERBS,
  type DispositionToolConfig,
} from "./disposition-tool-factory";

const verificationEvidenceConfig: DispositionToolConfig<
  VerificationEvidenceDisposition,
  "adv_verification_evidence_disposition"
> = {
  toolName: "adv_verification_evidence_disposition",
  dispositionVerbs: DISPOSITION_VERBS,
  dispositionSchema: VerificationEvidenceDispositionSchema,
  description:
    "Record a typed disposition for a verification-evidence gap on a completed task with a proof-bearing evidence policy (test, static_check, review, artifact_reference) — an unresolved verification_missing / verification_mismatch warning that would otherwise produce a VERIFICATION_EVIDENCE_MISSING acceptance/release blocker. Clears the structural block for that (taskId, concernKey). Disposition verbs: fixed | rejected_with_evidence | split | fast_follow — there is no accepted_debt path.",
  argumentDescriptions: {
    changeId: "Change ID that owns the task.",
    taskId: "Task ID the verification-evidence gap was raised against.",
    concernKey:
      "Stable concern key from the structural blocker; use 'verification' for the per-task verification-evidence gap.",
    disposition:
      "How the gap is resolved. No accepted_debt: use fixed, rejected_with_evidence, split, or fast_follow.",
    evidence:
      "Required non-blank evidence/rationale for the disposition (e.g. adv_run_test run id, PR link, fast-follow change ID, reasoning).",
    dryRun: "Preview the disposition without firing the signal.",
    priorApprovalEvidence:
      "Optional prior approval evidence for audit continuity when recovery follows a gate/acceptance approval.",
  },
  dispositionField: "verification_evidence_dispositions",
  mutationKind: "verification_evidence_disposition",
  authorityReason: "record verification-evidence disposition",
  messages: {
    invalid: "Invalid verification-evidence disposition",
    unverified: (reason) =>
      `Verification-evidence disposition recovery wrote the disk projection but the postcondition could not be verified: ${reason}`,
    staleRevision: (expected, actual) =>
      `Verification-evidence disposition recovery encountered a stale projection revision: expected ${expected}, actual ${actual}`,
    operatorRequired: (reason) =>
      `Cannot safely record verification evidence disposition: ${reason}`,
    unexpected: (outcome) =>
      `Unexpected verification evidence disposition mutation outcome: ${String(outcome)}`,
    failed: "Failed to record verification-evidence disposition",
  },
  errorCodes: {
    unverified: "VERIFICATION_EVIDENCE_DISPOSITION_RECOVERY_UNVERIFIED",
    staleRevision: "VERIFICATION_EVIDENCE_DISPOSITION_STALE_REVISION",
    operatorRequired: "VERIFICATION_EVIDENCE_MUTATION_OPERATOR_REQUIRED",
  },
};

export const verificationEvidenceTools = createDispositionTool(
  verificationEvidenceConfig,
);
