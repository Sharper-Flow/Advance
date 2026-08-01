/**
 * adv CLI — opt-scan optimization-candidate contract
 *
 * Zero-dependency runtime validators + typed shapes for the optimization
 * detector. Mirrors the arch-scan/slop-scan local scanner convention:
 * literal unions exported as `as const` arrays → derived types; structured
 * runtime validators return {@link ValidationResult}.
 *
 * Structural revision #1: candidates are always evidence-backed. A candidate
 * is either `static` (advisory, deterministic source evidence only) or
 * `measured` (benchmark/profile provenance attached). Cross-field validation
 * guards static candidates from carrying measured evidence or asserting
 * measured runtime impact.
 */

// --- Literal unions (const arrays → derived types) ---

export const OPTIMIZATION_SIGNAL_CLASSES = ["static", "measured"] as const;
export type OptimizationSignalClass = (typeof OPTIMIZATION_SIGNAL_CLASSES)[number];

export const OPTIMIZATION_CANDIDATE_FAMILIES = [
  "repeated_boundary_work",
  "avoidable_collection_work",
  "worker_startup_pressure",
  "cache_opportunity",
] as const;
export type OptimizationCandidateFamily =
  (typeof OPTIMIZATION_CANDIDATE_FAMILIES)[number];

export const OPTIMIZATION_SEVERITIES = ["blocker", "major", "minor", "nit"] as const;
export type OptimizationSeverity = (typeof OPTIMIZATION_SEVERITIES)[number];

export const OPTIMIZATION_CONFIDENCES = ["high", "medium", "low"] as const;
export type OptimizationConfidence = (typeof OPTIMIZATION_CONFIDENCES)[number];

export const OPTIMIZATION_DETECTION_METHODS = [
  "ast",
  "regex",
  "heuristic",
  "profile",
  "benchmark",
] as const;
export type OptimizationDetectionMethod =
  (typeof OPTIMIZATION_DETECTION_METHODS)[number];

export const OPTIMIZATION_EVIDENCE_ROLES = [
  "trigger",
  "scope",
  "measurement",
  "rejected_scope",
  "invalidation",
  "ownership",
] as const;
export type OptimizationEvidenceRole =
  (typeof OPTIMIZATION_EVIDENCE_ROLES)[number];

export const COST_SHAPE_PATTERNS = [
  "cpu",
  "memory",
  "io",
  "latency",
  "boundary",
  "collection",
  "startup",
  "cache_miss",
] as const;
export type CostShapePattern = (typeof COST_SHAPE_PATTERNS)[number];

export const OPTIMIZATION_COVERAGE_STATES = [
  "run",
  "skipped",
  "degraded",
  "failed",
  "timed_out",
  "unavailable",
  "externally_covered",
] as const;
export type OptimizationCoverageState =
  (typeof OPTIMIZATION_COVERAGE_STATES)[number];

// --- Interfaces ---

/**
 * A single piece of structured evidence attached to an optimization
 * candidate. Roles extend the arch-scan convention with optimization-
 * specific concepts: the trigger signal, searched scope, actual
 * measurement, rejected scope explaining why a candidate was dropped,
 * and cache-specific invalidation/ownership evidence.
 */
export interface OptimizationEvidence {
  readonly role: OptimizationEvidenceRole;
  readonly file: string;
  readonly line: number | null;
  readonly column?: number;
  readonly matchedSignal?: string;
  readonly snippet?: string;
}

/**
 * Expected cost shape for the candidate. The `family` maps to the agreed
 * V1 candidate class; the `pattern` names the resource pressure (cpu,
 * memory, io, latency, boundary calls, allocations, startup overhead, or
 * cache misses). The description carries the human-readable shape.
 */
export interface ExpectedCostShape {
  readonly family: OptimizationCandidateFamily;
  readonly pattern: CostShapePattern;
  readonly description: string;
}

/**
 * Measurement evidence required for `signal_class: "measured"` candidates.
 * `baseline` and `observed` are numeric values in `unit`. Optional `fixture`
 * and `input` make the measurement reproducible.
 */
export interface MeasuredEvidence {
  readonly provenance: "profile" | "benchmark" | "telemetry";
  readonly baseline: number;
  readonly observed: number;
  readonly unit: string;
  readonly fixture?: string;
  readonly input?: string;
}

/**
 * Structured optimization candidate. Emitted by the typed opt-scan pipeline
 * when a deterministic detector fires and the candidate survives structural
 * validation.
 */
export interface OptimizationCandidate {
  readonly id: string;
  readonly detector_id: string;
  readonly category: "optimization-candidate";
  readonly signal_class: OptimizationSignalClass;
  readonly severity: OptimizationSeverity;
  readonly confidence: OptimizationConfidence;
  readonly detection_method: OptimizationDetectionMethod;
  readonly description: string;
  readonly evidence: readonly OptimizationEvidence[];
  readonly expected_cost_shape: ExpectedCostShape;
  readonly false_positive_caveat: string;
  readonly verification_needed: string;
  readonly measured?: MeasuredEvidence;
  readonly recommendation?: string;
  readonly source?: string;
}

/**
 * Per-detector coverage entry. Mirrors the slop-scan detector coverage shape
 * so the CLI can report run, skipped, degraded, failed, timed_out,
 * unavailable, and externally_covered states.
 */
export interface OptimizationCoverage {
  readonly id: string;
  readonly label: string;
  readonly state: OptimizationCoverageState;
  readonly reason: string;
  readonly important: boolean;
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
 * Validate a {@link OptimizationEvidence} object.
 */
export function validateOptimizationEvidence(
  value: unknown,
  path = "evidence",
): ValidationResult<OptimizationEvidence> {
  const issues: string[] = [];
  if (!isObject(value)) {
    return { ok: false, issues: [`${path} must be an object`] };
  }
  pushIf(
    issues,
    !isOneOf(value.role, OPTIMIZATION_EVIDENCE_ROLES),
    `${path}.role must be one of ${OPTIMIZATION_EVIDENCE_ROLES.join("|")}`,
  );
  pushIf(
    issues,
    typeof value.file !== "string" || value.file === "",
    `${path}.file must be a non-empty string`,
  );
  pushIf(
    issues,
    value.line !== null &&
      (typeof value.line !== "number" ||
        !Number.isInteger(value.line) ||
        value.line <= 0),
    `${path}.line must be a positive integer or null`,
  );
  pushIf(
    issues,
    value.column !== undefined &&
      (typeof value.column !== "number" ||
        !Number.isInteger(value.column) ||
        value.column <= 0),
    `${path}.column must be a positive integer when present`,
  );
  pushIf(
    issues,
    value.matchedSignal !== undefined && typeof value.matchedSignal !== "string",
    `${path}.matchedSignal must be a string when present`,
  );
  pushIf(
    issues,
    value.snippet !== undefined && typeof value.snippet !== "string",
    `${path}.snippet must be a string when present`,
  );

  return issues.length === 0
    ? { ok: true, value: value as unknown as OptimizationEvidence, issues: [] }
    : { ok: false, issues };
}

/**
 * Validate a {@link ExpectedCostShape} object.
 */
export function validateExpectedCostShape(
  value: unknown,
  path = "expected_cost_shape",
): ValidationResult<ExpectedCostShape> {
  const issues: string[] = [];
  if (!isObject(value)) {
    return { ok: false, issues: [`${path} must be an object`] };
  }
  pushIf(
    issues,
    !isOneOf(value.family, OPTIMIZATION_CANDIDATE_FAMILIES),
    `${path}.family must be one of ${OPTIMIZATION_CANDIDATE_FAMILIES.join("|")}`,
  );
  pushIf(
    issues,
    !isOneOf(value.pattern, COST_SHAPE_PATTERNS),
    `${path}.pattern must be one of ${COST_SHAPE_PATTERNS.join("|")}`,
  );
  pushIf(
    issues,
    typeof value.description !== "string" || value.description === "",
    `${path}.description must be a non-empty string`,
  );

  return issues.length === 0
    ? { ok: true, value: value as unknown as ExpectedCostShape, issues: [] }
    : { ok: false, issues };
}

/**
 * Validate a {@link MeasuredEvidence} object.
 */
export function validateMeasuredEvidence(
  value: unknown,
  path = "measured",
): ValidationResult<MeasuredEvidence> {
  const issues: string[] = [];
  if (!isObject(value)) {
    return { ok: false, issues: [`${path} must be an object`] };
  }
  pushIf(
    issues,
    !isOneOf(value.provenance, ["profile", "benchmark", "telemetry"]),
    `${path}.provenance must be one of profile|benchmark|telemetry`,
  );
  pushIf(
    issues,
    typeof value.baseline !== "number" || !Number.isFinite(value.baseline),
    `${path}.baseline must be a finite number`,
  );
  pushIf(
    issues,
    typeof value.observed !== "number" || !Number.isFinite(value.observed),
    `${path}.observed must be a finite number`,
  );
  pushIf(
    issues,
    typeof value.unit !== "string" || value.unit === "",
    `${path}.unit must be a non-empty string`,
  );
  pushIf(
    issues,
    value.fixture !== undefined && typeof value.fixture !== "string",
    `${path}.fixture must be a string when present`,
  );
  pushIf(
    issues,
    value.input !== undefined && typeof value.input !== "string",
    `${path}.input must be a string when present`,
  );

  return issues.length === 0
    ? { ok: true, value: value as unknown as MeasuredEvidence, issues: [] }
    : { ok: false, issues };
}

// Heuristic guard: prose fields on a static candidate must not assert
// speedup, latency reduction, or runtime impact. This is an advisory screen,
// not a substitute for the structural measured-field guard.
const STATIC_MEASURED_CLAIM_RE =
  /\b(speedup|speed-up|latency reduction|runtime impact|performance (gain|improvement|boost)|\d+%\s*(faster|speedup|improvement)|\d+x\s*(faster|slower))\b/i;

function guardStaticMeasuredClaims(
  value: Record<string, unknown>,
  issues: string[],
): void {
  const signalClass = value.signal_class;
  const measured = value.measured;

  if (signalClass === "static") {
    if (measured !== undefined) {
      issues.push("static candidate cannot include measured evidence");
    }

    const proseFields = [
      ["description", value.description],
      ["recommendation", value.recommendation],
      ["false_positive_caveat", value.false_positive_caveat],
      ["verification_needed", value.verification_needed],
    ] as const;
    for (const [field, text] of proseFields) {
      if (typeof text === "string" && STATIC_MEASURED_CLAIM_RE.test(text)) {
        issues.push(
          `static candidate cannot assert measured runtime impact in ${field}`,
        );
      }
    }
  } else if (signalClass === "measured") {
    if (measured === undefined) {
      issues.push("measured candidate must include measured evidence");
    }
  }
}

/**
 * Validate an {@link OptimizationCandidate} object, including its evidence,
 * expected cost shape, optional measured evidence, and the static/measured
 * cross-field guard.
 */
export function validateOptimizationCandidate(
  value: unknown,
): ValidationResult<OptimizationCandidate> {
  const issues: string[] = [];
  if (!isObject(value)) {
    return { ok: false, issues: ["candidate must be an object"] };
  }

  pushIf(
    issues,
    typeof value.id !== "string" || value.id === "",
    "candidate.id must be a non-empty string",
  );
  pushIf(
    issues,
    typeof value.detector_id !== "string" || value.detector_id === "",
    "candidate.detector_id must be a non-empty string",
  );
  pushIf(
    issues,
    value.category !== "optimization-candidate",
    'candidate.category must be "optimization-candidate"',
  );
  pushIf(
    issues,
    !isOneOf(value.signal_class, OPTIMIZATION_SIGNAL_CLASSES),
    `candidate.signal_class must be one of ${OPTIMIZATION_SIGNAL_CLASSES.join("|")}`,
  );
  pushIf(
    issues,
    !isOneOf(value.severity, OPTIMIZATION_SEVERITIES),
    `candidate.severity must be one of ${OPTIMIZATION_SEVERITIES.join("|")}`,
  );
  pushIf(
    issues,
    !isOneOf(value.confidence, OPTIMIZATION_CONFIDENCES),
    `candidate.confidence must be one of ${OPTIMIZATION_CONFIDENCES.join("|")}`,
  );
  pushIf(
    issues,
    !isOneOf(value.detection_method, OPTIMIZATION_DETECTION_METHODS),
    `candidate.detection_method must be one of ${OPTIMIZATION_DETECTION_METHODS.join("|")}`,
  );
  pushIf(
    issues,
    typeof value.description !== "string" || value.description === "",
    "candidate.description must be a non-empty string",
  );
  pushIf(
    issues,
    typeof value.false_positive_caveat !== "string" ||
      value.false_positive_caveat === "",
    "candidate.false_positive_caveat must be a non-empty string",
  );
  pushIf(
    issues,
    typeof value.verification_needed !== "string" ||
      value.verification_needed === "",
    "candidate.verification_needed must be a non-empty string",
  );

  const shapeResult = validateExpectedCostShape(value.expected_cost_shape);
  if (!shapeResult.ok) issues.push(...shapeResult.issues);

  if (!Array.isArray(value.evidence)) {
    issues.push("candidate.evidence must be an array");
  } else {
    if (value.evidence.length === 0) {
      issues.push("candidate.evidence must contain at least one source record");
    }
    value.evidence.forEach((entry, index) => {
      const sub = validateOptimizationEvidence(entry, `evidence[${index}]`);
      if (!sub.ok) issues.push(...sub.issues);
    });
  }

  if (value.measured !== undefined) {
    const measuredResult = validateMeasuredEvidence(value.measured);
    if (!measuredResult.ok) issues.push(...measuredResult.issues);
  }

  pushIf(
    issues,
    value.recommendation !== undefined && typeof value.recommendation !== "string",
    "candidate.recommendation must be a string when present",
  );
  pushIf(
    issues,
    value.source !== undefined && typeof value.source !== "string",
    "candidate.source must be a string when present",
  );

  // Cross-field static/measured claim guard.
  guardStaticMeasuredClaims(value, issues);

  return issues.length === 0
    ? { ok: true, value: value as unknown as OptimizationCandidate, issues: [] }
    : { ok: false, issues };
}

/**
 * Validate an {@link OptimizationCoverage} object.
 */
export function validateOptimizationCoverage(
  value: unknown,
): ValidationResult<OptimizationCoverage> {
  const issues: string[] = [];
  if (!isObject(value)) {
    return { ok: false, issues: ["coverage must be an object"] };
  }
  pushIf(
    issues,
    typeof value.id !== "string" || value.id === "",
    "coverage.id must be a non-empty string",
  );
  pushIf(
    issues,
    typeof value.label !== "string" || value.label === "",
    "coverage.label must be a non-empty string",
  );
  pushIf(
    issues,
    !isOneOf(value.state, OPTIMIZATION_COVERAGE_STATES),
    `coverage.state must be one of ${OPTIMIZATION_COVERAGE_STATES.join("|")}`,
  );
  pushIf(
    issues,
    typeof value.reason !== "string" || value.reason === "",
    "coverage.reason must be a non-empty string",
  );
  pushIf(
    issues,
    typeof value.important !== "boolean",
    "coverage.important must be a boolean",
  );

  return issues.length === 0
    ? { ok: true, value: value as unknown as OptimizationCoverage, issues: [] }
    : { ok: false, issues };
}
