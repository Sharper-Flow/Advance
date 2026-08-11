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
 * `tool`, `hint`, `received_args`) are preserved; sensitive argument values
 * are redacted before being echoed back to the agent.
 */

import { ZodError } from "zod";
import { formatToolOutput } from "./tool-output";
import { appendProfileLog } from "./debug-log";
import { recordToolDuration } from "./metrics";
import {
  isAdvSessionNotReady,
  ADV_SESSION_NOT_READY_KIND,
} from "./readiness-envelope";
import { DEFAULT_TOOL_TIMEOUT_MS } from "./tool-budgets";
import { withToolDeadline } from "./tool-deadline";

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

function isSensitiveArgKey(key: string): boolean {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  return [
    "password",
    "passwd",
    "pwd",
    "token",
    "secret",
    "apikey",
    "credential",
    "privatekey",
  ].some((sensitive) => normalized.includes(sensitive));
}

export function redactSensitiveArgs(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveArgs(item, seen));
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = isSensitiveArgKey(key)
      ? "[REDACTED]"
      : redactSensitiveArgs(entry, seen);
  }
  return redacted;
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
  const redactedArgs =
    args === undefined ? undefined : redactSensitiveArgs(args);
  mergeDefinedContext(enrichment as ErrorContext, derived);

  // Preserve the typed ADV_SESSION_NOT_READY envelope when the fail-closed
  // session-readiness barrier throws it. This is distinct from
  // ADV_PLUGIN_INIT_FAILED and no_poller diagnostics and must remain
  // caller-discriminable at the tool-result boundary.
  if (isAdvSessionNotReady(error)) {
    enrichment.errorClass = "AdvSessionNotReady";
    return formatToolOutput({
      error: ADV_SESSION_NOT_READY_KIND,
      kind: error.kind,
      blockers: error.blockers,
      retryHint: error.retryHint,
      retryable: true,
      tool: toolName,
      ...(args !== undefined && { received_args: redactedArgs }),
      ...enrichment,
    });
  }

  // Handle Zod schema validation errors specially
  if (error instanceof ZodError) {
    return formatToolOutput({
      error: formatZodError(error),
      tool: toolName,
      hint: "Please check your arguments and try again.",
      received_args: redactedArgs,
      ...enrichment,
    });
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    // Preserve structured fields from AdvProjectContextMismatch errors
    if (error.name === "AdvProjectContextMismatch") {
      const e = error as unknown as Record<string, unknown>;
      enrichment.changeId = e.changeId;
      enrichment.owningProjectId = e.owningProjectId;
      enrichment.currentProjectId = e.currentProjectId;
    }
    return formatToolOutput({
      error: error.message,
      tool: toolName,
      hint:
        formatToolTimeoutHint(error) ??
        "An unexpected error occurred. Please check your arguments.",
      ...(args !== undefined && { received_args: redactedArgs }),
      ...enrichment,
    });
  }

  // Handle unknown error types
  const unknownMessage = String(error);
  return formatToolOutput({
    error: unknownMessage,
    tool: toolName,
    hint: "An unknown error occurred.",
    ...enrichment,
  });
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TRUNCATION_LIMIT = 30000;

/**
 * Optional safety-net timeout override. Accepted by `safeExecute` and
 * `safeExecuteSimple`; when omitted the default `DEFAULT_TOOL_TIMEOUT_MS`
 * is used.
 */
export interface SafeExecuteOptions<TArgs = unknown> {
  /** Hard timeout (ms) for a single tool execute() call. Default: 10_000. */
  timeoutMs?: number;
  /**
   * Optional timeout classifier invoked when the safety-net timeout fires.
   *
   * Tools whose durable work may already have landed when the outer
   * budget expires (e.g. adv_change_archive's bundle-first write) can
   * replace the bare `ToolExecutionTimeout` response with a typed,
   * actionable result. Return a formatted tool-output string to use it,
   * or `undefined` to keep the generic timeout response.
   *
   * Best-effort: a throwing classifier falls back to the generic
   * response, and the (uncancellable) execute promise keeps running in
   * the background either way.
   */
  onToolTimeout?: (
    args: TArgs,
    error: ToolExecutionTimeoutError,
  ) => Promise<string | undefined>;
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
 *   2. Stale/corrupted persisted state where a read or write hangs.
 *   3. An unresponsive host dependency.
 */
function formatToolTimeoutHint(error: unknown): string | undefined {
  if (!(error instanceof ToolExecutionTimeoutError)) return undefined;
  return (
    "Tool execution timed out. Likely causes: (1) missing required args — " +
    "verify all required fields are provided; (2) stale persisted state — " +
    "retry with `adv_status` and `adv_doctor`; (3) an unresponsive host " +
    "dependency — an OpenCode restart may be required."
  );
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

/**
 * rq-advLatencyTelemetry01: always-on in-memory per-tool duration
 * recording for safeExecute-wrapped tools. Keeps `ADV_PROFILE` file
 * logging as an opt-in extra so existing profile workflows are not
 * altered.
 */
function recordToolTelemetry(
  tool: string,
  startedAt: number,
  outcome: "success" | "error",
): void {
  const durationMs = Number((performance.now() - startedAt).toFixed(3));
  recordToolDuration(tool, durationMs, outcome);
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
  options?: SafeExecuteOptions<TArgs>,
): (args: TArgs, context: TContext) => Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  return async (args: TArgs, context: TContext): Promise<string> => {
    const profiling = isProfilingEnabled();
    const startedAt = performance.now();
    try {
      const result = await raceWithTimeout(
        withToolDeadline(timeoutMs, () => fn(args, context)),
        toolName,
        timeoutMs,
      );
      const output = applyOutputBudget(result);
      recordToolTelemetry(toolName, startedAt, "success");
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
      recordToolTelemetry(toolName, startedAt, "error");
      if (
        error instanceof ToolExecutionTimeoutError &&
        options?.onToolTimeout
      ) {
        try {
          const typed = await options.onToolTimeout(args, error);
          if (typed !== undefined) {
            if (profiling) {
              recordToolProfile(
                toolName,
                startedAt,
                "error",
                deriveErrorClass(error),
                extra,
              );
            }
            return applyOutputBudget(typed);
          }
        } catch {
          // Classifier failure must never mask the original timeout —
          // fall through to the generic response below.
        }
      }
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
 * Creates a version of safeExecute that works with tools that don't have a
 * context parameter (store-less tools that take a directory or similar).
 *
 * For such tools, the binder's `dir` and optional `path` parameters are
 * surfaced by default as `workdir` and `path` in error responses, since
 * they carry diagnostic value that would otherwise be lost.
 */
export function safeExecuteSimple<TArgs, TExtra>(
  fn: (args: TArgs, extra: TExtra) => Promise<string>,
  toolName: string,
  contextExtractor?: ContextExtractorSimple<TArgs, TExtra>,
  options?: SafeExecuteOptions<TArgs>,
): (args: TArgs, extra: TExtra, extraPath?: unknown) => Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  return async (
    args: TArgs,
    extra: TExtra,
    extraPath?: unknown,
  ): Promise<string> => {
    const profiling = isProfilingEnabled();
    const startedAt = performance.now();
    try {
      const result = await raceWithTimeout(
        withToolDeadline(timeoutMs, () => fn(args, extra)),
        toolName,
        timeoutMs,
      );
      const output = applyOutputBudget(result);
      recordToolTelemetry(toolName, startedAt, "success");
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
      recordToolTelemetry(toolName, startedAt, "error");
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
