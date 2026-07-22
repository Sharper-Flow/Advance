/**
 * Tests for verifyStatusRepairReadAfterWrite lifecycleState extension
 * (rq-shippedWorkflowTermination01 D6).
 *
 * The `requireLifecycleState` flag adds a `showLifecycleState === "archived"`
 * assertion alongside the existing `showStatus === "archived"` check. Existing
 * callers (internal recovery writers) omit the flag and retain status-only
 * semantics.
 */

import { describe, expect, it, vi } from "vitest";
import { verifyStatusRepairReadAfterWrite } from "./recovery";
import type { Change, Store } from "../../types";

function makeStore(options: {
  showChange?: Change | null;
  inFlightChanges?: Change[];
  archivedChanges?: Change[];
  throws?: boolean;
}): Store {
  const {
    showChange = null,
    inFlightChanges = [],
    archivedChanges = [],
    throws = false,
  } = options;
  return {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
      archive: "/tmp/test/.adv/archive",
    },
    changes: {
      get: vi.fn(async () => {
        if (throws) throw new Error("store get exploded");
        return showChange
          ? { success: true, data: showChange }
          : { success: true, data: null };
      }),
      // The readback helper calls list() twice: once for in-flight (no status
      // filter or {}) and once for archived ({status:"archived"}). The mock
      // distinguishes via the query argument so counts reflect intent.
      list: vi.fn(async (query: unknown) => {
        const q = query as { status?: string } | null;
        if (q && q.status === "archived") {
          return { changes: archivedChanges };
        }
        return { changes: inFlightChanges };
      }),
      save: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "fixWorkflowReliabilityDefects",
    title: "Fix workflow reliability defects",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    ...overrides,
  } as Change;
}

describe("verifyStatusRepairReadAfterWrite — lifecycleState extension", () => {
  it("returns ok:true when status AND lifecycleState are archived (requireLifecycleState:true)", async () => {
    const change = makeChange({
      status: "archived",
      lifecycleState: "archived",
    });
    const store = makeStore({
      showChange: change,
      inFlightChanges: [],
      archivedChanges: [change],
    });

    const result = await verifyStatusRepairReadAfterWrite({
      store,
      changeId: "fixWorkflowReliabilityDefects",
      requireLifecycleState: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.readback.showStatus).toBe("archived");
      expect(result.readback.showLifecycleState).toBe("archived");
      expect(result.readback.inFlightCount).toBe(0);
      expect(result.readback.archivedCount).toBe(1);
    }
  });

  it("returns ok:false with lifecycleState failure when stale open literal survives (requireLifecycleState:true)", async () => {
    // status:"archived" but lifecycleState:"open" — the bug D5/D6 fixes.
    const change = makeChange({ status: "archived", lifecycleState: "open" });
    const store = makeStore({
      showChange: change,
      inFlightChanges: [],
      archivedChanges: [change],
    });

    const result = await verifyStatusRepairReadAfterWrite({
      store,
      changeId: "fixWorkflowReliabilityDefects",
      requireLifecycleState: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("lifecycleState");
      expect(result.error).toContain("open");
      expect(result.readback.showLifecycleState).toBe("open");
      expect(result.readback.showStatus).toBe("archived");
    }
  });

  it("returns ok:false when lifecycleState is missing (requireLifecycleState:true)", async () => {
    const change = makeChange({ status: "archived" });
    // lifecycleState undefined
    delete (change as Partial<Change>).lifecycleState;
    const store = makeStore({
      showChange: change,
      inFlightChanges: [],
      archivedChanges: [change],
    });

    const result = await verifyStatusRepairReadAfterWrite({
      store,
      changeId: "fixWorkflowReliabilityDefects",
      requireLifecycleState: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("lifecycleState");
      expect(result.error).toContain("missing");
    }
  });

  it("omits lifecycleState assertion when requireLifecycleState is not set (backward compat)", async () => {
    // status:"archived" but lifecycleState:"open" — old status-repair semantics
    // don't care about lifecycleState.
    const change = makeChange({ status: "archived", lifecycleState: "open" });
    const store = makeStore({
      showChange: change,
      inFlightChanges: [],
      archivedChanges: [change],
    });

    const result = await verifyStatusRepairReadAfterWrite({
      store,
      changeId: "fixWorkflowReliabilityDefects",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The field is still surfaced in readback for visibility, but no
      // assertion is applied.
      expect(result.readback.showLifecycleState).toBe("open");
      expect(result.readback.showStatus).toBe("archived");
    }
  });

  it("always surfaces showLifecycleState in readback regardless of flag", async () => {
    const change = makeChange({
      status: "archived",
      lifecycleState: "archived",
    });
    const store = makeStore({
      showChange: change,
      inFlightChanges: [],
      archivedChanges: [change],
    });

    const result = await verifyStatusRepairReadAfterWrite({
      store,
      changeId: "fixWorkflowReliabilityDefects",
      // No requireLifecycleState.
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.readback.showLifecycleState).toBe("archived");
    }
  });

  it("still fails when status is not archived (regression of existing behavior)", async () => {
    const change = makeChange({ status: "draft", lifecycleState: "open" });
    const store = makeStore({
      showChange: change,
      inFlightChanges: [change],
      archivedChanges: [],
    });

    const result = await verifyStatusRepairReadAfterWrite({
      store,
      changeId: "fixWorkflowReliabilityDefects",
      requireLifecycleState: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Both status and lifecycleState failures surface in the error.
      expect(result.error).toContain("status");
      expect(result.error).toContain("lifecycleState");
    }
  });
});
