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
}

/** Singleton counter state. Reset on plugin init via `resetMetrics()`. */
let counters: AdvMetricsCounters = createEmptyCounters();

function createEmptyCounters(): AdvMetricsCounters {
  return {
    adv_tool_calls: 0,
    adv_tool_call_count_by_name: {},
    system_block_bytes: 0,
    subagent_spawns: 0,
    wall_time_ms: 0,
  };
}

/** Reset all counters to zero. Called from the plugin factory at init. */
export function resetMetrics(): void {
  counters = createEmptyCounters();
}

/** Read a snapshot of current counters. The returned object is a
 *  shallow copy; callers must not mutate it. */
export function getMetrics(): AdvMetricsCounters {
  return {
    adv_tool_calls: counters.adv_tool_calls,
    adv_tool_call_count_by_name: { ...counters.adv_tool_call_count_by_name },
    system_block_bytes: counters.system_block_bytes,
    subagent_spawns: counters.subagent_spawns,
    wall_time_ms: counters.wall_time_ms,
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
