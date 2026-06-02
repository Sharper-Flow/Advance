/**
 * Prep-readiness TDD-inversion severity tests (rq-PR003tdd.1, AC4 of
 * remediateSlopScanFindings / QUAL-012).
 *
 * The metadata-less title-heuristic inversion finding must be ADVISORY
 * (severity "warning"), not a gate-blocking "error". A title regex must not
 * solely own a hard gate-block (P33); the authoritative block for missing or
 * invalid TDD intent remains TASK_TDD_INTENT_MISSING. This aligns
 * prep-readiness with the permissive tdd-contract rq-TDD002sep.2 stance.
 */

import { describe, expect, test } from "vitest";
import { runPrepReadinessChecks } from "./prep-readiness";
import type { Change } from "../types";

/**
 * Two metadata-less tasks: a test task (by title heuristic) blocked_by an
 * implementation task (by title heuristic) — the canonical heuristic-path
 * inversion shape.
 */
function buildInversionChange(): Change {
  return {
    id: "c-inversion",
    title: "Inversion fixture",
    status: "active",
    created_at: "2026-06-02T00:00:00.000Z",
    deltas: {},
    tasks: [
      {
        id: "impl",
        title: "Implement the parser",
        status: "pending",
        deps: [],
        metadata: {},
      },
      {
        id: "test",
        title: "Add failing test for the parser",
        status: "pending",
        deps: [{ type: "blocked_by", target: "impl" }],
        metadata: {},
      },
    ],
  } as unknown as Change;
}

describe("checkTaskGraphIntegrity — TDD inversion severity (rq-PR003tdd.1, AC4)", () => {
  test("heuristic-path inversion is advisory warning, not a gate-blocking error (strict)", () => {
    const result = runPrepReadinessChecks(buildInversionChange(), "strict");
    const inversion = [...result.mustFailures, ...result.warnings].filter(
      (i) => i.code === "TASK_TDD_INVERSION",
    );
    expect(inversion).toHaveLength(1);
    expect(inversion[0].severity).toBe("warning");
    expect(
      result.mustFailures.some((i) => i.code === "TASK_TDD_INVERSION"),
    ).toBe(false);
    expect(result.warnings.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(
      true,
    );
  });

  test("missing tdd_intent still blocks via TASK_TDD_INTENT_MISSING in strict mode", () => {
    const result = runPrepReadinessChecks(buildInversionChange(), "strict");
    expect(
      result.mustFailures.some((i) => i.code === "TASK_TDD_INTENT_MISSING"),
    ).toBe(true);
  });

  test("advisory/off enforcement still emits inversion as a warning", () => {
    for (const mode of ["advisory", "off"] as const) {
      const result = runPrepReadinessChecks(buildInversionChange(), mode);
      const inversion = [...result.mustFailures, ...result.warnings].filter(
        (i) => i.code === "TASK_TDD_INVERSION",
      );
      expect(inversion).toHaveLength(1);
      expect(inversion[0].severity).toBe("warning");
    }
  });
});
