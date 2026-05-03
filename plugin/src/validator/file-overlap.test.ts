/**
 * File-Overlap Validator Tests
 *
 * TDD inline: red → green for scanFileOverlaps.
 */

import { describe, test, expect, vi } from "vitest";
import {
  scanFileOverlaps,
  type OverlapMatch,
  type FileOverlapResult,
} from "./file-overlap";

// =============================================================================
// Tests 1-4 use injected deps (no Temporal I/O)
// =============================================================================

describe("scanFileOverlaps with injected deps", () => {
  test("detects overlap when peer touches same file", async () => {
    const planned = ["src/foo.ts", "src/bar.ts"];
    const registry = [
      { branch: "change/current", path: "/wt/current", changeId: "chg-curr" },
      { branch: "change/peer", path: "/wt/peer", changeId: "chg-peer" },
    ];
    const summaries = {
      "chg-peer": {
        status: "active",
        touched_files: ["src/bar.ts", "src/baz.ts"],
      },
    };

    const result = await scanFileOverlaps("/project", planned, {
      registry,
      changeSummaries: summaries,
      currentBranch: "change/current",
    });

    expect(result.unavailable).toBeUndefined();
    expect(result.scannedPeers).toBe(1);
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]).toEqual({
      peerBranch: "change/peer",
      peerChangeId: "chg-peer",
      overlappingFiles: ["src/bar.ts"],
    } as OverlapMatch);
  });

  test("returns empty overlaps when files are disjoint", async () => {
    const planned = ["src/foo.ts"];
    const registry = [
      { branch: "change/current", path: "/wt/current", changeId: "chg-curr" },
      { branch: "change/peer", path: "/wt/peer", changeId: "chg-peer" },
    ];
    const summaries = {
      "chg-peer": {
        status: "active",
        touched_files: ["src/bar.ts", "src/baz.ts"],
      },
    };

    const result = await scanFileOverlaps("/project", planned, {
      registry,
      changeSummaries: summaries,
      currentBranch: "change/current",
    });

    expect(result.unavailable).toBeUndefined();
    expect(result.scannedPeers).toBeGreaterThanOrEqual(1);
    expect(result.overlaps).toHaveLength(0);
  });

  test("single-worktree case returns empty result without error", async () => {
    const planned = ["src/foo.ts"];
    const registry = [
      { branch: "change/current", path: "/wt/current", changeId: "chg-curr" },
    ];

    const result = await scanFileOverlaps("/project", planned, {
      registry,
      changeSummaries: {},
      currentBranch: "change/current",
    });

    expect(result).toEqual({
      overlaps: [],
      scannedPeers: 0,
    } as FileOverlapResult);
  });

  test("skips archived peer changes", async () => {
    const planned = ["src/foo.ts"];
    const registry = [
      { branch: "change/current", path: "/wt/current", changeId: "chg-curr" },
      { branch: "change/peer", path: "/wt/peer", changeId: "chg-peer" },
    ];
    const summaries = {
      "chg-peer": {
        status: "archived",
        touched_files: ["src/foo.ts"],
      },
    };

    const result = await scanFileOverlaps("/project", planned, {
      registry,
      changeSummaries: summaries,
      currentBranch: "change/current",
    });

    expect(result.overlaps).toHaveLength(0);
    expect(result.scannedPeers).toBe(0); // archived peers are not counted as scanned
  });

  test("skips peers without changeId", async () => {
    const planned = ["src/foo.ts"];
    const registry = [
      { branch: "change/current", path: "/wt/current", changeId: "chg-curr" },
      { branch: "change/peer", path: "/wt/peer" /* no changeId */ },
    ];

    const result = await scanFileOverlaps("/project", planned, {
      registry,
      changeSummaries: {},
      currentBranch: "change/current",
    });

    expect(result.overlaps).toHaveLength(0);
    expect(result.scannedPeers).toBe(0);
  });
});

// =============================================================================
// Test 5: Unavailable workflow (production path, mocked)
// =============================================================================

vi.mock("../tools/worktree/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tools/worktree/state")>();
  return {
    ...actual,
    initStateDb: vi.fn(async () => {
      throw new Error("workflow unreachable");
    }),
  };
});

describe("scanFileOverlaps production path fallback", () => {
  test("returns unavailable when initStateDb throws", async () => {
    const result = await scanFileOverlaps("/project", ["src/foo.ts"]);

    expect(result.unavailable).toBe(true);
    expect(result.overlaps).toHaveLength(0);
    expect(result.scannedPeers).toBe(0);
  });
});
