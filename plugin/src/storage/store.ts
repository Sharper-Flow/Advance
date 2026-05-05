/**
 * Store — Temporal-Only Backend Selector / Composition Root
 *
 * Creates a Temporal-backed store. The disk-only backend is constructed
 * internally as the file-backed persistence layer, but the returned Store
 * is always the Temporal adapter.
 *
 * Temporal-only runtime: `temporalBundle` is required. Callers that do
 * not have a Temporal bundle must not call `createStore`.
 *
 * P2.7: SQLite-backed `createLegacyStore` deleted; replaced by the
 * SQLite-free `createDiskStore`. See `store-disk.ts` for the migration
 * rationale.
 */

import { getProjectId } from "../utils/project-id";
import type { TemporalClientBundle } from "../temporal/client";
import { createTemporalStoreBackend } from "./store-temporal";
import { createDiskStore } from "./store-disk";

// Re-export public types and helpers
export {
  type Store,
  type SearchResult,
  computeLastActivity,
  buildChangeRecency,
} from "./store-types";

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

  const legacy = await createDiskStore(directory, {
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

// Back-compat: tools/change.ts cross-project flow needs a non-Temporal
// Store for target repos that may not have a workflow bundle running.
// `createDiskStore` is the canonical name; alias here for migration ease.
export { createDiskStore as createLegacyStore } from "./store-disk";
