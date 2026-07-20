/**
 * strict-plan-validation tests — pre-cutover plan surface proof (AC9/DDC5).
 *
 * Activation requires proof that the plan surface is strict and functional:
 * every gate position derives a parseable actionable plan with the
 * manifest-owned command, exceptional states (terminal/archive-ready,
 * conflicting) behave per contract, malformed payloads are rejected at the
 * boundary, and derivation is deterministic.
 */

import { describe, expect, test } from "vitest";

import { GATE_ORDER } from "../types";
import { validateStrictPlanSurface } from "./strict-plan-validation";

describe("validateStrictPlanSurface", () => {
  test("passes against the canonical plan kernel with all checks recorded", () => {
    const result = validateStrictPlanSurface();
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    // 7 gate positions + terminal + archive-ready + malformed rejection +
    // conflicting-state degradation + determinism.
    expect(result.checks).toBe(12);
    expect(result.detail).toContain("12");
  });

  test("records failures instead of throwing when a check breaks", () => {
    const result = validateStrictPlanSurface({
      deriveOverride: () => {
        throw new Error("kernel exploded");
      },
    });
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0]).toContain("kernel exploded");
  });

  test("covers every gate position with its manifest-owned command", () => {
    // Indirect structural assertion: the validation passes only when each
    // gate derives an actionable plan; GATE_ORDER length drives the matrix.
    expect(GATE_ORDER).toHaveLength(7);
    const result = validateStrictPlanSurface();
    expect(result.passed).toBe(true);
  });
});
