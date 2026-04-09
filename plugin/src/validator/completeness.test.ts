/**
 * Completeness Validator Tests — TDD compliance with metadata.tdd_intent
 *
 * TDD red phase: tests written before implementation changes.
 * Covers rq-TDD003na (not_applicable skips TDD) and rq-TDD001inl (inline default).
 */

import { describe, test, expect } from "vitest";
import { checkTddCompliance } from "./completeness";
import type { Change } from "../types";

// =============================================================================
// Test Fixtures
// =============================================================================

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id: "testChange",
    title: "Test Change",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [],
    deltas: {},
    ...overrides,
  } as Change;
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "tk-abc12345",
    title: "Implement feature",
    section: "Core",
    status: "done",
    priority: 0,
    created_at: "2026-01-01T00:00:00Z",
    tdd_phase: "none",
    ...overrides,
  };
}

// =============================================================================
// checkTddCompliance — metadata-aware
// =============================================================================

describe("checkTddCompliance", () => {
  test("flags completed logic task without TDD evidence", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-impl0001",
          title: "Implement user authentication",
          status: "done",
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("MISSING_TDD_EVIDENCE");
  });

  test("does not flag completed logic task with TDD evidence", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-impl0002",
          title: "Implement user authentication",
          status: "done",
          tdd_evidence: {
            red: { recorded_at: "2026-01-01T00:00:00Z" },
            green: { recorded_at: "2026-01-01T00:01:00Z" },
          },
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(0);
  });

  test("does not flag completed logic task with skipped TDD", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-impl0003",
          title: "Implement user authentication",
          status: "done",
          tdd_evidence: {
            skipped: true,
            skip_reason: "trivial: config change",
          },
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(0);
  });

  // --- rq-TDD003na.1: not_applicable skips TDD evidence requirement ---

  test("does not flag task with metadata.tdd_intent='not_applicable' (rq-TDD003na.1)", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-doc00001",
          title: "Create task classifier utility", // would match isLogicTask
          status: "done",
          metadata: { tdd_intent: "not_applicable" },
          // No tdd_evidence — should be OK because metadata says not_applicable
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(0);
  });

  // --- rq-TDD002sep: separate_verification has own compliance path ---

  test("does not flag task with metadata.tdd_intent='separate_verification' without evidence", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-e2e00001",
          title: "Add integration tests across services", // matches isLogicTask
          status: "done",
          metadata: { tdd_intent: "separate_verification" },
          // separate_verification tasks have their own compliance path
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(0);
  });

  // --- rq-TDD001inl: inline tasks still require TDD evidence ---

  test("flags task with metadata.tdd_intent='inline' but no TDD evidence", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-impl0004",
          title: "Implement user authentication",
          status: "done",
          metadata: { tdd_intent: "inline" },
          // inline tasks MUST have TDD evidence
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("MISSING_TDD_EVIDENCE");
  });

  test("flags explicit inline metadata even when title is not logic-heavy by heuristic", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-impl0006",
          title: "Coordinate release notes",
          status: "done",
          metadata: { tdd_intent: "inline" },
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("MISSING_TDD_EVIDENCE");
  });

  // --- Legacy backward compatibility ---

  test("does not flag trivial task without metadata (legacy fallback via title)", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-doc00002",
          title: "Update README documentation",
          status: "done",
          // No metadata, no tdd_evidence — title heuristic says trivial
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(0);
  });

  // --- Severity escalation: MISSING_TDD_EVIDENCE is an error, not a warning ---

  test("MISSING_TDD_EVIDENCE has severity 'error' (blocks validation)", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-impl0010",
          title: "Implement user authentication",
          status: "done",
          metadata: { tdd_intent: "inline" },
          // No tdd_evidence — should produce severity 'error'
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("MISSING_TDD_EVIDENCE");
    expect(issues[0].severity).toBe("error");
  });

  test("MISSING_TDD_EVIDENCE recommendation references adv_task_reclassify_tdd", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-impl0011",
          title: "Implement feature X",
          status: "done",
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].details?.recommendation).toContain(
      "adv_task_reclassify_tdd",
    );
    expect(issues[0].details?.recommendation).not.toContain(
      "adv_task_skip_tdd",
    );
  });

  test("does not flag pending tasks", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-impl0005",
          title: "Implement feature",
          status: "pending",
        }),
      ],
    });
    const issues = checkTddCompliance(change);
    expect(issues).toHaveLength(0);
  });
});
