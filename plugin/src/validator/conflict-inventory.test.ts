import { describe, expect, test } from "vitest";
import type { Change } from "../types";
import { runConflictChecks } from "./conflicts";
import type { ValidationContext, ConflictInventory } from "./types";

const createdAt = "2026-05-08T00:00:00.000Z";

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "testChange",
    title: "Test change",
    status: "active",
    created_at: createdAt,
    tasks: [],
    deltas: {
      "cap-a": [
        {
          id: "delta-1",
          operation: "add",
          requirement: {
            id: "req-1",
            title: "Requirement 1",
            priority: "must",
            body: "Body",
          },
        },
      ],
    },
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<ValidationContext> = {},
): ValidationContext {
  return {
    existingSpecs: new Map(),
    existingRequirementIds: new Set(),
    requirementReferences: new Map(),
    ...overrides,
  };
}

function makeInventory(
  overrides: Partial<ConflictInventory> = {},
): ConflictInventory {
  return {
    entries: [],
    completeness: "complete",
    warnings: [],
    source: "change-inventory",
    ownChangeId: "testChange",
    ...overrides,
  };
}

describe("conflict inventory typed context", () => {
  test("returns no conflict issues when inventory is complete and no overlaps", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        entries: [
          {
            id: "otherChange",
            title: "Other change",
            status: "active",
            capabilities: ["cap-b"],
            isArchived: false,
            isOwnChange: false,
          },
        ],
      }),
    });

    const issues = runConflictChecks(change, context);
    const conflictIssues = issues.filter(
      (i) => i.code === "OVERLAPPING_CAPABILITY",
    );
    expect(conflictIssues).toHaveLength(0);
  });

  test("warns on overlapping capabilities with active non-own changes", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        entries: [
          {
            id: "otherChange",
            title: "Other change",
            status: "active",
            capabilities: ["cap-a"],
            isArchived: false,
            isOwnChange: false,
          },
        ],
      }),
    });

    const issues = runConflictChecks(change, context);
    const conflictIssues = issues.filter(
      (i) => i.code === "OVERLAPPING_CAPABILITY",
    );
    expect(conflictIssues).toHaveLength(1);
    expect(conflictIssues[0].severity).toBe("warning");
    expect(conflictIssues[0].message).toContain("Other change");
  });

  test("skips own change in conflict detection", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        entries: [
          {
            id: "testChange",
            title: "Test change",
            status: "active",
            capabilities: ["cap-a"],
            isArchived: false,
            isOwnChange: true,
          },
        ],
      }),
    });

    const issues = runConflictChecks(change, context);
    const conflictIssues = issues.filter(
      (i) => i.code === "OVERLAPPING_CAPABILITY",
    );
    expect(conflictIssues).toHaveLength(0);
  });

  test("treats archived changes as related context, not authority", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        entries: [
          {
            id: "archivedChange",
            title: "Archived change",
            status: "archived",
            capabilities: ["cap-a"],
            isArchived: true,
            isOwnChange: false,
          },
        ],
      }),
    });

    const issues = runConflictChecks(change, context);
    const conflictIssues = issues.filter(
      (i) => i.code === "OVERLAPPING_CAPABILITY",
    );
    // Archived changes should not produce conflict warnings
    expect(conflictIssues).toHaveLength(0);
  });

  test("emits blocked error when inventory completeness is blocked", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        completeness: "blocked",
        warnings: ["Temporal visibility unavailable"],
      }),
    });

    const issues = runConflictChecks(change, context);
    const blockedIssues = issues.filter(
      (i) => i.code === "CONFLICT_INVENTORY_BLOCKED",
    );
    expect(blockedIssues).toHaveLength(1);
    expect(blockedIssues[0].severity).toBe("error");
  });

  test("emits degraded warning when inventory completeness is degraded", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        completeness: "degraded",
        warnings: ["Some peer changes could not be hydrated"],
      }),
    });

    const issues = runConflictChecks(change, context);
    const degradedIssues = issues.filter(
      (i) => i.code === "CONFLICT_INVENTORY_DEGRADED",
    );
    expect(degradedIssues).toHaveLength(1);
    expect(degradedIssues[0].severity).toBe("warning");
  });

  test("emits warnings for each inventory warning", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        warnings: [
          "Peer change peer-1 workflow unavailable",
          "Epic epic-1 member list incomplete",
        ],
      }),
    });

    const issues = runConflictChecks(change, context);
    const warningIssues = issues.filter(
      (i) => i.code === "CONFLICT_INVENTORY_WARNING",
    );
    expect(warningIssues).toHaveLength(2);
  });

  test("includes Epic context in conflict details", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        entries: [
          {
            id: "otherChange",
            title: "Other change",
            status: "active",
            capabilities: ["cap-a"],
            isArchived: false,
            isOwnChange: false,
            epic: {
              id: "epic-1",
              title: "Epic One",
              entry_id: "entry-1",
            },
          },
        ],
      }),
    });

    const issues = runConflictChecks(change, context);
    const conflictIssues = issues.filter(
      (i) => i.code === "OVERLAPPING_CAPABILITY",
    );
    expect(conflictIssues).toHaveLength(1);
    expect(conflictIssues[0].details?.epicId).toBe("epic-1");
    expect(conflictIssues[0].details?.epicTitle).toBe("Epic One");
  });

  test("includes inventory source in overlapping-capability conflict details", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        source: "test-inventory-source",
        entries: [
          {
            id: "otherChange",
            title: "Other change",
            status: "active",
            capabilities: ["cap-a"],
            isArchived: false,
            isOwnChange: false,
          },
        ],
      }),
    });

    const issues = runConflictChecks(change, context);
    const conflictIssues = issues.filter(
      (i) => i.code === "OVERLAPPING_CAPABILITY",
    );
    expect(conflictIssues).toHaveLength(1);
    expect(conflictIssues[0].details?.source).toBe("test-inventory-source");
  });

  test("backward compatible with legacy activeChanges array", () => {
    const change = makeChange();
    const context = makeContext({
      activeChanges: [
        {
          id: "legacyChange",
          title: "Legacy change",
          capabilities: ["cap-a"],
        },
      ],
    });

    const issues = runConflictChecks(change, context);
    const conflictIssues = issues.filter(
      (i) => i.code === "OVERLAPPING_CAPABILITY",
    );
    expect(conflictIssues).toHaveLength(1);
    expect(conflictIssues[0].severity).toBe("warning");
  });

  test("no clean result when inventory has warnings and no explicit overlaps", () => {
    const change = makeChange();
    const context = makeContext({
      conflictInventory: makeInventory({
        warnings: ["Pagination incomplete — deadline reached"],
      }),
    });

    const issues = runConflictChecks(change, context);
    // Should have at least one warning issue (not a clean no-conflict result)
    const warningIssues = issues.filter((i) => i.severity === "warning");
    expect(warningIssues.length).toBeGreaterThan(0);
  });
});
