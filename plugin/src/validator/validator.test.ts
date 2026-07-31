/**
 * Validator pass computation fail-closed semantics for conflict inventory
 * completeness (fixValidationInputTimeout, task 2).
 *
 * Verifies that validateChange consumes conflictInventory.canConcludeClean and
 * refuses a clean/pass verdict when the inventory is incomplete, while still
 * preserving existing diagnostics and hydrated-peer checks.
 */

import { describe, expect, test } from "vitest";
import type { Change } from "../types";
import { validateChange } from "./validator";
import type { ConflictInventory } from "./types";

function makeMinimalChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "test-change",
    title: "Test change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [],
    deltas: {},
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
    source: "test-inventory",
    ownChangeId: "test-change",
    ...overrides,
  };
}

describe("validateChange canConcludeClean", () => {
  test("passes when inventory can conclude clean and no errors", async () => {
    const change = makeMinimalChange();
    const result = await validateChange(change, {
      specs: [],
      conflictInventory: makeInventory({ canConcludeClean: true }),
    });
    expect(result.passed).toBe(true);
  });

  test("fails when canConcludeClean is false (degraded/non-conclusive)", async () => {
    const change = makeMinimalChange({
      deltas: {
        "cap-a": [
          {
            id: "delta-1",
            operation: "add",
            requirement: {
              id: "rq-1",
              title: "Requirement 1",
              priority: "must",
              body: "Body",
            },
          },
        ],
      },
    });
    const result = await validateChange(change, {
      specs: [],
      conflictInventory: makeInventory({
        completeness: "degraded",
        canConcludeClean: false,
        warnings: ["Peer change peer-1 workflow unavailable"],
      }),
    });

    expect(result.passed).toBe(false);
    // Preserves the degraded diagnostic as a warning, not an error.
    const degradedIssues = result.errors.filter(
      (i) => i.code === "CONFLICT_INVENTORY_DEGRADED",
    );
    expect(degradedIssues).toHaveLength(0);
    const warningIssues = result.warnings.filter(
      (i) => i.code === "CONFLICT_INVENTORY_DEGRADED",
    );
    expect(warningIssues).toHaveLength(1);
  });

  test("fails when canConcludeClean is false (blocked)", async () => {
    const change = makeMinimalChange();
    const result = await validateChange(change, {
      specs: [],
      conflictInventory: makeInventory({
        completeness: "blocked",
        canConcludeClean: false,
        warnings: ["Temporal visibility unavailable"],
      }),
    });

    expect(result.passed).toBe(false);
    const blockedIssues = result.errors.filter(
      (i) => i.code === "CONFLICT_INVENTORY_BLOCKED",
    );
    expect(blockedIssues).toHaveLength(1);
  });

  test("legacy activeChanges path remains error-based when no inventory provided", async () => {
    const change = makeMinimalChange();
    const result = await validateChange(change, {
      specs: [],
      activeChanges: [],
    });
    expect(result.passed).toBe(true);
  });

  test("still fails on real errors even when canConcludeClean is true", async () => {
    const change = makeMinimalChange({
      deltas: {
        "cap-a": [
          {
            id: "delta-1",
            operation: "add",
            requirement: {
              id: "rq-1",
              title: "Requirement 1",
              priority: "must",
              body: "Body",
            },
          },
          {
            id: "delta-2",
            operation: "add",
            requirement: {
              id: "rq-1",
              title: "Requirement 1 duplicate",
              priority: "must",
              body: "Body",
            },
          },
        ],
      },
    });
    const result = await validateChange(change, {
      specs: [],
      conflictInventory: makeInventory({ canConcludeClean: true }),
    });
    expect(result.passed).toBe(false);
    expect(
      result.errors.some((i) => i.code === "DUPLICATE_REQUIREMENT_ID"),
    ).toBe(true);
  });

  test("includes authorityDiagnostics in validation result when inventory provides them", async () => {
    const change = makeMinimalChange();
    const diagnostics = {
      source: "active-conflict-authority",
      activeCandidateCount: 3,
      omittedCount: 1,
      shadowCount: 0,
      elapsedMs: 42,
    };
    const result = await validateChange(change, {
      specs: [],
      conflictInventory: makeInventory({
        canConcludeClean: true,
        authorityDiagnostics: diagnostics,
      }),
    });
    expect(result.authorityDiagnostics).toEqual(diagnostics);
  });

  test("synthesizes stable authorityDiagnostics when inventory does not provide them", async () => {
    const change = makeMinimalChange();
    const result = await validateChange(change, {
      specs: [],
      conflictInventory: makeInventory({
        source: "test-inventory",
        canConcludeClean: true,
      }),
    });
    expect(result.authorityDiagnostics).toEqual({
      source: "test-inventory",
      activeCandidateCount: null,
      omittedCount: null,
      shadowCount: null,
      elapsedMs: null,
    });
  });
});
