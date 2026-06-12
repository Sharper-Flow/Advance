/** adv CLI — slop scan text renderer */

import type { DetectorCoverage, SlopScanReport } from "./schema";

const WARNING_STATES = new Set(["degraded", "failed", "timed_out", "unavailable"]);

function importantWarnings(detectors: DetectorCoverage[]): DetectorCoverage[] {
  return detectors.filter((detector) => detector.important && WARNING_STATES.has(detector.state));
}

export function renderSlopScanReport(report: SlopScanReport, _useColor: boolean): string {
  const lines: string[] = [];
  const warnings = importantWarnings(report.coverage.detectors);

  lines.push("SLOP SCAN REPORT");
  lines.push(`Scope: ${report.scope.requestedPath}`);
  lines.push(`Languages: ${report.scope.languages.length > 0 ? report.scope.languages.join(", ") : "unknown"}`);
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
    else lines.push("No findings from completed detectors; coverage warnings require review.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("Findings");
  for (const finding of report.findings) {
    const location = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
    lines.push(`- [${finding.severity}] ${finding.id} ${finding.name} (${location})`);
    lines.push(`  ${finding.description}`);
    lines.push(`  Fix: ${finding.fix}`);
    lines.push(`  Evidence: ${finding.detectionMethod}, confidence ${finding.confidence}`);
  }

  return `${lines.join("\n")}\n`;
}
