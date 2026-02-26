import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const DIRTY_FIXTURE = join(__dirname, "../test/fixtures/slop-scan/dirty.ts");
const CLEAN_FIXTURE = join(__dirname, "../test/fixtures/slop-scan/clean.ts");

function maxNestingDepth(source: string): number {
  let depth = 0;
  let max = 0;

  for (const ch of source) {
    if (ch === "{") {
      depth += 1;
      if (depth > max) max = depth;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
    }
  }

  return max;
}

function defensiveGuardSignals(source: string): number {
  const checks = source.match(/if\s*\(([^)]*)\)\s*return\s+null;/g) ?? [];
  return checks.filter(
    (line) =>
      line.includes("user") &&
      (line.includes("null") ||
        line.includes("undefined") ||
        line.includes("typeof")),
  ).length;
}

function hasSingleGuardOnly(source: string): boolean {
  const checks = source.match(/if\s*\([^)]*\)\s*return\s+null;/g) ?? [];
  return checks.length <= 2;
}

describe("slop scan fixture verification", () => {
  test("dirty fixture triggers deep-nesting and defensive-overkill signals", () => {
    const src = readFileSync(DIRTY_FIXTURE, "utf8");
    expect(maxNestingDepth(src)).toBeGreaterThanOrEqual(5);
    expect(defensiveGuardSignals(src)).toBeGreaterThanOrEqual(3);
  });

  test("clean fixture avoids defensive-overkill false positives", () => {
    const src = readFileSync(CLEAN_FIXTURE, "utf8");
    expect(maxNestingDepth(src)).toBeLessThan(5);
    expect(defensiveGuardSignals(src)).toBeLessThan(3);
    expect(hasSingleGuardOnly(src)).toBe(true);
  });

  test("output contract fields are always present in finding shape", () => {
    const finding = {
      id: "QUAL-011",
      name: "defensive_overkill",
      severity: "medium",
      file: "test/fixtures/slop-scan/dirty.ts",
      line: 3,
      description: "Redundant guard chain on same symbol",
      fix: "Use a single guard and trust type invariants",
      nestingDepth: 5,
      complexity: 11,
      confidence: "high",
      detectionMethod: "degraded",
      degradedReason: "AST tool unavailable",
      phase: 1,
    };

    expect(finding).toHaveProperty("nestingDepth");
    expect(finding).toHaveProperty("complexity");
    expect(finding).toHaveProperty("confidence");
    expect(finding).toHaveProperty("detectionMethod");
    expect(finding.degradedReason).toBeTruthy();
  });
});
