import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { createStore } from "./store";
import { getProjectPaths } from "./json";
import {
  computeReconcileCompletionProof,
  ReconcileCompletionProofSchema,
} from "./reconcile-proof";
import { findProjectionDivergences } from "./projection-health";

describe("computeReconcileCompletionProof", () => {
  test("proves an empty store with two unbounded scans", async () => {
    const root = await createTempDir("adv-reconcile-proof-empty-");
    try {
      const calls: unknown[] = [];
      const proof = await computeReconcileCompletionProof({
        paths: getProjectPaths(root),
        deps: {
          scan: async (_paths, options) => {
            calls.push(options);
            return {
              divergences: [],
              scanned: 0,
              omitted: 0,
              truncated: false,
              budgetExceeded: false,
            };
          },
        },
      });

      expect(calls).toEqual([undefined, undefined]);
      expect(proof.complete).toBe(true);
      expect(proof.status).toBe("complete");
      expect(proof.before_divergence_count).toBe(0);
      expect(proof.after_divergence_count).toBe(0);
      expect(ReconcileCompletionProofSchema.safeParse(proof).success).toBe(
        true,
      );
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("reports zero after-count for a residue-free store after apply", async () => {
    const root = await createTempDir("adv-reconcile-proof-clean-");
    try {
      const store = await createStore(root);
      await store.changes.create("Proof fixture");

      const proof = await computeReconcileCompletionProof({
        paths: getProjectPaths(root),
      });

      expect(proof.complete).toBe(true);
      expect(proof.before_divergence_count).toBe(0);
      expect(proof.after_divergence_count).toBe(0);
      expect(proof.after.divergences).toEqual([]);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("does not treat a report-only newer legacy envelope as a completion divergence", async () => {
    const root = await createTempDir("adv-reconcile-proof-legacy-newer-");
    try {
      const store = await createStore(root);
      const paths = getProjectPaths(root);
      const created = await store.changes.create("Legacy newer proof fixture");
      const loaded = await store.changes.get(created.changeId);
      expect(loaded.success).toBe(true);
      if (!loaded.success || !loaded.data)
        throw new Error("fixture load failed");
      await writeFile(
        join(paths.changes, `${created.changeId}.json`),
        JSON.stringify({ state: { ...loaded.data, projection_revision: 99 } }),
      );

      const scan = await findProjectionDivergences(paths);
      expect(scan.divergences).toEqual([]);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("keeps residual divergence visible and does not synthesize completion", async () => {
    const root = await createTempDir("adv-reconcile-proof-residual-");
    try {
      const paths = getProjectPaths(root);
      const divergence = {
        change_id: "proof-residual-fixture",
        canonical: { projection_revision: 2, state_revision: 1, task_count: 0 },
        legacy: { projection_revision: 1, state_revision: 1, task_count: 0 },
        reasons: ["legacy envelope is behind or differs"],
      };

      const proof = await computeReconcileCompletionProof({
        paths,
        deps: {
          scan: async () => ({
            divergences: [divergence],
            scanned: 1,
            omitted: 0,
            truncated: false,
            budgetExceeded: false,
          }),
        },
      });

      expect(proof.complete).toBe(false);
      expect(proof.status).toBe("incomplete");
      expect(proof.before_divergence_count).toBe(1);
      expect(proof.after_divergence_count).toBe(1);
      expect(proof.residual_divergences[0]?.change_id).toBe(
        "proof-residual-fixture",
      );
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("fails closed when the proof scan errors", async () => {
    const root = await createTempDir("adv-reconcile-proof-error-");
    try {
      const proof = await computeReconcileCompletionProof({
        paths: getProjectPaths(root),
        deps: {
          scan: async () => {
            throw new Error("disk read failed");
          },
        },
      });

      expect(proof.complete).toBe(false);
      expect(proof.status).toBe("error");
      expect(proof.error).toContain("disk read failed");
      expect(ReconcileCompletionProofSchema.safeParse(proof).success).toBe(
        true,
      );
    } finally {
      await cleanupTempDir(root);
    }
  });
});
