/**
 * Task Classifier Tests
 *
 * TDD red phase: tests written before implementation.
 * Covers metadata-first detection with title heuristic fallback.
 *
 * Spec: .adv/specs/tdd-contract/spec.json
 * Requirements: rq-TDD004cls (classifier), rq-TDD001inl (inline default)
 */

import { describe, test, expect } from "vitest";
import {
  classifyTddIntent,
  getTaskTddCompliance,
  isTestTask,
  isImplTask,
  requiresTddEvidence,
  type TddIntent,
} from "./task-classifier";

// =============================================================================
// Test Fixtures
// =============================================================================

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "tk-abc12345",
    title: "Implement feature",
    section: "Core",
    status: "pending" as const,
    priority: 0,
    created_at: "2026-01-01T00:00:00Z",
    tdd_phase: "none" as const,
    ...overrides,
  };
}

// =============================================================================
// isTestTask — title heuristic
// =============================================================================

describe("isTestTask", () => {
  test("matches 'test' keyword", () => {
    expect(isTestTask("Write unit tests for auth")).toBe(true);
  });

  test("matches 'spec' keyword", () => {
    expect(isTestTask("Update spec scenarios")).toBe(true);
  });

  test("matches 'failing test' keyword", () => {
    expect(isTestTask("Write failing test for login")).toBe(true);
  });

  test("matches 'red phase' keyword", () => {
    expect(isTestTask("Red phase for validator")).toBe(true);
  });

  test("does not match implementation titles", () => {
    expect(isTestTask("Implement user authentication")).toBe(false);
  });

  test("does not match documentation titles", () => {
    expect(isTestTask("Update README")).toBe(false);
  });
});

// =============================================================================
// isImplTask — title heuristic
// =============================================================================

describe("isImplTask", () => {
  test("matches 'implement' keyword", () => {
    expect(isImplTask("Implement user authentication")).toBe(true);
  });

  test("matches 'create' keyword", () => {
    expect(isImplTask("Create shared classifier")).toBe(true);
  });

  test("matches 'add' keyword", () => {
    expect(isImplTask("Add input validation")).toBe(true);
  });

  test("matches 'build' keyword", () => {
    expect(isImplTask("Build the API endpoint")).toBe(true);
  });

  test("does not match 'write test' titles", () => {
    // The regex has a negative lookahead: write\s+(?!test|spec)
    // "Write tests" → "Write " + "tests" → lookahead blocks → false
    expect(isImplTask("Write tests for auth")).toBe(false);
  });

  test("matches 'write' followed by non-test word (known heuristic limitation)", () => {
    // "Write unit tests" → "Write " + "unit" → lookahead passes → true
    // This is a known limitation of title heuristics — metadata.tdd_intent fixes it
    expect(isImplTask("Write unit tests")).toBe(true);
  });

  test("does not match documentation titles", () => {
    expect(isImplTask("Update documentation")).toBe(false);
  });
});

// =============================================================================
// classifyTddIntent — metadata-first with title fallback
// =============================================================================

describe("classifyTddIntent", () => {
  // --- rq-TDD004cls.1: Metadata takes precedence over title heuristics ---

  test("metadata.tdd_intent='inline' overrides title heuristics", () => {
    const task = makeTask({
      title: "Write tests for auth module", // would match isTestTask
      metadata: { tdd_intent: "inline" },
    });
    expect(classifyTddIntent(task)).toBe("inline");
  });

  test("metadata.tdd_intent='not_applicable' overrides test-like title", () => {
    const task = makeTask({
      title: "Update test fixtures documentation", // contains 'test'
      metadata: { tdd_intent: "not_applicable" },
    });
    expect(classifyTddIntent(task)).toBe("not_applicable");
  });

  test("metadata.tdd_intent='separate_verification' is respected", () => {
    const task = makeTask({
      title: "Run integration tests across services",
      metadata: { tdd_intent: "separate_verification" },
    });
    expect(classifyTddIntent(task)).toBe("separate_verification");
  });

  // --- rq-TDD004cls.2: Invalid metadata falls back to title heuristics ---

  test("invalid metadata value falls back to title heuristics for impl task", () => {
    const task = makeTask({
      title: "Implement user authentication",
      metadata: { tdd_intent: "bogus_value" },
    });
    // Falls back to title heuristic: impl task → inline
    expect(classifyTddIntent(task)).toBe("inline");
  });

  test("invalid metadata value falls back to title heuristics for trivial task", () => {
    const task = makeTask({
      title: "Update README documentation",
      metadata: { tdd_intent: "invalid" },
    });
    // Falls back to title heuristic: trivial task → not_applicable
    expect(classifyTddIntent(task)).toBe("not_applicable");
  });

  // --- rq-TDD001inl.3: Default tdd_intent is inline when metadata absent ---

  test("no metadata defaults to inline for logic tasks", () => {
    const task = makeTask({
      title: "Implement user authentication",
    });
    expect(classifyTddIntent(task)).toBe("inline");
  });

  test("no metadata defaults to not_applicable for trivial tasks", () => {
    const task = makeTask({
      title: "Update README documentation",
    });
    expect(classifyTddIntent(task)).toBe("not_applicable");
  });

  test("no metadata defaults to inline for test-like tasks (legacy fallback)", () => {
    const task = makeTask({
      title: "Write unit tests for auth",
    });
    // A test task without metadata is treated as inline (the test is part of impl)
    // This is the legacy fallback behavior
    expect(classifyTddIntent(task)).toBe("inline");
  });

  // --- Edge cases ---

  test("empty metadata object falls back to title heuristics", () => {
    const task = makeTask({
      title: "Create API endpoint",
      metadata: {},
    });
    expect(classifyTddIntent(task)).toBe("inline");
  });

  test("metadata with other keys but no tdd_intent falls back", () => {
    const task = makeTask({
      title: "Fix database connection",
      metadata: { env: "production" },
    });
    expect(classifyTddIntent(task)).toBe("inline");
  });

  test("task with tdd_evidence.skipped and no metadata returns not_applicable", () => {
    const task = makeTask({
      title: "Create task classifier with test-first approach",
      tdd_evidence: { skipped: true, skip_reason: "False positive" },
    });
    // Has skipped TDD evidence → not_applicable
    expect(classifyTddIntent(task)).toBe("not_applicable");
  });

  test("ambiguous title with no clear pattern defaults to inline", () => {
    const task = makeTask({
      title: "Handle edge case in parser",
    });
    expect(classifyTddIntent(task)).toBe("inline");
  });
});

describe("requiresTddEvidence", () => {
  test("requires evidence for explicit inline metadata even when title is non-logic", () => {
    const task = makeTask({
      title: "Coordinate release notes",
      metadata: { tdd_intent: "inline" },
    });
    expect(requiresTddEvidence(task)).toBe(true);
  });

  test("does not require evidence for separate verification", () => {
    const task = makeTask({
      title: "Run E2E suite across services",
      metadata: { tdd_intent: "separate_verification" },
    });
    expect(requiresTddEvidence(task)).toBe(false);
  });
});

describe("getTaskTddCompliance", () => {
  test("returns missing for explicit inline metadata without evidence on non-logic title", () => {
    const task = makeTask({
      title: "Coordinate release notes",
      metadata: { tdd_intent: "inline" },
    });
    expect(getTaskTddCompliance(task)).toBe("missing");
  });

  test("returns compliant when explicit inline task has full evidence", () => {
    const task = makeTask({
      title: "Coordinate release notes",
      metadata: { tdd_intent: "inline" },
      tdd_evidence: {
        red: { recorded_at: "2026-01-01T00:00:00Z" },
        green: { recorded_at: "2026-01-01T00:01:00Z" },
      },
    });
    expect(getTaskTddCompliance(task)).toBe("compliant");
  });
});
