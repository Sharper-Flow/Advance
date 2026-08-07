/**
 * Per-tool runtime degradation wrapper (KD3).
 *
 * Detects host-probe unavailability at call time and returns class-aware
 * degraded response shapes for Tier-4 MCP read tools. This is the runtime
 * complement to the static classification table in `tools/index.ts`.
 *
 * Design invariants (DDC6 determinism):
 *   - Same input + same host-probe state → same response.
 *   - No tool silently returns stale data without tagging.
 *   - Degraded envelopes are additive JSON objects; they never rewrite binary
 *     or non-JSON tool output (that shape is reported and skipped).
 */

import type { Tier4ToolName, ToolClassification } from "./tools/index.js";

export interface DegradationOptions {
  /** Override host-probe availability probe. */
  hostProbesAvailable?: () => Promise<boolean>;
}

/**
 * Host-probe fields surfaced by `adv_status` whose data originates from host
 * probes (worker process lock, session-debt scan, etc.).
 * When host probes are unavailable, these fields are tagged with
 * `{ degraded: true, source: "host_probe_unavailable_in_mcp" }`.
 */
export const HOST_PROBE_FIELDS: readonly string[] = [
  "queue_serviceability",
  "worker_processes",
  "search_attributes",
  "opencode_session_debt",
  "opencode_debt_counts",
  "health_snapshot",
  "snapshot_health",
  "peer_sessions",
  "worktree_census",
];

/**
 * Probe whether representative host-side diagnostics are available right now.
 * Uses the OpenCode session-debt scan as a canary because it exercises the
 * same host resources (bun:sqlite, opencode DB) that other status probes need.
 */
export async function areHostProbesAvailable(): Promise<boolean> {
  try {
    const { scanOpenCodeSessionDebt } =
      await import("../utils/opencode-session-debt.js");
    const result = await scanOpenCodeSessionDebt();
    return result.available === true;
  } catch {
    return false;
  }
}

function tryParseJson(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Tag host-probe fields in a parsed status payload as degraded.
 */
export function tagHostProbeFields(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...payload };
  for (const field of HOST_PROBE_FIELDS) {
    if (!(field in result)) {
      continue;
    }
    const value = result[field];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[field] = {
        ...(value as Record<string, unknown>),
        degraded: true,
        source: "host_probe_unavailable_in_mcp",
      };
    } else {
      result[field] = {
        value,
        degraded: true,
        source: "host_probe_unavailable_in_mcp",
      };
    }
  }
  return result;
}

/**
 * Wrap a Tier-4 tool executor with class-aware runtime degradation.
 *
 * @param toolName            Tool name (e.g. "status").
 * @param classifications     KD10 classifications for this tool.
 * @param execute             Underlying tool executor returning JSON text.
 * @param options             Optional probe overrides (used in tests).
 */
export function wrapTier4Tool(
  toolName: Tier4ToolName,
  classifications: ToolClassification[],
  execute: (args: Record<string, unknown>) => Promise<string>,
  options: DegradationOptions = {},
): (args: Record<string, unknown>) => Promise<string> {
  return async (args) => {
    const needsHostProbe = classifications.includes("needs-host-probe");

    const raw = await execute(args);

    if (needsHostProbe) {
      const available = await (options.hostProbesAvailable?.() ??
        areHostProbesAvailable());
      if (!available) {
        const payload = tryParseJson(raw);
        if (payload === undefined) {
          return JSON.stringify({
            error: "DEGRADED_NON_JSON_OUTPUT",
            tool: toolName,
            degraded: true,
            source: "host_probe_unavailable_in_mcp",
            text: raw,
          });
        }
        return JSON.stringify({
          ...tagHostProbeFields(payload),
          degraded: true,
          source: "host_probe_unavailable_in_mcp",
          tool: toolName,
        });
      }
    }

    return raw;
  };
}
