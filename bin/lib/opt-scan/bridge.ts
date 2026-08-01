/**
 * adv CLI — opt-scan execution bridge
 *
 * Thin wrapper around {@link runOptScan} that normalizes options for the
 * `/adv-optimizer` intake and the direct CLI entry at `bin/opt-scan.ts`.
 *
 * Bridge invariants (P33 structural, P34 evidence-backed):
 *   - Never throws. Missing repo, scan crashes, and unexpected errors are
 *     translated into a degraded {@link OptScanResult}.
 *   - Synthetic degraded coverage entries use the sentinel id
 *     {@link BRIDGE_DEGRADED_ID} so bridge-level failures are distinguishable
 *     from per-detector degradations.
 *   - Forwards every option verbatim to {@link runOptScan}; the bridge does not
 *     interpret `phase`, `detectorId`, or `regexTimeoutMs`.
 */

import { access } from "fs/promises";
import { runOptScan } from "./scan";
import type { ScanOptions, OptScanResult } from "./scan";

export const BRIDGE_DEGRADED_ID = "bridge";
export const BRIDGE_REASON_REPO_NOT_FOUND = "repo not found";

export interface BridgeOptions {
  /** Absolute path to the repository root to scan. */
  readonly repoRoot: string;
  /** Filter detectors by detection phase. Defaults to `"all"`. */
  readonly phase?: 1 | 3 | "all";
  /** Narrow the scan to a single detector id. */
  readonly detectorId?: string;
  /** Per-pattern regex execution budget in milliseconds. */
  readonly regexTimeoutMs?: number;
}

function bridgeDegradedResult(
  repoRoot: string,
  phase: 1 | 3 | "all",
  detectorId: string | undefined,
  reason: string,
): OptScanResult {
  return {
    schema_version: "opt_scan_report.v1",
    generated_at: new Date().toISOString(),
    scope: { repoRoot, phase, detectorId },
    candidates: [],
    coverage: [
      {
        id: BRIDGE_DEGRADED_ID,
        label: "bridge",
        state: "degraded",
        reason,
        important: true,
      },
    ],
  };
}

export async function runOptBridge(
  options: BridgeOptions,
): Promise<OptScanResult> {
  const phase: 1 | 3 | "all" = options.phase ?? "all";

  try {
    await access(options.repoRoot);
  } catch {
    return bridgeDegradedResult(
      options.repoRoot,
      phase,
      options.detectorId,
      BRIDGE_REASON_REPO_NOT_FOUND,
    );
  }

  const scanOptions: ScanOptions = {
    repoRoot: options.repoRoot,
    phase: options.phase,
    detectorId: options.detectorId,
    regexTimeoutMs: options.regexTimeoutMs,
  };

  try {
    return await runOptScan(scanOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return bridgeDegradedResult(
      options.repoRoot,
      phase,
      options.detectorId,
      `bridge error: ${msg}`,
    );
  }
}
