/**
 * Tests for utils/metrics.ts — in-memory AC6 counters.
 *
 * Per JC-1, metrics are session-scoped and reset on plugin init.
 * No persistence is exercised here (out of scope for this change).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  getMetrics,
  recordAdvToolCall,
  recordSubagentSpawn,
  recordSystemBlockBytes,
  recordWallTimeMs,
  resetMetrics,
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
  it("zeroes all counters, including per-name map", () => {
    recordAdvToolCall("adv_change_show");
    recordSystemBlockBytes(1234);
    recordSubagentSpawn();
    recordWallTimeMs(5000);

    resetMetrics();
    const m = getMetrics();
    expect(m.adv_tool_calls).toBe(0);
    expect(m.adv_tool_call_count_by_name).toEqual({});
    expect(m.system_block_bytes).toBe(0);
    expect(m.subagent_spawns).toBe(0);
    expect(m.wall_time_ms).toBe(0);
  });
});
