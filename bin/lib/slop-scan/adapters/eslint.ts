/** adv CLI — ESLint slop detector adapter */

import type { SlopScanFinding } from "../schema";
import { parseFirstNumber, toRepoRelative } from "./_paths";

interface EslintMessage {
  ruleId?: string | null;
  message?: string;
  line?: number;
}

interface EslintFileResult {
  filePath: string;
  messages?: EslintMessage[];
}

function findingForMessage(
  file: string,
  message: EslintMessage,
): SlopScanFinding | null {
  if (message.ruleId !== "complexity" && message.ruleId !== "max-depth")
    return null;
  const value = parseFirstNumber(message.message ?? "");
  const isComplexity = message.ruleId === "complexity";

  return {
    id: "MAINT-004",
    name: isComplexity ? "complexity_hotspot" : "deep_nesting",
    severity: "MEDIUM",
    category: "Code Quality",
    file,
    line: message.line ?? null,
    description:
      message.message ?? (isComplexity ? "Complex function" : "Deep nesting"),
    fix: isComplexity
      ? "Reduce cyclomatic complexity or split the function."
      : "Flatten control flow or extract smaller functions.",
    confidence: "high",
    detectionMethod: "ast",
    grouping: "actionable",
    actionability: "actionable",
    phase: 1,
    nestingDepth: isComplexity ? null : value,
    complexity: isComplexity ? value : null,
  };
}

export function normalizeEslintJson(
  raw: string,
  repoRoot: string,
): SlopScanFinding[] {
  const parsed = JSON.parse(raw) as EslintFileResult[];
  const findings: SlopScanFinding[] = [];
  for (const result of parsed) {
    const file = toRepoRelative(result.filePath, repoRoot);
    for (const message of result.messages ?? []) {
      const finding = findingForMessage(file, message);
      if (finding) findings.push(finding);
    }
  }
  return findings;
}

export function buildEslintCommand(
  targetPath: string,
  thresholds = { complexity: 10, maxDepth: 4 },
): string[] {
  return [
    "pnpm",
    "exec",
    "eslint",
    "--format",
    "json",
    "--rule",
    `complexity: [warn, ${thresholds.complexity}]`,
    "--rule",
    `max-depth: [warn, ${thresholds.maxDepth}]`,
    targetPath,
  ];
}
