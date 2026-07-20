/**
 * adv CLI — arch-scan capability-consistency orchestrator
 *
 * Selects applicable relationships from the registry, dispatches each to
 * {@link evaluateRelationship}, and aggregates findings + coverage into a
 * single {@link ScanResult}.
 *
 * Selection is controlled by `phase` (1, 3, or "all") and optional
 * `relationshipId` (single-relationship narrow). Unknown relationship ids
 * are reported as a coverage `skipped` entry rather than throwing — the
 * scan remains usable as a whole.
 */

import { CAPABILITY_RELATIONSHIPS } from "./registry";
import { evaluateRelationship } from "./evaluator";
import type {
  CapabilityCoverage,
  CapabilityFinding,
} from "./schema";

export interface ScanOptions {
  /** Absolute path to the repository root to scan. */
  readonly repoRoot: string;
  /**
   * Filter relationships by detection phase. Defaults to `"all"` (run
   * every registered relationship).
   */
  readonly phase?: 1 | 3 | "all";
  /**
   * Narrow the scan to a single relationship id. Useful for rule tests
   * and targeted re-runs. Unknown ids yield an empty findings array and
   * a `skipped` coverage entry.
   */
  readonly relationshipId?: string;
  /** Per-pattern regex execution budget in milliseconds. */
  readonly regexTimeoutMs?: number;
}

export interface ScanResult {
  readonly findings: readonly CapabilityFinding[];
  readonly coverage: CapabilityCoverage;
}

/**
 * Run the capability-consistency scan.
 *
 * Iterates selected relationships in registry order, calls
 * {@link evaluateRelationship} for each, and aggregates the resulting
 * findings + per-relationship coverage state.
 */
export async function runCapabilityScan(
  options: ScanOptions,
): Promise<ScanResult> {
  const phase: 1 | 3 | "all" = options.phase ?? "all";

  // Filter by relationship id first; if unknown, return a single skipped
  // coverage entry without iterating.
  let selected = CAPABILITY_RELATIONSHIPS;
  if (options.relationshipId !== undefined) {
    const found = CAPABILITY_RELATIONSHIPS.filter(
      (entry) => entry.id === options.relationshipId,
    );
    if (found.length === 0) {
      return {
        findings: [],
        coverage: {
          appliedRelationships: [],
          skippedRelationships: [
            {
              id: options.relationshipId,
              reason: "relationship id not found in registry",
            },
          ],
          degradedRelationships: [],
        },
      };
    }
    selected = found;
  }

  if (phase !== "all") {
    selected = selected.filter((entry) => entry.detection_phase === phase);
  }

  const findings: CapabilityFinding[] = [];
  const appliedRelationships: string[] = [];
  const skippedRelationships: Array<{ id: string; reason: string }> = [];
  const degradedRelationships: Array<{ id: string; reason: string }> = [];

  for (const relationship of selected) {
    const result = await evaluateRelationship(relationship, {
      repoRoot: options.repoRoot,
      regexTimeoutMs: options.regexTimeoutMs,
    });
    findings.push(...result.findings);
    const state = result.coverage_entry.state;
    if (state === "applied") {
      appliedRelationships.push(result.coverage_entry.id);
    } else if (state === "skipped") {
      skippedRelationships.push({
        id: result.coverage_entry.id,
        reason: result.coverage_entry.reason,
      });
    } else {
      degradedRelationships.push({
        id: result.coverage_entry.id,
        reason: result.coverage_entry.reason,
      });
    }
  }

  return {
    findings,
    coverage: {
      appliedRelationships,
      skippedRelationships,
      degradedRelationships,
    },
  };
}
