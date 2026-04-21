/**
 * Store — Backend Selector / Composition Root
 *
 * Thin selector that decides which store backend to use:
 *   1. Builds the legacy JSON+SQLite backend via `createLegacyStore` as the
 *      dedicated file-backed test/dev harness.
 *   2. When a `temporalBundle` is supplied and a `projectId` can be resolved,
 *      returns the Temporal compatibility adapter from `store-temporal.ts`.
 *      After A1 bootstrap wiring, this is the default production path.
 *   3. If no Temporal bundle is available, returns the legacy backend as-is
 *      for test/dev or legacy callers that intentionally omit Temporal.
 */

import { getProjectId } from "../utils/project-id";
import type { TemporalClientBundle } from "../temporal/client";
import { createTemporalStoreBackend } from "./store-temporal";
import { createLegacyStore } from "./store-legacy";

// Re-export public types and helpers
export {
  type Store,
  type SearchResult,
  classifyRecency,
  computeLastActivity,
  buildChangeRecency,
} from "./store-types";

// Re-export the bounded corruption-recovery helper for test back-compat.
// Production wiring lives in `store-legacy.ts`; tests import via this name.
export { recoverCorruptedDatabase as _recoverCorruptedDatabase } from "./corruption-recovery";

import type { Store } from "./store-types";

export async function createStore(
  directory: string,
  options?: {
    externalRoot?: string;
    temporalBundle?: TemporalClientBundle;
    projectIdOverride?: string;
  },
): Promise<Store> {
  const legacy = await createLegacyStore(directory, {
    externalRoot: options?.externalRoot,
  });

  if (options?.temporalBundle) {
    const projectId =
      options.projectIdOverride ?? (await getProjectId(directory));
    if (projectId) {
      return createTemporalStoreBackend({
        legacy,
        temporal: options.temporalBundle,
        projectId,
      });
    }
  }

  return legacy;
}

export { createLegacyStore } from "./store-legacy";
