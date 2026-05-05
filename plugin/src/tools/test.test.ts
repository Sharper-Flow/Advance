/**
 * Test Tool — Simplified adv_run_test Tests
 *
 * Verifies that adv_run_test runs shell commands and returns results
 * without workflow involvement or phase parameter.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { testTools } from "./test";
import type { Store } from "../storage/store";

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
  });

  test("runs command and returns result without phase", async () => {
    const store = createMockStore();

    const result = await testTools.adv_run_test.execute(
      {
        taskId: "tk-abc",
        command: "echo test output",
      },
      store,
      "/tmp",
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.output).toContain("test output");
    expect(parsed.phase).toBeUndefined();
    expect(parsed.command).toBe("echo test output");
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
});
