/**
 * adv CLI — arch-scan execution bridge
 *
 * Thin wrapper around {@link runCapabilityScan} that normalizes options for
 * two consumers:
 *   - the `/adv-arch-scan` markdown Phase 1 invocation (when the capability
 *     pack applies), and
 *   - the direct CLI entry at `bin/arch-scan.ts`.
 *
 * Bridge invariants (P33 structural, P34 evidence-backed):
 *   - Never throws. Missing repo, scan crashes, and unexpected errors are
 *     translated into an empty {@link ScanResult} carrying a synthetic
 *     degraded entry so callers (CLI, markdown orchestrator) can rely on a
 *     single return shape.
 *   - Synthetic degraded entries use the sentinel id
 *     {@link BRIDGE_DEGRADED_ID} so bridge-level failures are
 *     distinguishable from per-relationship degradations emitted by the
 *     scan pipeline (which carry the relationship id).
 *   - Forwards every option verbatim to {@link runCapabilityScan}; the
 *     bridge does not interpret `phase`, `relationshipId`, or
 *     `regexTimeoutMs` — it only normalizes their presence.
 */

import { access } from "fs/promises";
import { runCapabilityScan } from "./scan";
import type { ScanOptions, ScanResult } from "./scan";

/**
 * Sentinel id used for synthetic degraded entries emitted by the bridge
 * itself (missing repo, scan crash). The scan pipeline never emits this id;
 * it only emits relationship ids from the registry. This lets the CLI
 * discriminate a fully-degraded run (exit 1) from a run where one
 * relationship simply timed out (exit 0 with a degraded entry).
 */
export const BRIDGE_DEGRADED_ID = "bridge";

/** Reason string recorded when `repoRoot` does not exist on disk. */
export const BRIDGE_REASON_REPO_NOT_FOUND = "repo not found";

export interface BridgeOptions {
  /** Absolute path to the repository root to scan. */
  readonly repoRoot: string;
  /** Filter relationships by detection phase. Defaults to `"all"`. */
  readonly phase?: 1 | 3 | "all";
  /** Narrow the scan to a single relationship id. */
  readonly relationshipId?: string;
  /** Per-pattern regex execution budget in milliseconds. */
  readonly regexTimeoutMs?: number;
}

/**
 * Run the capability-consistency scan via the bridge.
 *
 * Validates that `repoRoot` exists, delegates to
 * {@link runCapabilityScan} with normalized options, and catches any
 * unexpected error from the scan pipeline. Both the missing-repo and
 * caught-error paths return an empty `ScanResult` with a synthetic degraded
 * entry (id {@link BRIDGE_DEGRADED_ID}) so callers never see a thrown
 * exception from the bridge.
 */
export async function runCapabilityBridge(
  options: BridgeOptions,
): Promise<ScanResult> {
  // Validate repoRoot exists before entering the scan pipeline. The scan
  // itself does not assert this; without the guard, a missing repo would
  // surface as opaque readdir errors deep in the evaluator.
  try {
    await access(options.repoRoot);
  } catch {
    return emptyBridgeDegraded(BRIDGE_REASON_REPO_NOT_FOUND);
  }

  const scanOptions: ScanOptions = {
    repoRoot: options.repoRoot,
    phase: options.phase,
    relationshipId: options.relationshipId,
    regexTimeoutMs: options.regexTimeoutMs,
  };

  try {
    return await runCapabilityScan(scanOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return emptyBridgeDegraded(`bridge error: ${msg}`);
  }
}

/**
 * Build an empty {@link ScanResult} whose only signal is a single synthetic
 * degraded entry under {@link BRIDGE_DEGRADED_ID}. Used by both the
 * missing-repo and caught-error paths.
 */
function emptyBridgeDegraded(reason: string): ScanResult {
  return {
    findings: [],
    coverage: {
      appliedRelationships: [],
      skippedRelationships: [],
      degradedRelationships: [{ id: BRIDGE_DEGRADED_ID, reason }],
    },
  };
}
