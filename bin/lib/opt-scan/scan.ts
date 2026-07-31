/**
 * adv CLI — opt-scan orchestrator
 *
 * Selects applicable detectors from the registry, dispatches each to the
 * evaluator, and aggregates candidates + coverage into a single
 * {@link OptScanResult}.
 *
 * In the structural foundation, the evaluator is a stub that records each
 * detector as `skipped` with a deterministic reason. This gives the CLI a
 * stable JSON envelope and coverage breakdown while the per-detector logic
 * is implemented in a follow-up task.
 */

import { OPTIMIZATION_DETECTORS } from "./registry";
import { evaluateDetector } from "./evaluator";
import type { OptimizationCandidate, OptimizationCoverage } from "./schema";

export interface ScanOptions {
  /** Absolute path to the repository root to scan. */
  readonly repoRoot: string;
  /** Filter detectors by detection phase. Defaults to `"all"`. */
  readonly phase?: 1 | 3 | "all";
  /** Narrow the scan to a single detector id. Unknown ids are reported as a skipped coverage entry. */
  readonly detectorId?: string;
  /** Per-pattern regex execution budget in milliseconds. */
  readonly regexTimeoutMs?: number;
}

export interface OptScanScope {
  readonly repoRoot: string;
  readonly phase: 1 | 3 | "all";
  readonly detectorId?: string;
}

export interface OptScanFailure {
  readonly code: "OPT_SCAN_DEGRADED";
  readonly message: string;
  readonly failedDetectors: OptimizationCoverage[];
}

export interface OptScanResult {
  readonly schema_version: "opt_scan_report.v1";
  readonly generated_at: string;
  readonly scope: OptScanScope;
  readonly candidates: readonly OptimizationCandidate[];
  readonly coverage: readonly OptimizationCoverage[];
  readonly failure?: OptScanFailure;
}

const FAILURE_STATES = new Set<OptimizationCoverage["state"]>([
  "degraded",
  "failed",
  "timed_out",
  "unavailable",
]);

export function attachOptScanFailure(result: OptScanResult): OptScanResult {
  const failedDetectors = result.coverage.filter(
    (detector) => detector.important && FAILURE_STATES.has(detector.state),
  );
  if (failedDetectors.length === 0) {
    const { failure: _, ...rest } = result;
    return rest;
  }
  return {
    ...result,
    failure: {
      code: "OPT_SCAN_DEGRADED",
      message:
        "Required opt-scan detector coverage degraded; fix detector setup or narrow scope before trusting results.",
      failedDetectors,
    },
  };
}

/**
 * Run the optimization scan.
 *
 * Selects detectors from the registry by phase and optional detector id,
 * then returns a stable report envelope with each detector recorded as
 * skipped (structural foundation stub). No file traversal is performed.
 */
export async function runOptScan(options: ScanOptions): Promise<OptScanResult> {
  const phase: 1 | 3 | "all" = options.phase ?? "all";
  const scope: OptScanScope = {
    repoRoot: options.repoRoot,
    phase,
    detectorId: options.detectorId,
  };

  let selected = OPTIMIZATION_DETECTORS;
  if (options.detectorId !== undefined) {
    const found = OPTIMIZATION_DETECTORS.filter(
      (entry) => entry.id === options.detectorId,
    );
    if (found.length === 0) {
      return {
        schema_version: "opt_scan_report.v1",
        generated_at: new Date().toISOString(),
        scope,
        candidates: [],
        coverage: [
          {
            id: options.detectorId,
            label: options.detectorId,
            state: "skipped",
            reason: "detector id not found in registry",
            important: true,
          },
        ],
      };
    }
    selected = found;
  }

  if (phase !== "all") {
    selected = selected.filter((entry) => entry.detection_phase === phase);
  }

  const candidates: OptimizationCandidate[] = [];
  const coverage: OptimizationCoverage[] = [];

  for (const detector of selected) {
    const result = await evaluateDetector(detector, {
      repoRoot: options.repoRoot,
      regexTimeoutMs: options.regexTimeoutMs,
    });
    candidates.push(...result.candidates);
    coverage.push(result.coverage_entry);
  }

  const result: OptScanResult = {
    schema_version: "opt_scan_report.v1",
    generated_at: new Date().toISOString(),
    scope,
    candidates,
    coverage,
  };

  return attachOptScanFailure(result);
}
