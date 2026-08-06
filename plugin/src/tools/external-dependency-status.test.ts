/**
 * Bounded, best-effort external-dependency enrichment for change-show.
 *
 * Verifies AC1/AC3: external-dependency status enrichment is capped by
 * per-item and total timeouts, bounded concurrency, and degrades gracefully
 * without breaking the core change read.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const stores: Array<{
    close: ReturnType<typeof vi.fn>;
    changes: {
      get: ReturnType<typeof vi.fn>;
    };
  }> = [];
  return {
    validateCrossRepoTarget: vi.fn(async () => ({ ok: true }) as const),
    createDiskStore: vi.fn(async (_path: string, _options?: unknown) => {
      const store = {
        close: vi.fn(),
        changes: {
          get: vi.fn(async () => ({
            success: true,
            data: {
              id: "target-change",
              title: "Target Change",
              status: "active",
              gates: {
                proposal: { status: "done" },
                discovery: { status: "done" },
                design: { status: "done" },
                planning: { status: "done" },
                execution: { status: "done" },
                acceptance: { status: "done" },
                release: { status: "done" },
              },
              tasks: [],
            },
          })),
        },
      };
      stores.push(store);
      return store;
    }),
    stores,
    getProjectId: vi.fn(async () => "test-project-id"),
    getExternalRootForProject: vi.fn(() => "/external-root"),
  };
});

vi.mock("./target-project", () => ({
  validateCrossRepoTarget: mocks.validateCrossRepoTarget,
}));

vi.mock("../storage/store-disk", () => ({
  createDiskStore: mocks.createDiskStore,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
    getExternalRootForProject: mocks.getExternalRootForProject,
  };
});

import { buildExternalDependencyStatus } from "./external-dependency-status";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stores.length = 0;
});

describe("buildExternalDependencyStatus", () => {
  test("returns undefined when no dependencies", async () => {
    const result = await buildExternalDependencyStatus(undefined);
    expect(result).toBeUndefined();
  });

  test("returns satisfied status for a found target change", async () => {
    const result = await buildExternalDependencyStatus([
      {
        target_path: "/repo/other",
        changeId: "target-change",
        relationship: "follow_up",
        advisory: true,
      },
    ]);

    expect(result).toBeDefined();
    expect(result?.summary).toMatchObject({
      total: 1,
      satisfied: 1,
      warning: 0,
      blocking: 0,
      advisoryOnly: true,
    });
    expect(result?.dependencies[0].status).toBe("satisfied");
  });

  test("degrades a single slow dependency to warning with bounded per-item timeout", async () => {
    mocks.createDiskStore.mockImplementationOnce(async () => {
      const store = {
        close: vi.fn(),
        changes: {
          get: vi.fn(
            async () =>
              new Promise<never>((_resolve) => {
                /* never resolves */
              }),
          ),
        },
      };
      mocks.stores.push(store);
      return store;
    });

    const result = await buildExternalDependencyStatus(
      [
        {
          target_path: "/repo/slow",
          changeId: "slow-change",
          relationship: "follow_up",
          advisory: true,
        },
      ],
      { perItemTimeoutMs: 50, totalTimeoutMs: 500, concurrency: 4 },
    );

    expect(result).toBeDefined();
    expect(result?.summary).toMatchObject({
      total: 1,
      satisfied: 0,
      warning: 1,
      blocking: 0,
    });
    expect(result?.dependencies[0].status).toBe("warning");
    expect(result?.dependencies[0].message).toMatch(/timed out/i);
  });

  test("processes many dependencies with bounded concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    mocks.createDiskStore.mockImplementation(async () => {
      const store = {
        close: vi.fn(),
        changes: {
          get: vi.fn(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 50));
            inFlight--;
            return {
              success: true,
              data: {
                id: "target-change",
                status: "active",
                gates: {
                  proposal: { status: "done" },
                  discovery: { status: "done" },
                  design: { status: "done" },
                  planning: { status: "done" },
                  execution: { status: "done" },
                  acceptance: { status: "done" },
                  release: { status: "done" },
                },
                tasks: [],
              },
            };
          }),
        },
      };
      mocks.stores.push(store);
      return store;
    });

    const dependencies = Array.from({ length: 8 }, (_, i) => ({
      target_path: `/repo/dep-${i}`,
      changeId: `target-change-${i}`,
      relationship: "follow_up" as const,
      advisory: true,
    }));

    const start = Date.now();
    const result = await buildExternalDependencyStatus(dependencies, {
      concurrency: 4,
      perItemTimeoutMs: 500,
      totalTimeoutMs: 5000,
    });
    const elapsed = Date.now() - start;

    expect(result).toBeDefined();
    expect(result?.summary.total).toBe(8);
    expect(result?.summary.satisfied).toBe(8);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    // 8 items * 50ms / 4 workers = 100ms floor; allow some scheduling overhead.
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThan(400);
  });

  test("preserves satisfied results when total budget expires", async () => {
    let callCount = 0;
    mocks.createDiskStore.mockImplementation(async () => {
      const thisCall = ++callCount;
      const store = {
        close: vi.fn(),
        changes: {
          get: vi.fn(async () => {
            if (thisCall === 1) {
              return {
                success: true,
                data: {
                  id: "target-change",
                  status: "active",
                  gates: {
                    proposal: { status: "done" },
                    discovery: { status: "done" },
                    design: { status: "done" },
                    planning: { status: "done" },
                    execution: { status: "done" },
                    acceptance: { status: "done" },
                    release: { status: "done" },
                  },
                  tasks: [],
                },
              };
            }
            return new Promise<never>((_resolve) => {
              /* never resolves */
            });
          }),
        },
      };
      mocks.stores.push(store);
      return store;
    });

    const dependencies = [
      {
        target_path: "/repo/fast",
        changeId: "fast-change",
        relationship: "follow_up" as const,
        advisory: true,
      },
      {
        target_path: "/repo/slow",
        changeId: "slow-change",
        relationship: "follow_up" as const,
        advisory: true,
      },
    ];

    const result = await buildExternalDependencyStatus(dependencies, {
      concurrency: 2,
      perItemTimeoutMs: 1_000,
      totalTimeoutMs: 100,
    });

    expect(result).toBeDefined();
    expect(result?.summary).toMatchObject({
      total: 2,
      satisfied: 1,
      warning: 1,
      blocking: 0,
      advisoryOnly: true,
    });
    expect(result?.dependencies[0].status).toBe("satisfied");
    expect(result?.dependencies[1].status).toBe("warning");
    expect(result?.note).toMatch(/partial/i);
  });
});
