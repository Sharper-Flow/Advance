import { describe, expect, it, vi } from "vitest";
import type { Store } from "../storage/store";
import {
  runParityScenarios,
  type ParityMismatch,
  type SpecScenario,
} from "./parity-harness";

function makeStore(): Store {
  return {
    close: vi.fn(),
  } as unknown as Store & { close: ReturnType<typeof vi.fn> };
}

describe("parity harness scaffold", () => {
  it("returns PASS when legacy and temporal results are deep-equal", async () => {
    const legacy = makeStore();
    const temporal = makeStore();
    const scenario: SpecScenario<{ value: number }> = {
      id: "scn-equal",
      title: "equal scenario",
      run: async ({ backend }) => ({ value: backend === "legacy" ? 1 : 1 }),
    };

    const result = await runParityScenarios({
      projectDir: "/tmp/project",
      scenarios: [scenario],
      createLegacyStore: async () => legacy,
      createTemporalStore: async () => temporal,
      createTestWorkflowEnvironment: async () => ({ teardown: vi.fn() }),
    });

    expect(result.summary.total).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.results[0]?.status).toBe("PASS");
  });

  it("returns FAIL with structured mismatches when results differ", async () => {
    const legacy = makeStore();
    const temporal = makeStore();
    const scenario: SpecScenario<{ value: number }> = {
      id: "scn-diff",
      title: "different scenario",
      run: async ({ backend }) => ({ value: backend === "legacy" ? 1 : 2 }),
    };

    const result = await runParityScenarios({
      projectDir: "/tmp/project",
      scenarios: [scenario],
      createLegacyStore: async () => legacy,
      createTemporalStore: async () => temporal,
      createTestWorkflowEnvironment: async () => ({ teardown: vi.fn() }),
    });

    expect(result.summary.failed).toBe(1);
    expect(result.results[0]?.status).toBe("FAIL");
    expect(result.results[0]?.mismatches[0]).toMatchObject({
      path: "value",
      legacy: 1,
      temporal: 2,
    } satisfies ParityMismatch);
  });

  it("creates a TestWorkflowEnvironment and tears it down once per run", async () => {
    const legacy = makeStore();
    const temporal = makeStore();
    const teardown = vi.fn(async () => {});
    const createEnv = vi.fn(async () => ({ teardown }));
    const createTemporal = vi.fn(async () => temporal);

    await runParityScenarios({
      projectDir: "/tmp/project",
      scenarios: [
        {
          id: "scn-env",
          title: "env scenario",
          run: async () => ({ ok: true }),
        },
      ],
      createLegacyStore: async () => legacy,
      createTemporalStore: createTemporal,
      createTestWorkflowEnvironment: createEnv,
    });

    expect(createEnv).toHaveBeenCalledTimes(1);
    expect(createTemporal).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("allows custom compare function per scenario", async () => {
    const legacy = makeStore();
    const temporal = makeStore();
    const scenario: SpecScenario<{ ts: string }> = {
      id: "scn-custom",
      title: "custom compare",
      run: async ({ backend }) => ({
        ts:
          backend === "legacy"
            ? "2026-01-01T00:00:00.000Z"
            : "2026-01-02T00:00:00.000Z",
      }),
      compare: () => [],
    };

    const result = await runParityScenarios({
      projectDir: "/tmp/project",
      scenarios: [scenario],
      createLegacyStore: async () => legacy,
      createTemporalStore: async () => temporal,
      createTestWorkflowEnvironment: async () => ({ teardown: vi.fn() }),
    });

    expect(result.results[0]?.status).toBe("PASS");
    expect(result.results[0]?.mismatches).toEqual([]);
  });
});
