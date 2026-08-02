/**
 * listSourceRankedCandidates — source-ranked candidate orientation tests.
 *
 * TDD red phase: the production implementation is a stub, so these tests
 * fail with expected semantic failures until the green phase.
 */

import { describe, expect, it } from "vitest";

import {
  listSourceRankedCandidates,
  type SourceRankedCandidate,
} from "./list-source-ranked-candidates";
import type { TemporalListOutcome, TemporalOperations } from "./operations";

/** Canonical 40-character lowercase hex project ID used across these tests. */
const PROJECT_ID = "0".repeat(40);
const CHANGE_PREFIX = `adv/change/${PROJECT_ID}/`;

interface VisibilityRecord {
  workflowId: string;
  searchAttributes?: Record<string, unknown>;
}

function makeOwner(records: VisibilityRecord[]): TemporalOperations {
  return {
    list: async function <T extends { workflowId: string }>(
      _ctx: unknown,
      _query: string,
      _options?: { limit?: number },
    ): Promise<TemporalListOutcome<T[]>> {
      return { kind: "complete", value: records as T[], truncated: false };
    },
  } as unknown as TemporalOperations;
}

function visibilityRecord(
  changeId: string,
  lastSignalAt: string,
  createdAt: string,
): VisibilityRecord {
  return {
    workflowId: `${CHANGE_PREFIX}${changeId}`,
    searchAttributes: {
      AdvLastSignalAt: [lastSignalAt],
      AdvCreatedAt: [createdAt],
    },
  };
}

function diskCandidate(
  id: string,
  lastSignalAt: string,
  createdAt: string,
): SourceRankedCandidate {
  return { id, source: "disk", lastSignalAt, createdAt };
}

function shuffleWithSeed<T>(input: T[], seed: number): T[] {
  const arr = [...input];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

describe("listSourceRankedCandidates", () => {
  it("ranks by Visibility AdvLastSignalAt descending, then AdvCreatedAt", async () => {
    const client = makeOwner([
      // Older by lastSignalAt but appears first in enumeration.
      visibilityRecord(
        "alpha",
        "2026-07-18T10:00:00.000Z",
        "2026-07-18T08:00:00.000Z",
      ),
      // Newer by lastSignalAt.
      visibilityRecord(
        "bravo",
        "2026-07-18T11:00:00.000Z",
        "2026-07-18T07:00:00.000Z",
      ),
      // Same lastSignalAt as bravo but older createdAt.
      visibilityRecord(
        "charlie",
        "2026-07-18T11:00:00.000Z",
        "2026-07-18T06:00:00.000Z",
      ),
    ]);

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 3,
    });

    expect(result.admitted.map((c) => c.id)).toEqual([
      "bravo",
      "charlie",
      "alpha",
    ]);
    expect(result.admitted[0].source).toBe("visibility");
  });

  it("falls back to AdvCreatedAt when AdvLastSignalAt is absent", async () => {
    const client = makeOwner([
      {
        workflowId: `${CHANGE_PREFIX}newer`,
        searchAttributes: {
          AdvCreatedAt: ["2026-07-18T12:00:00.000Z"],
        },
      },
      {
        workflowId: `${CHANGE_PREFIX}older`,
        searchAttributes: {
          AdvCreatedAt: ["2026-07-18T10:00:00.000Z"],
        },
      },
    ]);

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 2,
    });

    expect(result.admitted.map((c) => c.id)).toEqual(["newer", "older"]);
  });

  it("includes durable disk-only projection candidates", async () => {
    const client = makeOwner([
      visibilityRecord(
        "visible",
        "2026-07-18T10:00:00.000Z",
        "2026-07-18T08:00:00.000Z",
      ),
    ]);

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 2,
      diskCandidates: [
        diskCandidate(
          "disk-only",
          "2026-07-18T09:00:00.000Z",
          "2026-07-18T07:00:00.000Z",
        ),
      ],
    });

    expect(result.admitted.map((c) => c.id)).toEqual(["visible", "disk-only"]);
    const diskAdmitted = result.admitted.find((c) => c.id === "disk-only");
    expect(diskAdmitted?.source).toBe("disk");
  });

  it("does not let memo warmth or input order outrank source timestamps", async () => {
    // Input order (which could represent memo-warm iteration) is intentionally
    // oldest-first. Source-backed timestamps must still win.
    const client = makeOwner([
      visibilityRecord(
        "old-but-warm",
        "2026-07-18T08:00:00.000Z",
        "2026-07-18T06:00:00.000Z",
      ),
      visibilityRecord(
        "new-but-cold",
        "2026-07-18T12:00:00.000Z",
        "2026-07-18T10:00:00.000Z",
      ),
    ]);

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 2,
    });

    expect(result.admitted.map((c) => c.id)).toEqual([
      "new-but-cold",
      "old-but-warm",
    ]);
  });

  it("tie-breaks equal timestamps by canonical ID ascending", async () => {
    const client = makeOwner([
      visibilityRecord(
        "zebra",
        "2026-07-18T10:00:00.000Z",
        "2026-07-18T08:00:00.000Z",
      ),
      visibilityRecord(
        "apple",
        "2026-07-18T10:00:00.000Z",
        "2026-07-18T08:00:00.000Z",
      ),
    ]);

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 2,
    });

    expect(result.admitted.map((c) => c.id)).toEqual(["apple", "zebra"]);
  });

  it("selects the globally newest 10 from 57 shuffled candidates", async () => {
    const ids = Array.from(
      { length: 57 },
      (_, i) => String.fromCharCode(97 + (i % 26)) + i,
    );
    const orderedIds = [...ids].sort();
    const records: VisibilityRecord[] = orderedIds.map((id, index) =>
      visibilityRecord(
        id,
        `2026-07-${String(18 - index).padStart(2, "0")}T10:00:00.000Z`,
        `2026-07-${String(18 - index).padStart(2, "0")}T08:00:00.000Z`,
      ),
    );
    const shuffledRecords = shuffleWithSeed(records, 12345);
    const client = makeOwner(shuffledRecords);

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 10,
    });

    expect(result.admitted).toHaveLength(10);
    const newestIds = orderedIds.slice(0, 10);
    expect(result.admitted.map((c) => c.id)).toEqual(newestIds);
  });

  it("hydrates only the admitted IDs", async () => {
    const client = makeOwner([
      visibilityRecord(
        "a",
        "2026-07-18T12:00:00.000Z",
        "2026-07-18T10:00:00.000Z",
      ),
      visibilityRecord(
        "b",
        "2026-07-18T11:00:00.000Z",
        "2026-07-18T09:00:00.000Z",
      ),
      visibilityRecord(
        "c",
        "2026-07-18T10:00:00.000Z",
        "2026-07-18T08:00:00.000Z",
      ),
    ]);

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 2,
    });

    expect(result.admitted.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.admitted).toHaveLength(2);
  });

  it("reports omittedCount 47 and a bounded deterministic omitted-ID sample", async () => {
    const ids = Array.from({ length: 57 }, (_, i) => `c${i}`);
    const records = ids.map((id, index) =>
      visibilityRecord(
        id,
        `2026-07-${String(18 - index).padStart(2, "0")}T10:00:00.000Z`,
        `2026-07-${String(18 - index).padStart(2, "0")}T08:00:00.000Z`,
      ),
    );
    const client = makeOwner(shuffleWithSeed(records, 42));

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 10,
    });

    expect(result.omittedCount).toBe(47);
    expect(result.omittedIds.length).toBeGreaterThan(0);
    expect(result.omittedIds.length).toBeLessThanOrEqual(20);
    // Deterministic for the same inputs.
    const result2 = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 10,
    });
    expect(result2.omittedIds).toEqual(result.omittedIds);
  });

  it("degrades for invalid/missing timestamps instead of using enumeration order", async () => {
    const client = makeOwner([
      // Missing lastSignalAt, invalid createdAt.
      {
        workflowId: `${CHANGE_PREFIX}bad`,
        searchAttributes: {
          AdvCreatedAt: ["not-a-date"],
        },
      },
      // Valid timestamps.
      visibilityRecord(
        "good",
        "2026-07-18T10:00:00.000Z",
        "2026-07-18T08:00:00.000Z",
      ),
      // Missing both.
      {
        workflowId: `${CHANGE_PREFIX}missing`,
        searchAttributes: {},
      },
    ]);

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 3,
    });

    // Valid candidate must outrank timestamp-broken candidates.
    expect(result.admitted[0].id).toBe("good");
    expect(result.degraded).toBe(true);
    expect(result.missingTimestampIds).toContain("bad");
    expect(result.missingTimestampIds).toContain("missing");
    expect(result.missingTimestampIds).not.toContain("good");
  });

  it("omits candidates whose workflow IDs do not match the project prefix", async () => {
    const otherProjectId = "1".repeat(40);
    const client = makeOwner([
      visibilityRecord(
        "valid",
        "2026-07-18T10:00:00.000Z",
        "2026-07-18T08:00:00.000Z",
      ),
      {
        workflowId: `adv/change/${otherProjectId}/stranger`,
        searchAttributes: {
          AdvLastSignalAt: ["2026-07-18T12:00:00.000Z"],
          AdvCreatedAt: ["2026-07-18T10:00:00.000Z"],
        },
      },
    ]);

    const result = await listSourceRankedCandidates(client, {
      projectId: PROJECT_ID,
      limit: 2,
    });

    expect(result.admitted.map((c) => c.id)).toEqual(["valid"]);
    expect(result.omittedCount).toBe(0);
  });
});
