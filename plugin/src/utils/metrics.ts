// rq-advMetricsBaseline01 — per-phase metrics counters surfaced via health view
/**
 * In-Memory Metrics Counters
 *
 * Per JC-1, ADV holds the AC6 counters in process memory only — no
 * SQLite persistence, no cross-session aggregation. Counters reset on
 * plugin init (matches `state` lifecycle in `index.ts`).
 *
 * Surfaced via `adv_status view: "health"` so an operator can sample
 * the per-phase volume of:
 *
 *   - adv_tool_calls           — total `adv_*` tool invocations
 *   - adv_tool_call_count_by_name — Map<toolName, count> for breakdown
 *   - system_block_bytes       — bytes written into `output.system[0]`
 *                                across the session (cache-aware
 *                                refinement baseline)
 *   - subagent_spawns          — `task` tool invocations from main
 *   - wall_time_ms             — accumulator for caller-tracked timing
 *
 * The module exports a singleton state object plus accessor helpers.
 * Callers SHOULD use the helpers (atomic increments) rather than
 * mutating the export directly.
 */

export interface AdvMetricsCounters {
  adv_tool_calls: number;
  /** Map<toolName, callCount>. Object form for serializability. */
  adv_tool_call_count_by_name: Record<string, number>;
  system_block_bytes: number;
  subagent_spawns: number;
  wall_time_ms: number;
  /**
   * Per-tool duration aggregates surfaced via adv_status view:"health"
   * (rq-advLatencyTelemetry01). Always-on in-memory rollup. Records
   * success and error outcomes. Counters reset on plugin init.
   */
  adv_tool_durations: Record<string, ToolDurationStat>;
  /**
   * Recent named phase/substep durations (e.g. adv_status providers,
   * adv_run_test substeps). Bounded ring buffer to keep memory flat.
   */
  recent_phase_durations: PhaseDurationSample[];
}

export interface ToolDurationStat {
  count: number;
  total_ms: number;
  last_ms: number;
  max_ms: number;
  error_count: number;
}

export interface PhaseDurationSample {
  tool: string;
  phase: string;
  duration_ms: number;
  outcome: "success" | "error";
  at: string;
}

/** Maximum recent phase samples retained in memory. Bounded to keep
 *  metrics surfacing flat regardless of session length. */
export const RECENT_PHASE_BUFFER_LIMIT = 50;

/** Singleton counter state. Reset on plugin init via `resetMetrics()`. */
let counters: AdvMetricsCounters = createEmptyCounters();

function createEmptyCounters(): AdvMetricsCounters {
  return {
    adv_tool_calls: 0,
    adv_tool_call_count_by_name: {},
    system_block_bytes: 0,
    subagent_spawns: 0,
    wall_time_ms: 0,
    adv_tool_durations: {},
    recent_phase_durations: [],
  };
}

/** Reset all counters to zero. Called from the plugin factory at init. */
export function resetMetrics(): void {
  counters = createEmptyCounters();
}

/** Read a snapshot of current counters. The returned object is a
 *  shallow copy; callers must not mutate it. */
export function getMetrics(): AdvMetricsCounters {
  const durations: Record<string, ToolDurationStat> = {};
  for (const [name, stat] of Object.entries(counters.adv_tool_durations)) {
    durations[name] = { ...stat };
  }
  return {
    adv_tool_calls: counters.adv_tool_calls,
    adv_tool_call_count_by_name: { ...counters.adv_tool_call_count_by_name },
    system_block_bytes: counters.system_block_bytes,
    subagent_spawns: counters.subagent_spawns,
    wall_time_ms: counters.wall_time_ms,
    adv_tool_durations: durations,
    recent_phase_durations: counters.recent_phase_durations.map((s) => ({
      ...s,
    })),
  };
}

/** Increment the global ADV-tool-call counter and the per-name breakdown.
 *  Called from `tool.execute.after` for any `adv_*` tool. */
export function recordAdvToolCall(toolName: string): void {
  if (!toolName.startsWith("adv_")) return;
  counters.adv_tool_calls += 1;
  counters.adv_tool_call_count_by_name[toolName] =
    (counters.adv_tool_call_count_by_name[toolName] ?? 0) + 1;
}

/** Add bytes written to `output.system[0]` for cache-aware analysis. */
export function recordSystemBlockBytes(byteLen: number): void {
  if (byteLen > 0) counters.system_block_bytes += byteLen;
}

/** Increment the subagent-spawn counter. Called from `tool.execute.before`
 *  when the `task` tool is invoked from the main agent. */
export function recordSubagentSpawn(): void {
  counters.subagent_spawns += 1;
}

/** Add wall-clock milliseconds tracked by the caller (e.g. tool runtime). */
export function recordWallTimeMs(durationMs: number): void {
  if (durationMs > 0) counters.wall_time_ms += durationMs;
}

/**
 * Record a per-tool duration sample for the always-on telemetry surface
 * (rq-advLatencyTelemetry01). Updates count/total/last/max plus an
 * error-counter when outcome === "error". Negative or non-finite durations
 * are ignored. Outcome is recorded for both success and error so error
 * paths still surface latency.
 */
export function recordToolDuration(
  toolName: string,
  durationMs: number,
  outcome: "success" | "error" = "success",
): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const stat = counters.adv_tool_durations[toolName] ?? {
    count: 0,
    total_ms: 0,
    last_ms: 0,
    max_ms: 0,
    error_count: 0,
  };
  stat.count += 1;
  stat.total_ms += durationMs;
  stat.last_ms = durationMs;
  if (durationMs > stat.max_ms) stat.max_ms = durationMs;
  if (outcome === "error") stat.error_count += 1;
  counters.adv_tool_durations[toolName] = stat;
  recordWallTimeMs(durationMs);
}

/**
 * Record a named phase/substep duration sample. Used by adv_status
 * provider plan and adv_run_test substep timing. Bounded ring buffer
 * keeps memory flat across long sessions. Tool name and phase name
 * are caller-owned; this module does not parse semantics.
 */
export function recordPhaseDuration(sample: {
  tool: string;
  phase: string;
  durationMs: number;
  outcome?: "success" | "error";
  at?: string;
}): void {
  if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) return;
  const entry: PhaseDurationSample = {
    tool: sample.tool,
    phase: sample.phase,
    duration_ms: sample.durationMs,
    outcome: sample.outcome ?? "success",
    at: sample.at ?? new Date().toISOString(),
  };
  counters.recent_phase_durations.push(entry);
  if (counters.recent_phase_durations.length > RECENT_PHASE_BUFFER_LIMIT) {
    counters.recent_phase_durations.splice(
      0,
      counters.recent_phase_durations.length - RECENT_PHASE_BUFFER_LIMIT,
    );
  }
}

/**
 * Helper for callers that want to time an async phase and record it
 * automatically. Returns the phase result; failures still record duration
 * with outcome "error" and re-throw.
 */
export async function withRecordedPhase<T>(
  tool: string,
  phase: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const value = await fn();
    recordPhaseDuration({
      tool,
      phase,
      durationMs: performance.now() - startedAt,
      outcome: "success",
    });
    return value;
  } catch (err) {
    recordPhaseDuration({
      tool,
      phase,
      durationMs: performance.now() - startedAt,
      outcome: "error",
    });
    throw err;
  }
}
