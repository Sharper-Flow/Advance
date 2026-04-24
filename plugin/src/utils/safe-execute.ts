/**
 * Safe Execute Wrapper
 *
 * Wraps tool execute functions to catch ALL errors (including schema validation)
 * and return them as JSON content for the AI agent, rather than throwing exceptions
 * that bubble up to OpenCode's UI.
 *
 * This ensures the AI sees the error and can retry with corrected arguments.
 *
 * Enrichment: tool failures are additively tagged with an `errorClass` and
 * optional `{ workdir, path, operation }` context derived from the call
 * arguments or provided by the binder. Existing top-level keys (`error`,
 * `tool`, `hint`, `received_args`) are preserved.
 */

import { ZodError } from "zod";
import { formatToolOutput } from "./tool-output";
import { appendProfileLog } from "./debug-log";

/**
 * Optional enrichment context. All fields are additive — no existing
 * consumer is expected to depend on their shape.
 */
export interface ErrorContext {
  errorClass?: string;
  workdir?: string;
  path?: string;
  operation?: string;
}

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
 * Classify a thrown value into a short, stable class name.
 *
 *   ZodError instances           → "ZodError"
 *   Error subclasses             → the subclass name (TypeError, etc.)
 *   Plain `Error`                → "Error"
 *   Any non-Error thrown value   → "Unknown"
 */
export function deriveErrorClass(error: unknown): string {
  if (error instanceof ZodError) return "ZodError";
  if (error instanceof Error) {
    return error.name || "Error";
  }
  return "Unknown";
}

/**
 * Best-effort extraction of diagnostic context from call arguments.
 *
 * Recognised keys on `args`:
 *   - `workdir`   → `workdir`
 *   - `path`      → `path`
 *   - `filePath`  → `path`   (alias)
 *   - `directory` → `workdir` (only when workdir is absent)
 *
 * `extra` overrides derived values and may supply fields that args cannot
 * (e.g. `operation`). Non-string values are ignored. `null` / `undefined`
 * args produce an empty context.
 */
export function deriveContextFromArgs(
  args: unknown,
  extra?: ErrorContext,
): ErrorContext {
  const ctx: ErrorContext = {};

  if (args !== null && typeof args === "object") {
    const a = args as Record<string, unknown>;
    if (typeof a.workdir === "string") {
      ctx.workdir = a.workdir;
    } else if (typeof a.directory === "string") {
      ctx.workdir = a.directory;
    }
    if (typeof a.path === "string") {
      ctx.path = a.path;
    } else if (typeof a.filePath === "string") {
      ctx.path = a.filePath;
    }
  }

  mergeDefinedContext(ctx, extra);

  return ctx;
}

export function mergeDefinedContext(
  target: ErrorContext,
  extra?: ErrorContext,
): ErrorContext {
  if (!extra) return target;

  for (const [key, value] of Object.entries(extra) as Array<
    [keyof ErrorContext, string | undefined]
  >) {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  return target;
}

/**
 * Format any error into a JSON response suitable for AI agents.
 * This ensures errors are returned as content, not thrown as exceptions.
 *
 * `context` is merged additively on top of values derived from `args` so
 * callers can inject static data (e.g. a default `workdir` or
 * `operation`) without losing auto-derived fields.
 */
export function formatErrorResponse(
  error: unknown,
  toolName: string,
  args?: unknown,
  context?: ErrorContext,
): string {
  const errorClass = deriveErrorClass(error);
  const derived = deriveContextFromArgs(args, context);
  const enrichment: Record<string, unknown> = { errorClass };
  mergeDefinedContext(enrichment as ErrorContext, derived);

  // Handle Zod schema validation errors specially
  if (error instanceof ZodError) {
    return formatToolOutput({
      error: formatZodError(error),
      tool: toolName,
      hint: "Please check your arguments and try again.",
      received_args: args,
      ...enrichment,
    });
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return formatToolOutput({
      error: error.message,
      tool: toolName,
      hint:
        formatToolTimeoutHint(error) ??
        formatTemporalErrorHint(error) ??
        "An unexpected error occurred. Please check your arguments.",
      ...(args !== undefined && { received_args: args }),
      ...enrichment,
    });
  }

  // Handle unknown error types
  const unknownMessage = String(error);
  return formatToolOutput({
    error: unknownMessage,
    tool: toolName,
    hint:
      formatTemporalErrorHint(unknownMessage) ?? "An unknown error occurred.",
    ...enrichment,
  });
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TRUNCATION_LIMIT = 30000;

/**
 * Default safety-net timeout for a single tool execute() call, in
 * milliseconds. Tools that exceed this budget are interrupted and an
 * agent-visible `ToolExecutionTimeout` error is returned.
 *
 * Rationale: covers SDK-side Zod parse hangs on missing required args
 * (the root cause of the zero-args `adv_change_update` hang reproduced
 * during /adv-design of completeTemporalOnlyMigration — see wisdom
 * ws-3550c245 and design.md KD-8), as well as any deadlocked workflow
 * Update / signal path where `runTemporal` itself has no timeout.
 *
 * 10s is deliberately more forgiving than the Temporal query timeout
 * (5s, P1.3.8) because legitimate tool bodies may invoke multiple
 * backend operations in sequence.
 */
const DEFAULT_TOOL_TIMEOUT_MS = 10_000;

/**
 * Optional safety-net timeout override. Accepted by `safeExecute` and
 * `safeExecuteSimple`; when omitted the default `DEFAULT_TOOL_TIMEOUT_MS`
 * is used.
 */
export interface SafeExecuteOptions {
  /** Hard timeout (ms) for a single tool execute() call. Default: 10_000. */
  timeoutMs?: number;
}

/**
 * Sentinel class raised by the safety-net timeout wrapper. Surfaces as
 * `errorClass: "ToolExecutionTimeout"` in the agent-visible response.
 */
export class ToolExecutionTimeoutError extends Error {
  override readonly name = "ToolExecutionTimeout";
  constructor(
    public readonly toolName: string,
    public readonly timeoutMs: number,
  ) {
    super(
      `Tool '${toolName}' execution exceeded ${timeoutMs}ms timeout — ` +
        `likely missing required args or an SDK parse hang. ` +
        `Verify all required args are provided.`,
    );
  }
}

/**
 * Race a promise against a timeout. On timeout, rejects with
 * `ToolExecutionTimeoutError`. On success, clears the timer so the
 * wrapper does not leak handles.
 */
function raceWithTimeout<T>(
  promise: Promise<T>,
  toolName: string,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ToolExecutionTimeoutError(toolName, timeoutMs));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Hint for `ToolExecutionTimeout` errors. Guides the agent toward the
 * three most common root causes surfaced by the safety-net timeout:
 *
 *   1. Missing required args (zero-args invocation of a mutating tool).
 *   2. Stale/corrupted workflow state where a Temporal Update hangs.
 *   3. Unresponsive worker — query/update never gets a poller response.
 */
function formatToolTimeoutHint(error: unknown): string | undefined {
  if (!(error instanceof ToolExecutionTimeoutError)) return undefined;
  return (
    "Tool execution timed out. Likely causes: (1) missing required args — " +
    "verify all required fields are provided; (2) stuck Temporal workflow — " +
    "try `adv_status` to check worker health, or `adv_workflow_repair` to " +
    "rebuild state from disk; (3) unresponsive worker — an OpenCode restart " +
    "may be required if `adv_status` shows `worker_alive: false`."
  );
}

function formatTemporalErrorHint(error: unknown): string | undefined {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  const combined = messages.join("\n");

  if (/NonDeterministicWorkflowError|non[- ]determin/i.test(combined)) {
    return "Temporal workflow determinism issue detected. Check replay safety, patch/version workflow code changes, and avoid non-deterministic APIs inside workflows.";
  }
  const mentionsTemporal = /temporal/i.test(combined);
  if (
    mentionsTemporal &&
    /did not become reachable|runtime|worker|gRPC|ECONNREFUSED|Connection/i.test(
      combined,
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
 * Optional context extractor for binder-time enrichment.
 * Receives the raw args (and for simple tools the binder extras) and
 * returns additional context to merge into the error envelope.
 */
export type ContextExtractor<TArgs> = (args: TArgs) => ErrorContext;
export type ContextExtractorSimple<TArgs, TExtra> = (
  args: TArgs,
  extra: TExtra,
) => ErrorContext;

function isProfilingEnabled(): boolean {
  return process.env.ADV_PROFILE === "1";
}

function recordToolProfile(
  tool: string,
  startedAt: number,
  outcome: "success" | "error",
  errorClass?: string,
  context?: ErrorContext,
): void {
  appendProfileLog("tool-profile", {
    tool,
    outcome,
    duration_ms: Number((performance.now() - startedAt).toFixed(3)),
    ...(errorClass ? { errorClass } : {}),
    ...(context?.workdir ? { workdir: context.workdir } : {}),
    ...(context?.path ? { path: context.path } : {}),
    ...(context?.operation ? { operation: context.operation } : {}),
  });
}

/**
 * Wraps an execute function to catch all errors and return them as JSON content.
 * Also enforces output budget via formatToolOutput (compact JSON + truncation envelope).
 *
 * @param fn - The original execute function
 * @param toolName - Name of the tool (for error context)
 * @param contextExtractor - Optional hook providing static or derived enrichment context
 * @returns Wrapped function that never throws
 */
export function safeExecute<TArgs, TContext>(
  fn: (args: TArgs, context: TContext) => Promise<string>,
  toolName: string,
  contextExtractor?: ContextExtractor<TArgs>,
  options?: SafeExecuteOptions,
): (args: TArgs, context: TContext) => Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  return async (args: TArgs, context: TContext): Promise<string> => {
    const profiling = isProfilingEnabled();
    const startedAt = profiling ? performance.now() : 0;
    try {
      const result = await raceWithTimeout(
        fn(args, context),
        toolName,
        timeoutMs,
      );
      const output = applyOutputBudget(result);
      if (profiling) {
        recordToolProfile(
          toolName,
          startedAt,
          "success",
          undefined,
          contextExtractor ? contextExtractor(args) : undefined,
        );
      }
      return output;
    } catch (error) {
      const extra = contextExtractor ? contextExtractor(args) : undefined;
      if (profiling) {
        recordToolProfile(
          toolName,
          startedAt,
          "error",
          deriveErrorClass(error),
          extra,
        );
      }
      return formatErrorResponse(error, toolName, args, extra);
    }
  };
}

/**
 * Creates a version of safeExecute that works with tools that don't have a context parameter
 * (like agenda tools that just take directory).
 *
 * For agenda-style tools, the binder's `dir` and optional `path` parameters
 * are surfaced by default as `workdir` and `path` in error responses,
 * since they carry diagnostic value that would otherwise be lost.
 */
export function safeExecuteSimple<TArgs, TExtra>(
  fn: (args: TArgs, extra: TExtra) => Promise<string>,
  toolName: string,
  contextExtractor?: ContextExtractorSimple<TArgs, TExtra>,
  options?: SafeExecuteOptions,
): (args: TArgs, extra: TExtra, extraPath?: unknown) => Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  return async (
    args: TArgs,
    extra: TExtra,
    extraPath?: unknown,
  ): Promise<string> => {
    const profiling = isProfilingEnabled();
    const startedAt = profiling ? performance.now() : 0;
    try {
      const result = await raceWithTimeout(
        fn(args, extra),
        toolName,
        timeoutMs,
      );
      const output = applyOutputBudget(result);
      if (profiling) {
        const derivedExtra: ErrorContext = {};
        if (typeof extra === "string") {
          derivedExtra.workdir = extra;
        }
        if (typeof extraPath === "string") {
          derivedExtra.path = extraPath;
        }
        const provided = contextExtractor
          ? contextExtractor(args, extra)
          : undefined;
        recordToolProfile(toolName, startedAt, "success", undefined, {
          ...derivedExtra,
          ...(provided ?? {}),
        });
      }
      return output;
    } catch (error) {
      const derivedExtra: ErrorContext = {};
      if (typeof extra === "string") {
        derivedExtra.workdir = extra;
      }
      if (typeof extraPath === "string") {
        derivedExtra.path = extraPath;
      }
      const provided = contextExtractor
        ? contextExtractor(args, extra)
        : undefined;
      const merged: ErrorContext = {
        ...derivedExtra,
        ...(provided ?? {}),
      };
      if (profiling) {
        recordToolProfile(
          toolName,
          startedAt,
          "error",
          deriveErrorClass(error),
          merged,
        );
      }
      return formatErrorResponse(error, toolName, args, merged);
    }
  };
}
