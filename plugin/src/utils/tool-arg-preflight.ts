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

export type PlaceholderPolicyAction = "reject" | "omit" | "allow";

export interface PlaceholderFieldPolicy {
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

export type FieldPolicyMap = Record<string, PlaceholderFieldPolicy>;

type CrossFieldValidator = (
  args: Record<string, unknown>,
) => ToolArgPreflightIssue[];

const MAX_ZOD_PREFLIGHT_ISSUES = 10;

function projectZodIssues(
  issue: unknown,
  field: string,
): ToolArgPreflightIssue[] {
  if (!issue || typeof issue !== "object") return [];
  const row = issue as {
    code?: unknown;
    path?: unknown;
    message?: unknown;
    errors?: unknown;
  };
  if (row.code === "invalid_union" && Array.isArray(row.errors)) {
    return row.errors.flatMap((branch) =>
      Array.isArray(branch)
        ? branch.flatMap((nested) => projectZodIssues(nested, field))
        : [],
    );
  }
  const path = Array.isArray(row.path)
    ? [field, ...row.path.map(String)].join(".")
    : field;
  return [
    {
      field: path,
      message: typeof row.message === "string" ? row.message : "Invalid input",
    },
  ];
}

// rq-toolArgBlankArtifactLinkage01 (revised): all artifact fields accepted
// by create/update tools. After T2 (softenStrictModeOptionals), per-field
// FIELD_POLICIES entries with blank: "omit" normalize blank values to
// omitted before the at-least-one-of cross-field guard runs. The CROSS_FIELD
// validator for adv_change_update uses this constant to compute the
// "provided" set against normalizedArgs.
const ARTIFACT_FIELDS = [
  "proposal",
  "problemStatement",
  "agreement",
  "design",
  "executiveSummary",
];

// Structural Epic operations on adv_change_update. These mutate the Epic's
// entry list rather than writing narrative content, so they carry no artifact
// field and must be counted as operations in their own right — otherwise the
// artifact-only guard rejects them before the handler can dispatch.
const STRUCTURAL_FIELDS = ["link_change", "unlink_change", "reorder_entries"];

// rq-toolPlaceholderPolicy01: preflight is the pure/synchronous tool-boundary
// policy executor. Keep this table limited to structural placeholder decisions;
// no fs/store lookups here.
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
    // Contextually-validated by target-project helper when target_path is a
    // mutation into an untrusted project.
    confirmationEvidence: { blank: "omit" },
    parent_change_id: { blank: "omit", sentinels: "reject" },
    origin_source_artifact: { blank: "omit" },
    scope_repos: { emptyArray: "omit" },
    // Optional create-time Epic membership. Strict-mode providers fill these
    // optional strings with blanks/sentinels when no Epic is intended; normalize
    // before Zod .min(1) and before create can seed workflow metadata.
    epic_id: { blank: "omit", sentinels: "omit" },
    entry_id: { blank: "omit", sentinels: "omit" },
    epic_title: { blank: "omit", sentinels: "omit" },
    epic_order: { zero: "omit" },
    kind: { blank: "omit" },
    parent_epic_id: { blank: "omit" },
    // rq-toolPlaceholderPolicy01.5: strict-mode providers fill optional
    // .positive() int placeholders with 0. Normalize to omitted so cross-
    // field origin matrix and Zod .positive() never see the placeholder.
    origin_issue_number: { zero: "omit" },
  },
  adv_change_list: {
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
    // Contextually-validated audit fields. Strict-mode providers fill all
    // optional fields with "". confirmationEvidence is only required when
    // target_path is present. priorApprovalEvidence is an optional human-
    // checkpoint audit field (AC6), not a poisoned_history arg. The handler
    // validates them contextually, so blank → omit at preflight is safe and
    // necessary to avoid strict-mode deadlock (rq-toolPlaceholderPolicy01.6).
    confirmationEvidence: { blank: "omit" },
    priorApprovalEvidence: { blank: "omit" },
    link_change: { blank: "omit" },
    unlink_change: { blank: "omit" },
    // Strict-mode providers fill optional arrays with []. Normalize to omitted
    // so an empty reorder is never counted as a requested operation.
    reorder_entries: { emptyArray: "omit" },
  },
  adv_change_show: {
    target_path: { blank: "omit" },
  },
  adv_change_archive: {
    worktreePath: { blank: "omit" },
    target_path: { blank: "omit" },
    prTitleType: { blank: "omit" },
    // Contextually-validated: handler checks only when target_path present.
    confirmationEvidence: { blank: "omit" },
  },
  adv_run_test: {
    command: { blank: "reject" }, // required-when-present
    phase: { blank: "omit" }, // optional descriptive metadata
    target_path: { blank: "omit" },
    // Contextually-validated: handler checks only when target_path present.
    confirmationEvidence: { blank: "omit" },
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
    proof_target: { blank: "omit" },
    target_path: { blank: "omit" },
    // Contextually-validated: handler checks only when target_path present.
    confirmationEvidence: { blank: "omit" },
  },
  adv_task_add: {
    content: { blank: "reject" }, // required-when-present
    // Optional review proof; omit strict-mode placeholder fills so the
    // evidence-plan validator, rather than preflight, enforces it when the
    // selected route requires a conclusion.
    review_conclusion: { blank: "omit" },
    target_path: { blank: "omit" },
    // Contextually-validated (rq-toolPlaceholderPolicy01.6).
    confirmationEvidence: { blank: "omit" },
  },
  adv_wisdom_add: {
    content: { blank: "reject" }, // required-when-present
  },
  adv_change_close: {
    approvalEvidence: { blank: "reject" }, // audit
    supersededBy: { blank: "omit" }, // optional reference
  },
  adv_task_cancel: {
    approvalEvidence: { blank: "reject" }, // audit
    target_path: { blank: "omit" },
    // Contextually-validated (rq-toolPlaceholderPolicy01.6).
    confirmationEvidence: { blank: "omit" },
    reasons: { recordValuesBlank: "reject" }, // per-task audit
    supersededBy: { recordValuesBlank: "reject" }, // required-when-present
  },
  adv_task_checkpoint: {
    target_path: { blank: "omit" },
    // Contextually-validated when target_path present.
    confirmationEvidence: { blank: "omit" },
    workdir: { blank: "omit" }, // optional explicit override
  },
  adv_gate_status: {
    target_path: { blank: "omit" },
  },
  adv_gate_complete: {
    // Strict-mode providers (OpenAI Responses API strict:true) auto-fill
    // every optional field with "". These fields are contextually validated
    // by the handler (gate type, recovery mode, cross-project), so blank →
    // omit at preflight is safe and necessary for non-recovery gate
    // completions (rq-toolPlaceholderPolicy01.6).
    completedBy: { blank: "omit" }, // handler defaults to "agent"
    notes: { blank: "omit" }, // optional descriptive
    compatibilityReason: { blank: "omit" }, // optional descriptive
    // rq-internalMonotonicRecovery01 / AC5: recoveryMode/recoveryEvidence/
    // recoveryReason removed — recovery is classified internally.
    priorApprovalEvidence: { blank: "omit" }, // acceptance human checkpoint (AC6)
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "omit" }, // handler validates when target_path present
  },
  adv_worktree_create: {
    branch: { blank: "reject" }, // required-when-present
    base: { blank: "reject" }, // required-when-present
  },
  adv_worktree_delete: {
    branch: { blank: "reject" }, // required-when-present
    planToken: { blank: "omit" }, // optional; handler returns PLAN_REQUIRED when absent
    approvalEvidence: { blank: "omit" }, // required only for destructive apply
  },
  adv_worktree_cleanup: {
    reason: { blank: "reject" }, // audit
    approvalEvidence: { blank: "omit" }, // required only when deletion is applied
    // Optional mode selector. Strict-mode providers fill optional enums
    // with ""; normalize to omitted so Zod enum validation is bypassed.
    mode: { blank: "omit" },
    // Optional archived-branch restriction; handler treats blank as unset.
    changeId: { blank: "omit" },
  },
  adv_tool_catalog: {
    // Optional page limit: strict-mode providers fill optional positive ints
    // with 0; normalize to omitted so the handler default (50) applies.
    limit: { zero: "omit" },
  },
  adv_status: {
    target_path: { blank: "omit" },
  },
  // Consistency entries: these tools accept target_path/confirmationEvidence
  // or approvalEvidence but use falsy checks in handlers, so strict-mode
  // blanks are not a deadlock risk. Entries ensure consistent normalization
  // (rq-toolPlaceholderPolicy01.6).
  adv_subagent_report_submit: {
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "omit" },
  },
  adv_change_reenter: {
    scopeDelta: { blank: "omit" },
    approvalEvidence: { blank: "omit" },
  },
  adv_followup_promote: {
    source_report_key: { blank: "omit" },
    source_contract_id: { blank: "omit" },
    source_task_id: { blank: "omit" },
    capability: { blank: "omit" },
    proposal: { blank: "omit" },
    target_path: { blank: "omit" },
    confirmationEvidence: { blank: "omit" },
  },
  // tk-2b89b9cf3042: verified top-level strict-mode placeholder policy groups.
  // Zero omission for the positive-int optionals
  // (adv_change_create.origin_issue_number above); blank omission for
  // adv_ops_run_evidence_add optional evidence fields and the twelve
  // registered Epic tools' optional string / target-routing fields.
  adv_ops_run_evidence_add: {
    // Optional ops-run-evidence context fields. Strict-mode providers fill
    // optional strings with ""; normalize to omitted so the handler treats
    // them as not provided. Required/audit fields (changeId, runId,
    // step_kind, env, status, summary, artifact, next_status) keep their
    // Zod-required semantics and are intentionally left without a policy.
    step_id: { blank: "omit" },
    batch: { blank: "omit" },
    completion_signal: { blank: "omit" },
    health_verification: { blank: "omit" },
    rollback_or_cleanup_disposition: { blank: "omit" },
  },
  // tk-6ff82311335f: read-tool page-limit fields surfaced by the schema-backed
  // coverage guard. Each is an optional .positive() int; strict-mode providers
  // fill it with 0 instead of omitting. 0 means "no limit provided" for these
  // read tools, so normalize to omitted before Zod .positive() sees it.
  adv_wisdom_list: {
    maxEntries: { zero: "omit" },
  },
  adv_reflection_list: {
    maxEntries: { zero: "omit" },
  },
};

export function listToolArgFieldPolicies(): Readonly<
  Record<string, Readonly<FieldPolicyMap>>
> {
  return FIELD_POLICIES;
}

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

    const epicFields = ["epic_id", "entry_id", "epic_title"] as const;
    const providedEpicFields = epicFields.filter(
      (field) => args[field] !== undefined,
    );
    if (providedEpicFields.length > 0 && providedEpicFields.length < 3) {
      for (const field of epicFields) {
        if (args[field] === undefined) {
          invalid.push({
            field,
            message:
              "Complete create-time Epic membership requires epic_id, entry_id, and epic_title; omit all Epic fields when no Epic membership is intended.",
          });
        }
      }
    }

    // rq-backlogCoord08: validate creation-origin linkage structurally before
    // adv_change_create execution can seed workflow state or claim metadata.
    if (originKind === "roadmap") {
      // reshapeTriagePortfolioBalance: 'roadmap' is readable legacy only.
      // New writes (create path) reject this kind; archived changes still
      // carry it for read compatibility.
      invalid.push({
        field: "origin_kind",
        message:
          "ORIGIN_KIND_ROADMAP_RETIRED: origin_kind 'roadmap' is retired for new writes. Use 'triage' for issue-linked changes.",
      });
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
    // Per-field blank/emptyArray "omit" policies normalize placeholder fills
    // before this validator runs, so presence here means the caller requested
    // the operation.
    //
    // adv_change_update dispatches two kinds of work: an artifact write and a
    // structural Epic operation. Any number of artifacts is one write, while
    // each structural field is its own operation. Counting operations rather
    // than requiring an artifact is what keeps the structural route reachable.
    const artifacts = ARTIFACT_FIELDS.filter((field) => field in args);
    const structural = STRUCTURAL_FIELDS.filter((field) => field in args);
    const operations = (artifacts.length > 0 ? 1 : 0) + structural.length;

    if (operations === 0) {
      return [
        {
          field: [...ARTIFACT_FIELDS, ...STRUCTURAL_FIELDS].join("|"),
          message: `adv_change_update requires one operation: an artifact field (${ARTIFACT_FIELDS.join(", ")}) or a structural field (${STRUCTURAL_FIELDS.join(", ")}).`,
        },
      ];
    }

    if (operations > 1) {
      const requested = [
        ...(artifacts.length > 0 ? [artifacts.join("+")] : []),
        ...structural,
      ];
      return [
        {
          field: [...artifacts, ...structural].join("|"),
          message: `adv_change_update accepts one operation at a time; received ${requested.length}: ${requested.join(", ")}.`,
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
        invalid.push(...projectZodIssues(issue, field));
        if (invalid.length >= MAX_ZOD_PREFLIGHT_ISSUES) break;
      }
    }
  }

  invalid.push(
    ...(CROSS_FIELD_VALIDATORS[toolName]?.(policyResult.normalizedArgs) ?? []),
  );

  const dedupedInvalid = Array.from(
    new Map(
      invalid.map((issue) => [`${issue.field}\u0000${issue.message}`, issue]),
    ).values(),
  ).slice(0, MAX_ZOD_PREFLIGHT_ISSUES);

  return {
    ok: missing.length === 0 && dedupedInvalid.length === 0,
    missing,
    invalid: dedupedInvalid,
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
