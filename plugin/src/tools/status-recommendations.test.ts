import { describe, expect, test } from "vitest";

import {
  buildStatusRecommendationGroups,
  STATUS_RECOMMENDATION_KIND_ORDER,
  type StatusRecommendationItem,
} from "./status-recommendations";

describe("status recommendation grouping", () => {
  const item = (
    overrides: Partial<StatusRecommendationItem>,
  ): StatusRecommendationItem => ({
    kind: "stale",
    priority: "medium",
    title: "Stale change",
    detail: "last activity 3h ago",
    action: 'adv_status view:"changes"',
    source: "recency",
    ...overrides,
  });

  test("orders groups by operational priority, not input order", () => {
    const result = buildStatusRecommendationGroups(
      [
        item({ kind: "stale", changeId: "z-last" }),
        item({ kind: "health", priority: "critical", source: "health" }),
        item({ kind: "clarify", priority: "high", source: "clarify" }),
        item({
          kind: "blocked_or_stuck",
          priority: "critical",
          source: "release_readiness",
        }),
      ],
      { perGroup: 5 },
    );

    expect(STATUS_RECOMMENDATION_KIND_ORDER).toEqual([
      "blocked_or_stuck",
      "health",
      "release_ready",
      "clarify",
      "next_gate",
      "cleanup",
      "stale",
    ]);
    expect(result.groups.map((group) => group.kind)).toEqual([
      "blocked_or_stuck",
      "health",
      "clarify",
      "stale",
    ]);
  });

  test("reports per-group and total omitted counts", () => {
    const result = buildStatusRecommendationGroups(
      [
        item({ kind: "stale", changeId: "b" }),
        item({ kind: "stale", changeId: "a" }),
        item({ kind: "stale", changeId: "c" }),
        item({ kind: "cleanup", source: "branch_hygiene", changeId: "d" }),
      ],
      { perGroup: 2 },
    );

    const stale = result.groups.find((group) => group.kind === "stale");
    expect(stale).toMatchObject({ total: 3, omitted: 1 });
    expect(stale?.shown.map((shown) => shown.changeId)).toEqual(["a", "b"]);
    expect(result.total).toBe(4);
    expect(result.omitted).toBe(1);
    expect(result.drilldown).toEqual({
      changes: 'adv_status view:"changes"',
      hygiene: 'adv_status view:"hygiene"',
    });
  });
});
