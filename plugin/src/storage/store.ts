/**
 * Store — Composition Root
 *
 * Creates the disk-backed store. `store-disk.ts` declares
 * `const store: Store = {...}`, so its conformance to the full `Store`
 * interface (`store-types.ts`) is proven by the compiler.
 *
 * There is one persistence backend. Callers must not construct a store any
 * other way.
 */

import { createDiskStore } from "./store-disk";

// Re-export public types and helpers
export {
  type Store,
  type ReadStore,
  type CommandStore,
  type ReadSnapshot,
  ReadSnapshotSchema,
  type ChangeCreateInitialMetadata,
  type ChangeCreateOptions,
  type ProductOriginTags,
  type SearchResult,
  computeLastActivity,
  buildChangeRecency,
} from "./store-types";

import type { Store } from "./store-types";
import type { ProductContext } from "./product-context";

export interface CreateStoreOptions {
  externalRoot?: string;
  productContext?: ProductContext;
}

export async function createStore(
  directory: string,
  options: CreateStoreOptions = {},
): Promise<Store> {
  const store = await createDiskStore(directory, {
    externalRoot: options.externalRoot,
  });
  store.productContext = options.productContext;
  return store;
}

export { createDiskStore } from "./store-disk";
