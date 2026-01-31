/**
 * Gate Tools Tests
 *
 * Tests for 6-gate quality checklist tools.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { gateTools } from "./gate";
import { createStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup";

/**
 * Extract JSON content from banner-wrapped output.
 * Banner format: banner + "\n\n" + json
 */
function extractJson(output: string): unknown {
  // If output starts with banner (╔), extract JSON after the double newline
  if (output.startsWith("╔")) {
    const jsonStart = output.indexOf("\n\n");
    if (jsonStart !== -1) {
      return JSON.parse(output.slice(jsonStart + 2));
    }
  }
  // Otherwise, parse as-is
  return JSON.parse(output);
}

describe("Gate Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
    await store.init();
    await store.sync();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("adv_gate_status", () => {
    test("returns gate status for change without gates (creates defaults)", async () => {
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.changeId).toBe("addFeature");
      expect(parsed.gates).toBeDefined();
      expect(parsed.gates.research.status).toBe("pending");
      expect(parsed.gates.prep.status).toBe("pending");
      expect(parsed.gates.implementation.status).toBe("pending");
      expect(parsed.gates.review.status).toBe("pending");
      expect(parsed.gates.harden.status).toBe("pending");
      expect(parsed.gates.signoff.status).toBe("pending");
    });

    test("returns incomplete gates list", async () => {
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.incomplete).toEqual([
        "research",
        "prep",
        "implementation",
        "review",
        "harden",
        "signoff",
      ]);
      expect(parsed.canArchive).toBe(false);
    });

    test("returns error for nonexistent change", async () => {
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "nonexistent" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });

    test("returns next gate to complete", async () => {
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.nextGate).toBe("research");
    });
  });

  describe("gate migration", () => {
    test("migrates change gates to legacy status except signoff", async () => {
      // Get initial gates (should be created as pending)
      const beforeResult = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const beforeParsed = JSON.parse(beforeResult);
      expect(beforeParsed.gates.research.status).toBe("pending");

      // Migrate the change
      await store.gates.migrate("addFeature");

      // After migration, all gates should be 'legacy' except signoff
      const afterResult = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const afterParsed = JSON.parse(afterResult);

      expect(afterParsed.gates.research.status).toBe("legacy");
      expect(afterParsed.gates.prep.status).toBe("legacy");
      expect(afterParsed.gates.implementation.status).toBe("legacy");
      expect(afterParsed.gates.review.status).toBe("legacy");
      expect(afterParsed.gates.harden.status).toBe("legacy");
      expect(afterParsed.gates.signoff.status).toBe("pending"); // NEVER auto-marked
    });

    test("legacy gates count as satisfied for sequence enforcement", async () => {
      // Migrate gates to legacy
      await store.gates.migrate("addFeature");

      // Should be able to complete signoff directly (all others are legacy)
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "signoff" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.gateId).toBe("signoff");
    });

    test("canArchive is true when all gates satisfied (legacy or done)", async () => {
      // Migrate gates to legacy
      await store.gates.migrate("addFeature");

      // Complete signoff
      await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "signoff" },
        store,
      );

      // Check canArchive
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.canArchive).toBe(true);
      expect(parsed.incomplete).toEqual([]);
    });
  });

  describe("adv_gate_complete", () => {
    test("marks first gate (research) as done", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "research" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.gateId).toBe("research");
      expect(parsed.status).toBe("done");
      expect(parsed.completed_at).toBeDefined();
    });

    test("blocks completing gate if prior gate incomplete", async () => {
      // Try to complete prep without completing research first
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "prep" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("prior gate");
      expect(parsed.blockedBy).toEqual(["research"]);
    });

    test("allows completing gate after prior gate done", async () => {
      // Complete research first
      await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "research" },
        store,
      );

      // Now prep should work
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "prep" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.gateId).toBe("prep");
    });

    test("persists gate completion to JSON file", async () => {
      await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "research" },
        store,
      );

      // Reload store to verify persistence
      const freshStore = await createStore(tempDir);
      await freshStore.sync();

      const status = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        freshStore,
      );
      const parsed = extractJson(status) as Record<string, unknown>;
      const gates = parsed.gates as Record<string, { status: string }>;

      expect(gates.research.status).toBe("done");
    });

    test("returns error for nonexistent change", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "nonexistent", gateId: "research" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.error).toContain("not found");
    });

    test("returns error for invalid gate ID", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "invalid" as never },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.error).toContain("Invalid gate");
    });
  });
});
