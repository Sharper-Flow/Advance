/** adv CLI — slop scan text renderer */

import type {
  DetectorCoverage,
  SlopScanFinding,
  SlopScanReport,
} from "./schema";

const WARNING_STATES = new Set([
  "degraded",
  "failed",
  "timed_out",
  "unavailable",
]);

function importantWarnings(detectors: DetectorCoverage[]): DetectorCoverage[] {
  return detectors.filter(
    (detector) => detector.important && WARNING_STATES.has(detector.state),
  );
}

function renderFinding(lines: string[], finding: SlopScanFinding): void {
  const location =
    finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
  lines.push(
    `- [${finding.severity}] ${finding.id} ${finding.name} (${location})`,
  );
  lines.push(`  ${finding.description}`);
  lines.push(`  Fix: ${finding.fix}`);
  const diagnostics = [
    `${finding.detectionMethod}`,
    `confidence ${finding.confidence}`,
  ];
  if (finding.nestingDepth !== null)
    diagnostics.push(`nestingDepth ${finding.nestingDepth}`);
  if (finding.complexity !== null)
    diagnostics.push(`complexity ${finding.complexity}`);
  lines.push(`  Evidence: ${diagnostics.join(", ")}`);
}

export function renderSlopScanReport(
  report: SlopScanReport,
  _useColor: boolean,
): string {
  const lines: string[] = [];
  const warnings = importantWarnings(report.coverage.detectors);

  lines.push("SLOP SCAN REPORT");
  lines.push(`Scope: ${report.scope.requestedPath}`);
  lines.push(
    `Languages: ${report.scope.languages.length > 0 ? report.scope.languages.join(", ") : "unknown"}`,
  );
  lines.push("");

  if (warnings.length > 0) {
    lines.push("PROMINENT COVERAGE WARNINGS");
    for (const warning of warnings) {
      lines.push(`- ${warning.label}: ${warning.state} — ${warning.reason}`);
    }
    lines.push("");
  }

  lines.push("Summary");
  lines.push(`- Total findings: ${report.summary.total}`);
  lines.push(
    `- Severity: CRITICAL ${report.summary.bySeverity.CRITICAL}, HIGH ${report.summary.bySeverity.HIGH}, MEDIUM ${report.summary.bySeverity.MEDIUM}, LOW ${report.summary.bySeverity.LOW}`,
  );
  const categories = Object.entries(report.summary.byCategory)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => `${category} ${count}`);
  lines.push(
    `- Categories: ${categories.length > 0 ? categories.join(", ") : "none"}`,
  );
  lines.push("");

  lines.push("Detector Coverage");
  if (report.coverage.detectors.length === 0) {
    lines.push("- none recorded");
  } else {
    for (const detector of report.coverage.detectors) {
      lines.push(`- ${detector.label}: ${detector.state} — ${detector.reason}`);
    }
  }
  lines.push("");

  if (report.findings.length === 0) {
    if (warnings.length === 0) lines.push("[OK] No slop detected.");
    else
      lines.push(
        "No findings from completed detectors; coverage warnings require review.",
      );
    return `${lines.join("\n")}\n`;
  }

  const actionable = report.findings.filter(
    (finding) => finding.grouping === "actionable",
  );
  const lowConfidence = report.findings.filter(
    (finding) => finding.grouping === "low-confidence",
  );
  const userReview = report.findings.filter(
    (finding) => finding.grouping === "user-review",
  );

  if (actionable.length > 0) {
    lines.push("Actionable findings");
    for (const finding of actionable) renderFinding(lines, finding);
    lines.push("");
  }

  if (userReview.length > 0) {
    lines.push("User-review findings");
    lines.push(
      "Deletion candidates and protected-surface uncertainty require review before removal.",
    );
    for (const finding of userReview) renderFinding(lines, finding);
    lines.push("");
  }

  if (lowConfidence.length > 0) {
    lines.push("Low-confidence / non-blocking findings");
    lines.push("Low-confidence findings are not blocking by default.");
    for (const finding of lowConfidence) renderFinding(lines, finding);
  }

  return `${lines.join("\n")}\n`;
}
