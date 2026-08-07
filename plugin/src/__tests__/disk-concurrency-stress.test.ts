import { describe, expect, it } from "vitest";
import { runDiskConcurrencyStress } from "../../../scripts/disk-concurrency-stress";

describe("disk-only ten-agent concurrency stress", () => {
  it("keeps shared projections, worktrees, and terminal paths durable", async () => {
    const evidence = await runDiskConcurrencyStress();

    expect(Object.values(evidence.assertions).every(Boolean)).toBe(true);
    expect(evidence.actorCount).toBe(10);
    expect(evidence.lockTimeouts).toBe(0);
    expect(evidence.committedUnverified).toBe(0);
    expect(evidence.tornWrites).toBe(0);
  }, 120_000);
});
