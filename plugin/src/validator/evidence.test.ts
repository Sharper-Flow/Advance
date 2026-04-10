import { describe, test, expect } from "vitest";
import { validateEvidenceSemantics } from "./evidence";

describe("validateEvidenceSemantics", () => {
  test("red phase + exitCode=1 → valid (test is failing as expected)", () => {
    const result = validateEvidenceSemantics("red", 1);
    expect(result).toEqual({ valid: true });
  });

  test("red phase + exitCode=0 → reject (test is passing, contradicts red)", () => {
    const result = validateEvidenceSemantics("red", 0);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Red phase expects a failing test");
      expect(result.reason).toContain("exitCode=0");
    }
  });

  test("green phase + exitCode=0 → valid (test is passing as expected)", () => {
    const result = validateEvidenceSemantics("green", 0);
    expect(result).toEqual({ valid: true });
  });

  test("green phase + exitCode=1 → reject (test is failing, contradicts green)", () => {
    const result = validateEvidenceSemantics("green", 1);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Green phase expects a passing test");
      expect(result.reason).toContain("exitCode=1");
    }
  });

  test("exitCode undefined → valid for both phases (backward compat)", () => {
    expect(validateEvidenceSemantics("red", undefined)).toEqual({
      valid: true,
    });
    expect(validateEvidenceSemantics("green", undefined)).toEqual({
      valid: true,
    });
  });

  test("red phase + exitCode=2 → valid (any non-zero is a failing test)", () => {
    const result = validateEvidenceSemantics("red", 2);
    expect(result).toEqual({ valid: true });
  });

  test("green phase + exitCode=127 → reject (any non-zero contradicts green)", () => {
    const result = validateEvidenceSemantics("green", 127);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("exitCode=127");
    }
  });
});
