/**
 * Test Tools Tests
 *
 * Tests for adv_run_test evidence validation
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { testTools } from "./test";
import { createStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup";

describe("Test Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("adv_run_test", () => {
    test("rejects red phase when command exits 0 (test is passing)", async () => {
      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-task0001",
          command: "true", // exits 0
          phase: "red",
        },
        store,
        tempDir,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("Evidence rejected");
      expect(parsed.error).toContain("Red phase expects a failing test");
      expect(parsed.exitCode).toBe(0);
    });

    test("rejects green phase when command exits non-zero (test is failing)", async () => {
      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-task0001",
          command: "false", // exits 1
          phase: "green",
        },
        store,
        tempDir,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("Evidence rejected");
      expect(parsed.error).toContain("Green phase expects a passing test");
      expect(parsed.exitCode).toBe(1);
    });

    test("accepts red phase when command exits non-zero (correct semantics)", async () => {
      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-task0001",
          command: "false", // exits 1
          phase: "red",
        },
        store,
        tempDir,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.exitCode).toBe(1);
      expect(parsed.error).toBeUndefined();
    });

    test("accepts green phase when command exits 0 (correct semantics)", async () => {
      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-task0001",
          command: "true", // exits 0
          phase: "green",
        },
        store,
        tempDir,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.exitCode).toBe(0);
      expect(parsed.error).toBeUndefined();
    });
  });
});
