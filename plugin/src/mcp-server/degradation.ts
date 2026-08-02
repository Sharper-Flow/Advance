/**
 * Per-tool runtime degradation wrapper (KD3).
 *
 * Detects Temporal/host-probe unavailability at call time and returns
 * class-aware degraded response shapes for Tier-4 MCP read tools. This is the
 * runtime complement to the static KD10 classification table in
 * `tools/index.ts`: classifications decide *which* degradation path a tool
 * takes, and this module decides *when* to take it by probing actual runtime
 * state per call.
 *
 * Design invariants (DDC6 determinism):
 *   - Same input + same Temporal state → same response.
 *   - No tool silently returns stale data without tagging.
 *   - Degraded envelopes are additive JSON objects; they never rewrite binary
 *     or non-JSON tool output (that shape is reported and skipped).
 */

import type { Tier4ToolName, ToolClassification } from "./tools/index.js";
import { TemporalOperationsOwner } from "../temporal/operations.js";
import { makeTemporalLifecycleContext } from "../temporal/operations.js";

export interface DegradationOptions {
  /** Override Temporal reachability probe. */
  temporalReachable?: () => Promise<boolean>;
  /** Override host-probe availability probe. */
  hostProbesAvailable?: () => Promise<boolean>;
}

const TEMPORAL_REACHABILITY_TIMEOUT_MS = 2_000;

/**
 * Host-probe fields surfaced by `adv_status` whose data originates from host
 * probes (Temporal reachability, worker process lock, session-debt scan, etc.).
 * When host probes are unavailable, these fields are tagged with
 * `{ degraded: true, source: "host_probe_unavailable_in_mcp" }`.
 */
export const HOST_PROBE_FIELDS: readonly string[] = [
  "temporal_health",
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

const TEMPORAL_REACHABILITY_PROBE_PROJECT_ID =
  "0000000000000000000000000000000000000000";

/**
 * Probe whether the configured Temporal server is reachable right now.
 * Returns `false` on any connection or timeout error.
 */
export async function isTemporalReachable(): Promise<boolean> {
  let owner: TemporalOperationsOwner | undefined;
  try {
    owner = await TemporalOperationsOwner.fromEnv(
      TEMPORAL_REACHABILITY_PROBE_PROJECT_ID,
    );
    return await owner.isReachable(
      makeTemporalLifecycleContext(
        TEMPORAL_REACHABILITY_PROBE_PROJECT_ID,
        "isTemporalReachable",
        TEMPORAL_REACHABILITY_TIMEOUT_MS,
      ),
    );
  } catch {
    return false;
  } finally {
    await owner?.close();
  }
}

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
    const needsTemporal =
      classifications.includes("needs-temporal") ||
      classifications.includes("needs-temporal-diagnostics");
    const needsHostProbe = classifications.includes("needs-host-probe");

    if (needsTemporal) {
      const reachable = await (options.temporalReachable?.() ??
        isTemporalReachable());
      if (!reachable) {
        const raw = await execute(args);
        const payload = tryParseJson(raw);
        if (payload === undefined) {
          // Non-JSON tool output cannot safely accommodate the degraded
          // envelope. STOP_WHEN: report and skip with rationale.
          return JSON.stringify({
            error: "DEGRADED_NON_JSON_OUTPUT",
            tool: toolName,
            degraded: true,
            source: "disk_projection",
            text: raw,
          });
        }
        return JSON.stringify({
          ...payload,
          degraded: true,
          source: "disk_projection",
          tool: toolName,
        });
      }
    }

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
