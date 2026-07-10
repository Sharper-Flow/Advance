/** adv CLI — Knip dead-code detector adapter */

import type { SlopScanFinding } from "../schema";
import { deletionCandidate } from "./_findings";

interface KnipIssueFile {
  name?: string;
}

interface KnipIssueExport {
  name?: string;
  line?: number;
}

interface KnipIssueDependency {
  name?: string;
}

interface KnipIssue {
  file?: string;
  files?: KnipIssueFile[];
  exports?: KnipIssueExport[];
  dependencies?: KnipIssueDependency[];
}

interface KnipReport {
  issues?: KnipIssue[];
}

export function normalizeKnipJson(raw: string, _repoRoot: string): SlopScanFinding[] {
  const parsed = JSON.parse(raw) as KnipReport;
  const findings: SlopScanFinding[] = [];

  for (const issue of parsed.issues ?? []) {
    for (const file of issue.files ?? []) {
      const name = file.name ?? issue.file ?? "unknown file";
      findings.push(
        deletionCandidate({
          name: "unused_file",
          file: name,
          description: `Knip reported unused file ${name}.`,
        }),
      );
    }

    for (const item of issue.exports ?? []) {
      const symbol = item.name ?? "unknown export";
      findings.push(
        deletionCandidate({
          name: "unused_export",
          file: issue.file ?? "package export graph",
          line: item.line ?? null,
          description: `Knip reported unused export ${symbol}.`,
        }),
      );
    }

    for (const dependency of issue.dependencies ?? []) {
      const symbol = dependency.name ?? "unknown dependency";
      findings.push(
        deletionCandidate({
          name: "unused_dependency",
          file: issue.file ?? "package.json",
          description: `Knip reported unused dependency ${symbol}.`,
        }),
      );
    }
  }

  return findings;
}

export function buildKnipCommand(): string[] {
  return ["pnpm", "exec", "knip", "--reporter", "json"];
}
