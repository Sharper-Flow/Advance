/**
 * Conflict-detection idempotency (rq-releaseProjectionDurability01):
 * an "add" delta whose requirement already exists in specs with matching
 * id+title+priority is accepted (already-applied), not flagged as a duplicate.
 * A content-divergent duplicate (different title/priority) remains a conflict.
 *
 * The validator's existingSpecs carry only minimal fields (id/title/priority);
 * the full content guard lives in archive/delta.ts (covered by
 * delta-idempotency.test.ts).
 */
import { describe, expect, it } from "vitest";
import type { Change, Delta } from "../types";
import type { Requirement } from "../types/specs";
import { runConflictChecks } from "./conflicts";
import type { ValidationContext } from "./types";

function addDelta(
  capability: string,
  requirement: Requirement,
): {
  capability: string;
  delta: Extract<Delta, { operation: "add" }>;
} {
  return {
    capability,
    delta: { id: `dl-${requirement.id}`, operation: "add", requirement },
  };
}

function contextWith(
  capability: string,
  existing: Array<{ id: string; title: string; priority: string }>,
): ValidationContext {
  return {
    existingSpecs: new Map([
      [capability, { name: capability, requirements: existing }],
    ]),
    existingRequirementIds: new Set(existing.map((r) => r.id)),
    requirementReferences: new Map(),
  };
}

describe("runConflictChecks add idempotency (rq-releaseProjectionDurability01)", () => {
  it("does NOT flag a duplicate when existing matches id+title+priority", () => {
    const cap = "cap-a";
    const { delta } = addDelta(cap, {
      id: "rq-X",
      title: "Title X",
      body: "Body X",
      priority: "must",
    });
    const change: Change = {
      id: "test-change",
      title: "Test",
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: { [cap]: [delta] },
    };
    const context = contextWith(cap, [
      { id: "rq-X", title: "Title X", priority: "must" },
    ]);
    const issues = runConflictChecks(change, context);
    expect(
      issues.filter((i) => i.code === "DUPLICATE_REQUIREMENT_ID"),
    ).toHaveLength(0);
  });

  it("flags a duplicate when existing matches id but diverges in title", () => {
    const cap = "cap-a";
    const { delta } = addDelta(cap, {
      id: "rq-X",
      title: "New Title",
      body: "Body X",
      priority: "must",
    });
    const change: Change = {
      id: "test-change",
      title: "Test",
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: { [cap]: [delta] },
    };
    const context = contextWith(cap, [
      { id: "rq-X", title: "Old Title", priority: "must" },
    ]);
    const issues = runConflictChecks(change, context);
    expect(
      issues.filter((i) => i.code === "DUPLICATE_REQUIREMENT_ID"),
    ).toHaveLength(1);
  });

  it("flags a duplicate when existing matches id but diverges in priority", () => {
    const cap = "cap-a";
    const { delta } = addDelta(cap, {
      id: "rq-X",
      title: "Title X",
      body: "Body X",
      priority: "should",
    });
    const change: Change = {
      id: "test-change",
      title: "Test",
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: { [cap]: [delta] },
    };
    const context = contextWith(cap, [
      { id: "rq-X", title: "Title X", priority: "must" },
    ]);
    const issues = runConflictChecks(change, context);
    expect(
      issues.filter((i) => i.code === "DUPLICATE_REQUIREMENT_ID"),
    ).toHaveLength(1);
  });
});
