/**
 * Store — Backend Selector / Composition Root
 *
 * Thin selector that decides which store backend to use:
 *   1. Always builds the legacy JSON+SQLite backend via `createLegacyStore`.
 *   2. If a `temporalBundle` (and a resolvable `projectId`) is supplied,
 *      wraps the legacy backend with the Temporal compatibility adapter
 *      from `store-temporal.ts`.
 *   3. Otherwise returns the legacy backend as-is.
 *
 * The Temporal overlay is intentionally opt-in so existing tool callers
 * keep working without any Temporal runtime dependency.
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
