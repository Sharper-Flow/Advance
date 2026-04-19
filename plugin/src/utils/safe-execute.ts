/**
 * Safe Execute Wrapper
 *
 * Wraps tool execute functions to catch ALL errors (including schema validation)
 * and return them as JSON content for the AI agent, rather than throwing exceptions
 * that bubble up to OpenCode's UI.
 *
 * This ensures the AI sees the error and can retry with corrected arguments.
 */

import { ZodError } from "zod";
import { formatToolOutput } from "./tool-output";

/**
 * Format a Zod validation error into a human-readable message
 */
export function formatZodError(error: ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `'${issue.path.join(".")}'` : "input";
    return `- ${path}: ${issue.message}`;
  });
  return `Schema validation failed:\n${issues.join("\n")}`;
}

/**
 * Format any error into a JSON response suitable for AI agents.
 * This ensures errors are returned as content, not thrown as exceptions.
 */
export function formatErrorResponse(
  error: unknown,
  toolName: string,
  args?: unknown,
): string {
  // Handle Zod schema validation errors specially
  if (error instanceof ZodError) {
    return formatToolOutput({
      error: formatZodError(error),
      tool: toolName,
      hint: "Please check your arguments and try again.",
      received_args: args,
    });
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return formatToolOutput({
      error: error.message,
      tool: toolName,
      hint:
        formatTemporalErrorHint(error.message) ??
        "An unexpected error occurred. Please check your arguments.",
      ...(args !== undefined && { received_args: args }),
    });
  }

  // Handle unknown error types
  const unknownMessage = String(error);
  return formatToolOutput({
    error: unknownMessage,
    tool: toolName,
    hint:
      formatTemporalErrorHint(unknownMessage) ?? "An unknown error occurred.",
  });
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TRUNCATION_LIMIT = 30000;

function formatTemporalErrorHint(message: string): string | undefined {
  if (/NonDeterministicWorkflowError|non[- ]determin/i.test(message)) {
    return "Temporal workflow determinism issue detected. Check replay safety, patch/version workflow code changes, and avoid non-deterministic APIs inside workflows.";
  }
  const mentionsTemporal = /temporal/i.test(message);
  if (
    mentionsTemporal &&
    /did not become reachable|runtime|worker|gRPC|ECONNREFUSED|Connection/i.test(
      message,
    )
  ) {
    return "Temporal runtime/worker connectivity issue. Verify the local Temporal runtime is running, the worker process is started, and the configured address/namespace are reachable.";
  }
  return undefined;
}

/**
 * Truncate output if it exceeds character limit.
 * @deprecated Use formatToolOutput() for JSON data. This remains for non-JSON (banner-wrapped) strings.
 */
export function truncateOutput(
  output: string,
  limit = DEFAULT_TRUNCATION_LIMIT,
): string {
  if (output.length <= limit) {
    return output;
  }

  const truncationMessage = `\n\n[WARNING: Output truncated. Length ${output.length} exceeds limit of ${limit} characters. Please use more specific queries or filters.]`;
  return output.slice(0, limit) + truncationMessage;
}

/**
 * Apply budget-aware output formatting.
 * - For JSON strings: parse and re-serialize via formatToolOutput (compact + truncation envelope)
 * - For non-JSON (e.g. banner-wrapped): fall back to truncateOutput
 */
function applyOutputBudget(output: string): string {
  // Try to parse as JSON first — if it's valid JSON, use formatToolOutput
  if (output.startsWith("{") || output.startsWith("[")) {
    try {
      const parsed = JSON.parse(output);
      return formatToolOutput(parsed);
    } catch {
      // Not valid JSON despite starting with { or [, fall through
    }
  }

  // Non-JSON output (banner-wrapped, etc.) — use legacy truncation
  return truncateOutput(output);
}

/**
 * Wraps an execute function to catch all errors and return them as JSON content.
 * Also enforces output budget via formatToolOutput (compact JSON + truncation envelope).
 *
 * @param fn - The original execute function
 * @param toolName - Name of the tool (for error context)
 * @returns Wrapped function that never throws
 */
export function safeExecute<TArgs, TContext>(
  fn: (args: TArgs, context: TContext) => Promise<string>,
  toolName: string,
): (args: TArgs, context: TContext) => Promise<string> {
  return async (args: TArgs, context: TContext): Promise<string> => {
    try {
      const result = await fn(args, context);
      return applyOutputBudget(result);
    } catch (error) {
      return formatErrorResponse(error, toolName, args);
    }
  };
}

/**
 * Creates a version of safeExecute that works with tools that don't have a context parameter
 * (like agenda tools that just take directory).
 */
export function safeExecuteSimple<TArgs, TExtra>(
  fn: (args: TArgs, extra: TExtra) => Promise<string>,
  toolName: string,
): (args: TArgs, extra: TExtra) => Promise<string> {
  return async (args: TArgs, extra: TExtra): Promise<string> => {
    try {
      const result = await fn(args, extra);
      return applyOutputBudget(result);
    } catch (error) {
      return formatErrorResponse(error, toolName, args);
    }
  };
}
