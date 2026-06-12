/** adv CLI — external CI coverage accounting */

import type { DetectorCoverage } from "../schema";

const SEMGREP_CONFIGS = /^\s*semgrep-configs:\s*["']?([^"'\n]+)["']?\s*$/m;

export function normalizeSemgrepExternalCoverage(workflowText: string): DetectorCoverage {
  const configs = workflowText.match(SEMGREP_CONFIGS)?.[1]?.trim();
  const usesSecurityGate = workflowText.includes("sharperflow-security-gates") || workflowText.includes("semgrep");

  if (configs && usesSecurityGate) {
    return {
      id: "external-ci-semgrep",
      label: "Semgrep PR gate",
      state: "externally_covered",
      reason: `Semgrep covered by PR CI config: ${configs}`,
      important: false,
      command: "GitHub Actions security-gates workflow",
    };
  }

  return {
    id: "external-ci-semgrep",
    label: "Semgrep PR gate",
    state: "skipped",
    reason: "No Semgrep PR CI config detected in provided workflow text",
    important: false,
  };
}
