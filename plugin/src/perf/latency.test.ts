import { describe, expect, test } from "vitest";
import {
  computeLatencyStats,
  discardWarmup,
  renderLatencyReport,
  runTimedSamples,
} from "./latency";

describe("latency harness", () => {
  test("discardWarmup drops the requested number of earliest samples", () => {
    expect(discardWarmup([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5]);
    expect(discardWarmup([1, 2], 10)).toEqual([]);
  });

  test("computeLatencyStats returns ordered min/p50/p95/max/avg", () => {
    const stats = computeLatencyStats([5, 1, 9, 3, 7]);

    expect(stats.count).toBe(5);
    expect(stats.min_ms).toBe(1);
    expect(stats.p50_ms).toBe(5);
    expect(stats.p95_ms).toBe(9);
    expect(stats.max_ms).toBe(9);
    expect(stats.avg_ms).toBe(5);
  });

  test("runTimedSamples collects timing stats for an async operation", async () => {
    let counter = 0;
    const result = await runTimedSamples(
      "sample-op",
      async () => {
        counter += 1;
      },
      5,
      1,
    );

    expect(counter).toBe(5);
    expect(result.label).toBe("sample-op");
    expect(result.stats.count).toBe(4);
    expect(result.stats.max_ms).toBeGreaterThanOrEqual(result.stats.min_ms);
  });

  test("renderLatencyReport includes metadata and operation summaries", () => {
    const report = renderLatencyReport({
      title: "ADV Latency Report",
      metadata: {
        backend_mode: "legacy",
        workdir: "/tmp/project",
      },
      operations: [
        {
          label: "adv_status",
          stats: {
            count: 5,
            min_ms: 1,
            p50_ms: 2,
            p95_ms: 4,
            max_ms: 5,
            avg_ms: 2.4,
          },
        },
      ],
    });

    expect(report).toContain("# ADV Latency Report");
    expect(report).toContain("backend_mode");
    expect(report).toContain("adv_status");
    expect(report).toContain("p95");
  });
});
