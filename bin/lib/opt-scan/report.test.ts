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
      reason: "fixture-only sample: simulated skipped detector",
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
    expect(output).toContain("fixture-only sample: simulated skipped detector");
  });

  test("renders candidate evidence, recommendation, and verification in text", () => {
    const output = renderReport(
      {
        ...result,
        candidates: [
          {
            id: "repeated_boundary_work:src/api.ts:12",
            detector_id: "repeated_boundary_work",
            category: "optimization-candidate",
            signal_class: "static",
            severity: "minor",
            confidence: "medium",
            detection_method: "regex",
            description: "Boundary call in loop.",
            evidence: [
              { role: "trigger", file: "src/api.ts", line: 12 },
              { role: "scope", file: "src/api.ts", line: 10 },
            ],
            expected_cost_shape: {
              family: "repeated_boundary_work",
              pattern: "boundary",
              description: "Repeated boundary calls.",
            },
            false_positive_caveat: "May be intentional.",
            verification_needed: "Profile representative load.",
            recommendation: "Review batching after profiling.",
          },
        ],
      },
      "text",
    );

    expect(output).toContain("repeated_boundary_work:src/api.ts:12");
    expect(output).toContain("[trigger] src/api.ts:12");
    expect(output).toContain("[scope] src/api.ts:10");
    expect(output).toContain("Recommendation: Review batching after profiling.");
    expect(output).toContain("Verification: Profile representative load.");
  });
});
