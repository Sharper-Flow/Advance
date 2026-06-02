/**
 * Unit tests for the adv_status probe helpers extracted in AC9 of
 * remediateSlopScanFindings (computeAutoManagedCensus, deriveOpencodeDebtCounts).
 * These lock the faithful behavior of the extracted pure functions.
 */

import { describe, expect, test } from "vitest";
import { computeAutoManagedCensus, deriveOpencodeDebtCounts } from "./status";

type DebtSnapshot = Parameters<typeof deriveOpencodeDebtCounts>[0];

describe("computeAutoManagedCensus", () => {
  test("counts auto / legacy / unmigrated markers", () => {
    const census = computeAutoManagedCensus([
      { worktree_auto_managed: true },
      { worktree_auto_managed: true },
      { worktree_auto_managed: false },
      { worktree_auto_managed: undefined },
      {},
    ]);
    expect(census).toEqual({ auto: 2, legacy: 1, unmigrated: 2 });
  });

  test("empty input yields all zeros", () => {
    expect(computeAutoManagedCensus([])).toEqual({
      auto: 0,
      legacy: 0,
      unmigrated: 0,
    });
  });
});

describe("deriveOpencodeDebtCounts", () => {
  test("returns null when the snapshot is unavailable", () => {
    expect(
      deriveOpencodeDebtCounts({ available: false } as unknown as DebtSnapshot),
    ).toBeNull();
  });

  test("prefers explicit total_* fields when present", () => {
    const snapshot = {
      available: true,
      total_orphan_ghost: 3,
      total_live_in_flight: 4,
      total_idle_active_session: 5,
      total_repairable_tool_parts: 6,
      total_live_tool_parts: 7,
      total_idle_tool_parts: 8,
      orphan_ghost: [],
      live_in_flight: [],
      idle_active_session: [],
      repairable_tool_parts: [],
      live_tool_parts: [],
      idle_tool_parts: [],
    } as unknown as DebtSnapshot;
    expect(deriveOpencodeDebtCounts(snapshot)).toEqual({
      orphanGhost: 3,
      liveInFlight: 4,
      idleActiveSession: 5,
      repairableToolPart: 6,
      liveToolPart: 7,
      idleToolPart: 8,
    });
  });

  test("falls back to array lengths (and 0 for missing optional arrays)", () => {
    const snapshot = {
      available: true,
      orphan_ghost: [1, 2],
      live_in_flight: [1],
      idle_active_session: [1, 2, 3],
      // repairable_tool_parts / live_tool_parts / idle_tool_parts omitted
    } as unknown as DebtSnapshot;
    expect(deriveOpencodeDebtCounts(snapshot)).toEqual({
      orphanGhost: 2,
      liveInFlight: 1,
      idleActiveSession: 3,
      repairableToolPart: 0,
      liveToolPart: 0,
      idleToolPart: 0,
    });
  });
});
