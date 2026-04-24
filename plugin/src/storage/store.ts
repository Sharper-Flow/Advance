/**
 * Store — Temporal-Only Backend Selector / Composition Root
 *
 * Creates a Temporal-backed store. The legacy JSON+SQLite backend is
 * constructed internally as the file-backed persistence layer, but the
 * returned Store is always the Temporal adapter.
 *
 * Temporal-only runtime: `temporalBundle` is required. Callers that do
 * not have a Temporal bundle must not call `createStore`.
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
export { recoverCorruptedDatabase as _recoverCorruptedDatabase } from "./corruption-recovery";

import type { Store } from "./store-types";

export interface CreateStoreOptions {
  externalRoot?: string;
  temporalBundle: TemporalClientBundle;
  projectIdOverride?: string;
}

export async function createStore(
  directory: string,
  options: CreateStoreOptions,
): Promise<Store> {
  if (!options?.temporalBundle) {
    throw new Error(
      "temporalBundle is required — ADV runtime is Temporal-only. " +
        "If you see this in tests, supply a mock temporalBundle.",
    );
  }

  const legacy = await createLegacyStore(directory, {
    externalRoot: options.externalRoot,
  });

  const projectId =
    options.projectIdOverride ?? (await getProjectId(directory));
  if (!projectId) {
    throw new Error(
      "projectId could not be resolved — required for Temporal-backed store",
    );
  }

  return createTemporalStoreBackend({
    legacy,
    temporal: options.temporalBundle,
    projectId,
  });
}

export { createLegacyStore } from "./store-legacy";
