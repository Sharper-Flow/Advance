/**
 * Test Tools Tests
 *
 * Tests for adv_run_test evidence validation and bounded execution.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  testTools,
  DEFAULT_TEST_TIMEOUT_MS,
  DEFAULT_TEST_MAX_BUFFER,
} from "./test";
import { createLegacyStore, type Store } from "../storage/store";
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
    store = await createLegacyStore(tempDir);
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
      await store.tasks.recordRunEvent("tk-task0001", {
        idempotencyKey: "run:start:red-test",
        type: "start",
        recordedAt: "2026-04-14T00:00:00.000Z",
        payload: {},
      });
      await store.tasks.recordRunEvent("tk-task0001", {
        idempotencyKey: "run:baseline:red-test",
        type: "baseline",
        recordedAt: "2026-04-14T00:00:01.000Z",
        payload: { branch: "main", headSha: "abc", workdir: tempDir },
      });
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
      const run = await store.tasks.getRun("tk-task0001");
      expect(run?.phase).toBe("red_recorded");
      expect(run?.events.at(-1)?.type).toBe("red_evidence");
    });

    test("accepts green phase when command exits 0 (correct semantics)", async () => {
      await store.tasks.recordRunEvent("tk-task0001", {
        idempotencyKey: "run:start:green-test",
        type: "start",
        recordedAt: "2026-04-14T00:00:00.000Z",
        payload: {},
      });
      await store.tasks.recordRunEvent("tk-task0001", {
        idempotencyKey: "run:baseline:green-test",
        type: "baseline",
        recordedAt: "2026-04-14T00:00:01.000Z",
        payload: { branch: "main", headSha: "abc", workdir: tempDir },
      });
      await store.tasks.recordRunEvent("tk-task0001", {
        idempotencyKey: "run:red:green-test",
        type: "red_evidence",
        recordedAt: "2026-04-14T00:00:02.000Z",
        payload: { command: "false", exit_code: 1 },
      });
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
      const run = await store.tasks.getRun("tk-task0001");
      expect(run?.phase).toBe("green_recorded");
      expect(run?.events.at(-1)?.type).toBe("green_evidence");
    });

    describe("bounded execution", () => {
      test("exports DEFAULT_TEST_TIMEOUT_MS = 30_000", () => {
        expect(DEFAULT_TEST_TIMEOUT_MS).toBe(30_000);
      });

      test("exports DEFAULT_TEST_MAX_BUFFER = 10MB", () => {
        expect(DEFAULT_TEST_MAX_BUFFER).toBe(10 * 1024 * 1024);
      });

      test("classifies timeout as dedicated failure with command + duration", async () => {
        const result = await testTools.adv_run_test.execute(
          {
            taskId: "tk-task0001",
            // sleep longer than our test-level timeout override below
            command: "sleep 2",
            phase: "red",
          },
          store,
          tempDir,
          { timeoutMs: 100, maxBuffer: DEFAULT_TEST_MAX_BUFFER },
        );
        const parsed = JSON.parse(result);

        // Evidence accepted (non-zero exit is valid for red phase)
        // but a `timedOut` marker + classification surfaced
        expect(parsed.timedOut).toBe(true);
        expect(parsed.command).toBe("sleep 2");
        expect(parsed.timeoutMs).toBe(100);
        // Output must mention the timeout + duration
        expect(parsed.output).toMatch(/timed out/i);
        expect(parsed.output).toContain("sleep 2");
        expect(parsed.output).toContain("100");
      });

      test("classifies maxBuffer-exceed as dedicated failure", async () => {
        const result = await testTools.adv_run_test.execute(
          {
            taskId: "tk-task0001",
            // emit bytes quickly — tiny maxBuffer forces early kill
            command: "yes x 2>/dev/null | head -c 2000",
            phase: "red",
          },
          store,
          tempDir,
          { timeoutMs: 5_000, maxBuffer: 16 },
        );
        const parsed = JSON.parse(result);

        expect(parsed.maxBufferExceeded).toBe(true);
        expect(parsed.output).toMatch(/maxBuffer/i);
      });

      test("regular non-zero exit is not misclassified as timeout/maxBuffer", async () => {
        const result = await testTools.adv_run_test.execute(
          {
            taskId: "tk-task0001",
            command: "false",
            phase: "red",
          },
          store,
          tempDir,
          { timeoutMs: 5_000, maxBuffer: DEFAULT_TEST_MAX_BUFFER },
        );
        const parsed = JSON.parse(result);

        expect(parsed.timedOut).toBeFalsy();
        expect(parsed.maxBufferExceeded).toBeFalsy();
        expect(parsed.success).toBe(true);
        expect(parsed.exitCode).toBe(1);
      });
    });
  });
});
