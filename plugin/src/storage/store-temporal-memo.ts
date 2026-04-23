/**
 * ChangeSummaryMemo — In-process indexed read path for ADV.
 *
 * Lightweight Map<changeId, ChangeSummary> used by store-temporal.ts's
 * Read Router to serve status/list surfaces without O(N) fan-out queries.
 *
 * Lifecycle:
 *   - set(): populate on direct-query read or PSW hydration
 *   - get(): serve summary surfaces (status, changes.list)
 *   - invalidate(): called before every mutation to prevent stale reads
 *   - invalidateAll(): bulk clear (shutdown, error recovery)
 *   - bulkSet(): PSW hydration on startup
 *
 * Invalidated per-mutation: freshness-first on critical surfaces (which
 * bypass the Memo entirely), and the Memo is always stale-safe because
 * every write invalidates before executing.
 */

import type { ChangeStatus } from "../types";

export interface GateProgress {
  proposal: string;
  discovery: string;
  design: string;
  planning: string;
  execution: string;
  acceptance: string;
  release: string;
}

export interface ChangeSummary {
  id: string;
  title: string;
  status: ChangeStatus;
  gateProgress: GateProgress;
  taskCounts: {
    total: number;
    done: number;
    pending: number;
  };
  lastActivityAt: string;
  /** Monotonic version for PSW signal dedupe */
  sourceVersion: number;
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
