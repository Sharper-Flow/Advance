/**
 * adv CLI — arch-scan capability-consistency finding contract
 *
 * Zero-dependency runtime validators + typed shapes for the capability-
 * consistency detector. Mirrors the slop-scan schema convention: literal
 * unions exported as `as const` arrays → derived types; structured runtime
 * validators return {@link ValidationResult}.
 *
 * Validator revision #3: evidence is structured multi-location objects, not
 * prose. No `any` types — every field is typed, every union is a derived
 * literal type backed by a runtime-iterable const array.
 */

// --- Literal unions (const arrays → derived types) ---

export const CAPABILITY_EVIDENCE_ROLES = [
  "trigger",
  "counterpart",
  "exception",
  "searched_scope",
] as const;
export type CapabilityEvidenceRole = (typeof CAPABILITY_EVIDENCE_ROLES)[number];

export const CAPABILITY_SEVERITIES = ["blocker", "major", "minor", "nit"] as const;
export type CapabilitySeverity = (typeof CAPABILITY_SEVERITIES)[number];

export const CAPABILITY_CONFIDENCES = ["high", "medium", "low"] as const;
export type CapabilityConfidence = (typeof CAPABILITY_CONFIDENCES)[number];

export const CAPABILITY_DETECTION_METHODS = [
  "ast",
  "tool",
  "regex",
  "heuristic",
] as const;
export type CapabilityDetectionMethod =
  (typeof CAPABILITY_DETECTION_METHODS)[number];

// --- Interfaces ---

/**
 * A single piece of structured evidence attached to a capability finding.
 * The `role` discriminator ties the evidence to its function in the
 * relationship (trigger fired, acceptable counterpart matched, exception
 * signal observed, or searched-but-empty scope proving absence).
 */
export interface CapabilityEvidence {
  readonly role: CapabilityEvidenceRole;
  readonly file: string;
  readonly line: number | null;
  readonly column?: number;
  readonly matchedSignal?: string;
}

/**
 * Bounded absence proof — emitted when a finding relies on a counterpart
 * NOT being present. Records the searched roots, glob inclusions/exclusions,
 * and any parse failures so the claim is reproducible (P34 evidence-backed).
 */
export interface AbsenceProof {
  readonly searchedRoots: readonly string[];
  readonly includedGlobs: readonly string[];
  readonly excludedGlobs: readonly string[];
  readonly parseFailures: readonly string[];
}

/**
 * Structured capability-consistency finding. Emitted by the typed arch-scan
 * pipeline when a trigger fires and no acceptable counterpart is found.
 */
export interface CapabilityFinding {
  readonly id: string;
  readonly relationship_id: string;
  readonly category: "capability-consistency";
  readonly severity: CapabilitySeverity;
  readonly confidence: CapabilityConfidence;
  readonly detection_method: CapabilityDetectionMethod;
  readonly description: string;
  readonly evidence: readonly CapabilityEvidence[];
  readonly absence_proof?: AbsenceProof;
  readonly recommendation: string;
  readonly source?: string;
}

/**
 * Per-run coverage summary — which relationships applied, which were skipped
 * (e.g. no trigger files in scope), and which degraded (e.g. detector crash).
 */
export interface CapabilityCoverage {
  readonly appliedRelationships: readonly string[];
  readonly skippedRelationships: ReadonlyArray<{
    readonly id: string;
    readonly reason: string;
  }>;
  readonly degradedRelationships: ReadonlyArray<{
    readonly id: string;
    readonly reason: string;
  }>;
}

// --- Runtime validators (zero-dependency) ---

export interface ValidationResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly issues: readonly string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function pushIf(
  issues: string[],
  condition: boolean,
  message: string,
): void {
  if (condition) issues.push(message);
}

/**
 * Validate a {@link CapabilityEvidence} object. Returns a typed result with
 * the narrowed value on success or a list of path-qualified issues.
 */
export function validateCapabilityEvidence(
  value: unknown,
  path = "evidence",
): ValidationResult<CapabilityEvidence> {
  const issues: string[] = [];
  if (!isObject(value)) {
    return { ok: false, issues: [`${path} must be an object`] };
  }
  pushIf(
    issues,
    !isOneOf(value.role, CAPABILITY_EVIDENCE_ROLES),
    `${path}.role must be one of ${CAPABILITY_EVIDENCE_ROLES.join("|")}`,
  );
  pushIf(
    issues,
    typeof value.file !== "string" || value.file === "",
    `${path}.file must be a non-empty string`,
  );
  pushIf(
    issues,
    value.line !== null &&
      (typeof value.line !== "number" || !Number.isFinite(value.line)),
    `${path}.line must be a number or null`,
  );
  pushIf(
    issues,
    value.column !== undefined &&
      (typeof value.column !== "number" || !Number.isFinite(value.column)),
    `${path}.column must be a number when present`,
  );
  pushIf(
    issues,
    value.matchedSignal !== undefined && typeof value.matchedSignal !== "string",
    `${path}.matchedSignal must be a string when present`,
  );

  return issues.length === 0
    ? { ok: true, value: value as unknown as CapabilityEvidence, issues: [] }
    : { ok: false, issues };
}

/**
 * Validate a {@link CapabilityFinding} object, including its evidence array
 * and optional absence proof. Returns path-qualified issues for any malformed
 * nested field.
 */
export function validateCapabilityFinding(
  value: unknown,
): ValidationResult<CapabilityFinding> {
  const issues: string[] = [];
  if (!isObject(value)) {
    return { ok: false, issues: ["finding must be an object"] };
  }

  pushIf(
    issues,
    typeof value.id !== "string" || value.id === "",
    "finding.id must be a non-empty string",
  );
  pushIf(
    issues,
    typeof value.relationship_id !== "string" || value.relationship_id === "",
    "finding.relationship_id must be a non-empty string",
  );
  pushIf(
    issues,
    value.category !== "capability-consistency",
    'finding.category must be "capability-consistency"',
  );
  pushIf(
    issues,
    !isOneOf(value.severity, CAPABILITY_SEVERITIES),
    `finding.severity must be one of ${CAPABILITY_SEVERITIES.join("|")}`,
  );
  pushIf(
    issues,
    !isOneOf(value.confidence, CAPABILITY_CONFIDENCES),
    `finding.confidence must be one of ${CAPABILITY_CONFIDENCES.join("|")}`,
  );
  pushIf(
    issues,
    !isOneOf(value.detection_method, CAPABILITY_DETECTION_METHODS),
    `finding.detection_method must be one of ${CAPABILITY_DETECTION_METHODS.join("|")}`,
  );
  pushIf(
    issues,
    typeof value.description !== "string" || value.description === "",
    "finding.description must be a non-empty string",
  );

  if (!Array.isArray(value.evidence)) {
    issues.push("finding.evidence must be an array");
  } else {
    value.evidence.forEach((entry, index) => {
      const sub = validateCapabilityEvidence(entry, `evidence[${index}]`);
      if (!sub.ok) issues.push(...sub.issues);
    });
  }

  if (value.absence_proof !== undefined) {
    if (!isObject(value.absence_proof)) {
      issues.push("finding.absence_proof must be an object when present");
    } else {
      const ap = value.absence_proof;
      pushIf(
        issues,
        !isStringArray(ap.searchedRoots),
        "absence_proof.searchedRoots must be a string array",
      );
      pushIf(
        issues,
        !isStringArray(ap.includedGlobs),
        "absence_proof.includedGlobs must be a string array",
      );
      pushIf(
        issues,
        !isStringArray(ap.excludedGlobs),
        "absence_proof.excludedGlobs must be a string array",
      );
      pushIf(
        issues,
        !isStringArray(ap.parseFailures),
        "absence_proof.parseFailures must be a string array",
      );
    }
  }

  pushIf(
    issues,
    typeof value.recommendation !== "string" || value.recommendation === "",
    "finding.recommendation must be a non-empty string",
  );
  pushIf(
    issues,
    value.source !== undefined && typeof value.source !== "string",
    "finding.source must be a string when present",
  );

  return issues.length === 0
    ? { ok: true, value: value as unknown as CapabilityFinding, issues: [] }
    : { ok: false, issues };
}
