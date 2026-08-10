import { describe, expect, test } from "bun:test";

import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { buildEmptySlopScanReport } from "./schema";
import { deadCodeCheckExitCode, runDeadCodeCheck } from "./check";

const repoRoot = "/repo/plugin";

function cleanReport() {
  const report = buildEmptySlopScanReport({
    repoRoot,
    requestedPath: ".",
    languages: ["typescript"],
  });
  report.coverage.detectors.push({
    id: "knip",
    label: "Knip",
    state: "run",
    reason: "completed with no findings",
    important: true,
  });
  return report;
}

describe("dead-code:check command", () => {
  test("returns pass for an unchanged reviewed set", async () => {
    const result = await runDeadCodeCheck({
      repoRoot,
      baselinePath: "/repo/dead-code-baseline.json",
      readBaseline: async () => ({ fingerprints: [] }),
      scan: async () => cleanReport(),
    });

    expect(result).toMatchObject({ status: "pass", ok: true });
    expect(deadCodeCheckExitCode(result)).toBe(0);
  });

  test("returns pass and zero exit for a strict subset of the reviewed set", async () => {
    const result = await runDeadCodeCheck({
      repoRoot,
      baselinePath: "/repo/dead-code-baseline.json",
      readBaseline: async () => ({
        fingerprints: [
          JSON.stringify({
            id: "MAINT-003",
            name: "unused_export",
            file: "src/removed.ts",
            description: "Knip reported unused export removed.",
          }),
        ],
      }),
      scan: async () => cleanReport(),
    });

    expect(result.status).toBe("pass");
    expect(deadCodeCheckExitCode(result)).toBe(0);
  });

  test("returns fail for a new normalized fingerprint, including same-count replacement", async () => {
    const report = cleanReport();
    report.findings.push({
      id: "MAINT-003",
      name: "unused_export",
      severity: "LOW",
      category: "Dead Code",
      file: `${repoRoot}/src/new.ts`,
      line: 1,
      description: "Knip reported unused export new.",
      fix: "Review before removal.",
      confidence: "high",
      detectionMethod: "tool",
      grouping: "user-review",
      actionability: "review_required",
      phase: 1,
      nestingDepth: null,
      complexity: null,
    });

    const result = await runDeadCodeCheck({
      repoRoot,
      baselinePath: "/repo/dead-code-baseline.json",
      readBaseline: async () => ({
        fingerprints: [
          JSON.stringify({
            id: "MAINT-003",
            name: "unused_export",
            file: "src/old.ts",
            description: "Knip reported unused export old.",
          }),
        ],
      }),
      scan: async () => report,
    });

    expect(result).toMatchObject({ status: "fail", ok: false });
    expect(result.diagnostics.join("\n")).toContain("src/new.ts");
    expect(deadCodeCheckExitCode(result)).toBe(1);
  });

  test("blocks analyzer, report, coverage, and baseline failures", async () => {
    const cases = [
      {
        name: "analyzer",
        scan: async () => {
          throw new Error("knip unavailable");
        },
      },
      {
        name: "report",
        scan: async () => ({ invalid: true }),
      },
      {
        name: "coverage",
        scan: async () => {
          const report = cleanReport();
          report.coverage.detectors[0].state = "failed";
          report.coverage.detectors[0].reason = "knip failed";
          return report;
        },
      },
    ];

    for (const testCase of cases) {
      const result = await runDeadCodeCheck({
        repoRoot,
        baselinePath: "/repo/dead-code-baseline.json",
        readBaseline: async () => ({ fingerprints: [] }),
        scan: testCase.scan,
      });
      expect(result.status, testCase.name).toBe("blocked");
      expect(deadCodeCheckExitCode(result), testCase.name).toBe(2);
    }

    const baselineResult = await runDeadCodeCheck({
      repoRoot,
      baselinePath: "/repo/dead-code-baseline.json",
      readBaseline: async () => {
        throw new Error("baseline unreadable");
      },
      scan: async () => cleanReport(),
    });
    expect(baselineResult.status).toBe("blocked");
    expect(deadCodeCheckExitCode(baselineResult)).toBe(2);
  });

  test("does not write or change baseline bytes", async () => {
    const bytes = '{"fingerprints":[]}\n';
    const directory = await mkdtemp(join(tmpdir(), "dead-code-check-"));
    const baselinePath = join(directory, "baseline.json");
    try {
      await writeFile(baselinePath, bytes);
      const result = await runDeadCodeCheck({
        repoRoot,
        baselinePath,
        scan: async () => cleanReport(),
      });

      expect(result.status).toBe("pass");
      expect(await readFile(baselinePath, "utf8")).toBe(bytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
