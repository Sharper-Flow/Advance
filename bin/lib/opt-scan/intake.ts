/**
 * adv CLI — opt-scan optimizer candidate intake
 *
 * Validates an externally-supplied optimization candidate JSON and renders a
 * read-only recommendation plus verification route. The intake consumer is
 * deliberately conservative:
 *
 *   - It preserves every piece of supplied evidence in the rendered report.
 *   - It rejects cache-opportunity candidates that lack ownership or
 *     invalidation evidence.
 *   - It rejects any static candidate that tries to carry measured evidence or
 *     assert a runtime gain.
 *   - It performs no source edits, creates no caches, and mutates no ADV or
 *     task/gate state.
 *
 * This module has zero runtime dependencies other than the opt-scan schema
 * validator and Bun built-ins.
 */

import {
  validateOptimizationCandidate,
  type OptimizationCandidate,
  type OptimizationEvidence,
} from "./schema";

export const INTAKE_SCHEMA_VERSION = "opt_scan_intake.v1";

export interface IntakeResult {
  readonly schema_version: typeof INTAKE_SCHEMA_VERSION;
  readonly candidate_id?: string;
  readonly detector_id?: string;
  readonly status: "accepted" | "rejected";
  readonly rejection_reasons: readonly string[];
  readonly recommendation?: string;
  readonly verification_route?: string;
  readonly evidence: readonly OptimizationEvidence[];
  readonly safety_note: string;
}

const SAFETY_NOTE =
  "This intake is read-only. It does not edit source files, create caches, " +
  "or mutate ADV/task/gate state.";

// Mirror of the schema's static-measured-claim guard. Kept here so the
// intake consumer has its own explicit policy even if the schema validator
// is relaxed in a future revision.
const STATIC_MEASURED_CLAIM_RE =
  /\b(speedup|speed-up|latency reduction|runtime impact|performance (gain|improvement|boost)|\d+%\s*(faster|speedup|improvement)|\d+x\s*(faster|slower))\b/i;

function applyIntakeRules(candidate: OptimizationCandidate): string[] {
  const reasons: string[] = [];

  if (candidate.signal_class === "static") {
    if (candidate.measured !== undefined) {
      reasons.push("static candidate cannot include measured evidence");
    }

    const proseFields: readonly [string, string | undefined][] = [
      ["description", candidate.description],
      ["recommendation", candidate.recommendation],
      ["false_positive_caveat", candidate.false_positive_caveat],
      ["verification_needed", candidate.verification_needed],
    ];

    for (const [field, text] of proseFields) {
      if (typeof text === "string" && STATIC_MEASURED_CLAIM_RE.test(text)) {
        reasons.push(
          `static candidate cannot assert measured runtime impact in ${field}`,
        );
      }
    }
  }

  const evidenceRoles = new Set(
    candidate.evidence.map((entry) => entry.role),
  );
  if (!evidenceRoles.has("trigger")) {
    reasons.push("candidate evidence must include a trigger role");
  }

  if (candidate.expected_cost_shape.family === "cache_opportunity") {
    if (!evidenceRoles.has("ownership")) {
      reasons.push(
        "cache opportunity rejected: missing ownership evidence",
      );
    }
    if (!evidenceRoles.has("invalidation")) {
      reasons.push(
        "cache opportunity rejected: missing invalidation evidence",
      );
    }
  }

  return reasons;
}

function buildIntakeResult(
  candidate: OptimizationCandidate,
  status: "accepted" | "rejected",
  reasons: readonly string[],
): IntakeResult {
  return {
    schema_version: INTAKE_SCHEMA_VERSION,
    candidate_id: candidate.id,
    detector_id: candidate.detector_id,
    status,
    rejection_reasons: reasons,
    recommendation:
      status === "accepted"
        ? (candidate.recommendation ??
          "Review preserved evidence and verify before optimizing.")
        : undefined,
    verification_route:
      status === "accepted" ? candidate.verification_needed : undefined,
    evidence: candidate.evidence,
    safety_note: SAFETY_NOTE,
  };
}

/**
 * Validate an optimization candidate and apply optimizer intake policy.
 *
 * Returns an {@link IntakeResult} that preserves the candidate identity,
 * evidence roles, and either a recommendation+verification route or a list
 * of rejection reasons. Never throws.
 */
export function processCandidateIntake(candidate: unknown): IntakeResult {
  const validation = validateOptimizationCandidate(candidate);
  if (!validation.ok) {
    return {
      schema_version: INTAKE_SCHEMA_VERSION,
      status: "rejected",
      rejection_reasons: validation.issues,
      evidence: [],
      safety_note: SAFETY_NOTE,
    };
  }

  const reasons = applyIntakeRules(validation.value);
  if (reasons.length > 0) {
    return buildIntakeResult(validation.value, "rejected", reasons);
  }

  return buildIntakeResult(validation.value, "accepted", []);
}

function renderText(result: IntakeResult): string {
  const lines: string[] = [];
  lines.push("Optimizer Intake");
  lines.push("================");
  lines.push("");

  if (result.candidate_id !== undefined) {
    lines.push(`Candidate: ${result.candidate_id}`);
  }
  if (result.detector_id !== undefined) {
    lines.push(`Detector:  ${result.detector_id}`);
  }
  lines.push(`Status:    ${result.status}`);
  lines.push("");

  if (result.evidence.length > 0) {
    lines.push("Evidence:");
    for (const entry of result.evidence) {
      const location =
        entry.line !== null && entry.line !== undefined
          ? `${entry.file}:${entry.line}`
          : entry.file;
      const signal = entry.matchedSignal ? ` — ${entry.matchedSignal}` : "";
      lines.push(`  [${entry.role}] ${location}${signal}`);
    }
    lines.push("");
  }

  if (result.status === "accepted") {
    if (result.recommendation !== undefined) {
      lines.push(`Recommendation: ${result.recommendation}`);
    }
    if (result.verification_route !== undefined) {
      lines.push(`Verification:   ${result.verification_route}`);
    }
    lines.push("");
  }

  if (result.rejection_reasons.length > 0) {
    lines.push("Rejection reasons:");
    for (const reason of result.rejection_reasons) {
      lines.push(`  - ${reason}`);
    }
    lines.push("");
  }

  lines.push(`Safety: ${result.safety_note}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Render an intake result as JSON or minimal text.
 *
 * Pure: no side effects.
 */
export function renderIntakeReport(
  result: IntakeResult,
  format: "text" | "json",
): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }
  return renderText(result);
}
