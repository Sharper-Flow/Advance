/** adv CLI — Knip dead-code detector adapter */

import type { SlopScanFinding } from "../schema";

interface KnipExportFinding {
  file?: string;
  line?: number;
  name?: string;
  symbol?: string;
}

interface KnipReport {
  files?: string[];
  exports?: KnipExportFinding[];
  dependencies?: string[];
}

function deletionCandidate(params: {
  name: string;
  file: string;
  line?: number | null;
  description: string;
}): SlopScanFinding {
  return {
    id: "MAINT-003",
    name: params.name,
    severity: "LOW",
    category: "Dead Code",
    file: params.file,
    line: params.line ?? null,
    description: params.description,
    fix: "Verify reachability and public API usage before removing.",
    confidence: "medium",
    detectionMethod: "tool",
    grouping: "user-review",
    actionability: "review_required",
    phase: 1,
    nestingDepth: null,
    complexity: null,
  };
}

export function normalizeKnipJson(raw: string, _repoRoot: string): SlopScanFinding[] {
  const parsed = JSON.parse(raw) as KnipReport;
  const findings: SlopScanFinding[] = [];

  for (const file of parsed.files ?? []) {
    findings.push(
      deletionCandidate({
        name: "unused_file",
        file,
        description: `Knip reported unused file ${file}.`,
      }),
    );
  }

  for (const item of parsed.exports ?? []) {
    const symbol = item.name ?? item.symbol ?? "unknown export";
    findings.push(
      deletionCandidate({
        name: "unused_export",
        file: item.file ?? "package export graph",
        line: item.line ?? null,
        description: `Knip reported unused export ${symbol}.`,
      }),
    );
  }

  for (const dependency of parsed.dependencies ?? []) {
    findings.push(
      deletionCandidate({
        name: "unused_dependency",
        file: "package.json",
        description: `Knip reported unused dependency ${dependency}.`,
      }),
    );
  }

  return findings;
}

export function buildKnipCommand(): string[] {
  return ["pnpm", "exec", "knip", "--reporter", "json"];
}
