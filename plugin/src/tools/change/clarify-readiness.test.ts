/**
 * Bounded, best-effort clarify-readiness enrichment for change-show.
 *
 * Verifies AC1/AC3: applyClarifyReadinessToChangeOutput surfaces findings
 * without blocking the core read on slow persistence, and degrades silently
 * when persistence exceeds its budget.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import type { Change, FeatureFlags } from "../../types";
import type { Store } from "../../storage/store";

const mocks = vi.hoisted(() => ({
  runClarifyReadinessChecks: vi.fn(() => ({ findings: [] })),
}));

vi.mock("../../validator/clarify-readiness", () => ({
  runClarifyReadinessChecks: mocks.runClarifyReadinessChecks,
}));

import { applyClarifyReadinessToChangeOutput } from "./create-clarify";

function createMockStore(
  options: {
    getDelayMs?: number;
    saveDelayMs?: number;
    saveShouldHang?: boolean;
    getResult?:
      | { success: true; data: Change }
      | { success: false; error: string };
  } = {},
): Store {
  const { getDelayMs = 0, saveDelayMs = 0, saveShouldHang = false } = options;
  return {
    paths: { root: "/tmp/test", changes: "/tmp/test/.adv/changes" },
    config: { features: { clarify_enforcement: "advisory" } as FeatureFlags },
    changes: {
      get: vi.fn(async () => {
        if (getDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, getDelayMs));
        }
        return (
          options.getResult ?? {
            success: true,
            data: {
              id: "test-change",
              title: "Test Change",
              status: "active",
              tasks: [],
              clarify_findings: [],
            } as unknown as Change,
          }
        );
      }),
      save: vi.fn(async () => {
        if (saveShouldHang) {
          await new Promise<never>(() => {
            /* never resolves */
          });
        }
        if (saveDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
        }
      }),
    },
  } as unknown as Store;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyClarifyReadinessToChangeOutput", () => {
  test("surfaces new findings and returns without blocking on slow persistence", async () => {
    mocks.runClarifyReadinessChecks.mockReturnValue({
      findings: [
        {
          code: "missing-acceptance",
          severity: "warning",
          message: "Acceptance criteria are missing.",
          details: { questionCategory: "scope" },
        },
      ],
    });

    const store = createMockStore({ saveDelayMs: 50 });
    const output: Record<string, unknown> = {};
    const change: Change = {
      id: "test-change",
      title: "Test Change",
      status: "active",
      tasks: [],
      clarify_findings: [],
    } as unknown as Change;

    const start = Date.now();
    await applyClarifyReadinessToChangeOutput({
      output,
      change,
      proposalText: "",
      changeId: "test-change",
      store,
    });
    const elapsed = Date.now() - start;

    expect(output.clarifyFindings).toMatchObject({
      count: 1,
      findings: [
        {
          code: "missing-acceptance",
          severity: "warning",
          message: "Acceptance criteria are missing.",
          questionCategory: "scope",
        },
      ],
    });
    // Persistence should be best-effort and bounded; 50ms is well within budget.
    expect(elapsed).toBeLessThan(500);
    expect(store.changes.save).toHaveBeenCalled();
  });

  test("skips persistence when persist is false", async () => {
    mocks.runClarifyReadinessChecks.mockReturnValue({
      findings: [
        {
          code: "missing-acceptance",
          severity: "warning",
          message: "Acceptance criteria are missing.",
          details: { questionCategory: "scope" },
        },
      ],
    });

    const store = createMockStore();
    const output: Record<string, unknown> = {};
    const change: Change = {
      id: "test-change",
      title: "Test Change",
      status: "active",
      tasks: [],
      clarify_findings: [],
    } as unknown as Change;

    await applyClarifyReadinessToChangeOutput({
      output,
      change,
      proposalText: "",
      changeId: "test-change",
      store,
      persist: false,
    });

    expect(output.clarifyFindings).toMatchObject({
      count: 1,
      findings: [
        {
          code: "missing-acceptance",
          severity: "warning",
          message: "Acceptance criteria are missing.",
          questionCategory: "scope",
        },
      ],
    });
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("does not throw and still surfaces findings when persistence times out", async () => {
    mocks.runClarifyReadinessChecks.mockReturnValue({
      findings: [
        {
          code: "ambiguous-scope",
          severity: "error",
          message: "Scope is ambiguous.",
          details: { questionCategory: "scope" },
        },
      ],
    });

    const store = createMockStore({ saveShouldHang: true });
    const output: Record<string, unknown> = {};
    const change: Change = {
      id: "test-change",
      title: "Test Change",
      status: "active",
      tasks: [],
      clarify_findings: [],
    } as unknown as Change;

    await expect(
      applyClarifyReadinessToChangeOutput({
        output,
        change,
        proposalText: "",
        changeId: "test-change",
        store,
      }),
    ).resolves.toBeUndefined();

    expect(output.clarifyFindings).toMatchObject({
      count: 1,
      findings: [
        {
          code: "ambiguous-scope",
          severity: "error",
          message: "Scope is ambiguous.",
        },
      ],
    });
  });
});
