/**
 * Terminal-workflow reconciliation.
 *
 * Production evidence motivating this: 56 of 79 RUNNING change workflows
 * belonged to already-archived changes, because `adv_change_archive`'s
 * `recover_via_disk` fallback converges disk state without ever firing the
 * terminal signal.
 *
 * Completing a workflow is irreversible, so the safety vetoes below are the
 * most important assertions in this file — a false positive without bundle
 * evidence would complete a non-terminal change out from under the user.
 */
import { describe, expect, it, vi } from "vitest";
import {
  reconcileTerminalWorkflows,
  type TerminalReconcileDeps,
} from "./reconcile-terminal-workflows";
import {
  activeChangeIdsFromStatuses,
  archiveDirToChangeId,
  isTerminalChangeStatus,
  terminalChangeIdsFromStatuses,
} from "./reconcile-terminal-deps";
import { createMockOwnerFromClient } from "./__tests__/mock-owner";
import type { TemporalOperations } from "./operations";

const PROJECT = "0".repeat(40);
const WF = (changeId: string) => `adv/change/${PROJECT}/${changeId}`;

function client(
  entries: Array<{ workflowId: string; status?: string }>,
  terminate: () => Promise<void> = vi.fn(async () => {}),
): TemporalOperations {
  return createMockOwnerFromClient({
    client: {
      workflow: {
        list: () =>
          (async function* () {
            for (const e of entries) {
              yield {
                workflowId: e.workflowId,
                status: { name: e.status ?? "RUNNING" },
              };
            }
          })(),
        terminate,
      },
    },
  });
}

function deps(
  over: Partial<TerminalReconcileDeps> = {},
): TerminalReconcileDeps {
  return {
    listArchivedChangeIds: async () => new Set<string>(),
    listActiveChangeIds: async () => new Set<string>(),
    fireTerminal: vi.fn(async () => {}),
    ...over,
  };
}

describe("reconcileTerminalWorkflows", () => {
  it("completes a RUNNING workflow whose change is archived on disk", async () => {
    const fireTerminal = vi.fn(async () => {});
    const terminate = vi.fn(async () => {});
    const result = await reconcileTerminalWorkflows(
      client([{ workflowId: WF("archivedOne") }], terminate),
      PROJECT,
      deps({
        listArchivedChangeIds: async () => new Set(["archivedOne"]),
        fireTerminal,
      }),
    );

    expect(fireTerminal).toHaveBeenCalledWith("archivedOne");
    expect(terminate).not.toHaveBeenCalled();
    expect(result.reconciled).toEqual(["archivedOne"]);
    expect(result.failed).toEqual([]);
  });

  it("lets archive evidence outrank a stale non-terminal disk projection", async () => {
    const fireTerminal = vi.fn(async () => {});
    const result = await reconcileTerminalWorkflows(
      client([{ workflowId: WF("reopened") }]),
      PROJECT,
      deps({
        // The disk projection can lag the merged archive bundle. Bundle
        // evidence is authoritative for this reconciliation path.
        listArchivedChangeIds: async () => new Set(["reopened"]),
        listActiveChangeIds: async () => new Set(["reopened"]),
        fireTerminal,
      }),
    );

    expect(fireTerminal).toHaveBeenCalledWith("reopened");
    expect(result.reconciled).toEqual(["reopened"]);
    expect(result.skipped).toEqual([]);
  });

  it("vetoes a stale non-terminal disk projection when no archive evidence exists", async () => {
    const fireTerminal = vi.fn(async () => {});
    const result = await reconcileTerminalWorkflows(
      client([{ workflowId: WF("stillDrafting") }]),
      PROJECT,
      deps({
        listActiveChangeIds: async () => new Set(["stillDrafting"]),
        fireTerminal,
      }),
    );

    expect(fireTerminal).not.toHaveBeenCalled();
    expect(result.reconciled).toEqual([]);
    expect(result.skipped).toEqual([
      { changeId: "stillDrafting", reason: "still_active" },
    ]);
  });

  it("requires positive archive evidence — absence is not evidence", async () => {
    const fireTerminal = vi.fn(async () => {});
    const result = await reconcileTerminalWorkflows(
      client([{ workflowId: WF("unknownChange") }]),
      PROJECT,
      deps({
        // Some other change is archived, so the sweep runs, but not this one.
        listArchivedChangeIds: async () => new Set(["somethingElse"]),
        fireTerminal,
      }),
    );

    expect(fireTerminal).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([
      { changeId: "unknownChange", reason: "no_archive_evidence" },
    ]);
  });

  it("ignores workflows that are not RUNNING", async () => {
    const fireTerminal = vi.fn(async () => {});
    const result = await reconcileTerminalWorkflows(
      client([{ workflowId: WF("done"), status: "COMPLETED" }]),
      PROJECT,
      deps({
        listArchivedChangeIds: async () => new Set(["done"]),
        fireTerminal,
      }),
    );

    expect(fireTerminal).not.toHaveBeenCalled();
    expect(result.inspected).toBe(0);
  });

  it("ignores workflows outside the change namespace", async () => {
    const fireTerminal = vi.fn(async () => {});
    const result = await reconcileTerminalWorkflows(
      client([
        { workflowId: `adv/epic/${PROJECT}/someEpic` },
        { workflowId: `adv/change/otherProject/someChange` },
      ]),
      PROJECT,
      deps({
        listArchivedChangeIds: async () => new Set(["someEpic", "someChange"]),
        fireTerminal,
      }),
    );

    expect(fireTerminal).not.toHaveBeenCalled();
    expect(result.inspected).toBe(0);
  });

  it("ignores nested workflow ids that are not a bare change id", async () => {
    const fireTerminal = vi.fn(async () => {});
    await reconcileTerminalWorkflows(
      client([{ workflowId: WF("nested/child") }]),
      PROJECT,
      deps({
        listArchivedChangeIds: async () => new Set(["nested/child"]),
        fireTerminal,
      }),
    );

    expect(fireTerminal).not.toHaveBeenCalled();
  });

  it("dryRun reports what it would do without firing anything", async () => {
    const fireTerminal = vi.fn(async () => {});
    const result = await reconcileTerminalWorkflows(
      client([{ workflowId: WF("a") }, { workflowId: WF("b") }]),
      PROJECT,
      deps({
        listArchivedChangeIds: async () => new Set(["a", "b"]),
        fireTerminal,
      }),
      { dryRun: true },
    );

    expect(fireTerminal).not.toHaveBeenCalled();
    expect(result.reconciled).toEqual(["a", "b"]);
    expect(result.dryRun).toBe(true);
  });

  it("honours the per-sweep cap and flags that it capped", async () => {
    const fireTerminal = vi.fn(async () => {});
    const ids = ["a", "b", "c", "d"];
    const result = await reconcileTerminalWorkflows(
      client(ids.map((id) => ({ workflowId: WF(id) }))),
      PROJECT,
      deps({
        listArchivedChangeIds: async () => new Set(ids),
        fireTerminal,
      }),
      { maxPerSweep: 2 },
    );

    expect(fireTerminal).toHaveBeenCalledTimes(2);
    expect(result.reconciled).toHaveLength(2);
    expect(result.capped).toBe(true);
  });

  it("records a failed signal without aborting the rest of the sweep", async () => {
    const fireTerminal = vi.fn(async (changeId: string) => {
      if (changeId === "bad") throw new Error("signal rejected");
    });
    const result = await reconcileTerminalWorkflows(
      client([{ workflowId: WF("bad") }, { workflowId: WF("good") }]),
      PROJECT,
      deps({
        listArchivedChangeIds: async () => new Set(["bad", "good"]),
        fireTerminal,
      }),
    );

    expect(result.reconciled).toEqual(["good"]);
    expect(result.failed).toEqual([
      { changeId: "bad", error: "signal rejected" },
    ]);
  });

  it("records no archive evidence when no bundle exists", async () => {
    const list = vi.fn(() =>
      (async function* () {
        yield { workflowId: WF("a"), status: { name: "RUNNING" } };
      })(),
    );
    const result = await reconcileTerminalWorkflows(
      createMockOwnerFromClient({
        client: { workflow: { list } },
      }),
      PROJECT,
      deps({ listArchivedChangeIds: async () => new Set<string>() }),
    );

    expect(list).toHaveBeenCalled();
    expect(result.inspected).toBe(1);
    expect(result.skipped).toEqual([
      { changeId: "a", reason: "no_archive_evidence" },
    ]);
  });

  it("only matches archive evidence EXACTLY, never by near-miss", async () => {
    const fireTerminal = vi.fn(async () => {});
    await reconcileTerminalWorkflows(
      client([{ workflowId: WF("addFoo") }]),
      PROJECT,
      deps({
        // Prefix/suffix neighbours must not be treated as evidence.
        listArchivedChangeIds: async () => new Set(["addFooBar", "add"]),
        fireTerminal,
      }),
    );

    expect(fireTerminal).not.toHaveBeenCalled();
  });

  it("does nothing when the cap is zero", async () => {
    const fireTerminal = vi.fn(async () => {});
    const result = await reconcileTerminalWorkflows(
      client([{ workflowId: WF("a") }]),
      PROJECT,
      deps({
        listArchivedChangeIds: async () => new Set(["a"]),
        fireTerminal,
      }),
      { maxPerSweep: 0 },
    );

    expect(fireTerminal).not.toHaveBeenCalled();
    expect(result.reconciled).toEqual([]);
  });
});

describe("change-status authority (presence is not liveness)", () => {
  // Measured in production: the projection directory held 96 draft, 28
  // archived and 4 closed changes side by side. Treating directory PRESENCE as
  // "active" vetoed every archived change that had not been pruned, which made
  // reconciliation inert.
  const projection = new Map<string, string>([
    ["stillDrafting", "draft"],
    ["archivedButPresent", "archived"],
    ["closedButPresent", "closed"],
    ["corruptEntry", "unknown"],
  ]);

  it("classifies archived and closed as terminal", () => {
    expect(isTerminalChangeStatus("archived")).toBe(true);
    expect(isTerminalChangeStatus("closed")).toBe(true);
  });

  it("classifies everything else as non-terminal", () => {
    expect(isTerminalChangeStatus("draft")).toBe(false);
    expect(isTerminalChangeStatus("unknown")).toBe(false);
    expect(isTerminalChangeStatus("")).toBe(false);
  });

  it("treats a present-but-archived change as terminal, not active", () => {
    expect([...terminalChangeIdsFromStatuses(projection)].sort()).toEqual([
      "archivedButPresent",
      "closedButPresent",
    ]);
    expect([...activeChangeIdsFromStatuses(projection)].sort()).toEqual([
      "corruptEntry",
      "stillDrafting",
    ]);
  });

  it("fails closed: an unreadable entry counts as active and is vetoed", () => {
    expect(activeChangeIdsFromStatuses(projection).has("corruptEntry")).toBe(
      true,
    );
    expect(terminalChangeIdsFromStatuses(projection).has("corruptEntry")).toBe(
      false,
    );
  });
});

describe("archiveDirToChangeId", () => {
  it("recovers the change id from a current-style bundle name", () => {
    expect(archiveDirToChangeId("2026-07-29-decoupleOrphanAdopter")).toBe(
      "decoupleOrphanAdopter",
    );
  });

  it("yields a legacy slug that cannot match any workflow id", () => {
    // Not a real change id — so it contributes no evidence and the legacy
    // bundle's workflow is left alone rather than mis-reconciled.
    expect(archiveDirToChangeId("2026-01-26-add-runtime-enf-qzFE")).toBe(
      "add-runtime-enf-qzFE",
    );
  });

  it("returns null when there is no date prefix", () => {
    expect(archiveDirToChangeId("decoupleOrphanAdopter")).toBeNull();
    expect(archiveDirToChangeId("")).toBeNull();
  });

  it("returns null when the date prefix has no remainder", () => {
    expect(archiveDirToChangeId("2026-07-29-")).toBeNull();
  });
});
