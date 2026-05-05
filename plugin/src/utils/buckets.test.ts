import { describe, expect, it } from "vitest";

import type { BucketContext } from "./buckets";
import { deriveBucket } from "./buckets";

const NOW = Date.parse("2026-05-05T12:00:00.000Z");
const STALE = "2026-05-04T00:00:00.000Z";
const FRESH = "2026-05-05T11:30:00.000Z";

function ctx(overrides: Partial<BucketContext>): BucketContext {
  return {
    pendingCheckpoint: false,
    currentGateStatus: "pending",
    currentGateId: "execution",
    allNonReleaseGatesDone: false,
    releaseGateStatus: "pending",
    proposalDoneOnly: false,
    createdAt: FRESH,
    lastSignalAt: FRESH,
    nowMs: NOW,
    idleThresholdMs: 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe("deriveBucket", () => {
  it("prioritizes pending checkpoints over all other states", () => {
    expect(
      deriveBucket(
        ctx({
          pendingCheckpoint: true,
          currentGateStatus: "stuck",
        }),
      ),
    ).toBe("awaiting_approval");
  });

  it("returns awaiting_approval for awaiting gates", () => {
    expect(deriveBucket(ctx({ currentGateStatus: "awaiting_approval" }))).toBe(
      "awaiting_approval",
    );
  });

  it("returns ready_to_archive when all non-release gates are done and release awaits", () => {
    expect(
      deriveBucket(
        ctx({
          allNonReleaseGatesDone: true,
          releaseGateStatus: "awaiting_approval",
        }),
      ),
    ).toBe("ready_to_archive");
  });

  it("returns stuck for stuck current gate", () => {
    expect(deriveBucket(ctx({ currentGateStatus: "stuck" }))).toBe("stuck");
  });

  it("returns drifting for stale in-progress gate", () => {
    expect(
      deriveBucket(
        ctx({
          currentGateStatus: "in_progress",
          lastSignalAt: STALE,
        }),
      ),
    ).toBe("drifting");
  });

  it("returns in_flight for fresh in-progress gate", () => {
    expect(
      deriveBucket(
        ctx({
          currentGateStatus: "in_progress",
          lastSignalAt: FRESH,
        }),
      ),
    ).toBe("in_flight");
  });

  it("returns never_started for stale proposal-only changes", () => {
    expect(
      deriveBucket(
        ctx({
          proposalDoneOnly: true,
          createdAt: STALE,
          lastSignalAt: undefined,
        }),
      ),
    ).toBe("never_started");
  });

  it("defaults to in_flight", () => {
    expect(deriveBucket(ctx({ currentGateStatus: "pending" }))).toBe(
      "in_flight",
    );
  });
});
