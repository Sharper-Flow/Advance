/**
 * Status Tool Tests
 *
 * Test adv_status lineage and recommendation behavior.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { statusTools } from "./status";
import {
  createTestProject,
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { createLegacyStore } from "../storage/store";
import type { Store } from "../storage/store";

describe("Status Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("adv_status", () => {
    test("shows ↳ prefix for fast-follow changes in formatted output", async () => {
      // Create parent and child changes
      const { changeTools } = await import("./change");
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.formatted.activeSection).toContain("↳ childFollowUp");
    });

    test("recommendation includes parent reference for fast-follow", async () => {
      const { changeTools } = await import("./change");
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const followRec = parsed.recommendations.find((r: string) =>
        r.includes("fast-follow"),
      );
      expect(followRec).toBeDefined();
      expect(followRec).toContain("childFollowUp");
      expect(followRec).toContain(parentParsed.changeId);
    });

    test("recommendation annotates terminal parent", async () => {
      const { changeTools } = await import("./change");
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      // Move parent to a terminal state (closed)
      await store.changes.close(parentParsed.changeId, {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "User cancelled",
        approved_at: new Date().toISOString(),
      });

      await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const followRec = parsed.recommendations.find((r: string) =>
        r.includes("fast-follow"),
      );
      expect(followRec).toBeDefined();
      // Terminal parent (archived or closed) should be annotated with its state
      expect(followRec).toMatch(/\((archived|closed)\)/);
    });
  });
});
