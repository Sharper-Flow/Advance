/**
 * SC4/SC6 wiring tests for the tool-layer signal adapters.
 *
 * Verifies that the helpers exported from `_adapters.ts`:
 * - `fireSignalGuarded` rejects mutation-ineligible diagnostics.
 * - `fireSignalAndRefreshGuarded` rejects mutation-ineligible diagnostics.
 * - `runPostSignalReadback` classifies outcomes per SC6 (confirmed /
 *   outcome_unknown_readback_unavailable / failed_before_ack).
 *
 * The signals themselves are intercepted via a fake WorkflowHandleLike so
 * the tests do NOT require a live Temporal connection.
 */
import { describe, expect, test, vi } from "vitest";
import {
  fireSignalGuarded,
  fireSignalAndRefreshGuarded,
  runPostSignalReadback,
} from "./_adapters";
import { TemporalMutationIneligibleError } from "../temporal/mutation-safety";

function makeHandle(
  overrides: {
    signal?: () => Promise<void>;
    query?: () => Promise<unknown>;
  } = {},
) {
  return {
    signal: overrides.signal ?? vi.fn(async () => {}),
    query: overrides.query ?? vi.fn(async () => ({})),
  } as unknown as import("../storage/store-temporal/shared").WorkflowHandleLike;
}

function makeStore() {
  return {
    changes: {
      refresh: vi.fn(async () => {}),
    },
  } as unknown as import("../storage/store").Store;
}

describe("fireSignalGuarded (SC4 wiring)", () => {
  test("blocks no_poller diagnostic before reaching the signal RPC", async () => {
    const signal = vi.fn(async () => {});
    const handle = makeHandle({ signal });
    await expect(
      fireSignalGuarded(
        handle,
        { reachable: false, class: "no_poller", evidence: "no poller" },
        "anySignal",
      ),
    ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    expect(signal).not.toHaveBeenCalled();
  });

  test("blocks deadline diagnostic", async () => {
    const signal = vi.fn(async () => {});
    const handle = makeHandle({ signal });
    await expect(
      fireSignalGuarded(
        handle,
        { reachable: false, class: "deadline", evidence: "deadline exceeded" },
        "anySignal",
      ),
    ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    expect(signal).not.toHaveBeenCalled();
  });

  test("blocks unregistered-query diagnostic", async () => {
    const signal = vi.fn(async () => {});
    const handle = makeHandle({ signal });
    await expect(
      fireSignalGuarded(
        handle,
        {
          reachable: false,
          class: "query_failed_or_not_registered",
          evidence: "Query type 'foo' not registered",
        },
        "anySignal",
      ),
    ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    expect(signal).not.toHaveBeenCalled();
  });

  test("blocks unknown diagnostic", async () => {
    const signal = vi.fn(async () => {});
    const handle = makeHandle({ signal });
    await expect(
      fireSignalGuarded(
        handle,
        { reachable: false, class: "unknown" },
        "anySignal",
      ),
    ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    expect(signal).not.toHaveBeenCalled();
  });

  test("allows reachable diagnostic to reach the signal RPC", async () => {
    const signal = vi.fn(async () => {});
    const handle = makeHandle({ signal });
    await expect(
      fireSignalGuarded(
        handle,
        { reachable: true, class: "reachable" },
        "anySignal",
        "arg1",
      ),
    ).resolves.toBeUndefined();
    expect(signal).toHaveBeenCalledTimes(1);
    expect(signal).toHaveBeenCalledWith("anySignal", "arg1");
  });
});

describe("fireSignalAndRefreshGuarded (SC4 wiring)", () => {
  test("blocks mutation-ineligible diagnostic BEFORE the signal AND before the refresh", async () => {
    const signal = vi.fn(async () => {});
    const handle = makeHandle({ signal });
    const store = makeStore();
    await expect(
      fireSignalAndRefreshGuarded(
        handle,
        store,
        "change-1",
        { reachable: false, class: "no_poller" },
        "anySignal",
      ),
    ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    expect(signal).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  test("allows reachable diagnostic; signal fires AND refresh runs", async () => {
    const signal = vi.fn(async () => {});
    const handle = makeHandle({ signal });
    const store = makeStore();
    await expect(
      fireSignalAndRefreshGuarded(
        handle,
        store,
        "change-1",
        { reachable: true, class: "reachable" },
        "anySignal",
        { payload: 1 },
      ),
    ).resolves.toBeUndefined();
    expect(signal).toHaveBeenCalledTimes(1);
    expect(store.changes.refresh).toHaveBeenCalledWith("change-1");
  });
});

describe("runPostSignalReadback (SC6 wiring)", () => {
  test("classifies confirmed outcome on readback success", async () => {
    const result = await runPostSignalReadback(async () => ({ ok: true }));
    expect(result.outcome).toBe("confirmed");
    expect(result.data).toEqual({ ok: true });
    expect(result.error).toBeUndefined();
  });

  test("classifies outcome_unknown_readback_unavailable on any readback failure", async () => {
    for (const message of [
      "no poller is available for this workflow query",
      "Query type 'changeStateQuery' not registered",
      "deadline exceeded",
      "Failed to query Workflow",
      "query rejected",
    ]) {
      const result = await runPostSignalReadback(async () => {
        throw new Error(message);
      });
      expect(result.outcome).toBe("outcome_unknown_readback_unavailable");
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  test("classifies failed_before_ack when a signal error is supplied alongside readback success", async () => {
    const result = await runPostSignalReadback(
      async () => ({ ok: true }),
      new Error("signal connection refused"),
    );
    expect(result.outcome).toBe("failed_before_ack");
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toMatch(/connection refused/);
  });

  test("classifies failed_before_ack when a signal error is supplied alongside readback failure", async () => {
    const result = await runPostSignalReadback(async () => {
      throw new Error("readback failed");
    }, new Error("signal failed before ack"));
    expect(result.outcome).toBe("failed_before_ack");
    expect((result.error as Error).message).toMatch(/signal failed before ack/);
  });
});
