/**
 * Test Tool — Simplified adv_run_test Tests
 *
 * Verifies that adv_run_test runs shell commands and returns results
 * without workflow involvement.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shapeCommandOutput, testTools } from "./test";
import type { Store } from "../storage/store";

const { mockGetService, mockGetChangeHandle, mockSignal, mockGetProjectId } =
  vi.hoisted(() => ({
    mockGetService: vi.fn(),
    mockGetChangeHandle: vi.fn(),
    mockSignal: vi.fn(),
    mockGetProjectId: vi.fn(),
  }));

vi.mock("../temporal/service", () => ({
  getService: mockGetService,
}));

vi.mock("./_adapters", () => ({
  getChangeHandle: mockGetChangeHandle,
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: mockGetProjectId,
}));

function createMockStore(): Store {
  return {
    paths: { root: "/tmp/test" } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {} as Store["changes"],
    tasks: {
      get: vi.fn(
        async (taskId: string) =>
          ({
            id: taskId,
            title: "Test Task",
            status: "in_progress",
            priority: 0,
            created_at: "2026-01-01T00:00:00Z",
          }) as import("../types").Task,
      ),
      show: vi.fn(),
      list: vi.fn(),
      ready: vi.fn(),
      update: vi.fn(),
      add: vi.fn(),
      cancel: vi.fn(),
      reclassifyTdd: vi.fn(),
    } as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
  } as unknown as Store;
}

describe("test tools — simplified adv_run_test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetService.mockReturnValue(null);
    mockGetChangeHandle.mockReturnValue({ signal: mockSignal });
    mockSignal.mockResolvedValue(undefined);
    mockGetProjectId.mockResolvedValue("proj-test");
  });

  test("runs command and returns result with optional descriptive phase", async () => {
    const store = createMockStore();

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "echo test output",
        phase: "green",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.output).toContain("test output");
    expect(parsed.phase).toBe("green");
    expect(parsed.command).toBe("echo test output");
  });

  test("declares optional red/green/verify phase in the tool schema", () => {
    const phaseSchema = testTools.adv_run_test.args.phase;

    expect(phaseSchema).toBeDefined();
    expect(phaseSchema?.safeParse("red").success).toBe(true);
    expect(phaseSchema?.safeParse("green").success).toBe(true);
    expect(phaseSchema?.safeParse("verify").success).toBe(true);
    expect(phaseSchema?.safeParse("blue").success).toBe(false);
  });

  test("returns typed result contract for passing command", async () => {
    const store = createMockStore();

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "printf typed-pass",
        phase: "verify",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.passed).toBe(true);
    expect(parsed.classification).toBe("passed");
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
    expect(parsed.outputBytesSeen).toBeGreaterThan(0);
    expect(parsed.outputBytesRetained).toBeGreaterThan(0);
    expect(parsed.outputTruncated).toBe(false);
    expect(parsed.executionMode).toBe("shell");
    expect(parsed.evidence).toMatchObject({
      schema_version: "adv_run_test.v1",
      command: "printf typed-pass",
      exitCode: 0,
      passed: true,
      classification: "passed",
    });
    expect(parsed.evidence.durationMs).toBe(parsed.durationMs);
    expect(parsed.evidenceRecording).toMatchObject({
      status: "not_applicable",
      reason: "no_change_for_task",
    });
  });

  test("reports recorded evidence status when testRunRecordedSignal succeeds", async () => {
    const store = createMockStore();
    vi.mocked(store.tasks.show).mockResolvedValue({
      changeId: "change-a",
    } as Awaited<ReturnType<Store["tasks"]["show"]>>);
    mockGetService.mockReturnValue({ client: {}, namespace: "default" });

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "printf recorded",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.passed).toBe(true);
    expect(parsed.evidenceRecording).toMatchObject({
      status: "recorded",
      runId: parsed.runId,
    });
    expect(mockSignal).toHaveBeenCalledOnce();
  });

  test("reports degraded evidence status when recording signal fails", async () => {
    const store = createMockStore();
    vi.mocked(store.tasks.show).mockResolvedValue({
      changeId: "change-a",
    } as Awaited<ReturnType<Store["tasks"]["show"]>>);
    mockGetService.mockReturnValue({ client: {}, namespace: "default" });
    mockSignal.mockRejectedValue(new Error("signal failed"));

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "printf command-still-succeeds",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.passed).toBe(true);
    expect(parsed.output).toContain("command-still-succeeds");
    expect(parsed.evidenceRecording).toMatchObject({
      status: "degraded",
      reason: "signal_failed",
      message: expect.stringContaining("signal failed"),
    });
  });

  test("bounds evidence recording wait when signal hangs", async () => {
    const store = createMockStore();
    vi.mocked(store.tasks.show).mockResolvedValue({
      changeId: "change-a",
    } as Awaited<ReturnType<Store["tasks"]["show"]>>);
    mockGetService.mockReturnValue({ client: {}, namespace: "default" });
    mockSignal.mockReturnValue(new Promise(() => undefined));

    const startedAt = performance.now();
    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "printf bounded-recording",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(performance.now() - startedAt).toBeLessThan(1_500);
    expect(parsed.passed).toBe(true);
    expect(parsed.evidenceRecording).toMatchObject({
      status: "degraded",
      reason: "timeout",
      message: expect.stringContaining("timed out"),
    });
  });

  test("returns typed result contract for non-zero command", async () => {
    const store = createMockStore();

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "printf typed-fail && exit 7",
        phase: "red",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.passed).toBe(false);
    expect(parsed.classification).toBe("failed");
    expect(parsed.exitCode).toBe(7);
    expect(parsed.evidence).toMatchObject({
      schema_version: "adv_run_test.v1",
      command: "printf typed-fail && exit 7",
      exitCode: 7,
      passed: false,
      classification: "failed",
    });
  });

  test("reports retained-output truncation without hard output-limit failure", async () => {
    const store = createMockStore();

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "node -e \"console.log('x'.repeat(3000))\"",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.passed).toBe(true);
    expect(parsed.classification).toBe("passed");
    expect(parsed.outputTruncated).toBe(true);
    expect(parsed.maxBufferExceeded).toBe(false);
    expect(parsed.outputBytesSeen).toBeGreaterThan(parsed.outputBytesRetained);
    expect(parsed.output).toContain("... (truncated)");
  });

  test("advises repo-local oc-test wrapper without rewriting command", async () => {
    const root = mkdtempSync(join(tmpdir(), "adv-run-test-"));
    const workdir = join(root, "plugin");
    mkdirSync(join(root, "bin"), { recursive: true });
    mkdirSync(workdir, { recursive: true });
    writeFileSync(join(root, "bin", "oc-test"), "#!/usr/bin/env bash\n");

    try {
      const store = createMockStore();
      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-abc",
          command: "printf direct-command; : pnpm test",
        },
        store,
        workdir,
      );

      const parsed = JSON.parse(result);
      expect(parsed.command).toBe("printf direct-command; : pnpm test");
      expect(parsed.output).toContain("direct-command");
      expect(parsed.advisories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "repo_test_wrapper_available",
            message: expect.stringContaining(
              "executed supplied command unchanged",
            ),
          }),
        ]),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not advise when caller already uses repo-local oc-test wrapper", async () => {
    const root = mkdtempSync(join(tmpdir(), "adv-run-test-"));
    const workdir = join(root, "plugin");
    mkdirSync(join(root, "bin"), { recursive: true });
    mkdirSync(workdir, { recursive: true });
    writeFileSync(
      join(root, "bin", "oc-test"),
      "#!/usr/bin/env bash\nprintf wrapper-used\n",
      { mode: 0o755 },
    );

    try {
      const store = createMockStore();
      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-abc",
          command: "../bin/oc-test targeted -- --help",
        },
        store,
        workdir,
      );

      const parsed = JSON.parse(result);
      expect(parsed.advisories).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("records adv_run_test substep telemetry phases", async () => {
    const { resetMetrics, getMetrics } = await import("../utils/metrics");
    resetMetrics();
    const store = createMockStore();

    await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "echo telemetry sample",
      },
      store,
      "/tmp",
    );

    const phases = getMetrics().recent_phase_durations.filter(
      (p) => p.tool === "adv_run_test",
    );
    const names = new Set(phases.map((p) => p.phase));
    expect(names.has("taskLookup")).toBe(true);
    expect(names.has("commandExecution")).toBe(true);
    expect(names.has("outputShaping")).toBe(true);
    for (const p of phases) {
      expect(p.duration_ms).toBeGreaterThanOrEqual(0);
    }
  });

  test("records failure outcome for command execution substep on non-zero exit", async () => {
    const { resetMetrics, getMetrics } = await import("../utils/metrics");
    resetMetrics();
    const store = createMockStore();

    await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "exit 2",
      },
      store,
      "/tmp",
    );

    const commandPhase = getMetrics()
      .recent_phase_durations.filter((p) => p.tool === "adv_run_test")
      .find((p) => p.phase === "commandExecution");
    expect(commandPhase).toBeDefined();
    expect(commandPhase?.outcome).toBe("error");
  });

  test("returns error output when command fails", async () => {
    const store = createMockStore();

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "echo error message >&2 && exit 1",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.exitCode).toBe(1);
  });

  test("returns error when task not found", async () => {
    const store = createMockStore();
    vi.mocked(store.tasks.get).mockResolvedValue(null);

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-missing",
        command: "echo test",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("Task not found");
  });

  test("truncates long output", async () => {
    const store = createMockStore();

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "node -e \"console.log('x'.repeat(3000))\"",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.output).toContain("... (truncated)");
    expect(parsed.output.length).toBeLessThan(3000);
  });

  test("preserves late failure lines in noisy failing output", () => {
    const noisyPrefix = Array.from(
      { length: 260 },
      (_, index) => `PASS src/noise-${index}.test.ts`,
    ).join("\n");
    const lateFailure =
      "src/tools/test.test.ts:42:13 expected true received false";
    const rawOutput = [
      noisyPrefix,
      lateFailure,
      "Tests: 1 failed, 259 passed",
    ].join("\n");

    const shaped = shapeCommandOutput(rawOutput, 1, 500);

    expect(shaped).toContain(lateFailure);
    expect(shaped).toContain("Tests: 1 failed, 259 passed");
    expect(shaped).toContain("... (truncated)");
    expect(shaped.length).toBeLessThanOrEqual(500 + "... (truncated)".length);
  });

  test("preserves late summary lines in noisy passing output", () => {
    const noisyPrefix = Array.from(
      { length: 260 },
      (_, index) => `PASS src/noise-${index}.test.ts`,
    ).join("\n");
    const summary = "Tests: 260 passed, 260 total";
    const rawOutput = [noisyPrefix, summary, "Duration: 12.34s"].join("\n");

    const shaped = shapeCommandOutput(rawOutput, 0, 500);

    expect(shaped).toContain(summary);
    expect(shaped).toContain("Duration: 12.34s");
    expect(shaped).toContain("... (truncated)");
  });

  test("preserves adv_run_test diagnostic prefix when shaping output", () => {
    const diagnostic =
      "[adv_run_test] Command timed out after 30000ms: pnpm test";
    const noisyBody = Array.from(
      { length: 260 },
      (_, index) => `PASS src/noise-${index}.test.ts`,
    ).join("\n");
    const rawOutput = [
      diagnostic,
      noisyBody,
      "src/tools/test.test.ts:99:1 error timeout cleanup failed",
    ].join("\n");

    const shaped = shapeCommandOutput(rawOutput, 1, 500);

    expect(shaped).toContain(diagnostic);
    expect(shaped).toContain(
      "src/tools/test.test.ts:99:1 error timeout cleanup failed",
    );
    expect(shaped).toContain("... (truncated)");
  });

  describe("shell command compatibility (AC6, DONT6)", () => {
    test("preserves pipe and metacharacter semantics through shell", async () => {
      const store = createMockStore();

      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-abc",
          command: "printf 'a\\nb\\nc\\n' | wc -l",
        },
        store,
        "/tmp",
      );

      const parsed = JSON.parse(result);
      expect(parsed.exitCode).toBe(0);
      // shell pipeline executed end-to-end; word-count returns "3"
      expect(parsed.output).toMatch(/\b3\b/);
    });

    test("captures stdout, stderr, and redirect semantics through shell", async () => {
      const store = createMockStore();

      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-abc",
          command:
            'tmp=$(mktemp) && printf redirected > "$tmp" && cat "$tmp" && rm "$tmp" && printf stderr-line >&2',
        },
        store,
        "/tmp",
      );

      const parsed = JSON.parse(result);
      expect(parsed.exitCode).toBe(0);
      expect(parsed.output).toContain("redirected");
      expect(parsed.output).toContain("stderr-line");
      expect(parsed.classification).toBe("passed");
    });

    test("does not execute command when task is missing", async () => {
      const store = createMockStore();
      vi.mocked(store.tasks.get).mockResolvedValue(null);

      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-missing",
          command: "node -e 'process.stdout.write(\"SHOULD_NOT_RUN\")'",
        },
        store,
        "/tmp",
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Task not found");
      // Output is intentionally absent because we short-circuit before exec.
      expect(parsed.output).toBeUndefined();
    });

    test("classifies SIGTERM-induced timeouts", async () => {
      const store = createMockStore();

      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-abc",
          command: "sleep 5",
        },
        store,
        "/tmp",
        { timeoutMs: 500, maxBuffer: 1024 * 1024 },
      );

      const parsed = JSON.parse(result);
      expect(parsed.timedOut).toBe(true);
      expect(parsed.passed).toBe(false);
      expect(parsed.classification).toBe("timed_out");
      expect(parsed.maxBufferExceeded).toBe(false);
      expect(parsed.output).toContain("[adv_run_test] Command timed out");
      expect(parsed.timeoutMs).toBe(500);
    });

    test("classifies max-buffer exceedance", async () => {
      const store = createMockStore();

      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-abc",
          command: "node -e \"console.log('x'.repeat(2048))\"",
        },
        store,
        "/tmp",
        { timeoutMs: 30_000, maxBuffer: 128 },
      );

      const parsed = JSON.parse(result);
      expect(parsed.maxBufferExceeded).toBe(true);
      expect(parsed.passed).toBe(false);
      expect(parsed.classification).toBe("output_limit");
      expect(parsed.outputBytesSeen).toBeGreaterThan(2000);
      expect(parsed.timedOut).toBe(false);
      expect(parsed.output).toContain(
        "[adv_run_test] Command exceeded maxBuffer",
      );
    });

    test("never caches command results — every call runs fresh subprocess", async () => {
      const store = createMockStore();

      const first = JSON.parse(
        await testTools.adv_run_test.execute(
          {
            taskId: "tk-abc",
            command: "node -e \"console.log('cache-bust-' + Date.now())\"",
          },
          store,
          "/tmp",
        ),
      );

      // Force a small delay so Date.now() changes between calls.
      await new Promise((r) => setTimeout(r, 5));

      const second = JSON.parse(
        await testTools.adv_run_test.execute(
          {
            taskId: "tk-abc",
            command: "node -e \"console.log('cache-bust-' + Date.now())\"",
          },
          store,
          "/tmp",
        ),
      );

      expect(first.output).not.toEqual(second.output);
      expect(vi.mocked(store.tasks.get)).toHaveBeenCalledTimes(2);
    });

    test("non-zero exit reports exitCode without claiming timeout", async () => {
      const store = createMockStore();

      const result = await testTools.adv_run_test.execute(
        {
          taskId: "tk-abc",
          command: "exit 7",
        },
        store,
        "/tmp",
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.exitCode).toBe(7);
      expect(parsed.passed).toBe(false);
      expect(parsed.classification).toBe("failed");
      expect(parsed.timedOut).toBe(false);
      expect(parsed.maxBufferExceeded).toBe(false);
    });
  });
});
