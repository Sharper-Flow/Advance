/**
 * Task Classifier Tests
 *
 * Validates getTaskTddCompliance returns "compliant" when a task has
 * complete TDD evidence (both red and green phases), "missing" when
 * evidence is incomplete or absent, and "not_required" when TDD does
 * not apply.
 *
 * Bug context: prior to this test file, getTaskTddCompliance had no
 * code path to return "compliant" — every inline-intent / logic-heavy
 * task was flagged as missing regardless of actual evidence content.
 * This produced false-positive MISSING_TDD_EVIDENCE blockers during
 * adv_change_archive even when tasks completed full red→green cycles.
 *
 * Spec ref: rq-TDD004cls (Task Classifier with Metadata-First Detection)
 */

import { describe, test, expect } from "vitest";
import {
  classifyTddIntent,
  getTaskTddCompliance,
  requiresTddEvidence,
  resolveTaskEvidence,
  validateTaskEvidenceForStage,
} from "./task-classifier";

const evidence = {
  red: {
    test_file: "src/foo.test.ts",
    command: "vitest run src/foo.test.ts",
    output_snippet: "FAIL  src/foo.test.ts",
    exit_code: 1,
    recorded_at: "2026-05-03T22:57:59.292Z",
  },
  green: {
    test_file: "src/foo.test.ts",
    command: "vitest run src/foo.test.ts",
    output_snippet: "PASS  src/foo.test.ts",
    exit_code: 0,
    recorded_at: "2026-05-03T23:00:32.477Z",
  },
};

describe("classifyTddIntent", () => {
  test("metadata.tdd_intent: inline → inline", () => {
    expect(
      classifyTddIntent({
        title: "Implement feature",
        metadata: { tdd_intent: "inline" },
      }),
    ).toBe("inline");
  });

  test("metadata.tdd_intent: not_applicable → not_applicable", () => {
    expect(
      classifyTddIntent({
        title: "Implement feature",
        metadata: { tdd_intent: "not_applicable" },
      }),
    ).toBe("not_applicable");
  });

  test("metadata.tdd_intent: separate_verification → separate_verification", () => {
    expect(
      classifyTddIntent({
        title: "Verify integration",
        metadata: { tdd_intent: "separate_verification" },
      }),
    ).toBe("separate_verification");
  });

  test("invalid metadata + logic title → inline (heuristic fallback)", () => {
    expect(
      classifyTddIntent({
        title: "Implement parser",
        metadata: { tdd_intent: "garbage" },
      }),
    ).toBe("inline");
  });

  test("no metadata + docs title → not_applicable (trivial heuristic)", () => {
    expect(
      classifyTddIntent({
        title: "Update docs",
      }),
    ).toBe("not_applicable");
  });
});

describe("requiresTddEvidence", () => {
  test("inline intent → true", () => {
    expect(
      requiresTddEvidence({
        title: "Implement parser",
        metadata: { tdd_intent: "inline" },
      }),
    ).toBe(true);
  });

  test("not_applicable intent → false", () => {
    expect(
      requiresTddEvidence({
        title: "Implement parser",
        metadata: { tdd_intent: "not_applicable" },
      }),
    ).toBe(false);
  });

  test("separate_verification intent → false", () => {
    expect(
      requiresTddEvidence({
        title: "Verify integration",
        metadata: { tdd_intent: "separate_verification" },
      }),
    ).toBe(false);
  });

  test("docs title without metadata → false", () => {
    expect(
      requiresTddEvidence({
        title: "Update README",
      }),
    ).toBe(false);
  });
});

describe("getTaskTddCompliance", () => {
  test("inline intent + complete red+green evidence → compliant", () => {
    // Real-world failure mode: task completed full TDD cycle, evidence
    // recorded under tdd_evidence (passthrough field), but the validator
    // returned "missing" anyway because the function never inspected
    // the evidence. This test pins the correct behavior.
    expect(
      getTaskTddCompliance({
        title: "Implement evidence write idempotency",
        metadata: { tdd_intent: "inline" },
        tdd_evidence: evidence,
      }),
    ).toBe("compliant");
  });

  test("inline intent + task completion verification → compliant", () => {
    expect(
      getTaskTddCompliance({
        title: "Implement evidence write idempotency",
        metadata: { tdd_intent: "inline" },
        verification:
          "Targeted tests, pnpm run check, pnpm test, and pnpm run build passed.",
      }),
    ).toBe("compliant");
  });

  test("inline intent + only red evidence → missing", () => {
    expect(
      getTaskTddCompliance({
        title: "Implement evidence write idempotency",
        metadata: { tdd_intent: "inline" },
        tdd_evidence: { red: evidence.red },
      }),
    ).toBe("missing");
  });

  test("inline intent + only green evidence → missing", () => {
    expect(
      getTaskTddCompliance({
        title: "Implement evidence write idempotency",
        metadata: { tdd_intent: "inline" },
        tdd_evidence: { green: evidence.green },
      }),
    ).toBe("missing");
  });

  test("inline intent + no evidence → missing", () => {
    expect(
      getTaskTddCompliance({
        title: "Implement evidence write idempotency",
        metadata: { tdd_intent: "inline" },
      }),
    ).toBe("missing");
  });

  test("inline intent + empty evidence object → missing", () => {
    expect(
      getTaskTddCompliance({
        title: "Implement evidence write idempotency",
        metadata: { tdd_intent: "inline" },
        tdd_evidence: {},
      }),
    ).toBe("missing");
  });

  test("not_applicable intent → not_required (regardless of evidence)", () => {
    expect(
      getTaskTddCompliance({
        title: "Update docs",
        metadata: { tdd_intent: "not_applicable" },
      }),
    ).toBe("not_required");
  });

  test("separate_verification intent → not_required", () => {
    expect(
      getTaskTddCompliance({
        title: "Verify cross-cutting flow",
        metadata: { tdd_intent: "separate_verification" },
      }),
    ).toBe("not_required");
  });

  test("title-heuristic logic task without evidence → missing", () => {
    expect(
      getTaskTddCompliance({
        title: "Implement new feature",
      }),
    ).toBe("missing");
  });

  test("title-heuristic logic task with task completion verification → compliant", () => {
    expect(
      getTaskTddCompliance({
        title: "Implement new feature",
        verification: "Task completed with red/green test evidence.",
      }),
    ).toBe("compliant");
  });

  test("title-heuristic logic task with complete evidence → compliant", () => {
    expect(
      getTaskTddCompliance({
        title: "Implement new feature",
        tdd_evidence: evidence,
      }),
    ).toBe("compliant");
  });

  test("title-heuristic trivial task → not_required", () => {
    expect(
      getTaskTddCompliance({
        title: "Update README",
      }),
    ).toBe("not_required");
  });

  // Regression: data/constant tasks should not trigger MISSING_TDD_EVIDENCE (#62)
  test.each([
    ["Add new entry to denylist", "not_required"],
    ["Update manifest entry for plugin", "not_required"],
    ["Bump dependency version", "not_required"],
    ["Update schema stub for types", "not_required"],
    ["Add data file for region mapping", "not_required"],
    ["Update constant values in config", "not_required"],
    ["Add new entry to allowlist", "not_required"],
    ["Update seed data for tests", "not_required"],
    ["Update fixture data", "not_required"],
    ["Add mapping table entry", "not_required"],
    // Behavior tasks must still require TDD evidence
    ["Implement new feature", "missing"],
    ["Fix edge case in parser", "missing"],
    ["Create handler for auth flow", "missing"],
    ["Build retry logic for API calls", "missing"],
  ] as const)("title-heuristic %s → %s", (title, expected) => {
    expect(getTaskTddCompliance({ title })).toBe(expected);
  });
});

describe("resolveTaskEvidence", () => {
  const baseTask = (overrides: Partial<import("../types").Task> = {}) =>
    ({
      id: "tk-test",
      title: "Implement evidence policy resolver",
      type: "code",
      status: "pending",
      priority: 0,
      created_at: "2026-07-17T00:00:00.000Z",
      ...overrides,
    }) as import("../types").Task;

  test("new code task with explicit test policy is valid and new", () => {
    const result = resolveTaskEvidence(
      baseTask({
        metadata: { tdd_intent: "inline" },
        evidence_plan: {
          policy: "test",
          proof_target: "Automated red/green tests",
          provenance: "new",
        },
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.policy).toBe("test");
    expect(result.compatibility).toBe("new");
    expect(result.errors).toHaveLength(0);
  });

  test("legacy code task without explicit policy defaults to test with proof target", () => {
    const result = resolveTaskEvidence(
      baseTask({ metadata: { tdd_intent: "inline" } }),
    );
    expect(result.valid).toBe(true);
    expect(result.policy).toBe("test");
    expect(result.proof_target).toBeTruthy();
    expect(result.compatibility).toBe("legacy");
  });

  test("behavior-critical code task with not_applicable is invalid", () => {
    const result = resolveTaskEvidence(
      baseTask({
        metadata: { tdd_intent: "not_applicable" },
        evidence_policy: "not_applicable",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not_applicable"))).toBe(true);
  });

  test("behavior-critical non-test route requires rationale and review conclusion", () => {
    const result = resolveTaskEvidence(
      baseTask({
        metadata: { tdd_intent: "inline" },
        evidence_policy: "review",
        evidence_plan: {
          policy: "review",
          proof_target: "Structured review conclusion",
          provenance: "new",
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("rationale"))).toBe(true);
    expect(result.errors.some((e) => e.includes("review conclusion"))).toBe(
      true,
    );
  });

  test("behavior-critical non-test route with rationale and review is valid", () => {
    const result = resolveTaskEvidence(
      baseTask({
        metadata: { tdd_intent: "inline" },
        evidence_policy: "review",
        evidence_plan: {
          policy: "review",
          proof_target: "Structured review conclusion",
          rationale: "Automated tests would duplicate the reviewer check.",
          review_conclusion: "Review approved by senior engineer.",
          provenance: "new",
        },
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.policy).toBe("review");
  });

  test("non-test rationale must be bounded to 500 non-whitespace characters", () => {
    const longRationale = "a".repeat(600);
    const result = resolveTaskEvidence(
      baseTask({
        metadata: { tdd_intent: "inline" },
        evidence_policy: "review",
        evidence_plan: {
          policy: "review",
          proof_target: "Structured review conclusion",
          rationale: longRationale,
          review_conclusion: "Review approved.",
          provenance: "new",
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("500"))).toBe(true);
  });

  test("legacy code task without plan is normalized with legacy compatibility", () => {
    const result = resolveTaskEvidence(baseTask({ evidence_policy: "test" }));
    expect(result.valid).toBe(true);
    expect(result.policy).toBe("test");
    expect(result.compatibility).toBe("legacy");
  });

  test("legacy docs task without evidence policy defaults to readable non-test policy", () => {
    const result = resolveTaskEvidence(
      baseTask({ type: "docs", title: "Update README" }),
    );
    expect(result.valid).toBe(true);
    expect(result.compatibility).toBe("legacy");
    expect(result.policy).not.toBe("test");
  });

  test("reclassified task carries reclassified compatibility", () => {
    const result = resolveTaskEvidence(
      baseTask({
        metadata: { tdd_intent: "not_applicable" },
        evidence_policy: "source_citation",
        type: "docs",
        tdd_reclassification: {
          from_intent: "inline",
          to_intent: "not_applicable",
          reason: "Docs task",
          approved_by_user: true,
          approval_evidence: "User approved",
          approved_at: "2026-07-17T00:00:00.000Z",
        },
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.compatibility).toBe("reclassified");
  });

  test("explicit evidence plan provenance takes precedence", () => {
    const result = resolveTaskEvidence(
      baseTask({
        evidence_plan: {
          policy: "test",
          proof_target: "Custom proof target",
          provenance: "new",
        },
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.policy).toBe("test");
    expect(result.proof_target).toBe("Custom proof target");
    expect(result.compatibility).toBe("new");
  });
});

describe("validateTaskEvidenceForStage", () => {
  function baseTask(overrides: any = {}) {
    return {
      id: "tk-1",
      title: "Implement feature",
      type: "code" as const,
      status: "pending" as const,
      priority: 0,
      created_at: "2026-07-17T00:00:00.000Z",
      ...overrides,
    };
  }

  test("prep stage accepts valid test-route plan", () => {
    const result = validateTaskEvidenceForStage(
      baseTask({
        evidence_plan: {
          policy: "test",
          proof_target: "Automated tests",
          provenance: "new",
          stage: "stage-v2",
        },
      }),
      "prep",
    );
    expect(result.valid).toBe(true);
  });

  test("completion stage requires review_evidence_ref for stage-v2 non-test route", () => {
    const result = validateTaskEvidenceForStage(
      baseTask({
        evidence_plan: {
          policy: "review",
          proof_target: "Structured review",
          rationale: "Rationale",
          provenance: "new",
          stage: "stage-v2",
        },
      }),
      "completion",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("review_evidence_ref"))).toBe(
      true,
    );
  });

  test("completion stage accepts legacy non-test route with review_conclusion", () => {
    const result = validateTaskEvidenceForStage(
      baseTask({
        evidence_plan: {
          policy: "review",
          proof_target: "Structured review",
          rationale: "Rationale",
          review_conclusion: "Ready",
          provenance: "legacy",
        },
      }),
      "completion",
    );
    expect(result.valid).toBe(true);
  });

  test("completion stage accepts stage-v2 non-test route with matching reviewer report", () => {
    const task = baseTask({
      id: "tk-1",
      evidence_plan: {
        policy: "review",
        proof_target: "Structured review",
        rationale: "Rationale",
        review_evidence_ref: { report_key: "c|tk-1|adv-reviewer|1" },
        provenance: "new",
        stage: "stage-v2",
      },
    });
    const report = {
      schema_version: "1.0" as const,
      change_id: "c",
      task_id: "tk-1",
      scope: { kind: "task" as const, task_id: "tk-1" },
      attempt: 1,
      agent: "adv-reviewer" as const,
      workdir_used: "/tmp",
      phase: "review" as const,
      verdict: "READY" as const,
      blocking_findings: [],
      nonblocking_findings: [],
      changes_made: [],
      wisdom_candidates: [],
      verification: {
        tests_run: [],
        results: "n/a" as const,
        evidence: "review",
      },
      scope_drift: null,
      risks: [],
      required_main_agent_actions: [],
    };
    const result = validateTaskEvidenceForStage(task, "completion", [report]);
    expect(result.valid).toBe(true);
  });

  test("completion stage rejects review_evidence_ref that does not resolve to same-task report", () => {
    const task = baseTask({
      id: "tk-1",
      evidence_plan: {
        policy: "review",
        proof_target: "Structured review",
        rationale: "Rationale",
        review_evidence_ref: { report_key: "c|tk-2|adv-reviewer|1" },
        provenance: "new",
        stage: "stage-v2",
      },
    });
    const report = {
      schema_version: "1.0" as const,
      change_id: "c",
      task_id: "tk-2",
      scope: { kind: "task" as const, task_id: "tk-2" },
      attempt: 1,
      agent: "adv-reviewer" as const,
      workdir_used: "/tmp",
      phase: "review" as const,
      verdict: "READY" as const,
      blocking_findings: [],
      nonblocking_findings: [],
      changes_made: [],
      wisdom_candidates: [],
      verification: {
        tests_run: [],
        results: "n/a" as const,
        evidence: "review",
      },
      scope_drift: null,
      risks: [],
      required_main_agent_actions: [],
    };
    const result = validateTaskEvidenceForStage(task, "completion", [report]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not resolve"))).toBe(
      true,
    );
  });
});
