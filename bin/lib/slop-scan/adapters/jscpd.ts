/** adv CLI — jscpd duplicate-code adapter */

import type { SlopScanFinding } from "../schema";

interface JscpdLocation {
  name?: string;
  start?: number;
  end?: number;
  startLoc?: { line?: number; column?: number };
  endLoc?: { line?: number; column?: number };
}

interface JscpdDuplicate {
  format?: string;
  lines?: number;
  tokens?: number;
  firstFile?: JscpdLocation;
  secondFile?: JscpdLocation;
}

interface JscpdReport {
  duplicates?: JscpdDuplicate[];
  statistics?: unknown;
}

function startLine(location: JscpdLocation | undefined): number | null {
  return location?.start ?? location?.startLoc?.line ?? null;
}

export function normalizeJscpdReport(report: JscpdReport): SlopScanFinding[] {
  return (report.duplicates ?? []).map((duplicate) => {
    const first = duplicate.firstFile;
    const second = duplicate.secondFile;
    return {
      id: "STRUCT-002",
      name: "duplicate_code_block",
      severity: "MEDIUM",
      category: "Duplication",
      file: first?.name ?? "jscpd duplicate report",
      line: startLine(first),
      description: `jscpd reported ${duplicate.lines ?? "unknown"} duplicated lines between ${first?.name ?? "first file"} and ${second?.name ?? "second file"}.`,
      fix: "Review duplicated blocks and extract shared behavior only when it preserves clarity.",
      confidence: "high",
      detectionMethod: "tool",
      grouping: "actionable",
      actionability: "actionable",
      phase: 1,
      nestingDepth: null,
      complexity: duplicate.lines ?? null,
    } satisfies SlopScanFinding;
  });
}

export function normalizeJscpdJson(raw: string): SlopScanFinding[] {
  return normalizeJscpdReport(JSON.parse(raw) as JscpdReport);
}

export function buildJscpdCommand(targetPath: string, outputDir: string): string[] {
  return ["jscpd", "--reporters", "json", "--output", outputDir, targetPath];
}
