/** adv CLI — ast-grep structural adapter */

import type { SlopScanFinding, SlopSeverity } from "../schema";
import { toRepoRelative } from "./_paths";

interface AstGrepMatch {
  ruleId?: string;
  message?: string;
  file?: string;
  filePath?: string;
  severity?: string;
  range?: { start?: { line?: number; column?: number } };
}

function normalizeSeverity(value: string | undefined): SlopSeverity {
  switch (value) {
    case "error":
      return "HIGH";
    case "hint":
      return "LOW";
    case "info":
      return "LOW";
    default:
      return "MEDIUM";
  }
}

export function normalizeAstGrepJson(raw: string, repoRoot: string): SlopScanFinding[] {
  const parsed = JSON.parse(raw) as AstGrepMatch[];
  return parsed.map((match) => {
    const file = toRepoRelative(match.file ?? match.filePath ?? "ast-grep match", repoRoot);
    return {
      id: match.ruleId && /^[A-Z]+-\d+$/.test(match.ruleId) ? match.ruleId : "STRUCT-005",
      name: "structural_pattern_match",
      severity: normalizeSeverity(match.severity),
      category: "Structure",
      file,
      line: match.range?.start?.line ?? null,
      description: match.message ?? "ast-grep structural pattern matched.",
      fix: "Review matched structure against project conventions before changing code.",
      confidence: "medium",
      detectionMethod: "ast",
      grouping: "user-review",
      actionability: "review_required",
      phase: 1,
      nestingDepth: null,
      complexity: null,
    };
  });
}

export function buildAstGrepCommand(targetPath: string): string[] {
  return ["ast-grep", "scan", "--json=compact", targetPath];
}
