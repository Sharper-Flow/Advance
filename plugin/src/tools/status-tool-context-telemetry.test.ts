/**
 * T4: Health view surfaces tool-context telemetry.
 *
 * Verifies that applyStatusView exposes the init-time schema manifest and
 * bounded numeric cache-token samples in the health view, while omitting them
 * from the summary view. Also asserts the documented limitation that live
 * per-request MCP tool counts require upstream OpenCode support.
 */

import { describe, expect, test } from "vitest";

import { applyStatusView } from "./status-view";

const full = {
  formatted: { summary: "" },
  tool_context_telemetry: {
    manifest: {
      total_tools: 3,
      total_schema_bytes: 1000,
      total_approx_tokens_4char_rule: 250,
      conversion_errors: 0,
      tools: {
        adv_status: {
          status: "available" as const,
          schema_bytes: 500,
          approx_tokens_4char_rule: 125,
        },
      },
    },
    cache_tokens: {
      sample_count: 2,
      total_input_tokens: 1000,
      total_cache_read_tokens: 200,
      total_cache_write_tokens: 300,
      samples: [
        { input_tokens: 400, cache_read_tokens: 100, cache_write_tokens: 150 },
        { input_tokens: 600, cache_read_tokens: 100, cache_write_tokens: 150 },
      ],
    },
    lane_projections: {
      "adv-ci-waiter": {
        availability: "available" as const,
        enabled_tools: 2,
        schema_bytes: 600,
        approx_tokens_4char_rule: 150,
        conversion_errors: 0,
      },
      "adv-engineer": {
        availability: "unavailable" as const,
        enabled_tools: 0,
        schema_bytes: 0,
        approx_tokens_4char_rule: 0,
        conversion_errors: 0,
      },
    },
    limitations: [
      "Live per-request MCP tool counts are unavailable without upstream OpenCode support.",
    ],
  },
};

describe("applyStatusView tool_context_telemetry projection", () => {
  test("health view includes schema manifest + lane projections + cache-token telemetry + limitation", () => {
    const projection = applyStatusView(full as never, "health");

    expect(projection.tool_context_telemetry).toEqual(
      full.tool_context_telemetry,
    );
    expect(projection.tool_context_telemetry.manifest.total_tools).toBe(3);
    expect(projection.tool_context_telemetry.cache_tokens.sample_count).toBe(2);
    expect(
      (projection.tool_context_telemetry as { limitations: string[] })
        .limitations,
    ).toContain(
      "Live per-request MCP tool counts are unavailable without upstream OpenCode support.",
    );
  });

  test("summary view omits tool_context_telemetry", () => {
    const projection = applyStatusView(full as never, "summary");
    expect("tool_context_telemetry" in projection).toBe(false);
  });

  test("changes and hygiene views omit tool_context_telemetry", () => {
    expect(
      "tool_context_telemetry" in applyStatusView(full as never, "changes"),
    ).toBe(false);
    expect(
      "tool_context_telemetry" in applyStatusView(full as never, "hygiene"),
    ).toBe(false);
  });
});
