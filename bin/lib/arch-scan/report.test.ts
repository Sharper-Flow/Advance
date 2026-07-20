import { describe, expect, test } from "bun:test";

import { renderReport } from "./report";
import type { ScanResult } from "./scan";

const result: ScanResult = {
  findings: [
    {
      id: "test#1",
      relationship_id: "test-relationship",
      category: "capability-consistency",
      severity: "major",
      confidence: "high",
      detection_method: "regex",
      description: "Test finding.",
      evidence: [
        {
          role: "trigger",
          file: "src/example.ts",
          line: 7,
          matchedSignal: "TEST_TRIGGER",
        },
      ],
      recommendation: "Add a counterpart.",
    },
  ],
  coverage: {
    appliedRelationships: ["test-relationship"],
    skippedRelationships: [],
    degradedRelationships: [],
  },
};

describe("renderReport", () => {
  test("renders stable text with finding evidence location", () => {
    const output = renderReport(result, "text");

    expect(output).toContain("Capability-Consistency Scan");
    expect(output).toContain("Findings: 1");
    expect(output).toContain("[major] test-relationship — src/example.ts:7");
    expect(output).toContain("Test finding.");
  });

  test("renders JSON without omitting structured finding fields", () => {
    const parsed = JSON.parse(renderReport(result, "json")) as {
      findings: Array<{ evidence: Array<{ file: string; line: number }> }>;
      coverage: ScanResult["coverage"];
    };

    expect(parsed.findings[0].evidence[0]).toEqual({
      role: "trigger",
      file: "src/example.ts",
      line: 7,
      matchedSignal: "TEST_TRIGGER",
    });
    expect(parsed.coverage.appliedRelationships).toEqual(["test-relationship"]);
  });
});
