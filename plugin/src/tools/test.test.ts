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
    test("description says it runs commands and records durable TDD evidence", () => {
      expect(testTools.adv_run_test.description).toMatch(/run/i);
      expect(testTools.adv_run_test.description).toMatch(/record/i);
      expect(testTools.adv_run_test.description).toMatch(/durable/i);
      expect(testTools.adv_run_test.description).toMatch(/evidence/i);
    });

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

    describe("ledger auto-advance (Phase F.0)", () => {
      /**
       * Phase F.0 regression: production code never emitted `baseline`
       * events, so the strict task-run ledger stayed wedged at `started`
       * (or `not_started`) and `red_evidence` writes silently failed in
       * adv_run_test. The next checkpoint then surfaced the failure as
       * "Workflow Update failed". Recurred across enforceLayerBoundariesWorkflow,
       * fixReflectionAccuracyReporting, and bringTemporalNativeReliability.
       *
       * Fix: adv_run_test must auto-emit start + baseline before its
       * red_evidence ledger event when the task-run is still in
       * `not_started` or `started`. This drives the strict lifecycle
       * automatically without weakening the change-state contract.
       */
      test("auto-emits start+baseline before red_evidence on a fresh task", async () => {
        const result = await testTools.adv_run_test.execute(
          {
            taskId: "tk-task0001",
            command: "false",
            phase: "red",
          },
          store,
          tempDir,
        );
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(true);
        expect(parsed.exitCode).toBe(1);

        const run = await store.tasks.getRun("tk-task0001");
        expect(run?.phase).toBe("red_recorded");
        const eventTypes = run?.events.map((e) => e.type) ?? [];
        expect(eventTypes).toContain("start");
        expect(eventTypes).toContain("baseline");
        expect(eventTypes.at(-1)).toBe("red_evidence");
      });

      test("auto-emits baseline before red_evidence when start was already emitted", async () => {
        await store.tasks.recordRunEvent("tk-task0001", {
          idempotencyKey: "run:start:autoadv2",
          type: "start",
          recordedAt: "2026-04-14T00:00:00.000Z",
          payload: {},
        });

        const result = await testTools.adv_run_test.execute(
          {
            taskId: "tk-task0001",
            command: "false",
            phase: "red",
          },
          store,
          tempDir,
        );
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(true);
        const run = await store.tasks.getRun("tk-task0001");
        expect(run?.phase).toBe("red_recorded");
        const eventTypes = run?.events.map((e) => e.type) ?? [];
        expect(eventTypes).toContain("baseline");
        expect(eventTypes.at(-1)).toBe("red_evidence");
      });

      test("does not re-emit baseline when ledger already past baseline_captured", async () => {
        await store.tasks.recordRunEvent("tk-task0001", {
          idempotencyKey: "run:start:autoadv3",
          type: "start",
          recordedAt: "2026-04-14T00:00:00.000Z",
          payload: {},
        });
        await store.tasks.recordRunEvent("tk-task0001", {
          idempotencyKey: "run:baseline:autoadv3",
          type: "baseline",
          recordedAt: "2026-04-14T00:00:01.000Z",
          payload: {
            branch: "manual",
            headSha: "deadbeef",
            workdir: tempDir,
          },
        });

        const result = await testTools.adv_run_test.execute(
          {
            taskId: "tk-task0001",
            command: "false",
            phase: "red",
          },
          store,
          tempDir,
        );
        expect(JSON.parse(result).success).toBe(true);

        const run = await store.tasks.getRun("tk-task0001");
        const baselines =
          run?.events.filter((e) => e.type === "baseline") ?? [];
        expect(baselines.length).toBe(1);
        expect(baselines[0]?.payload.branch).toBe("manual");
      });
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

    // rq-runTestTimeoutArg01: caller-controlled timeoutMs with [1s, 5min] cap.
    describe("timeoutMs schema arg", () => {
      test("custom timeoutMs is honored by execute (overrides default 30s)", async () => {
        // Run a 2s sleep with a 100ms timeout passed via tool ARG (not internal
        // bounds). Without the schema arg + plumbing, the default 30s would
        // apply and the command would complete normally.
        const result = await testTools.adv_run_test.execute(
          {
            taskId: "tk-task0001",
            command: "sleep 2",
            phase: "red",
            timeoutMs: 100,
          },
          store,
          tempDir,
        );
        const parsed = JSON.parse(result);

        expect(parsed.timedOut).toBe(true);
        expect(parsed.timeoutMs).toBe(100);
        expect(parsed.output).toMatch(/timed out/i);
      });

      test("timeoutMs above 300_000 is rejected by schema", () => {
        const schema = testTools.adv_run_test.args.timeoutMs;
        expect(() => schema.parse(300_001)).toThrow();
      });

      test("timeoutMs below 1000 is rejected by schema", () => {
        const schema = testTools.adv_run_test.args.timeoutMs;
        expect(() => schema.parse(999)).toThrow();
      });

      test("timeoutMs at boundaries (1000 and 300_000) is accepted", () => {
        const schema = testTools.adv_run_test.args.timeoutMs;
        expect(schema.parse(1000)).toBe(1000);
        expect(schema.parse(300_000)).toBe(300_000);
      });

      test("timeoutMs is optional (undefined accepted, default applies)", () => {
        const schema = testTools.adv_run_test.args.timeoutMs;
        expect(schema.parse(undefined)).toBeUndefined();
      });
    });
  });
});
