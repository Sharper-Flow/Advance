/**
 * Epic projection reader facade.
 *
 * Re-exports the read-only epic projection helpers from the epic-projection
 * module. This module previously duplicated that logic; the single bounded-read
 * implementation now lives in epic-projection.ts so both surfaces stay in
 * sync.
 */

export {
  loadRetiredEpicProjection,
  loadActiveEpicProjection,
  listActiveEpicProjections,
  listRetiredEpicProjections,
  listRetiredEpicIds,
} from "./epic-projection";

export type { LoadResult } from "./change-projection-reader";
