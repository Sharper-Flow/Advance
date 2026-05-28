/**
 * Tests for utils/metrics.ts — in-memory AC6 counters.
 *
 * Per JC-1, metrics are session-scoped and reset on plugin init.
 * No persistence is exercised here (out of scope for this change).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  getMetrics,
  RECENT_PHASE_BUFFER_LIMIT,
  recordAdvToolCall,
  recordPhaseDuration,
  recordSubagentSpawn,
  recordSystemBlockBytes,
  recordToolDuration,
  recordWallTimeMs,
  resetMetrics,
  withRecordedPhase,
} from "./metrics";

beforeEach(() => {
  resetMetrics();
});

describe("getMetrics — initial state", () => {
  it("returns all-zeros after resetMetrics", () => {
    const m = getMetrics();
    expect(m.adv_tool_calls).toBe(0);
    expect(m.adv_tool_call_count_by_name).toEqual({});
    expect(m.system_block_bytes).toBe(0);
    expect(m.subagent_spawns).toBe(0);
    expect(m.wall_time_ms).toBe(0);
    expect(m.adv_tool_durations).toEqual({});
    expect(m.recent_phase_durations).toEqual([]);
  });

  it("returns a copy that callers cannot use to mutate state", () => {
    const m = getMetrics();
    m.adv_tool_calls = 999;
    m.adv_tool_call_count_by_name["adv_change_show"] = 999;
    expect(getMetrics().adv_tool_calls).toBe(0);
    expect(getMetrics().adv_tool_call_count_by_name).toEqual({});
  });
});

describe("recordAdvToolCall", () => {
  it("increments adv_tool_calls and per-name count for adv_* tools", () => {
    recordAdvToolCall("adv_change_show");
    recordAdvToolCall("adv_change_show");
    recordAdvToolCall("adv_task_list");
    const m = getMetrics();
    expect(m.adv_tool_calls).toBe(3);
    expect(m.adv_tool_call_count_by_name.adv_change_show).toBe(2);
    expect(m.adv_tool_call_count_by_name.adv_task_list).toBe(1);
  });

  it("ignores non-adv_* tool names (bash, edit, read)", () => {
    recordAdvToolCall("bash");
    recordAdvToolCall("edit");
    recordAdvToolCall("read");
    const m = getMetrics();
    expect(m.adv_tool_calls).toBe(0);
    expect(m.adv_tool_call_count_by_name).toEqual({});
  });
});

describe("recordSystemBlockBytes", () => {
  it("accumulates positive byte lengths", () => {
    recordSystemBlockBytes(120);
    recordSystemBlockBytes(80);
    expect(getMetrics().system_block_bytes).toBe(200);
  });

  it("ignores zero and negative values", () => {
    recordSystemBlockBytes(0);
    recordSystemBlockBytes(-50);
    expect(getMetrics().system_block_bytes).toBe(0);
  });
});

describe("recordSubagentSpawn", () => {
  it("increments subagent_spawns", () => {
    recordSubagentSpawn();
    recordSubagentSpawn();
    recordSubagentSpawn();
    expect(getMetrics().subagent_spawns).toBe(3);
  });
});

describe("recordWallTimeMs", () => {
  it("accumulates positive durations", () => {
    recordWallTimeMs(100);
    recordWallTimeMs(250);
    expect(getMetrics().wall_time_ms).toBe(350);
  });

  it("ignores zero and negative values", () => {
    recordWallTimeMs(0);
    recordWallTimeMs(-200);
    expect(getMetrics().wall_time_ms).toBe(0);
  });
});

describe("resetMetrics", () => {
  it("zeroes all counters, including per-name map and durations", () => {
    recordAdvToolCall("adv_change_show");
    recordSystemBlockBytes(1234);
    recordSubagentSpawn();
    recordWallTimeMs(5000);
    recordToolDuration("adv_status", 120, "success");
    recordPhaseDuration({
      tool: "adv_status",
      phase: "temporalHealth",
      durationMs: 12,
    });

    resetMetrics();
    const m = getMetrics();
    expect(m.adv_tool_calls).toBe(0);
    expect(m.adv_tool_call_count_by_name).toEqual({});
    expect(m.system_block_bytes).toBe(0);
    expect(m.subagent_spawns).toBe(0);
    expect(m.wall_time_ms).toBe(0);
    expect(m.adv_tool_durations).toEqual({});
    expect(m.recent_phase_durations).toEqual([]);
  });
});

describe("recordToolDuration", () => {
  it("aggregates per-tool count/total/last/max and adds to wall_time_ms", () => {
    recordToolDuration("adv_status", 100, "success");
    recordToolDuration("adv_status", 50, "success");
    recordToolDuration("adv_status", 200, "success");
    recordToolDuration("adv_change_show", 75, "success");

    const m = getMetrics();
    expect(m.adv_tool_durations.adv_status).toEqual({
      count: 3,
      total_ms: 350,
      last_ms: 200,
      max_ms: 200,
      error_count: 0,
    });
    expect(m.adv_tool_durations.adv_change_show.count).toBe(1);
    expect(m.wall_time_ms).toBe(425);
  });

  it("records error outcomes without losing duration", () => {
    recordToolDuration("adv_run_test", 80, "success");
    recordToolDuration("adv_run_test", 30, "error");
    const m = getMetrics();
    expect(m.adv_tool_durations.adv_run_test).toMatchObject({
      count: 2,
      total_ms: 110,
      last_ms: 30,
      error_count: 1,
    });
  });

  it("ignores negative or non-finite durations", () => {
    recordToolDuration("adv_status", -5, "success");
    recordToolDuration("adv_status", Number.NaN, "success");
    recordToolDuration("adv_status", Number.POSITIVE_INFINITY, "success");
    expect(getMetrics().adv_tool_durations.adv_status).toBeUndefined();
    expect(getMetrics().wall_time_ms).toBe(0);
  });
});

describe("recordPhaseDuration", () => {
  it("appends named phase samples with default success outcome", () => {
    recordPhaseDuration({
      tool: "adv_status",
      phase: "temporalHealth",
      durationMs: 7,
    });
    recordPhaseDuration({
      tool: "adv_run_test",
      phase: "subprocess",
      durationMs: 42,
      outcome: "error",
    });

    const samples = getMetrics().recent_phase_durations;
    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({
      tool: "adv_status",
      phase: "temporalHealth",
      duration_ms: 7,
      outcome: "success",
    });
    expect(samples[1]).toMatchObject({
      tool: "adv_run_test",
      phase: "subprocess",
      duration_ms: 42,
      outcome: "error",
    });
  });

  it("caps recent buffer at RECENT_PHASE_BUFFER_LIMIT", () => {
    const overflow = RECENT_PHASE_BUFFER_LIMIT + 25;
    for (let i = 0; i < overflow; i++) {
      recordPhaseDuration({
        tool: "adv_status",
        phase: `phase_${i}`,
        durationMs: i,
      });
    }
    const samples = getMetrics().recent_phase_durations;
    expect(samples).toHaveLength(RECENT_PHASE_BUFFER_LIMIT);
    expect(samples[0].phase).toBe(`phase_${overflow - RECENT_PHASE_BUFFER_LIMIT}`);
    expect(samples[samples.length - 1].phase).toBe(`phase_${overflow - 1}`);
  });
});

describe("withRecordedPhase", () => {
  it("records success duration and returns the value", async () => {
    const result = await withRecordedPhase("adv_status", "ok", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 99;
    });
    expect(result).toBe(99);
    const samples = getMetrics().recent_phase_durations;
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      tool: "adv_status",
      phase: "ok",
      outcome: "success",
    });
    expect(samples[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("records error duration and rethrows", async () => {
    await expect(
      withRecordedPhase("adv_run_test", "boom", async () => {
        throw new Error("kaboom");
      }),
    ).rejects.toThrow("kaboom");
    const samples = getMetrics().recent_phase_durations;
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      tool: "adv_run_test",
      phase: "boom",
      outcome: "error",
    });
  });
});
