/**
 * Specs Domain Operations
 *
 * Factory function that returns the `specs` namespace of the Store interface.
 * Extracted from store.ts to keep domain logic co-located and testable.
 */

import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import type { Spec } from "../types";
import { loadSpec, saveSpec } from "./json";
import { shouldCheckpoint, checkpointWAL } from "./health";
import type { StoreContext } from "./store-context";
import type { Store } from "./store";
import { acquireFileLock } from "../utils/fs";

export type SpecsSave = (spec: Spec) => Promise<void>;

export function createSpecsOps(
  ctx: StoreContext,
  ensureSpecSynced: (cap: string) => Promise<void>,
  ensureAllSpecsSynced: () => Promise<void>,
): Store["specs"] {
  const paths = ctx.paths;

  return {
    list: async (filter) => {
      // Lazy sync: list needs all specs for complete results
      await ensureAllSpecsSynced();

      const rows = ctx.sqlite.specs.list({ name: filter?.capability });

      // Filter by tag using SQL-backed lookup (replaces N per-row loadSpec)
      let specs = rows;
      if (filter?.tag) {
        const matchingSpecNames = new Set(
          ctx.sqlite.requirements.specsByTag(filter.tag),
        );
        specs = rows.filter((row) => matchingSpecNames.has(row.name));
      }

      return {
        specs: specs.map((s) => ({
          name: s.name,
          title: s.title,
          version: s.version,
          requirementCount: ctx.sqlite.requirements.list(s.name).length,
        })),
      };
    },

    get: async (capability) => {
      // Lazy sync: only sync this specific spec
      await ensureSpecSynced(capability);
      return loadSpec(paths.specs, capability);
    },

    search: async (query, limit = 20) => {
      // Lazy sync: search needs full FTS index
      await ensureAllSpecsSynced();

      const results = ctx.sqlite.requirements.search(query, limit);
      return results.map((r) => ({
        spec: r.spec_name,
        requirement: r.id,
        title: r.title,
        match: r.match,
      }));
    },

    save: async (spec) => {
      const specPath = join(paths.specs, spec.name, "spec.json");
      await mkdir(dirname(specPath), { recursive: true });
      const release = await acquireFileLock(specPath);
      try {
        const jsonPath = await saveSpec(paths.specs, spec);
        ctx.sqlite.specs.upsert(spec, jsonPath);
        if (shouldCheckpoint(ctx.dbPath)) {
          checkpointWAL(ctx.sqlite.db);
        }
      } finally {
        await release();
      }
    },
  };
}
