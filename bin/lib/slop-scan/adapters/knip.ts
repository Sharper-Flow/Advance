/** adv CLI — Knip dead-code detector adapter */

import type { SlopScanFinding } from "../schema";
import { deletionCandidate } from "./_findings";

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
