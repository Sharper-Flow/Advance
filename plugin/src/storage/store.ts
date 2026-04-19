/**
 * Unified Store — Composition Root
 *
 * Thin selector that chooses the legacy JSON+SQLite backend by default and
 * optionally wraps it with the Temporal compatibility adapter when a temporal
 * client bundle is supplied. This keeps the workflow/store boundary explicit.
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
