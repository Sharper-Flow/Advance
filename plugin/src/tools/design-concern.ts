import {
  DesignConcernDispositionSchema,
  type DesignConcernDisposition,
} from "../types";
import {
  createDispositionTool,
  DISPOSITION_VERBS,
  type DispositionToolConfig,
} from "./disposition-tool-factory";

const designConcernConfig: DispositionToolConfig<
  DesignConcernDisposition,
  "adv_design_concern_disposition"
> = {
  toolName: "adv_design_concern_disposition",
  dispositionVerbs: DISPOSITION_VERBS,
  dispositionSchema: DesignConcernDispositionSchema,
  description:
    "Record a typed disposition for a design-quality concern raised by an adv-designer report (a design_dimensions concern or neighboring recommendation). Clears the structural acceptance/release block for that (taskId, concernKey). Disposition verbs: fixed | rejected_with_evidence | split | fast_follow — there is no accepted_debt path.",
  argumentDescriptions: {
    changeId: "Change ID that owns the concern.",
    taskId: "Task ID the design concern was raised against.",
    concernKey:
      "Stable concern key from the structural blocker, e.g. 'dimension:site_design_consistency' or 'neighbor:0'.",
    disposition:
      "How the concern is resolved. No accepted_debt: use fixed, rejected_with_evidence, split, or fast_follow.",
    evidence:
      "Required non-blank evidence/rationale for the disposition (e.g. PR link, fast-follow change ID, reasoning).",
    dryRun: "Preview the disposition without firing the signal.",
    priorApprovalEvidence:
      "Optional prior approval evidence for audit continuity when recovery follows a gate/acceptance approval.",
  },
  dispositionField: "design_concern_dispositions",
  mutationKind: "design_concern_disposition",
  authorityReason: "record design-concern disposition",
  messages: {
    invalid: "Invalid design-concern disposition",
    unverified: (reason) =>
      `Design-concern disposition recovery wrote the disk projection but the postcondition could not be verified: ${reason}`,
    staleRevision: (expected, actual) =>
      `Design-concern disposition recovery encountered a stale projection revision: expected ${expected}, actual ${actual}`,
    operatorRequired: (reason) =>
      `Cannot safely record design concern disposition: ${reason}`,
    unexpected: (outcome) =>
      `Unexpected design-concern disposition mutation outcome: ${String(outcome)}`,
    failed: "Failed to record design-concern disposition",
  },
  errorCodes: {
    unverified: "DESIGN_CONCERN_DISPOSITION_RECOVERY_UNVERIFIED",
    staleRevision: "DESIGN_CONCERN_DISPOSITION_STALE_REVISION",
    operatorRequired: "DESIGN_CONSENT_MUTATION_OPERATOR_REQUIRED",
  },
};

export const designConcernTools = createDispositionTool(designConcernConfig);
