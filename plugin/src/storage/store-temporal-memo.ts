/**
 * ChangeSummaryMemo — In-process indexed read path for ADV.
 *
 * Lightweight Map<changeId, ChangeSummary> used by store-temporal/index.ts
 * to serve status/list surfaces without O(N) fan-out queries.
 *
 * Each mutation signal invalidates the affected entry before executing,
 * so the memo is always stale-safe. Direct queries repopulate via set().
 *
 * Lifecycle:
 *   - set(): populate on direct-query read
 *   - get(): serve summary surfaces (status, changes.list)
 *   - invalidate(): called before every mutation to prevent stale reads
 *   - invalidateAll(): bulk clear (shutdown, error recovery)
 *   - bulkSet(): batch hydration (e.g. startup recovery)
 */

import type { ChangeLifecycleState, ChangeStatus, FastFollowOf } from "../types";
import type { OpsFollowupLink, OpsFollowupProfile } from "../types/changes";

export type GateStatusValue = "pending" | "done" | "skipped" | "legacy";

const VALID_GATE_STATUS = new Set<string>([
  "pending",
  "done",
  "skipped",
  "legacy",
]);

/** Coerce an unknown gate status string to the typed union, defaulting to "pending". */
export function asGateStatus(value: string | undefined): GateStatusValue {
  if (value && VALID_GATE_STATUS.has(value)) return value as GateStatusValue;
  return "pending";
}

export interface GateProgress {
  proposal: GateStatusValue;
  discovery: GateStatusValue;
  design: GateStatusValue;
  planning: GateStatusValue;
  execution: GateStatusValue;
  acceptance: GateStatusValue;
  release: GateStatusValue;
}

export interface ChangeSummary {
  id: string;
  title: string;
  status: ChangeStatus;
  lifecycleState?: ChangeLifecycleState;
  gateProgress: GateProgress;
  taskCounts: {
    total: number;
    done: number;
    pending: number;
  };
  lastActivityAt: string;
  /** Same-project fast-follow lineage (optional) */
  fast_follow_of?: FastFollowOf;
  /** Inbound ops follow-up profile when this change is a linked follow-up. */
  ops_followup?: OpsFollowupProfile;
  /** Outbound ops follow-up links when this change has promoted follow-ups. */
  ops_followup_links?: OpsFollowupLink[];
}

export interface MemoStats {
  hits: number;
  misses: number;
}

export class ChangeSummaryMemo {
  private readonly store = new Map<string, ChangeSummary>();
  private hits = 0;
  private misses = 0;

  get(changeId: string): ChangeSummary | undefined {
    const entry = this.store.get(changeId);
    if (entry !== undefined) {
      this.hits++;
    } else {
      this.misses++;
    }
    return entry;
  }

  set(changeId: string, summary: ChangeSummary): void {
    this.store.set(changeId, summary);
  }

  invalidate(changeId: string): void {
    this.store.delete(changeId);
  }

  invalidateAll(): void {
    this.store.clear();
  }

  getAll(): ChangeSummary[] {
    return [...this.store.values()];
  }

  bulkSet(entries: Array<[string, ChangeSummary]>): void {
    this.store.clear();
    for (const [key, value] of entries) {
      this.store.set(key, value);
    }
  }

  size(): number {
    return this.store.size;
  }

  getStats(): MemoStats {
    return { hits: this.hits, misses: this.misses };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
