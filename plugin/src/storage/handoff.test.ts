/**
 * Handoff Tests
 *
 * Verifies session handoff state persistence for worktree sessions.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { writeHandoff, readHandoff, clearHandoff, type HandoffState } from "./handoff";

describe("Handoff", () => {
  let tempDir: string;
  let handoffPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    handoffPath = join(tempDir, "handoff.json");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const sampleHandoff: HandoffState = {
    changeId: "testChange",
    currentTaskId: "tk-abc123",
    gateStatus: {
      research: "done",
      prep: "done",
      implementation: "pending",
      review: "pending",
      harden: "pending",
      signoff: "pending",
    },
    objective: "Implement the feature",
    createdAt: "2026-02-13T18:00:00.000Z",
    sourceBranch: "main",
    worktreeBranch: "change/testChange",
  };

  describe("writeHandoff", () => {
    test("writes handoff state to file", async () => {
      await writeHandoff(handoffPath, sampleHandoff);

      expect(existsSync(handoffPath)).toBe(true);
      const content = JSON.parse(await readFile(handoffPath, "utf-8"));
      expect(content.changeId).toBe("testChange");
      expect(content.currentTaskId).toBe("tk-abc123");
      expect(content.objective).toBe("Implement the feature");
    });

    test("creates parent directories if needed", async () => {
      const nestedPath = join(tempDir, "deep/nested/handoff.json");
      await writeHandoff(nestedPath, sampleHandoff);
      expect(existsSync(nestedPath)).toBe(true);
    });

    test("overwrites existing handoff file", async () => {
      await writeHandoff(handoffPath, sampleHandoff);
      const updated = { ...sampleHandoff, currentTaskId: "tk-xyz789" };
      await writeHandoff(handoffPath, updated);

      const content = JSON.parse(await readFile(handoffPath, "utf-8"));
      expect(content.currentTaskId).toBe("tk-xyz789");
    });
  });

  describe("readHandoff", () => {
    test("reads handoff state from file", async () => {
      await writeHandoff(handoffPath, sampleHandoff);
      const result = await readHandoff(handoffPath);

      expect(result).not.toBeNull();
      expect(result!.changeId).toBe("testChange");
      expect(result!.gateStatus.research).toBe("done");
    });

    test("returns null when file does not exist", async () => {
      const result = await readHandoff(handoffPath);
      expect(result).toBeNull();
    });

    test("returns null for invalid JSON", async () => {
      const { writeFile } = await import("fs/promises");
      await writeFile(handoffPath, "not-json");
      const result = await readHandoff(handoffPath);
      expect(result).toBeNull();
    });
  });

  describe("clearHandoff", () => {
    test("removes handoff file", async () => {
      await writeHandoff(handoffPath, sampleHandoff);
      expect(existsSync(handoffPath)).toBe(true);

      await clearHandoff(handoffPath);
      expect(existsSync(handoffPath)).toBe(false);
    });

    test("does nothing when file does not exist", async () => {
      // Should not throw
      await clearHandoff(handoffPath);
    });
  });
});
