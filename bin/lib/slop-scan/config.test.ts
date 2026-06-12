import { describe, expect, test } from "bun:test";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  DEFAULT_SLOP_SCAN_CONFIG,
  parseSlopScanConfig,
  readSlopScanConfig,
} from "./config";

describe("slop-scan config", () => {
  test("uses canonical defaults when config is absent", () => {
    expect(parseSlopScanConfig(undefined)).toEqual({
      ok: true,
      config: DEFAULT_SLOP_SCAN_CONFIG,
      warnings: [],
    });
  });

  test("accepts partial canonical threshold overrides", () => {
    const parsed = parseSlopScanConfig({
      nesting_depth_threshold: 6,
    });

    expect(parsed).toEqual({
      ok: true,
      config: { ...DEFAULT_SLOP_SCAN_CONFIG, nesting_depth_threshold: 6 },
      warnings: [],
    });
  });

  test("normalizes legacy short keys with warnings", () => {
    const parsed = parseSlopScanConfig({
      nesting_depth: 5,
      defensive_guard: 4,
      complexity: 13,
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.config).toEqual({
      ...DEFAULT_SLOP_SCAN_CONFIG,
      nesting_depth_threshold: 5,
      defensive_guard_threshold: 4,
      complexity_threshold: 13,
    });
    expect(parsed.warnings).toEqual([
      "features.slop_scan.nesting_depth is deprecated; use nesting_depth_threshold",
      "features.slop_scan.defensive_guard is deprecated; use defensive_guard_threshold",
      "features.slop_scan.complexity is deprecated; use complexity_threshold",
    ]);
  });

  test("rejects invalid threshold values", () => {
    const parsed = parseSlopScanConfig({ complexity_threshold: 0 });

    expect(parsed.ok).toBe(false);
    expect(parsed.errors.join("\n")).toContain("complexity_threshold");
  });

  test("reads project.json features.slop_scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "slop-config-"));
    await Bun.write(
      `${root}/project.json`,
      JSON.stringify({
        features: { slop_scan: { ast_timeout_ms: 1234 } },
      }),
    );

    const parsed = await readSlopScanConfig(root);
    expect(parsed.ok).toBe(true);
    expect(parsed.config.ast_timeout_ms).toBe(1234);
  });
});
