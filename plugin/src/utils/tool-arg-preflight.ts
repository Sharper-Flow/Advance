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
}

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

function isBlankProvidedString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length === 0;
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
  const args = asRecord(rawArgs);
  const missing: string[] = [];
  const invalid: ToolArgPreflightIssue[] = [];

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

  invalid.push(...(CROSS_FIELD_VALIDATORS[toolName]?.(args) ?? []));

  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function formatToolArgPreflightError(
  toolName: string,
  argsSchema: ToolArgsSchema,
  rawArgs: unknown,
): string | undefined {
  const result = validateToolArgsBeforeExecute(toolName, argsSchema, rawArgs);
  if (result.ok) return undefined;

  return formatToolOutput({
    error: "Invalid tool arguments",
    code: "INVALID_TOOL_ARGS",
    tool: toolName,
    missing: result.missing,
    invalid: result.invalid,
    received_args: redactSensitiveArgs(rawArgs ?? {}),
  });
}
