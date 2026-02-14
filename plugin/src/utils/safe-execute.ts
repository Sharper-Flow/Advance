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
    return JSON.stringify(
      {
        error: formatZodError(error),
        tool: toolName,
        hint: "Please check your arguments and try again.",
        received_args: args,
      },
      null,
      2,
    );
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return JSON.stringify(
      {
        error: error.message,
        tool: toolName,
        hint: "An unexpected error occurred. Please check your arguments.",
        ...(args !== undefined && { received_args: args }),
      },
      null,
      2,
    );
  }

  // Handle unknown error types
  return JSON.stringify(
    {
      error: String(error),
      tool: toolName,
      hint: "An unknown error occurred.",
    },
    null,
    2,
  );
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TRUNCATION_LIMIT = 30000;

/**
 * Truncate output if it exceeds character limit.
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
 * Wraps an execute function to catch all errors and return them as JSON content.
 * Also enforces output truncation limits.
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
      return truncateOutput(result);
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
      return truncateOutput(result);
    } catch (error) {
      return formatErrorResponse(error, toolName, args);
    }
  };
}
