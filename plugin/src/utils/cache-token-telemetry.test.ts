import { beforeEach, describe, expect, it } from "vitest";

import { runTimedSamples } from "../perf/latency";
import {
  getCacheTokenTelemetry,
  recordStepFinishTokens,
  resetCacheTokenTelemetry,
} from "./cache-token-telemetry";

beforeEach(() => {
  resetCacheTokenTelemetry();
});

describe("recordStepFinishTokens", () => {
  it("retains only numeric cache-token fields from step-finish parts", () => {
    expect(
      recordStepFinishTokens({
        type: "step-finish",
        tokens: { input: 120, cache: { read: 80, write: 12 } },
        text: "must not be retained",
      }),
    ).toBe(true);

    expect(getCacheTokenTelemetry()).toEqual({
      sample_count: 1,
      total_input_tokens: 120,
      total_cache_read_tokens: 80,
      total_cache_write_tokens: 12,
      samples: [
        { input_tokens: 120, cache_read_tokens: 80, cache_write_tokens: 12 },
      ],
    });
  });

  it("rejects malformed and non-step-finish parts without throwing", () => {
    expect(recordStepFinishTokens({ type: "text", tokens: { input: 1 } })).toBe(
      false,
    );
    expect(
      recordStepFinishTokens({
        type: "step-finish",
        tokens: { input: "120", cache: { read: 1, write: 2 } },
      }),
    ).toBe(false);
    expect(getCacheTokenTelemetry().sample_count).toBe(0);
  });
});

describe("recordStepFinishTokens overhead", () => {
  it("p95 handler latency stays under 2ms", async () => {
    const payload = {
      type: "step-finish",
      tokens: { input: 120, cache: { read: 80, write: 12 } },
    };

    const measurement = await runTimedSamples(
      "recordStepFinishTokens",
      async () => {
        recordStepFinishTokens(payload);
      },
      500,
      20,
    );

    expect(measurement.stats.p95_ms).toBeLessThan(2);
  });
});
