/**
 * Prep-Readiness Validator Tests
 *
 * TDD red phase: tests written before implementation.
 * Covers all must-level and warning-level checks for the prep gate.
 */

import { describe, test, expect } from "vitest";
import {
  checkRequirementSmells,
  checkScenarioAdequacy,
  checkTaskGraphIntegrity,
  checkCrossRepoRouting,
  checkTddIntentAssigned,
  runPrepReadinessChecks,
} from "./prep-readiness";
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
    status: "pending",
    priority: 0,
    created_at: "2026-01-01T00:00:00Z",
    tdd_phase: "none",
    ...overrides,
  };
}

function makeDelta(reqId: string, reqTitle: string, scenarios: unknown[] = []) {
  return {
    id: `dl-${reqId.slice(3)}`,
    operation: "add" as const,
    requirement: {
      id: reqId,
      title: reqTitle,
      body: "Requirement body text.",
      priority: "must" as const,
      scenarios,
    },
  };
}

function makeSingleScenario(id: string) {
  return {
    id: `${id}.1`,
    title: "Happy path",
    given: ["the system is ready"],
    when: "the user acts",
    then: ["the action succeeds"],
  };
}

// =============================================================================
// checkRequirementSmells
// =============================================================================

describe("checkRequirementSmells", () => {
  test("returns no issues when change has no deltas", () => {
    const change = makeChange({ deltas: {} });
    const issues = checkRequirementSmells(change);
    expect(issues).toHaveLength(0);
  });

  test("returns no issues for a clean, specific requirement title", () => {
    const change = makeChange({
      deltas: {
        "my-cap": [
          makeDelta("rq-clean001", "User can log in with email and password", [
            makeSingleScenario("rq-clean001"),
          ]),
        ],
      },
    });
    const issues = checkRequirementSmells(change);
    expect(issues).toHaveLength(0);
  });

  test("returns SMELL_SUBJECTIVE warning for 'easy' in title", () => {
    const change = makeChange({
      deltas: {
        cap: [
          makeDelta("rq-sub0001", "Easy login for users", [
            makeSingleScenario("rq-sub0001"),
          ]),
        ],
      },
    });
    const issues = checkRequirementSmells(change);
    const smell = issues.find((i) => i.code === "SMELL_SUBJECTIVE");
    expect(smell).toBeDefined();
    expect(smell?.severity).toBe("warning");
  });

  test("returns SMELL_SUBJECTIVE warning for 'simple' in title", () => {
    const change = makeChange({
      deltas: {
        cap: [
          makeDelta("rq-sub0002", "Simple onboarding flow", [
            makeSingleScenario("rq-sub0002"),
          ]),
        ],
      },
    });
    const issues = checkRequirementSmells(change);
    expect(issues.some((i) => i.code === "SMELL_SUBJECTIVE")).toBe(true);
  });

  test("returns SMELL_AMBIGUOUS warning for 'etc' in title", () => {
    const change = makeChange({
      deltas: {
        cap: [
          makeDelta("rq-amb0001", "Handle errors, timeouts, etc", [
            makeSingleScenario("rq-amb0001"),
          ]),
        ],
      },
    });
    const issues = checkRequirementSmells(change);
    expect(issues.some((i) => i.code === "SMELL_AMBIGUOUS")).toBe(true);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
  });

  test("returns SMELL_SUPERLATIVE warning for 'best' in title", () => {
    const change = makeChange({
      deltas: {
        cap: [
          makeDelta("rq-sup0001", "Best possible response time", [
            makeSingleScenario("rq-sup0001"),
          ]),
        ],
      },
    });
    const issues = checkRequirementSmells(change);
    expect(issues.some((i) => i.code === "SMELL_SUPERLATIVE")).toBe(true);
  });

  test("returns SMELL_NEGATIVE warning for 'not' in title", () => {
    const change = makeChange({
      deltas: {
        cap: [
          makeDelta(
            "rq-neg0001",
            "System must not allow unauthenticated access",
            [makeSingleScenario("rq-neg0001")],
          ),
        ],
      },
    });
    const issues = checkRequirementSmells(change);
    expect(issues.some((i) => i.code === "SMELL_NEGATIVE")).toBe(true);
  });

  test("returns SMELL_TOTALITY warning for 'all' in title", () => {
    const change = makeChange({
      deltas: {
        cap: [
          makeDelta("rq-tot0001", "All users must verify email", [
            makeSingleScenario("rq-tot0001"),
          ]),
        ],
      },
    });
    const issues = checkRequirementSmells(change);
    expect(issues.some((i) => i.code === "SMELL_TOTALITY")).toBe(true);
  });

  test("all smell issues have severity warning (never error)", () => {
    const change = makeChange({
      deltas: {
        cap: [
          makeDelta("rq-mix0001", "All easy best cases without errors, etc", [
            makeSingleScenario("rq-mix0001"),
          ]),
        ],
      },
    });
    const issues = checkRequirementSmells(change);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
  });
});

// =============================================================================
// checkScenarioAdequacy
// =============================================================================

describe("checkScenarioAdequacy", () => {
  test("returns no issues when change has no deltas", () => {
    const change = makeChange({ deltas: {} });
    const issues = checkScenarioAdequacy(change);
    expect(issues).toHaveLength(0);
  });

  test("returns SCENARIO_MISSING error when requirement has no scenarios", () => {
    const change = makeChange({
      deltas: {
        cap: [makeDelta("rq-noscn01", "Feature with no scenarios", [])],
      },
    });
    const issues = checkScenarioAdequacy(change);
    const issue = issues.find((i) => i.code === "SCENARIO_MISSING");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  test("returns SCENARIO_MISSING error when scenarios field is undefined", () => {
    const change = makeChange({
      deltas: {
        cap: [
          {
            id: "dl-nodelta1",
            operation: "add" as const,
            requirement: {
              id: "rq-noscn02",
              title: "Feature without scenarios field",
              body: "body",
              priority: "must" as const,
              // no scenarios field
            },
          },
        ],
      },
    });
    const issues = checkScenarioAdequacy(change);
    expect(
      issues.some(
        (i) => i.code === "SCENARIO_MISSING" && i.severity === "error",
      ),
    ).toBe(true);
  });

  test("returns no SCENARIO_MISSING error when requirement has at least one scenario", () => {
    const change = makeChange({
      deltas: {
        cap: [
          makeDelta("rq-hasscn1", "Feature with scenario", [
            makeSingleScenario("rq-hasscn1"),
          ]),
        ],
      },
    });
    const issues = checkScenarioAdequacy(change);
    expect(issues.some((i) => i.code === "SCENARIO_MISSING")).toBe(false);
  });

  test("non-add deltas (modify/remove/rename) do not trigger scenario checks", () => {
    const change = makeChange({
      deltas: {
        cap: [
          {
            id: "dl-mod0001",
            operation: "remove" as const,
            requirement_id: "rq-old00001",
          },
        ],
      },
    });
    const issues = checkScenarioAdequacy(change);
    expect(issues.some((i) => i.code === "SCENARIO_MISSING")).toBe(false);
  });
});

// =============================================================================
// checkTaskGraphIntegrity
// =============================================================================

describe("checkTaskGraphIntegrity", () => {
  test("returns no issues for an empty task list", () => {
    const change = makeChange({ tasks: [] });
    const issues = checkTaskGraphIntegrity(change);
    expect(issues).toHaveLength(0);
  });

  test("returns TASK_TDD_INVERSION error when test task is blocked_by impl task", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl0001", title: "Implement feature X" }),
        makeTask({
          id: "tk-test0001",
          title: "Write tests for feature X",
          deps: [{ type: "blocked_by", target: "tk-impl0001" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    const issue = issues.find((i) => i.code === "TASK_TDD_INVERSION");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  test("returns no TASK_TDD_INVERSION when impl task is blocked_by test task (correct TDD order)", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-test0002", title: "Write failing tests" }),
        makeTask({
          id: "tk-impl0002",
          title: "Implement feature (green)",
          deps: [{ type: "blocked_by", target: "tk-test0002" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    expect(issues.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(false);
  });

  test("returns no TASK_TDD_INVERSION for docs/chore tasks", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-docs0001", title: "Update documentation" }),
        makeTask({
          id: "tk-fix0001",
          title: "Fix typo in readme",
          deps: [{ type: "blocked_by", target: "tk-docs0001" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    expect(issues.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(false);
  });

  test("skips TDD inversion check when test task has tdd_evidence.skipped (regression: trivial test alignment flagged as inversion)", () => {
    // Scenario: a test task with TDD explicitly skipped is blocked_by an impl task.
    // The inversion check should not fire because TDD was skipped — the task is
    // just aligning test assertions, not writing a new red-phase test.
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl5001", title: "Implement feature Z" }),
        makeTask({
          id: "tk-test5001",
          title: "Write tests for feature Z",
          deps: [{ type: "blocked_by", target: "tk-impl5001" }],
          tdd_evidence: {
            skipped: true,
            skip_reason: "trivial: updating test count and expected list",
          },
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    expect(issues.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(false);
  });

  test("ignores cancelled tasks when checking TDD inversion (regression: cancelled tasks blocked prep gate)", () => {
    // Scenario: a cancelled verification task had a blocked_by dep on an impl task.
    // The gate validator was flagging this as a TDD inversion even though the task
    // was no longer active. Cancelled tasks must be excluded from graph checks.
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl9001", title: "Add config rule" }),
        makeTask({
          id: "tk-verify9001",
          title: "Verify the rule is active",
          status: "cancelled",
          deps: [{ type: "blocked_by", target: "tk-impl9001" }],
        }),
        makeTask({ id: "tk-verify9002", title: "Verify config output" }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    expect(issues.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(false);
  });

  test("ignores cancelled tasks when checking orphan warning", () => {
    // Cancelled tasks should not be counted as orphans or factor into orphan detection.
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl9002", title: "Add feature" }),
        makeTask({
          id: "tk-old9001",
          title: "Old superseded task",
          status: "cancelled",
        }),
        makeTask({
          id: "tk-verify9003",
          title: "Verify feature works",
          deps: [{ type: "blocked_by", target: "tk-impl9002" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    expect(issues.some((i) => i.code === "TASK_ORPHAN")).toBe(false);
  });

  test("returns TASK_ORPHAN warning for task with no deps and not a dep of anything", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-lone0001", title: "Standalone task", deps: [] }),
        makeTask({
          id: "tk-dep00001",
          title: "Task with dependency",
          deps: [{ type: "blocked_by", target: "tk-other001" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    // tk-lone0001 has no deps and nothing depends on it → orphan
    const orphan = issues.find(
      (i) => i.code === "TASK_ORPHAN" && i.path?.includes("tk-lone0001"),
    );
    expect(orphan).toBeDefined();
    expect(orphan?.severity).toBe("warning");
  });

  test("does not flag orphan when task is a dep of another task", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-first001", title: "First task", deps: [] }),
        makeTask({
          id: "tk-second01",
          title: "Second task",
          deps: [{ type: "blocked_by", target: "tk-first001" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    // tk-first001 has no deps but IS a dep of tk-second01 → not orphan
    expect(
      issues.some(
        (i) => i.code === "TASK_ORPHAN" && i.path?.includes("tk-first001"),
      ),
    ).toBe(false);
  });

  // --- Metadata-based TDD inversion detection (rq-TDD005inv) ---

  test("separate_verification task blocked by impl task is NOT an inversion (rq-TDD005inv.2)", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl6001", title: "Implement auth module" }),
        makeTask({
          id: "tk-e2e06001",
          title: "Run E2E tests across services",
          metadata: { tdd_intent: "separate_verification" },
          deps: [{ type: "blocked_by", target: "tk-impl6001" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    expect(issues.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(false);
  });

  test("inline metadata prevents false positive for test-like title (rq-TDD005inv.3)", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl7001", title: "Create API endpoint" }),
        makeTask({
          id: "tk-cls07001",
          title: "Create task classifier with test-first approach",
          metadata: { tdd_intent: "inline" },
          deps: [{ type: "blocked_by", target: "tk-impl7001" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    // "test-first approach" in title would trigger isTestTask, but metadata says inline
    expect(issues.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(false);
  });

  test("not_applicable metadata prevents false positive for test-like title", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl8001", title: "Implement feature" }),
        makeTask({
          id: "tk-doc08001",
          title: "Update test documentation and spec scenarios",
          metadata: { tdd_intent: "not_applicable" },
          deps: [{ type: "blocked_by", target: "tk-impl8001" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    expect(issues.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(false);
  });

  test("test task without metadata blocked by impl task is still flagged (legacy fallback)", () => {
    // Legacy behavior preserved: no metadata → title heuristics → inversion detected
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl9101", title: "Implement feature Y" }),
        makeTask({
          id: "tk-test9101",
          title: "Write tests for feature Y",
          deps: [{ type: "blocked_by", target: "tk-impl9101" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    expect(issues.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(true);
  });

  test("remediation suggests merge, not dependency reversal (rq-TDD006rem)", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl9201", title: "Implement feature Z" }),
        makeTask({
          id: "tk-test9201",
          title: "Write tests for feature Z",
          deps: [{ type: "blocked_by", target: "tk-impl9201" }],
        }),
      ],
    });
    const issues = checkTaskGraphIntegrity(change);
    const inversion = issues.find((i) => i.code === "TASK_TDD_INVERSION");
    expect(inversion).toBeDefined();
    // Should suggest merge, not "reverse the dependency"
    const remediation = (inversion?.details?.remediation as string) ?? "";
    expect(remediation.toLowerCase()).toContain("merge");
    expect(remediation).not.toContain("Reverse the dependency");
  });
});

// =============================================================================
// checkCrossRepoRouting
// =============================================================================

describe("checkCrossRepoRouting", () => {
  test("returns no issues when no tasks have routing metadata", () => {
    const change = makeChange({
      tasks: [makeTask({ id: "tk-local001", title: "Local task" })],
    });
    const issues = checkCrossRepoRouting(change);
    expect(issues).toHaveLength(0);
  });

  test("returns CROSS_REPO_MISSING_METADATA error when target_repo set but target_path absent", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-xrp0001",
          title: "Cross-repo task",
          target_repo: "backend",
          // target_path intentionally absent
        }),
      ],
    });
    const issues = checkCrossRepoRouting(change);
    const issue = issues.find((i) => i.code === "CROSS_REPO_MISSING_METADATA");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  test("returns CROSS_REPO_MISSING_METADATA error when target_path set but target_repo absent", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-xrp0002",
          title: "Cross-repo task",
          target_path: "/home/user/dev/backend",
          // target_repo intentionally absent
        }),
      ],
    });
    const issues = checkCrossRepoRouting(change);
    expect(
      issues.some(
        (i) =>
          i.code === "CROSS_REPO_MISSING_METADATA" && i.severity === "error",
      ),
    ).toBe(true);
  });

  test("returns no error when both target_repo and target_path are set", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-xrp0003",
          title: "Cross-repo task",
          target_repo: "backend",
          target_path: "/home/user/dev/backend",
        }),
      ],
    });
    const issues = checkCrossRepoRouting(change);
    expect(issues.some((i) => i.code === "CROSS_REPO_MISSING_METADATA")).toBe(
      false,
    );
  });

  test("returns no error when neither target_repo nor target_path is set (local task)", () => {
    const change = makeChange({
      tasks: [makeTask({ id: "tk-local002", title: "Local task" })],
    });
    const issues = checkCrossRepoRouting(change);
    expect(issues.some((i) => i.code === "CROSS_REPO_MISSING_METADATA")).toBe(
      false,
    );
  });

  test("returns CROSS_REPO_HINT_UNROUTED warning when title contains '[backend]' but no routing metadata", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-hint0001",
          title: "[backend] Update database migrations",
        }),
      ],
    });
    const issues = checkCrossRepoRouting(change);
    expect(
      issues.some(
        (i) =>
          i.code === "CROSS_REPO_HINT_UNROUTED" && i.severity === "warning",
      ),
    ).toBe(true);
  });

  test("does not warn about repo hint when routing metadata is present", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-hint0002",
          title: "[backend] Update database migrations",
          target_repo: "backend",
          target_path: "/home/user/dev/backend",
        }),
      ],
    });
    const issues = checkCrossRepoRouting(change);
    expect(issues.some((i) => i.code === "CROSS_REPO_HINT_UNROUTED")).toBe(
      false,
    );
  });
});

// =============================================================================
// checkTddIntentAssigned (rq-PR006tdi)
// =============================================================================

describe("checkTddIntentAssigned", () => {
  test("returns TASK_TDD_INTENT_MISSING error for task without metadata.tdd_intent (rq-PR006tdi.1)", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-nointent", title: "Implement feature", metadata: {} }),
      ],
    });
    const issues = checkTddIntentAssigned(change);
    const issue = issues.find((i) => i.code === "TASK_TDD_INTENT_MISSING");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("tk-nointent");
  });

  test("returns TASK_TDD_INTENT_MISSING error for task with no metadata at all (rq-PR006tdi.1)", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-nometa1", title: "Implement feature" }),
      ],
    });
    const issues = checkTddIntentAssigned(change);
    expect(issues.some((i) => i.code === "TASK_TDD_INTENT_MISSING")).toBe(true);
  });

  test("returns no issues when all tasks have valid tdd_intent (rq-PR006tdi.2)", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-ok0001", title: "Impl feature", metadata: { tdd_intent: "inline" } }),
        makeTask({ id: "tk-ok0002", title: "E2E verification", metadata: { tdd_intent: "separate_verification" } }),
        makeTask({ id: "tk-ok0003", title: "Update docs", metadata: { tdd_intent: "not_applicable" } }),
      ],
    });
    const issues = checkTddIntentAssigned(change);
    expect(issues).toHaveLength(0);
  });

  test("excludes cancelled tasks from the check (rq-PR006tdi.3)", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-active1", title: "Active task", metadata: { tdd_intent: "inline" } }),
        makeTask({ id: "tk-cancel1", title: "Cancelled task without intent", status: "cancelled" }),
      ],
    });
    const issues = checkTddIntentAssigned(change);
    expect(issues.some((i) => i.code === "TASK_TDD_INTENT_MISSING")).toBe(false);
  });

  test("returns TASK_TDD_INTENT_MISSING error for invalid tdd_intent value (rq-PR006tdi.6)", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-invalid1",
          title: "Task with bad intent",
          metadata: { tdd_intent: "bogus_value" },
        }),
      ],
    });
    const issues = checkTddIntentAssigned(change);
    const issue = issues.find((i) => i.code === "TASK_TDD_INTENT_MISSING");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("bogus_value");
  });

  test("returns issues for multiple tasks missing intent", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-miss001", title: "Task A" }),
        makeTask({ id: "tk-miss002", title: "Task B", metadata: {} }),
        makeTask({ id: "tk-ok00001", title: "Task C", metadata: { tdd_intent: "inline" } }),
      ],
    });
    const issues = checkTddIntentAssigned(change);
    const missing = issues.filter((i) => i.code === "TASK_TDD_INTENT_MISSING");
    expect(missing).toHaveLength(2);
  });

  test("returns no issues for an empty task list", () => {
    const change = makeChange({ tasks: [] });
    const issues = checkTddIntentAssigned(change);
    expect(issues).toHaveLength(0);
  });
});

// =============================================================================
// runPrepReadinessChecks (integration)
// =============================================================================

describe("runPrepReadinessChecks", () => {
  test("returns no must-failures for a minimal valid change with no deltas", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-a000001", title: "Write failing tests", deps: [], metadata: { tdd_intent: "inline" } }),
        makeTask({
          id: "tk-b000001",
          title: "Implement feature",
          deps: [{ type: "blocked_by", target: "tk-a000001" }],
          metadata: { tdd_intent: "inline" },
        }),
      ],
      deltas: {},
    });
    const result = runPrepReadinessChecks(change);
    expect(result.mustFailures).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  test("returns must-failure for requirement with no scenarios", () => {
    const change = makeChange({
      deltas: {
        cap: [makeDelta("rq-noscn10", "Feature with no scenarios", [])],
      },
    });
    const result = runPrepReadinessChecks(change);
    expect(result.mustFailures.some((i) => i.code === "SCENARIO_MISSING")).toBe(
      true,
    );
    expect(result.passed).toBe(false);
  });

  test("returns must-failure for TDD inversion", () => {
    const change = makeChange({
      tasks: [
        makeTask({ id: "tk-impl0010", title: "Implement auth module" }),
        makeTask({
          id: "tk-test0010",
          title: "Write tests for auth module",
          deps: [{ type: "blocked_by", target: "tk-impl0010" }],
        }),
      ],
    });
    const result = runPrepReadinessChecks(change);
    expect(
      result.mustFailures.some((i) => i.code === "TASK_TDD_INVERSION"),
    ).toBe(true);
    expect(result.passed).toBe(false);
  });

  test("returns must-failure for incomplete cross-repo routing", () => {
    const change = makeChange({
      tasks: [
        makeTask({
          id: "tk-xrp0010",
          title: "Task in backend repo",
          target_repo: "backend",
          // missing target_path
        }),
      ],
    });
    const result = runPrepReadinessChecks(change);
    expect(
      result.mustFailures.some((i) => i.code === "CROSS_REPO_MISSING_METADATA"),
    ).toBe(true);
    expect(result.passed).toBe(false);
  });

  test("passes (no must-failures) when change has only warnings", () => {
    const change = makeChange({
      deltas: {
        cap: [
          makeDelta("rq-warn0001", "Easy login flow", [
            makeSingleScenario("rq-warn0001"),
          ]),
        ],
      },
      tasks: [
        makeTask({ id: "tk-warn0001", title: "Standalone task", deps: [], metadata: { tdd_intent: "inline" } }),
      ],
    });
    const result = runPrepReadinessChecks(change);
    // Smell warning + orphan warning — but no must-failures
    expect(result.mustFailures).toHaveLength(0);
    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("result includes checksPerformed list", () => {
    const change = makeChange();
    const result = runPrepReadinessChecks(change);
    expect(Array.isArray(result.checksPerformed)).toBe(true);
    expect(result.checksPerformed.length).toBeGreaterThan(0);
  });

  test("result has checkedAt ISO timestamp", () => {
    const change = makeChange();
    const result = runPrepReadinessChecks(change);
    expect(result.checkedAt).toBeDefined();
    expect(() => new Date(result.checkedAt)).not.toThrow();
  });
});
