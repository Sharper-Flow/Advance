/**
 * Helpers for ADV plugin hook bookkeeping.
 *
 * Keep these helpers outside `src/index.ts`. OpenCode 1.14.x initializes plugin
 * modules by invoking every function export from the entrypoint. Exporting
 * non-plugin helper functions from `index.ts` can register `null`/boolean values
 * as hooks and crash startup during `hook.config?.(...)`.
 */

/**
 * Parse JSON from a (potentially banner-wrapped) tool output.
 * OpenCode's hook contract types `output.output` as string, but real plugins
 * and SDK changes can pass structured values. Hooks must never crash during
 * parsing — a parser failure here can make an otherwise resumable session look
 * dead to the user.
 *
 * Strings: tries the post-banner segment first, then the full string.
 * ToolResult objects: parses their nested `output` first.
 * Other objects: returns the object directly.
 * Other values: returns null.
 */
function parseToolOutput<T>(rawOutput: unknown): T | null {
  if (rawOutput == null) return null;
  if (typeof rawOutput === "object") {
    const maybeToolResult = rawOutput as {
      title?: unknown;
      output?: unknown;
      metadata?: unknown;
      attachments?: unknown;
    };
    const isToolResult =
      "output" in maybeToolResult &&
      ("title" in maybeToolResult ||
        "metadata" in maybeToolResult ||
        "attachments" in maybeToolResult);
    if (isToolResult) {
      return parseToolOutput<T>(maybeToolResult.output);
    }
    return rawOutput as T;
  }
  if (typeof rawOutput !== "string") return null;

  const trimmed = rawOutput.trim();
  if (!trimmed) return null;
  const separatorIndex = trimmed.lastIndexOf("\n\n");
  const candidates = [
    separatorIndex >= 0 ? trimmed.slice(separatorIndex + 2).trim() : null,
    trimmed,
  ].filter((c): c is string => !!c);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const LONG_RUNNING_TOOLS = new Set(["adv_run_test"]);

export function isLongRunningTool(toolName: string): boolean {
  return LONG_RUNNING_TOOLS.has(toolName);
}

export function extractCreatedChangeId(rawOutput: unknown): string | null {
  const result = parseToolOutput<{
    changeId?: string;
    data?: { changeId?: string };
  }>(rawOutput);
  const changeId = result?.changeId ?? result?.data?.changeId;
  return typeof changeId === "string" ? changeId : null;
}

export function extractCompletedTask(
  rawOutput: unknown,
): { id: string; title: string } | null {
  const result = parseToolOutput<{
    success?: boolean;
    task?: { id?: string; title?: string; status?: string };
  }>(rawOutput);
  if (!result?.success || result.task?.status !== "done") return null;
  if (
    typeof result.task.id !== "string" ||
    typeof result.task.title !== "string"
  ) {
    return null;
  }
  return { id: result.task.id, title: result.task.title };
}
