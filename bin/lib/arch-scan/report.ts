/**
 * adv CLI — arch-scan capability-consistency report renderer
 *
 * Two formats:
 *   - `text`: human-readable summary with counts, coverage breakdown, and
 *     top-N findings with `file:line` trigger locations.
 *   - `json`: pretty-printed JSON.stringify of the full {@link ScanResult}.
 *
 * Pure: no fs, no side effects.
 */

import type { ScanResult } from "./scan";
import type { CapabilityEvidence, CapabilityFinding } from "./schema";

/** Maximum number of findings rendered in `text` format. */
const TEXT_FINDING_LIMIT = 20;

export function renderReport(
  result: ScanResult,
  format: "text" | "json",
): string {
  if (format === "json") {
    return JSON.stringify(serializeScanResult(result), null, 2);
  }
  return renderText(result);
}

/**
 * JSON.stringify cannot serialize RegExp directly; findings store plain
 * strings/numbers, so the result is already JSON-safe. Re-validate by
 * cloning through a shallow walk that omits any unexpected RegExp values.
 */
function serializeScanResult(result: ScanResult): unknown {
  return {
    findings: result.findings.map(serializeFinding),
    coverage: result.coverage,
  };
}

function serializeFinding(finding: CapabilityFinding): unknown {
  return {
    id: finding.id,
    relationship_id: finding.relationship_id,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    detection_method: finding.detection_method,
    description: finding.description,
    evidence: finding.evidence.map(serializeEvidence),
    absence_proof: finding.absence_proof,
    recommendation: finding.recommendation,
    source: finding.source,
  };
}

function serializeEvidence(evidence: CapabilityEvidence): unknown {
  return {
    role: evidence.role,
    file: evidence.file,
    line: evidence.line,
    column: evidence.column,
    matchedSignal: evidence.matchedSignal,
  };
}

function renderText(result: ScanResult): string {
  const lines: string[] = [];
  lines.push("Capability-Consistency Scan");
  lines.push("==========================");
  lines.push("");

  const coverage = result.coverage;
  lines.push(`Findings: ${result.findings.length}`);
  lines.push(
    `Coverage: ${coverage.appliedRelationships.length} applied · ${coverage.skippedRelationships.length} skipped · ${coverage.degradedRelationships.length} degraded`,
  );
  lines.push("");

  if (result.findings.length === 0) {
    lines.push("No findings.");
    lines.push("");
    if (coverage.skippedRelationships.length > 0) {
      lines.push("Skipped relationships:");
      for (const s of coverage.skippedRelationships) {
        lines.push(`  - ${s.id}: ${s.reason}`);
      }
      lines.push("");
    }
    if (coverage.degradedRelationships.length > 0) {
      lines.push("Degraded relationships:");
      for (const d of coverage.degradedRelationships) {
        lines.push(`  - ${d.id}: ${d.reason}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  // Group findings by relationship for a stable, reviewable summary.
  const byRelationship = new Map<string, CapabilityFinding[]>();
  for (const f of result.findings) {
    const bucket = byRelationship.get(f.relationship_id) ?? [];
    bucket.push(f);
    byRelationship.set(f.relationship_id, bucket);
  }

  lines.push(`Findings (top ${Math.min(TEXT_FINDING_LIMIT, result.findings.length)} of ${result.findings.length}):`);
  let shown = 0;
  outer: for (const [relId, bucket] of byRelationship) {
    for (const f of bucket) {
      if (shown >= TEXT_FINDING_LIMIT) break outer;
      const trigger = f.evidence.find((e) => e.role === "trigger");
      const loc = trigger
        ? `${trigger.file}:${trigger.line ?? "?"}`
        : "(no trigger location)";
      lines.push(`  [${f.severity}] ${relId} — ${loc}`);
      lines.push(`    ${f.description}`);
      shown++;
    }
  }
  if (result.findings.length > TEXT_FINDING_LIMIT) {
    lines.push(`  ... and ${result.findings.length - TEXT_FINDING_LIMIT} more`);
  }
  lines.push("");

  return lines.join("\n");
}
