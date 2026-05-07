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
});
