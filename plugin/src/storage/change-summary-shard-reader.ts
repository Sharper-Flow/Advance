/**
 * Durable per-change summary shard reader facade.
 *
 * Re-exports the read-only summary helpers from change-summary-shard.ts so
 * both the writer+reader module and the reader-only facade share a single
 * bounded-read implementation.
 */

export {
  ChangeSummaryShardSchema,
  ChangeSummaryPointerSchema,
  deriveSummaryShard,
  summaryPaths,
  assertSafeChangeId,
  readCurrentSummaryShard,
  listSummaryChanges,
  collectObsoleteSummaryShards,
} from "./change-summary-shard";

export type {
  ChangeSummaryShard,
  ChangeSummaryPointer,
  SummaryReadResult,
  SummaryIndexPaths,
} from "./change-summary-shard";

export type { ProjectionDocumentWarning } from "./change-projection-reader";
