import { describe, expect, test } from "bun:test";

import { deletionCandidate } from "./adapters/_findings";
import {
  attachSlopScanFailure,
  buildEmptySlopScanReport,
  requiredCoverageFailures,
  summarizeFindings,
  type DetectorCoverageState,
  type SlopScanReport,
} from "./schema";
import {
  deadCodeFingerprint,
  runDeadCodeRatchet,
  type DeadCodeBaseline,
} from "./ratchet";

const repoRoot = "/repo";

function reportWithFindings(
  findings: SlopScanReport["findings"],
): SlopScanReport {
  const report = buildEmptySlopScanReport({
    repoRoot,
    requestedPath: ".",
    languages: ["typescript"],
  });
  report.findings = findings;
  report.summary = summarizeFindings(findings);
  report.coverage.detectors.push({
    id: "knip",
    label: "Knip",
    state: "run",
    reason: "completed with findings",
    important: true,
  });
  return report;
}

function finding(params: {
  name: string;
  file: string;
  description: string;
  line?: number | null;
}) {
  return deletionCandidate({
    name: params.name,
    file: params.file,
    description: params.description,
    line: params.line,
  });
}

function baselineFor(...findings: SlopScanReport["findings"]): DeadCodeBaseline {
  return {
    fingerprints: findings.map((item) => deadCodeFingerprint(item, repoRoot)),
  };
}

describe("dead-code set ratchet", () => {
  test("reports only new shared-predicate findings and ignores line changes", async () => {
    const retained = finding({
      name: "unused_export",
      file: "/repo/src/old.ts",
      description: "Knip reported unused export old.",
      line: 10,
    });
    const added = finding({
      name: "unused_file",
      file: "/repo/src/new.ts",
      description: "Knip reported unused file new.",
      line: 20,
    });
    const excluded = {
      ...retained,
      id: "DEP-001" as const,
      category: "Dependencies",
      name: "unused_dependency",
    };
    const report = reportWithFindings([retained, added, excluded]);
    const baseline: DeadCodeBaseline = {
      fingerprints: [deadCodeFingerprint({ ...retained, line: 99 }, repoRoot)],
    };

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline,
      scan: async () => report,
    });

    expect(result.status).toBe("fail");
    expect(result.newFindings).toEqual([added]);
    expect(result.currentFingerprints).toHaveLength(2);
    expect(result.diagnostics).toEqual([
      "MAINT-003 unused_file src/new.ts: Knip reported unused file new.",
    ]);
  });

  test("sorts and deduplicates current fingerprints structurally", async () => {
    const first = finding({
      name: "unused_export",
      file: "/repo/src/z.ts",
      description: "Knip reported unused export z.",
      line: 20,
    });
    const second = finding({
      name: "unused_export",
      file: "/repo/src/a.ts",
      description: "Knip reported unused export a.",
      line: 4,
    });
    const duplicate = { ...first, line: 99 };

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: { fingerprints: [] },
      scan: async () => reportWithFindings([first, duplicate, second]),
    });

    expect(result.currentFingerprints).toEqual(
      [deadCodeFingerprint(second, repoRoot), deadCodeFingerprint(first, repoRoot)].sort(),
    );
    expect(result.newFindings.map((item) => item.file)).toEqual([
      "/repo/src/a.ts",
      "/repo/src/z.ts",
    ]);
  });

  test("passes when the current set is unchanged", async () => {
    const retained = finding({
      name: "unused_file",
      file: "/repo/src/retained.ts",
      description: "Knip reported unused file retained.",
    });

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: baselineFor(retained),
      scan: async () => reportWithFindings([retained]),
    });

    expect(result).toMatchObject({ status: "pass", ok: true, newFindings: [] });
  });

  test("passes when the current set is reduced", async () => {
    const retained = finding({
      name: "unused_file",
      file: "/repo/src/retained.ts",
      description: "Knip reported unused file retained.",
    });
    const removed = finding({
      name: "unused_file",
      file: "/repo/src/removed.ts",
      description: "Knip reported unused file removed.",
    });

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: baselineFor(retained, removed),
      scan: async () => reportWithFindings([retained]),
    });

    expect(result).toMatchObject({ status: "pass", ok: true, newFindings: [] });
  });

  test("fails when a same-count replacement appears", async () => {
    const removed = finding({
      name: "unused_file",
      file: "/repo/src/removed.ts",
      description: "Knip reported unused file removed.",
    });
    const added = finding({
      name: "unused_file",
      file: "/repo/src/added.ts",
      description: "Knip reported unused file added.",
    });

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: baselineFor(removed),
      scan: async () => reportWithFindings([added]),
    });

    expect(result).toMatchObject({ status: "fail", ok: false });
    expect(result.newFindings).toEqual([added]);
  });

  test("blocks a malformed baseline", async () => {
    let scanned = false;
    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: { fingerprints: [42 as unknown as string] },
      scan: async () => {
        scanned = true;
        return reportWithFindings([]);
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.diagnostics[0]).toContain("baseline.fingerprints");
    expect(scanned).toBe(false);
  });

  test("blocks a malformed report through validateSlopScanReport", async () => {
    const malformed = {
      ...reportWithFindings([]),
      schema_version: "slop_scan_report.invalid",
    };

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: { fingerprints: [] },
      scan: async () => malformed,
    });

    expect(result.status).toBe("blocked");
    expect(result.diagnostics.join("\n")).toContain("schema_version");
  });

  test("blocks scan exceptions", async () => {
    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: { fingerprints: [] },
      scan: async () => {
        throw new Error("scanner exploded");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.diagnostics).toEqual(["slop scan failed: scanner exploded"]);
  });

  test("blocks an existing report failure", async () => {
    const report = reportWithFindings([]);
    report.coverage.detectors[0] = {
      ...report.coverage.detectors[0],
      state: "failed",
      reason: "knip exited unexpectedly",
    };
    attachSlopScanFailure(report);

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: { fingerprints: [] },
      scan: async () => report,
    });

    expect(result.status).toBe("blocked");
    expect(result.diagnostics[0]).toBe(report.failure?.message);
  });

  for (const state of ["unavailable", "failed", "skipped", "timed_out"] as const) {
    test(`blocks required ${state} detector coverage`, async () => {
      const report = reportWithFindings([]);
      report.coverage.detectors[0] = {
        ...report.coverage.detectors[0],
        state: state as DetectorCoverageState,
        reason: `knip ${state}`,
      };

      const result = await runDeadCodeRatchet({
        repoRoot,
        requestedPath: ".",
        baseline: { fingerprints: [] },
        scan: async () => report,
      });

      expect(result.status).toBe("blocked");
      expect(result.newFindings).toEqual([]);
    });
  }

  test("does not mutate a frozen baseline input", async () => {
    const retained = finding({
      name: "unused_file",
      file: "/repo/src/retained.ts",
      description: "Knip reported unused file retained.",
    });
    const fingerprints = Object.freeze([
      deadCodeFingerprint(retained, repoRoot),
    ]);
    const baseline = Object.freeze({ fingerprints });

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline,
      scan: async () => reportWithFindings([retained]),
    });

    expect(result.status).toBe("pass");
    expect(baseline.fingerprints).toEqual(fingerprints);
    expect(Object.isFrozen(baseline)).toBe(true);
    expect(Object.isFrozen(baseline.fingerprints)).toBe(true);
  });

  test("fails closed when required coverage is degraded", async () => {
    const report = reportWithFindings([
      finding({
        name: "unused_file",
        file: "/repo/src/new.ts",
        description: "Knip reported unused file new.",
      }),
    ]);
    report.coverage.detectors[0] = {
      ...report.coverage.detectors[0],
      state: "unavailable",
      reason: "knip not found",
    };

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: { fingerprints: [] },
      scan: async () => report,
    });

    expect(requiredCoverageFailures(report.coverage.detectors)).toHaveLength(1);
    expect(result.status).toBe("blocked");
    expect(result.newFindings).toEqual([]);
    expect(result.diagnostics[0]).toContain(
      "Required slop-scan detector coverage degraded",
    );
  });

  test("bounds diagnostics while retaining the complete new set", async () => {
    const findings = Array.from({ length: 4 }, (_, index) =>
      finding({
        name: "unused_export",
        file: `/repo/src/${index}.ts`,
        description: `Knip reported unused export ${index}.`,
      }),
    );

    const result = await runDeadCodeRatchet({
      repoRoot,
      requestedPath: ".",
      baseline: { fingerprints: [] },
      maxDiagnostics: 2,
      scan: async () => reportWithFindings(findings),
    });

    expect(result.status).toBe("fail");
    expect(result.newFindings).toHaveLength(4);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnosticsTruncated).toBe(2);
  });
});
