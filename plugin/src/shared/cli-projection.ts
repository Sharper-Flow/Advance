/**
 * Shared CLI projection types and gate order.
 *
 * Plain TypeScript module with zero runtime imports. Safe to import from the
 * Bun `bin/adv` CLI without dragging in the plugin runtime graph (no zod, no
 * node:*, no storage, no tools).
 */

// =============================================================================
// Gate order — single source of truth for CLI projection
// =============================================================================

/**
 * Canonical ordered gate IDs.
 *
 * This is the CLI-side single source of truth for gate order. It must remain
 * identical to the order derived from `plugin/src/types/gates.ts`
 * `GATE_DEFS.map((g) => g.id)`, which is verified by
 * `plugin/src/cli-gate-order-parity.test.ts`.
 */
export const GATE_ORDER = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
] as const;

/** A valid gate identifier. */
export type GateId = (typeof GATE_ORDER)[number];

// =============================================================================
// CLI projection types
// =============================================================================

/** Per-gate state as projected to the CLI. */
export interface GateState {
  status: string;
  completed_at?: string;
  completed_by?: string;
}

/** Task record as projected to the CLI. */
export interface TaskRecord {
  id: string;
  title: string;
  status: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  cancellation?: { approved_at?: string };
}

/** Local-only wisdom entry shape used by CLI projection. */
export interface WisdomEntry {
  recorded_at?: string;
}

/** Change record as projected to the CLI. */
export interface ChangeRecord {
  id: string;
  title: string;
  status: string;
  lifecycleState?: string;
  created_at: string;
  tasks: TaskRecord[];
  gates?: Record<string, GateState>;
  wisdom?: WisdomEntry[];
  validation?: { validated_at?: string };
  fast_follow_of?: { parent_change_id?: string };
  epic_membership?: { epic_id: string; title: string };
  lastSignalAt?: string;
  same_project_dependencies?: unknown[];
}

/** Summary of an active change for status/epic renders. */
export interface ChangeSummary {
  id: string;
  title: string;
  status: string;
  lifecycleState?: string;
  recency: "hot" | "warm" | "stale";
  lastActivityAt: string;
  minutesSinceActivity: number;
  tasksDone: number;
  tasksTotal: number;
  firstIncompleteGate: string | null;
  gateProgressStr: string;
  parentChangeId?: string;
  epicId?: string;
  worktreeBranches?: string[];
  worktreePaths?: string[];
}

/** Payload returned by `adv status --json`. */
export interface LiveStatusPayload {
  source: "disk";
  live: boolean;
  stale: false;
  generated_at: string;
  project_id: string;
  counts: {
    active: number;
    archived: number;
    closed: number;
  };
  changes: ChangeSummary[];
  resume_projection?: unknown;
  /**
   * Always present. Explains whether `resume_projection` can be trusted as a
   * full answer, so an absent projection is never silently ambiguous.
   */
  resume_projection_state?: unknown;
  summary_residue?: {
    excluded: Array<{
      id: string;
      reason: "canonical_missing" | "canonical_terminal" | "canonical_error";
      detail?: string;
    }>;
    validation_unavailable?: true;
  };
  error?: string;
  remediation?: string;
}
