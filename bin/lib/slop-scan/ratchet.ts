/** Set-based dead-code ratchet built on the canonical slop-scan report. */

import { toRepoRelative } from "./adapters/_paths";
import { runSlopScan, type SlopScanOptions } from "./scan";
import {
  requiredCoverageFailures,
  validateSlopScanReport,
  type SlopScanFinding,
  type SlopScanReport,
} from "./schema";

const DEFAULT_MAX_DIAGNOSTICS = 20;
const MAX_DIAGNOSTICS_LIMIT = 100;

export interface DeadCodeBaseline {
  fingerprints: readonly string[];
}

export type DeadCodeBaselineInput = DeadCodeBaseline | readonly string[];

export type DeadCodeRatchetStatus = "pass" | "fail" | "blocked";

export interface DeadCodeRatchetOptions extends SlopScanOptions {
  baseline: DeadCodeBaselineInput;
  maxDiagnostics?: number;
  /** Test seam; production callers use runSlopScan by default. */
  scan?: (options: SlopScanOptions) => Promise<unknown>;
}

export interface DeadCodeRatchetResult {
  ok: boolean;
  status: DeadCodeRatchetStatus;
  report?: SlopScanReport;
  currentFingerprints: string[];
  newFindings: SlopScanFinding[];
  diagnostics: string[];
  diagnosticsTruncated: number;
}

/** The ratchet deliberately shares the adapter's canonical dead-code predicate. */
export function isDeadCodeFinding(
  finding: SlopScanFinding,
): boolean {
  return finding.id === "MAINT-003" && finding.category === "Dead Code";
}

/**
 * Build a line-independent, repo-portable identity for a dead-code finding.
 * JSON gives each field an unambiguous boundary and keeps the baseline reviewable.
 */
export function deadCodeFingerprint(
  finding: Pick<SlopScanFinding, "id" | "name" | "file" | "description">,
  repoRoot: string,
): string {
  return JSON.stringify({
    id: finding.id,
    name: finding.name,
    file: toRepoRelative(finding.file, repoRoot),
    description: finding.description,
  });
}

function diagnosticLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_DIAGNOSTICS;
  return Math.max(0, Math.min(MAX_DIAGNOSTICS_LIMIT, Math.floor(value)));
}

function boundedDiagnostics(
  diagnostics: string[],
  limit: number,
): Pick<DeadCodeRatchetResult, "diagnostics" | "diagnosticsTruncated"> {
  return {
    diagnostics: diagnostics.slice(0, limit),
    diagnosticsTruncated: Math.max(0, diagnostics.length - limit),
  };
}

function blockedResult(
  diagnostics: string[],
  limit: number,
  report?: SlopScanReport,
): DeadCodeRatchetResult {
  return {
    ok: false,
    status: "blocked",
    report,
    currentFingerprints: [],
    newFindings: [],
    ...boundedDiagnostics(diagnostics, limit),
  };
}

function baselineFingerprints(value: unknown): string[] | string {
  const fingerprints = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object" && "fingerprints" in value
      ? (value as { fingerprints?: unknown }).fingerprints
      : undefined;

  if (!Array.isArray(fingerprints)) {
    return "baseline.fingerprints must be an array of non-empty strings";
  }
  if (
    !fingerprints.every(
      (fingerprint) => typeof fingerprint === "string" && fingerprint.length > 0,
    )
  ) {
    return "baseline.fingerprints must be an array of non-empty strings";
  }
  return [...new Set(fingerprints)];
}

function findingDiagnostic(finding: SlopScanFinding, repoRoot: string): string {
  return `${finding.id} ${finding.name} ${toRepoRelative(finding.file, repoRoot)}: ${finding.description}`;
}

/**
 * Run the canonical scan and compare its shared dead-code set with a reviewed
 * baseline. Any invalid or degraded scan is blocked rather than treated as an
 * empty set; this prevents detector outages from looking like a clean ratchet.
 */
export async function runDeadCodeRatchet(
  options: DeadCodeRatchetOptions,
): Promise<DeadCodeRatchetResult> {
  const limit = diagnosticLimit(options.maxDiagnostics);
  const baseline = baselineFingerprints(options.baseline);
  if (typeof baseline === "string") return blockedResult([baseline], limit);

  const { baseline: _baseline, maxDiagnostics: _maxDiagnostics, scan, ...scanOptions } =
    options;
  let value: unknown;
  try {
    value = await (scan ?? runSlopScan)(scanOptions);
  } catch (error) {
    return blockedResult(
      [`slop scan failed: ${error instanceof Error ? error.message : String(error)}`],
      limit,
    );
  }

  const validation = validateSlopScanReport(value);
  if (!validation.ok || !validation.value) {
    return blockedResult(
      validation.issues.map((issue) => `invalid slop-scan report: ${issue}`),
      limit,
    );
  }
  const report = validation.value;
  const requiredFailures = requiredCoverageFailures(report.coverage.detectors);
  if (report.failure || requiredFailures.length > 0) {
    const diagnostics = [
      report.failure?.message ??
        "Required slop-scan detector coverage degraded; results are not trustworthy.",
      ...requiredFailures.map(
        (detector) => `${detector.id}: ${detector.reason}`,
      ),
    ];
    return blockedResult(diagnostics, limit, report);
  }

  const currentByFingerprint = new Map<string, SlopScanFinding>();
  for (const finding of report.findings) {
    if (!isDeadCodeFinding(finding)) continue;
    const fingerprint = deadCodeFingerprint(finding, report.scope.repoRoot);
    if (!currentByFingerprint.has(fingerprint)) currentByFingerprint.set(fingerprint, finding);
  }

  const currentFingerprints = [...currentByFingerprint.keys()].sort();
  const baselineSet = new Set(baseline);
  const newFindings = currentFingerprints
    .filter((fingerprint) => !baselineSet.has(fingerprint))
    .map((fingerprint) => currentByFingerprint.get(fingerprint) as SlopScanFinding);
  const diagnostics = newFindings.map((finding) =>
    findingDiagnostic(finding, report.scope.repoRoot),
  );

  return {
    ok: newFindings.length === 0,
    status: newFindings.length === 0 ? "pass" : "fail",
    report,
    currentFingerprints,
    newFindings,
    ...boundedDiagnostics(diagnostics, limit),
  };
}
