import type { SlopScanFinding } from "../schema";

export function complexityFinding(params: {
  name: string;
  file: string;
  line: number | null;
  description: string;
  complexity: number | null;
}): SlopScanFinding {
  return {
    id: "MAINT-004",
    name: params.name,
    severity: "MEDIUM",
    category: "Code Quality",
    file: params.file,
    line: params.line,
    description: params.description,
    fix: "Reduce complexity by splitting behavior or simplifying control flow.",
    confidence: "high",
    detectionMethod: "ast",
    grouping: "actionable",
    actionability: "actionable",
    phase: 1,
    nestingDepth: null,
    complexity: params.complexity,
  };
}

export function deletionCandidate(params: {
  name: string;
  file: string;
  line?: number | null;
  description: string;
  confidence?: "high" | "medium" | "low";
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
    confidence: params.confidence ?? "medium",
    detectionMethod: "tool",
    grouping: "user-review",
    actionability: "review_required",
    phase: 1,
    nestingDepth: null,
    complexity: null,
  };
}
