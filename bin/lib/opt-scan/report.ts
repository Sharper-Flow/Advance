/**
 * adv CLI — opt-scan report renderer
 *
 * Two formats:
 *   - `json`: pretty-printed JSON.stringify of the full {@link OptScanResult}.
 *   - `text`: human-readable summary with candidate count, coverage breakdown,
 *     and skipped/degraded reasons.
 *
 * Pure: no fs, no side effects.
 */

import type { OptScanResult } from "./scan";

export function renderReport(result: OptScanResult, format: "text" | "json"): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }
  return renderText(result);
}

function renderText(result: OptScanResult): string {
  const lines: string[] = [];
  lines.push("Optimization Scan");
  lines.push("=================");
  lines.push("");
  lines.push(`Candidates: ${result.candidates.length}`);
  lines.push(`Coverage: ${result.coverage.length} detector(s)`);
  lines.push("");

  const skipped = result.coverage.filter((c) => c.state === "skipped");
  const degraded = result.coverage.filter((c) => c.state === "degraded");
  const failed = result.coverage.filter((c) =>
    ["failed", "timed_out", "unavailable"].includes(c.state),
  );

  if (degraded.length > 0) {
    lines.push("Degraded:");
    for (const d of degraded) {
      lines.push(`  - ${d.id}: ${d.reason}`);
    }
    lines.push("");
  }

  if (failed.length > 0) {
    lines.push("Failed:");
    for (const f of failed) {
      lines.push(`  - ${f.id}: ${f.reason}`);
    }
    lines.push("");
  }

  if (skipped.length > 0) {
    lines.push("Skipped detectors:");
    for (const s of skipped) {
      lines.push(`  - ${s.id}: ${s.reason}`);
    }
    lines.push("");
  }

  if (result.candidates.length > 0) {
    lines.push("Candidates:");
    for (const candidate of result.candidates) {
      lines.push(
        `  - ${candidate.id} [${candidate.expected_cost_shape.family}]`,
      );
      for (const evidence of candidate.evidence) {
        const location =
          evidence.line === null
            ? evidence.file
            : `${evidence.file}:${evidence.line}`;
        lines.push(`    [${evidence.role}] ${location}`);
      }
      if (candidate.recommendation !== undefined) {
        lines.push(`    Recommendation: ${candidate.recommendation}`);
      }
      lines.push(`    Verification: ${candidate.verification_needed}`);
    }
    lines.push("");
  } else {
    lines.push("No candidates emitted.");
    lines.push("");
  }

  return lines.join("\n");
}
