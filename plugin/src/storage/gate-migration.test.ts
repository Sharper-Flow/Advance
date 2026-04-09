/**
 * Gate Migration Tests
 *
 * Tests for migrating old 6-gate model to new 7-gate model.
 */

import { describe, test, expect } from "vitest";
import { migrateGates, needsGateMigration } from "./gate-migration";
import type { GateCompletion } from "../types";

// Old 6-gate format (pre-migration)
type OldGates = Record<string, GateCompletion>;

function makeOldGates(
  overrides: Partial<Record<string, Partial<GateCompletion>>> = {},
): OldGates {
  const base: OldGates = {
    research: { status: "pending" },
    prep: { status: "pending" },
    implementation: { status: "pending" },
    review: { status: "pending" },
    harden: { status: "pending" },
    signoff: { status: "pending" },
  };
  for (const [key, val] of Object.entries(overrides)) {
    base[key] = { ...base[key], ...val };
  }
  return base;
}

describe("needsGateMigration", () => {
  test("returns true for old 6-gate format", () => {
    expect(needsGateMigration(makeOldGates())).toBe(true);
  });

  test("returns false for new 7-gate format", () => {
    const newGates = {
      proposal: { status: "pending" as const },
      discovery: { status: "pending" as const },
      design: { status: "pending" as const },
      planning: { status: "pending" as const },
      execution: { status: "pending" as const },
      acceptance: { status: "pending" as const },
      release: { status: "pending" as const },
    };
    expect(needsGateMigration(newGates)).toBe(false);
  });

  test("returns false for undefined/null gates", () => {
    expect(needsGateMigration(undefined)).toBe(false);
    expect(needsGateMigration(null)).toBe(false);
  });
});

describe("migrateGates", () => {
  test("migrates all-pending gates to 7 new pending gates", () => {
    const result = migrateGates(makeOldGates());
    const keys = Object.keys(result);
    expect(keys).toEqual([
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
    ]);
    // All should be pending (old gates were all pending)
    for (const key of keys) {
      expect(result[key].status).toBe("pending");
    }
  });

  test("migrates partially-complete gates preserving status and timestamps", () => {
    const old = makeOldGates({
      research: {
        status: "done",
        completed_at: "2026-01-15T10:00:00Z",
        completed_by: "agent",
      },
      prep: {
        status: "done",
        completed_at: "2026-01-16T14:00:00Z",
        completed_by: "agent",
      },
    });
    const result = migrateGates(old);

    // research → discovery (done, with migrated_from)
    expect(result.discovery.status).toBe("done");
    expect(result.discovery.completed_at).toBe("2026-01-15T10:00:00Z");
    expect(result.discovery.completed_by).toBe("agent");
    expect(result.discovery.migrated_from).toBe("research");

    // prep → planning (done, with migrated_from)
    expect(result.planning.status).toBe("done");
    expect(result.planning.completed_at).toBe("2026-01-16T14:00:00Z");
    expect(result.planning.migrated_from).toBe("prep");

    // Remaining old gates → new gates (pending)
    expect(result.execution.status).toBe("pending");
    expect(result.acceptance.status).toBe("pending");
    expect(result.release.status).toBe("pending");

    // New gates without old counterparts → legacy (change has work done, predates these stages)
    expect(result.proposal.status).toBe("legacy");
    expect(result.design.status).toBe("legacy");
  });

  test("migrates all-done gates — signoff absorbed into acceptance", () => {
    const old = makeOldGates({
      research: {
        status: "done",
        completed_at: "2026-01-15T10:00:00Z",
        completed_by: "agent",
      },
      prep: {
        status: "done",
        completed_at: "2026-01-16T14:00:00Z",
        completed_by: "agent",
      },
      implementation: {
        status: "done",
        completed_at: "2026-01-17T11:00:00Z",
        completed_by: "agent",
      },
      review: {
        status: "done",
        completed_at: "2026-01-18T15:00:00Z",
        completed_by: "agent",
      },
      harden: {
        status: "done",
        completed_at: "2026-01-19T17:00:00Z",
        completed_by: "agent",
      },
      signoff: {
        status: "done",
        completed_at: "2026-01-20T16:00:00Z",
        completed_by: "user",
      },
    });
    const result = migrateGates(old);

    // All mapped gates should be done
    expect(result.discovery.status).toBe("done");
    expect(result.planning.status).toBe("done");
    expect(result.execution.status).toBe("done");
    expect(result.release.status).toBe("done");

    // acceptance gets review's data (review → acceptance)
    expect(result.acceptance.status).toBe("done");
    expect(result.acceptance.migrated_from).toBe("review");
    expect(result.acceptance.absorbed_completions).toEqual([
      {
        gate_id: "signoff",
        status: "done",
        completed_at: "2026-01-20T16:00:00Z",
        completed_by: "user",
      },
    ]);

    // New gates without old counterparts → legacy (change predates these stages)
    expect(result.proposal.status).toBe("legacy");
    expect(result.design.status).toBe("legacy");
  });

  test("preserves legacy status through migration", () => {
    const old = makeOldGates({
      research: {
        status: "legacy",
        completed_at: "2026-01-01T00:00:00Z",
        completed_by: "migration",
      },
      prep: {
        status: "legacy",
        completed_at: "2026-01-01T00:00:00Z",
        completed_by: "migration",
      },
      implementation: {
        status: "legacy",
        completed_at: "2026-01-01T00:00:00Z",
        completed_by: "migration",
      },
      review: {
        status: "legacy",
        completed_at: "2026-01-01T00:00:00Z",
        completed_by: "migration",
      },
      harden: {
        status: "legacy",
        completed_at: "2026-01-01T00:00:00Z",
        completed_by: "migration",
      },
      signoff: { status: "pending" },
    });
    const result = migrateGates(old);

    expect(result.discovery.status).toBe("legacy");
    expect(result.planning.status).toBe("legacy");
    expect(result.execution.status).toBe("legacy");
    expect(result.acceptance.status).toBe("legacy");
    // harden→release (legacy), signoff is absorbed
    expect(result.release.status).toBe("legacy");
    expect(result.release.migrated_from).toBe("harden");
  });

  test("is idempotent — already-migrated gates pass through unchanged", () => {
    const newGates = {
      proposal: {
        status: "done" as const,
        completed_at: "2026-01-01T00:00:00Z",
        completed_by: "agent",
      },
      discovery: {
        status: "done" as const,
        completed_at: "2026-01-02T00:00:00Z",
        completed_by: "agent",
      },
      design: { status: "pending" as const },
      planning: { status: "pending" as const },
      execution: { status: "pending" as const },
      acceptance: { status: "pending" as const },
      release: { status: "pending" as const },
    };
    // Should not need migration
    expect(needsGateMigration(newGates)).toBe(false);
  });
});
