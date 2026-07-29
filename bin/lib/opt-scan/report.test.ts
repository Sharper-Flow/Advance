import { describe, expect, test } from "bun:test";

import { renderReport } from "./report";
import type { OptScanResult } from "./scan";

const result: OptScanResult = {
  schema_version: "opt_scan_report.v1",
  generated_at: "2026-07-29T19:00:00.000Z",
  scope: { repoRoot: "/tmp/demo", phase: "all" },
  candidates: [],
  coverage: [
    {
      id: "repeated_boundary_work",
      label: "Repeated boundary work",
      state: "skipped",
      reason: "structural foundation: detector implementation pending",
      important: true,
    },
  ],
};

describe("renderReport", () => {
  test("renders JSON preserving the report envelope", () => {
    const output = renderReport(result, "json");
    const parsed = JSON.parse(output);

    expect(parsed.schema_version).toBe("opt_scan_report.v1");
    expect(parsed.coverage[0].id).toBe("repeated_boundary_work");
    expect(parsed.candidates).toEqual([]);
  });

  test("renders text with coverage breakdown", () => {
    const output = renderReport(result, "text");

    expect(output).toContain("Optimization Scan");
    expect(output).toContain("Candidates: 0");
    expect(output).toContain("repeated_boundary_work");
    expect(output).toContain("structural foundation: detector implementation pending");
  });
});
