/**
 * adv CLI — slop scan report contract
 *
 * Zero-dependency runtime validators for the deterministic slop-scan CLI.
 */

export const SLOP_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type SlopSeverity = (typeof SLOP_SEVERITIES)[number];

export const FINDING_CONFIDENCES = ["high", "medium", "low"] as const;
export type FindingConfidence = (typeof FINDING_CONFIDENCES)[number];

export const DETECTION_METHODS = [
  "ast",
  "regex",
  "heuristic",
  "degraded",
  "tool",
  "external",
] as const;
export type DetectionMethod = (typeof DETECTION_METHODS)[number];

export const FINDING_GROUPS = ["actionable", "low-confidence", "user-review"] as const;
export type FindingGroup = (typeof FINDING_GROUPS)[number];

export const ACTIONABILITY = [
  "blocking",
  "actionable",
  "review_required",
  "non_blocking",
] as const;
export type FindingActionability = (typeof ACTIONABILITY)[number];

export const COVERAGE_STATES = [
  "run",
  "skipped",
  "degraded",
  "failed",
  "timed_out",
  "unavailable",
  "externally_covered",
] as const;
export type DetectorCoverageState = (typeof COVERAGE_STATES)[number];

export interface SlopScanFinding {
  id: string;
  name: string;
  severity: SlopSeverity;
  category: string;
  file: string;
  line: number | null;
  description: string;
  fix: string;
  confidence: FindingConfidence;
  detectionMethod: DetectionMethod;
  grouping: FindingGroup;
  actionability: FindingActionability;
  phase: 1 | 2;
  nestingDepth: number | null;
  complexity: number | null;
}

export interface DetectorCoverage {
  id: string;
  label: string;
  state: DetectorCoverageState;
  reason: string;
  important: boolean;
  command?: string;
}

export interface SlopScanSummary {
  total: number;
  bySeverity: Record<SlopSeverity, number>;
  byCategory: Record<string, number>;
}

export interface SlopScanReport {
  schema_version: "slop_scan_report.v1";
  generated_at: string;
  scope: {
    repoRoot: string;
    requestedPath: string;
    languages: string[];
  };
  summary: SlopScanSummary;
  findings: SlopScanFinding[];
  coverage: {
    detectors: DetectorCoverage[];
    falsePositiveProtections: string[];
  };
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: string[];
}

export function summarizeFindings(findings: SlopScanFinding[]): SlopScanSummary {
  const bySeverity: Record<SlopSeverity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  const byCategory: Record<string, number> = {};

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
  }

  return { total: findings.length, bySeverity, byCategory };
}

export function buildEmptySlopScanReport(scope: {
  repoRoot: string;
  requestedPath: string;
  languages: string[];
}): SlopScanReport {
  return {
    schema_version: "slop_scan_report.v1",
    generated_at: new Date().toISOString(),
    scope,
    summary: summarizeFindings([]),
    findings: [],
    coverage: {
      detectors: [],
      falsePositiveProtections: [],
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function requireString(obj: Record<string, unknown>, key: string, path: string, issues: string[]): void {
  if (typeof obj[key] !== "string" || obj[key] === "") issues.push(`${path}.${key} must be a non-empty string`);
}

function requireNullableNumber(obj: Record<string, unknown>, key: string, path: string, issues: string[]): void {
  const value = obj[key];
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
    issues.push(`${path}.${key} must be a number or null`);
  }
}

function validateFinding(value: unknown, index: number, issues: string[]): void {
  const path = `findings[${index}]`;
  if (!isObject(value)) {
    issues.push(`${path} must be an object`);
    return;
  }

  for (const key of ["id", "name", "category", "file", "description", "fix"] as const) {
    requireString(value, key, path, issues);
  }
  if (!isOneOf(value.severity, SLOP_SEVERITIES)) issues.push(`${path}.severity is invalid`);
  if (!isOneOf(value.confidence, FINDING_CONFIDENCES)) issues.push(`${path}.confidence is invalid`);
  if (!isOneOf(value.detectionMethod, DETECTION_METHODS)) issues.push(`${path}.detectionMethod is invalid`);
  if (!isOneOf(value.grouping, FINDING_GROUPS)) issues.push(`${path}.grouping is invalid`);
  if (!isOneOf(value.actionability, ACTIONABILITY)) issues.push(`${path}.actionability is invalid`);
  if (value.phase !== 1 && value.phase !== 2) issues.push(`${path}.phase must be 1 or 2`);
  if (value.line !== null && (typeof value.line !== "number" || !Number.isFinite(value.line))) {
    issues.push(`${path}.line must be a number or null`);
  }
  requireNullableNumber(value, "nestingDepth", path, issues);
  requireNullableNumber(value, "complexity", path, issues);
}

function validateCoverage(value: unknown, index: number, issues: string[]): void {
  const path = `coverage.detectors[${index}]`;
  if (!isObject(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  for (const key of ["id", "label", "reason"] as const) requireString(value, key, path, issues);
  if (!isOneOf(value.state, COVERAGE_STATES)) issues.push(`${path}.state is invalid`);
  if (typeof value.important !== "boolean") issues.push(`${path}.important must be boolean`);
}

export function validateSlopScanReport(value: unknown): ValidationResult<SlopScanReport> {
  const issues: string[] = [];
  if (!isObject(value)) return { ok: false, issues: ["report must be an object"] };

  if (value.schema_version !== "slop_scan_report.v1") issues.push("schema_version must be slop_scan_report.v1");
  if (typeof value.generated_at !== "string") issues.push("generated_at must be a string");

  if (!isObject(value.scope)) {
    issues.push("scope must be an object");
  } else {
    requireString(value.scope, "repoRoot", "scope", issues);
    requireString(value.scope, "requestedPath", "scope", issues);
    if (!Array.isArray(value.scope.languages) || !value.scope.languages.every((item) => typeof item === "string")) {
      issues.push("scope.languages must be an array of strings");
    }
  }

  if (!Array.isArray(value.findings)) {
    issues.push("findings must be an array");
  } else {
    value.findings.forEach((finding, index) => validateFinding(finding, index, issues));
  }

  if (!isObject(value.coverage)) {
    issues.push("coverage must be an object");
  } else {
    if (!Array.isArray(value.coverage.detectors)) {
      issues.push("coverage.detectors must be an array");
    } else {
      value.coverage.detectors.forEach((detector, index) => validateCoverage(detector, index, issues));
    }
    if (!Array.isArray(value.coverage.falsePositiveProtections)) {
      issues.push("coverage.falsePositiveProtections must be an array");
    }
  }

  if (!isObject(value.summary)) {
    issues.push("summary must be an object");
  }

  return issues.length === 0
    ? { ok: true, value: value as SlopScanReport, issues: [] }
    : { ok: false, issues };
}
