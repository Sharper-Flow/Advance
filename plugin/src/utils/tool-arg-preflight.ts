import type { z } from "zod";
import { formatToolOutput } from "./tool-output";
import { redactSensitiveArgs } from "./safe-execute";

type ToolArgsSchema = Record<string, z.ZodTypeAny>;

export interface ToolArgPreflightIssue {
  field: string;
  message: string;
}

export interface ToolArgPreflightResult {
  ok: boolean;
  missing: string[];
  invalid: ToolArgPreflightIssue[];
  normalizedArgs: Record<string, unknown>;
}

type PlaceholderPolicyAction = "reject" | "omit" | "allow";

interface PlaceholderFieldPolicy {
  blank?: PlaceholderPolicyAction;
  sentinels?: PlaceholderPolicyAction;
  emptyArray?: PlaceholderPolicyAction;
  recordValuesBlank?: "reject" | "allow";
}

type FieldPolicyMap = Record<string, PlaceholderFieldPolicy>;

type CrossFieldValidator = (
  args: Record<string, unknown>,
) => ToolArgPreflightIssue[];

// rq-toolArgBlankArtifactLinkage01: all artifact fields accepted by create/update tools.
const ARTIFACT_FIELDS = [
  "proposal",
  "problemStatement",
  "agreement",
  "design",
  "executiveSummary",
];

const BLANK_ARTIFACT_FIELD_MESSAGE =
  "Provided artifact fields must be non-blank strings; omit fields you do not want to change.";

const BLANK_SOURCE_ARTIFACT_MESSAGE =
  "origin_source_artifact must be a non-blank string; omit it when there is no source artifact.";

// rq-toolPlaceholderPolicy01 / rq-toolArgPreflightSingleSource01: preflight is
// the pure/synchronous tool-boundary policy executor. Keep this table limited
// to structural placeholder decisions; no fs/store/Temporal lookups here.
const FIELD_POLICIES: Record<string, FieldPolicyMap> = {
  adv_change_create: {
    target_path: { blank: "reject" },
    parent_change_id: { blank: "reject", sentinels: "reject" },
    scope_repos: { emptyArray: "omit" },
  },
  adv_run_test: {
    command: { blank: "reject" },
  },
  adv_task_add: {
    content: { blank: "reject" },
  },
  adv_wisdom_add: {
    content: { blank: "reject" },
  },
  adv_change_bulk_close: {
    approvalEvidence: { blank: "reject" },
    supersededBy: { blank: "reject" },
  },
  adv_change_close: {
    approvalEvidence: { blank: "reject" },
    supersededBy: { blank: "reject" },
  },
  adv_task_cancel: {
    approvalEvidence: { blank: "reject" },
    reasons: { recordValuesBlank: "reject" },
    supersededBy: { recordValuesBlank: "reject" },
  },
  adv_task_reclassify_tdd: {
    reason: { blank: "reject" },
    approvalEvidence: { blank: "reject" },
  },
  adv_gate_complete: {
    completedBy: { blank: "reject" },
    notes: { blank: "reject" },
    compatibilityReason: { blank: "reject" },
  },
  adv_worktree_create: {
    branch: { blank: "reject" },
    base: { blank: "reject" },
  },
  adv_worktree_resume: {
    changeId: { blank: "reject" },
    branch: { blank: "reject" },
    base: { blank: "reject" },
  },
  adv_worktree_delete: {
    branch: { blank: "reject" },
  },
  adv_worktree_cleanup: {
    reason: { blank: "reject" },
  },
  adv_conformance: {
    user: { blank: "reject" },
    reason: { blank: "reject" },
    spec: { blank: "reject" },
    artifact_path: { blank: "reject" },
  },
  adv_agenda_add: {
    title: { blank: "reject" },
    description: { blank: "reject" },
    category: { blank: "reject" },
  },
  adv_agenda_complete: {
    notes: { blank: "reject" },
  },
  adv_agenda_cancel: {
    reason: { blank: "reject" },
  },
  adv_contract_mint: {
    approvedAt: { blank: "reject" },
    recoveryEvidence: { blank: "reject" },
  },
  adv_contract_review_matrix_set: {
    reviewedAt: { blank: "reject" },
    recoveryEvidence: { blank: "reject" },
  },
  adv_temporal_register_search_attributes: {
    approvalEvidence: { blank: "reject" },
  },
  adv_temporal_worker_restart: {
    approvalEvidence: { blank: "reject" },
  },
};

const KNOWN_OMISSION_SENTINELS = new Set([
  "none",
  "n/a",
  "na",
  "null",
  "transcript",
]);

const CANONICAL_MINIMAL_PAYLOADS: Record<string, Record<string, unknown>> = {
  adv_change_create: { summary: "Add rate limiting" },
};

function isBlankProvidedString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length === 0;
}

function isOmissionSentinel(value: unknown): boolean {
  return (
    typeof value === "string" &&
    KNOWN_OMISSION_SENTINELS.has(value.trim().toLowerCase())
  );
}

function applyFieldPolicies(
  toolName: string,
  args: Record<string, unknown>,
): {
  invalid: ToolArgPreflightIssue[];
  normalizedArgs: Record<string, unknown>;
} {
  const policies = FIELD_POLICIES[toolName] ?? {};
  const invalid: ToolArgPreflightIssue[] = [];
  const normalizedArgs: Record<string, unknown> = { ...args };

  for (const [field, policy] of Object.entries(policies)) {
    if (!(field in args)) continue;
    const value = args[field];
    if (isBlankProvidedString(value)) {
      if (policy.blank === "omit") delete normalizedArgs[field];
      if (policy.blank === "reject") {
        invalid.push({
          field,
          message: `${field} must be a non-blank string.`,
        });
      }
    }
    if (isOmissionSentinel(value)) {
      if (policy.sentinels === "omit") delete normalizedArgs[field];
      if (policy.sentinels === "reject") {
        invalid.push({
          field,
          message: `${field} must reference a real change ID; omit it when there is no parent change.`,
        });
      }
    }
    if (Array.isArray(value) && value.length === 0) {
      if (policy.emptyArray === "omit") delete normalizedArgs[field];
      if (policy.emptyArray === "reject") {
        invalid.push({
          field,
          message: `${field} must not be an empty array; omit it when there are no entries.`,
        });
      }
    }
    if (
      policy.recordValuesBlank === "reject" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      for (const [key, recordValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (isBlankProvidedString(recordValue)) {
          invalid.push({
            field: `${field}.${key}`,
            message: `${field} values must be non-blank strings.`,
          });
        }
      }
    }
  }

  return { invalid, normalizedArgs };
}

const CROSS_FIELD_VALIDATORS: Record<string, CrossFieldValidator> = {
  adv_change_create: (args) => {
    const invalid: ToolArgPreflightIssue[] = [];
    const blankArtifacts = ARTIFACT_FIELDS.filter(
      (field) => field in args && isBlankProvidedString(args[field]),
    );
    invalid.push(
      ...blankArtifacts.map((field) => ({
        field,
        message: BLANK_ARTIFACT_FIELD_MESSAGE,
      })),
    );

    const hasIssueNumber = args.origin_issue_number !== undefined;
    const hasSourceArtifact = args.origin_source_artifact !== undefined;
    if (isBlankProvidedString(args.origin_source_artifact)) {
      invalid.push({
        field: "origin_source_artifact",
        message: BLANK_SOURCE_ARTIFACT_MESSAGE,
      });
    }

    const originKind = args.origin_kind;
    const hasTargetPath = args.target_path !== undefined;
    if (!hasTargetPath && args.source_project !== undefined) {
      invalid.push({
        field: "source_project",
        message: "source_project requires target_path to be set.",
      });
    }
    if (!hasTargetPath && args.source_change_id !== undefined) {
      invalid.push({
        field: "source_change_id",
        message: "source_change_id requires target_path to be set.",
      });
    }
    if (hasTargetPath && args.parent_change_id !== undefined) {
      invalid.push({
        field: "parent_change_id",
        message: "parent_change_id cannot be combined with target_path.",
      });
    }
    // rq-backlogCoord08: validate creation-origin linkage structurally before
    // adv_change_create execution can seed workflow state or claim metadata.
    if (originKind === "roadmap") {
      if (!hasIssueNumber) {
        invalid.push({
          field: "origin_issue_number",
          message: "origin_issue_number is required for roadmap origins.",
        });
      }
      if (hasSourceArtifact) {
        invalid.push({
          field: "origin_source_artifact",
          message:
            "origin_source_artifact is only allowed for triage or discovery origins.",
        });
      }
    } else if (originKind === "discovery") {
      if (hasIssueNumber) {
        invalid.push({
          field: "origin_issue_number",
          message:
            "origin_issue_number is only allowed for roadmap or triage origins.",
        });
      }
    } else if (originKind === "adhoc") {
      if (hasIssueNumber) {
        invalid.push({
          field: "origin_issue_number",
          message: "origin linkage fields are not allowed for adhoc origins.",
        });
      }
      if (hasSourceArtifact) {
        invalid.push({
          field: "origin_source_artifact",
          message: "origin linkage fields are not allowed for adhoc origins.",
        });
      }
    } else if (!originKind) {
      if (hasIssueNumber) {
        invalid.push({
          field: "origin_issue_number",
          message: "origin_issue_number requires origin_kind to be set.",
        });
      }
      if (hasSourceArtifact) {
        invalid.push({
          field: "origin_source_artifact",
          message: "origin_source_artifact requires origin_kind to be set.",
        });
      }
    }

    return invalid;
  },
  adv_change_update: (args) => {
    const provided = ARTIFACT_FIELDS.filter((field) => field in args);
    if (provided.length === 0) {
      return [
        {
          field: ARTIFACT_FIELDS.join("|"),
          message: "At least one artifact field must be provided.",
        },
      ];
    }

    // rq-toolArgBlankArtifactLinkage01: blank provided artifact fields are
    // invalid even when another artifact field in the same payload is valid.
    const blank = provided.filter((field) =>
      isBlankProvidedString(args[field]),
    );
    if (blank.length > 0) {
      return blank.map((field) => ({
        field,
        message: BLANK_ARTIFACT_FIELD_MESSAGE,
      }));
    }

    const nonEmpty = provided.filter((field) => {
      const value = args[field];
      return typeof value === "string" && value.trim().length > 0;
    });

    if (nonEmpty.length === 0) {
      return [
        {
          field: provided.join("|"),
          message:
            "At least one provided artifact field must be a non-empty string; omit fields you do not want to change.",
        },
      ];
    }

    return [];
  },
};

function asRecord(rawArgs: unknown): Record<string, unknown> {
  return rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
    ? (rawArgs as Record<string, unknown>)
    : {};
}

// rq-toolArgPreflight01: reject invalid ADV tool args before timeout safety nets.
export function validateToolArgsBeforeExecute(
  toolName: string,
  argsSchema: ToolArgsSchema,
  rawArgs: unknown,
): ToolArgPreflightResult {
  return preflightToolArgs(toolName, argsSchema, rawArgs);
}

// rq-toolArgPreflightSingleSource01: callers that need execution-safe args use
// this entry point; formatToolArgPreflightError is only the presentation layer.
export function preflightToolArgs(
  toolName: string,
  argsSchema: ToolArgsSchema,
  rawArgs: unknown,
): ToolArgPreflightResult {
  const args = asRecord(rawArgs);
  const policyResult = applyFieldPolicies(toolName, args);
  const missing: string[] = [];
  const invalid: ToolArgPreflightIssue[] = [...policyResult.invalid];

  for (const [field, schema] of Object.entries(argsSchema)) {
    const isRequired = !schema.safeParse(undefined).success;
    if (!(field in args)) {
      if (isRequired) missing.push(field);
      continue;
    }

    const parsed = schema.safeParse(args[field]);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = [field, ...issue.path].join(".");
        invalid.push({ field: path, message: issue.message });
      }
    }
  }

  invalid.push(
    ...(CROSS_FIELD_VALIDATORS[toolName]?.(policyResult.normalizedArgs) ?? []),
  );

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    normalizedArgs: policyResult.normalizedArgs,
  };
}

export function formatToolArgPreflightError(
  toolName: string,
  argsSchema: ToolArgsSchema,
  rawArgs: unknown,
): string | undefined {
  const result = preflightToolArgs(toolName, argsSchema, rawArgs);
  if (result.ok) return undefined;

  return formatToolOutput({
    error: "Invalid tool arguments",
    code: "INVALID_TOOL_ARGS",
    tool: toolName,
    missing: result.missing,
    invalid: result.invalid,
    ...(CANONICAL_MINIMAL_PAYLOADS[toolName]
      ? { canonical_minimal_payload: CANONICAL_MINIMAL_PAYLOADS[toolName] }
      : {}),
    received_args: redactSensitiveArgs(rawArgs ?? {}),
  });
}
