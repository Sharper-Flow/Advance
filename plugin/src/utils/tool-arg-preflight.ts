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

// fixWarpSessionLookup P25 touched-scope: include `executiveSummary` so the
// preflight validator matches the adv_change_update tool's accepted fields
// (see plugin/src/tools/change.ts:2042-2054 and the field describe() strings
// at lines 1966, 1972, 1978, 1984, 1990 — all five list executiveSummary as
// a valid field).
const ARTIFACT_FIELDS = [
  "proposal",
  "problemStatement",
  "agreement",
  "design",
  "executiveSummary",
];

const CROSS_FIELD_VALIDATORS: Record<string, CrossFieldValidator> = {
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
