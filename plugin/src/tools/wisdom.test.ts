/**
 * Wisdom Tools — rq-cacheRefresh01 contract test.
 *
 * Pins the centralizemutationcacherefresh migration contract:
 * `adv_wisdom_add` MUST use `fireSignalAndRefresh` (not raw `fireSignal`)
 * so the in-memory `changeCache` is invalidated after the wisdom signal
 * fires. Without this, subsequent reads in the same session return stale
 * state (the original silent-stale-cache bug class fixed by this change).
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { wisdomTools } from "./wisdom";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => {
  const signal = vi.fn(async () => {});
  const query = vi.fn(async () => undefined);
  const handle = { signal, query };
  return {
    signal,
    query,
    handle,
    getService: vi.fn(() => ({
      client: { workflow: { getHandle: vi.fn(() => handle) } },
    })),
    fireSignal: vi.fn(async () => {}),
    fireSignalAndRefresh: vi.fn(async () => {}),
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handle),
  };
});

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: vi.fn(async () => "test-project-id"),
  };
});

vi.mock("./_adapters", () => ({
  fireSignal: mocks.fireSignal,
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
}));

function createMockStore(): Store {
  return {
    paths: {
      root: "/tmp/fake-root",
      external: "/tmp/fake-external",
      changes: "/tmp/fake-changes",
      archive: "/tmp/fake-archive",
      wisdom: "/tmp/fake-wisdom.jsonl",
      agenda: "/tmp/fake-agenda.jsonl",
    },
    wisdom: {
      // Used as a fallback when Temporal handle is unavailable; mocked here
      // because the Temporal path is what we care about for this test.
      add: vi.fn(async () => undefined),
    },
    changes: {
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

describe("adv_wisdom_add — rq-cacheRefresh01 contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("uses fireSignalAndRefresh (not raw fireSignal) so cache is invalidated after signal", async () => {
    const store = createMockStore();

    await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-test",
        type: "pattern",
        content: "test wisdom entry",
      },
      store,
    );

    // Contract: tool MUST use the centralized helper that pairs signal
    // firing with cache refresh in one atomic call. Direct fireSignal
    // bypasses the cache invalidation — that is the bug class this
    // migration closes.
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
      mocks.handle,
      store,
      "chg-test",
      expect.objectContaining({ name: expect.any(String) }),
      expect.objectContaining({
        entry: expect.objectContaining({
          type: "pattern",
          content: "test wisdom entry",
        }),
      }),
    );

    // Negative assertion: the raw fireSignal helper MUST NOT be used
    // for change-associated signals (rq-cacheRefresh01-exempt only
    // applies to signals without a changeId — none currently exist).
    expect(mocks.fireSignal).not.toHaveBeenCalled();
  });
});
