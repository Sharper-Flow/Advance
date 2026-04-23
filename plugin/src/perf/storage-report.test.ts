import { describe, expect, test } from "vitest";
import { renderStorageComparisonReport } from "./storage-report";

describe("storage comparison report", () => {
  test("renders benchmark rows and tradeoff bullets", () => {
    const report = renderStorageComparisonReport({
      title: "Storage Comparison",
      metadata: {
        repo_root: "/tmp/repo",
        temporal_disabled: true,
      },
      benchmarks: [
        {
          candidate: "jsonl",
          operation: "agenda.add.100",
          p50_ms: 0.3,
          p95_ms: 1.0,
          notes: "append path",
        },
        {
          candidate: "legacy",
          operation: "adv_status",
          p50_ms: 103.7,
          p95_ms: 209,
          notes: "full tool path",
        },
      ],
      tradeoffs: [
        {
          candidate: "jsonl",
          strengths: ["append-only audit trail"],
          risks: ["needs compaction"],
        },
      ],
    });

    expect(report).toContain("# Storage Comparison");
    expect(report).toContain("agenda.add.100");
    expect(report).toContain("adv_status");
    expect(report).toContain("append-only audit trail");
    expect(report).toContain("needs compaction");
  });
});
