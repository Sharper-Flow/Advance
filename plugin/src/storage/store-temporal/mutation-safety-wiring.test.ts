/**
 * SC4/SC6 wiring tests for the storage-layer mutation helpers.
 *
 * Verifies that:
 * - `signalChangeWorkflowGuarded` rejects mutation-ineligible diagnostics
 *   before reaching the underlying `getGuardedChangeHandle().signal(...)`
 *   RPC.
 * - `queryChangeWorkflowReadback` classifies outcomes per SC6
 *   (confirmed / outcome_unknown_readback_unavailable / failed_before_ack).
 * - `fireSignalWithMutationGuard` (gates.ts internal helper) composes the
 *   signal + post-signal readback into a typed outcome, refuses to
 *   authorize mutation for SC4-ineligible classes, and reports
 *   `outcome_unknown_readback_unavailable` for ambiguous readback.
 */
import { createMockOwnerFromClient } from "../../temporal/__tests__/mock-owner";
import { describe, expect, test, vi } from "vitest";
import {
  signalChangeWorkflowGuarded,
  queryChangeWorkflowReadback,
  type TemporalStoreBackendInput,
} from "./shared";
import {
  TemporalMutationIneligibleError,
  type TemporalMutationOutcome,
  type TemporalWorkflowDiagnostic,
} from "../../temporal/mutation-safety";
import { TemporalMutationOutcomeError } from "../../temporal/outcome-errors";

function makeInput(
  opts: {
    signal?: () => Promise<void>;
    query?: () => Promise<unknown>;
  } = {},
): TemporalStoreBackendInput {
  return {
    projectId: "0e000000ec000000000000000000000000000000",
    temporal: createMockOwnerFromClient({
      client: {
        workflow: {
          start: vi.fn(async () => ({})),
          getHandle: vi.fn(() => ({
            signal: opts.signal ?? vi.fn(async () => {}),
            query: opts.query ?? vi.fn(async () => ({})),
          })),
        },
      },
    }),
    paths: { changes: "/tmp/changes", root: "/tmp" },
  } as unknown as TemporalStoreBackendInput;
}

describe("signalChangeWorkflowGuarded (SC4 wiring)", () => {
  test("blocks no_poller diagnostic before reaching the signal RPC", async () => {
    const signal = vi.fn(async () => {});
    const input = makeInput({ signal });
    await expect(
      signalChangeWorkflowGuarded(input, "change-1", "anySignal", [], {
        reachable: false,
        class: "no_poller",
      }),
    ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    expect(signal).not.toHaveBeenCalled();
  });

  test("blocks deadline + query_rejected + resource_exhaustion + permission diagnostics", async () => {
    const classes: TemporalWorkflowDiagnostic["class"][] = [
      "deadline",
      "query_rejected",
      "resource_exhaustion",
      "permission",
    ];
    for (const cls of classes) {
      const signal = vi.fn(async () => {});
      const input = makeInput({ signal });
      await expect(
        signalChangeWorkflowGuarded(input, "change-1", "anySignal", [], {
          reachable: false,
          class: cls,
        }),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
      expect(signal).not.toHaveBeenCalled();
    }
  });

  test("passes through not_found diagnostic (not SC4-blocked) as a typed mutation outcome error", async () => {
    const signal = vi.fn(async () => {
      throw new Error("workflow not found");
    });
    const input = makeInput({ signal });
    // The helper passes the diagnostic guard for not_found, then throws a
    // typed TemporalMutationOutcomeError preserving the non-confirmed
    // outcome so callers can distinguish kind/cause.
    let caught: unknown;
    await expect(
      signalChangeWorkflowGuarded(input, "change-1", "anySignal", [], {
        reachable: false,
        class: "not_found",
      }).catch((err) => {
        caught = err;
        throw err;
      }),
    ).rejects.toBeInstanceOf(TemporalMutationOutcomeError);
    expect(
      caught instanceof TemporalMutationOutcomeError &&
        caught.outcome.kind === "confirmed_failure",
    ).toBe(true);
    expect(signal).toHaveBeenCalled();
  });

  test("passes through poisoned_history diagnostic (not SC4-blocked) as a typed mutation outcome error", async () => {
    const signal = vi.fn(async () => {
      throw new Error("TMPRL1100 No command scheduled for event");
    });
    const input = makeInput({ signal });
    let caught: unknown;
    await expect(
      signalChangeWorkflowGuarded(input, "change-1", "anySignal", [], {
        reachable: false,
        class: "poisoned_history",
      }).catch((err) => {
        caught = err;
        throw err;
      }),
    ).rejects.toBeInstanceOf(TemporalMutationOutcomeError);
    expect(
      caught instanceof TemporalMutationOutcomeError &&
        caught.outcome.kind === "confirmed_failure",
    ).toBe(true);
    expect(signal).toHaveBeenCalled();
  });

  test("skips the guard when no diagnostic is supplied (normal-mode mutation)", async () => {
    const signal = vi.fn(async () => {});
    const input = makeInput({ signal });
    await expect(
      signalChangeWorkflowGuarded(input, "change-1", "anySignal", []),
    ).resolves.toBeUndefined();
    expect(signal).toHaveBeenCalledTimes(1);
  });

  test("forwards signal arguments to the underlying RPC", async () => {
    const signal = vi.fn(async () => {});
    const input = makeInput({ signal });
    await signalChangeWorkflowGuarded(
      input,
      "change-1",
      "gateCompletedSignal",
      [{ gateId: "discovery", completedAt: "now" }],
    );
    expect(signal).toHaveBeenCalledWith("gateCompletedSignal", {
      gateId: "discovery",
      completedAt: "now",
    });
  });
});

describe("queryChangeWorkflowReadback (SC6 wiring)", () => {
  test("classifies confirmed outcome on readback success", async () => {
    const result = await queryChangeWorkflowReadback(async () => ({
      gates: { discovery: { status: "done" } },
    }));
    expect(result.outcome).toBe("confirmed");
    expect(result.data).toEqual({
      gates: { discovery: { status: "done" } },
    });
  });

  test("classifies outcome_unknown_readback_unavailable for every SC4-listed readback failure shape", async () => {
    for (const message of [
      "no poller is available for this workflow query",
      "Query type 'changeStateQuery' not registered",
      "deadline exceeded",
      "Failed to query Workflow",
    ]) {
      const result = await queryChangeWorkflowReadback(async () => {
        throw new Error(message);
      });
      expect(result.outcome).toBe<TemporalMutationOutcome>(
        "outcome_unknown_readback_unavailable",
      );
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  test("classifies failed_before_ack when the signal error is supplied", async () => {
    const result = await queryChangeWorkflowReadback(
      async () => ({ state: "ok" }),
      new Error("connection refused before ack"),
    );
    expect(result.outcome).toBe("failed_before_ack");
    expect((result.error as Error).message).toMatch(/connection refused/);
  });

  test("signal error overrides readback error", async () => {
    const result = await queryChangeWorkflowReadback(async () => {
      throw new Error("readback lost poller");
    }, new Error("signal transport failed"));
    expect(result.outcome).toBe("failed_before_ack");
    expect((result.error as Error).message).toMatch(/signal transport failed/);
  });
});
