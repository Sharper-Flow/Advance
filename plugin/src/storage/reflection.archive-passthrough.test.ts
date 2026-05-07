/**
 * Archive passthrough regression tests for ReflectionEntrySchema.
 *
 * Verifies that fields removed from explicit schema declarations
 * (threshold_tier) continue to survive parse via the terminal
 * `.passthrough()` on the efficiency sub-schema.
 */

import { describe, expect, test } from "vitest";
import { appendReflection, listReflections } from "./reflection";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ReflectionEntrySchema archive passthrough", () => {
  const minimalValidEntry = {
    id: "rf-test",
    change_id: "test-change",
    created_at: "2026-01-01T00:00:00.000Z",
    plane1: {
      efficiency: {
        task_count: 3,
        tasks_done: 3,
        tasks_cancelled: 0,
        retry_total: 1,
        retry_density: 0.33,
        elapsed_ms: 3600000,
        per_gate_ms: { proposal: 300000 },
      },
      quality: {
        tdd_compliance: 1.0,
      },
      process: {
        gate_completion_rate: 1.0,
        tdd_intent_distribution: { inline: 3 },
        delegation_count: 0,
        drift_triggers: 0,
      },
      wisdom: {
        entries_captured: 2,
        entries_promoted: 1,
        wisdom_reuse_hits: 1,
      },
    },
    plane2: {
      friction_items: [],
      highlights: [],
      improvement_suggestions: [],
    },
  };

  test("preserves threshold_tier via passthrough on efficiency", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "reflection-passthrough-test-"));
    try {
      const entryWithTier = {
        ...minimalValidEntry,
        plane1: {
          ...minimalValidEntry.plane1,
          efficiency: {
            ...minimalValidEntry.plane1.efficiency,
            threshold_tier: "auto",
          },
        },
      };

      await appendReflection(tempDir, entryWithTier as any);

      const result = await listReflections(tempDir);
      expect(result).toHaveLength(1);
      // The field should be preserved via passthrough even though it's
      // no longer explicitly declared in the schema.
      expect((result[0].plane1.efficiency as any).threshold_tier).toBe("auto");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
