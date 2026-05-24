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
  // rq-toolPlaceholderPolicy01.5: optional positive-integer placeholders. Strict-
  // mode providers (e.g. OpenAI Responses API) fill optional `.positive()` Zod
  // ints with `0` instead of omitting them; `zero: "omit"` lets those fills be
  // normalized to omitted before Zod sees them.
  zero?: PlaceholderPolicyAction;
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

// rq-toolPlaceholderPolicy01: preflight is the pure/synchronous tool-boundary
// policy executor. Keep this table limited to structural placeholder decisions;
// no fs/store/Temporal lookups here.
const FIELD_POLICIES: Record<string, FieldPolicyMap> = {
  adv_change_create: {
    // Optional artifact content — strict-mode providers fill with "" defaults.
    proposal: { blank: "omit" },
    problemStatement: { blank: "omit" },
    agreement: { blank: "omit" },
    design: { blank: "omit" },
    executiveSummary: { blank: "omit" },
    // Optional path / lineage / origin metadata.
    target_path: { blank: "omit" },
    source_project: { blank: "omit" },
    source_change_id: { blank: "omit" },
    parent_change_id: { blank: "omit", sentinels: "reject" },
    origin_source_artifact: { blank: "omit" },
    scope_repos: { emptyArray: "omit" },
    // rq-toolPlaceholderPolicy01.5: strict-mode providers fill optional
    // .positive() int placeholders with 0. Normalize to omitted so cross-
    // field origin matrix and Zod .positive() never see the placeholder.
    origin_issue_number: { zero: "omit" },
  },
  adv_change_list: {
    target_path: { blank: "omit" },
  },
  adv_change_show: {
    target_path: { blank: "omit" },
  },
  adv_change_update: {
    // Optional artifact content — strict-mode providers fill with "" defaults.
    // Cross-field at-least-one-of guard still fires when ALL artifacts are
    // normalized out.
    proposal: { blank: "omit" },
    problemStatement: { blank: "omit" },
    agreement: { blank: "omit" },
    design: { blank: "omit" },
    executiveSummary: { blank: "omit" },
    target_path: { blank: "omit" },
    // Audit field — blank assertion is a semantic violation, stay strict.
    confirmationEvidence: { blank: "reject" },
  },
  adv_run_test: {
    command: { blank: "reject" }, // required-when-present
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "reject" }, // audit
  },
  adv_task_show: {
    target_path: { blank: "omit" },
  },
  adv_task_list: {
    target_path: { blank: "omit" },
  },
  adv_task_ready: {
    target_path: { blank: "omit" },
  },
  adv_task_update: {
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "reject" }, // audit
  },
  adv_task_add: {
    content: { blank: "reject" }, // required-when-present
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "reject" }, // audit
  },
  adv_wisdom_add: {
    content: { blank: "reject" }, // required-when-present
  },
  adv_change_bulk_close: {
    approvalEvidence: { blank: "reject" }, // audit
    supersededBy: { blank: "omit" }, // optional reference
  },
  adv_change_close: {
    approvalEvidence: { blank: "reject" }, // audit
    supersededBy: { blank: "omit" }, // optional reference
  },
  adv_task_cancel: {
    approvalEvidence: { blank: "reject" }, // audit
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "reject" }, // audit
    reasons: { recordValuesBlank: "reject" }, // per-task audit
    supersededBy: { recordValuesBlank: "reject" }, // required-when-present
  },
  adv_task_reclassify_tdd: {
    reason: { blank: "reject" }, // audit
    approvalEvidence: { blank: "reject" }, // audit
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "reject" }, // audit
  },
  adv_gate_status: {
    target_path: { blank: "omit" },
  },
  adv_gate_complete: {
    completedBy: { blank: "reject" }, // audit identity
    notes: { blank: "omit" }, // optional descriptive
    compatibilityReason: { blank: "omit" }, // optional descriptive
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "reject" }, // audit
  },
  adv_worktree_create: {
    branch: { blank: "reject" }, // required-when-present
    base: { blank: "reject" }, // required-when-present
  },
  adv_worktree_resume: {
    changeId: { blank: "reject" }, // required-when-present
    branch: { blank: "omit" }, // optional (resume by changeId OR branch)
    base: { blank: "omit" }, // optional
  },
  adv_worktree_delete: {
    branch: { blank: "reject" }, // required-when-present
  },
  adv_worktree_cleanup: {
    reason: { blank: "reject" }, // audit
  },
  adv_conformance: {
    user: { blank: "reject" }, // audit identity
    reason: { blank: "reject" }, // audit
    spec: { blank: "omit" }, // optional per-action
    artifact_path: { blank: "omit" }, // optional per-action
  },
  adv_agenda_add: {
    title: { blank: "reject" }, // required-when-present
    description: { blank: "omit" }, // optional
    category: { blank: "omit" }, // optional
  },
  adv_agenda_complete: {
    notes: { blank: "omit" }, // optional descriptive
  },
  adv_agenda_cancel: {
    reason: { blank: "reject" }, // audit
  },
  adv_contract_mint: {
    approvedAt: { blank: "omit" }, // optional ISO timestamp
    recoveryEvidence: { blank: "reject" }, // audit
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "reject" }, // audit
  },
  adv_contract_review_matrix_set: {
    reviewedAt: { blank: "omit" }, // optional ISO timestamp
    recoveryEvidence: { blank: "reject" }, // audit
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "reject" }, // audit
  },
  adv_temporal_register_search_attributes: {
    approvalEvidence: { blank: "reject" }, // audit
  },
  adv_temporal_reconnect: {
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "reject" }, // audit
  },
  adv_temporal_worker_restart: {
    approvalEvidence: { blank: "reject" }, // audit
  },
  adv_status: {
    target_path: { blank: "omit" },
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
    // rq-toolPlaceholderPolicy01.5: zero-valued optional ints (strict-mode
    // provider fills) handled symmetrically with blank/sentinels/emptyArray.
    if (typeof value === "number" && value === 0) {
      if (policy.zero === "omit") delete normalizedArgs[field];
      if (policy.zero === "reject") {
        invalid.push({
          field,
          message: `${field} must be a positive number; omit it when there is no value.`,
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

    // rq-toolArgBlankArtifactLinkage01.1/.3/.5 (revised): blank artifact and
    // blank origin_source_artifact placeholders are now normalized to omitted
    // via the FIELD_POLICIES table. This validator only enforces structural
    // origin-matrix and target/source/parent mutual-exclusion rules on the
    // post-normalization args view.
    const hasIssueNumber = args.origin_issue_number !== undefined;
    const hasSourceArtifact = args.origin_source_artifact !== undefined;

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
    // rq-toolArgBlankArtifactLinkage01.1 (revised): per-field blank: "omit"
    // policies normalize each blank artifact to omitted before this validator
    // runs. The remaining job is to ensure at least one artifact was actually
    // provided post-normalization — equivalent to "you sent something to
    // change". Sending all blanks naturally trips this check because every
    // artifact gets normalized out.
    const provided = ARTIFACT_FIELDS.filter((field) => field in args);
    if (provided.length === 0) {
      return [
        {
          field: ARTIFACT_FIELDS.join("|"),
          message: "At least one artifact field must be provided.",
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

// Callers that need execution-safe args use this entry point;
// formatToolArgPreflightError is only the presentation layer.
export function preflightToolArgs(
  toolName: string,
  argsSchema: ToolArgsSchema,
  rawArgs: unknown,
): ToolArgPreflightResult {
  const args = asRecord(rawArgs);
  const policyResult = applyFieldPolicies(toolName, args);
  const missing: string[] = [];
  const invalid: ToolArgPreflightIssue[] = [...policyResult.invalid];

  // rq-toolPlaceholderPolicy01.4: Zod validation reads from normalizedArgs so
  // fields normalized out by field policies are invisible to schema checks and
  // to cross-field validators. A required field accidentally normalized out
  // surfaces as `missing` (defensive: required fields should never carry a
  // blank/zero/sentinel/emptyArray "omit" policy).
  for (const [field, schema] of Object.entries(argsSchema)) {
    const isRequired = !schema.safeParse(undefined).success;
    if (!(field in policyResult.normalizedArgs)) {
      if (isRequired) missing.push(field);
      continue;
    }

    const parsed = schema.safeParse(policyResult.normalizedArgs[field]);
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
