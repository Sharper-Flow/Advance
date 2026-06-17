/**
 * Static test-file quality signals.
 *
 * Pure-function module that parses a test file to produce advisory metrics.
 * No workflow-layer imports and no I/O beyond reading the target test file.
 */

import { readFileSync } from "node:fs";

const TEST_FILE_PATH_RE =
  /([\w./-]+\.(?:test|spec)\.(?:ts|tsx|js|jsx))\b|([\w./-]+test_\w+\.py)\b|([\w./-]+_test\.go)\b|([\w./-]+_test\.py)\b/;

/**
 * Extract a specific test file path from a CLI command string.
 * Returns `undefined` for broad commands that do not name a file.
 */
export function extractTestFilePath(command: string): string | undefined {
  const match = TEST_FILE_PATH_RE.exec(command);
  if (!match) return undefined;
  return (match[1] ?? match[2] ?? match[3] ?? match[4]) as string;
}

type MockPatternResult = { pattern: string; count: number };

const MOCK_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "vi.mock", regex: /\bvi\.mock\s*\(/g },
  { name: "vi.fn", regex: /\bvi\.fn\s*\(/g },
  { name: "vi.spyOn", regex: /\bvi\.spyOn\s*\(/g },
  { name: "jest.mock", regex: /\bjest\.mock\s*\(/g },
  { name: "jest.fn", regex: /\bjest\.fn\s*\(/g },
  { name: "jest.spyOn", regex: /\bjest\.spyOn\s*\(/g },
  { name: "sinon.stub", regex: /\bsinon\.stub\s*\(/g },
  { name: "sinon.spy", regex: /\bsinon\.spy\s*\(/g },
  {
    name: "sinon.createStubInstance",
    regex: /\bsinon\.createStubInstance\s*\(/g,
  },
  { name: "unittest.mock.patch", regex: /\bunittest\.mock\.patch\b/g },
  { name: "mock.patch", regex: /(?<!\w)mock\.patch\s*\(/g },
  { name: "mocker.patch", regex: /\bmocker\.\w+\s*\(/g },
];

/**
 * Detect API-qualified mock usage in test file content.
 * Bare `mock` tokens (variables, comments) are intentionally ignored.
 */
export function detectMockPatterns(content: string): MockPatternResult[] {
  const results: MockPatternResult[] = [];
  for (const { name, regex } of MOCK_PATTERNS) {
    const count = content.match(regex)?.length ?? 0;
    if (count > 0) {
      results.push({ pattern: name, count });
    }
  }
  return results;
}

/**
 * Classify the behavioral surface of a test file from raw counts.
 *
 * - "large": ≥3 assertions AND ≥2 distinct functions
 * - "medium": 1-2 distinct functions OR ≥2 assertions
 * - "small": 1 assertion AND 1 function
 */
export function classifyBehaviorSurface(
  assertionCount: number,
  functionCount: number,
): "small" | "medium" | "large" {
  if (assertionCount >= 3 && functionCount >= 2) return "large";
  if (assertionCount === 1 && functionCount === 1) return "small";
  return "medium";
}

const ASSERTION_RE =
  /\bexpect\s*\(|\bassert\.|\btoEqual\b|\btoBe\b|\bStrictEqual\b|\bdeepEqual\b|\btoBeTruthy\b|\btoBeFalsy\b|\btoContain\b|\btoThrow\b|\bassert_equal\b|\bself\.assertEqual\b/g;

function countDistinctFunctions(content: string): number {
  const named = new Set<string>();

  for (const match of content.matchAll(/\bfunction\s+(\w+)/g)) {
    named.add(match[1]);
  }

  for (const match of content.matchAll(
    /\b(?:it|test|describe)\s*\(\s*["'`]([^"'`]+)/g,
  )) {
    named.add(`block:${match[1]}`);
  }

  for (const match of content.matchAll(/\bdef\s+(test_\w+)/g)) {
    named.add(match[1]);
  }

  const arrowCount = content.match(/=>/g)?.length ?? 0;

  return named.size + arrowCount;
}

function countAssertions(content: string): number {
  return content.match(ASSERTION_RE)?.length ?? 0;
}

export type QualitySignals = {
  assertionDensity: number;
  mockSurface: MockPatternResult[];
  behaviorSurface: "small" | "medium" | "large";
};

/**
 * Compute advisory quality signals for a test file on disk.
 * Returns `null` when the file cannot be read.
 */
export function computeQualitySignals(filePath: string): QualitySignals | null {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const assertionCount = countAssertions(content);
  const functionCount = countDistinctFunctions(content);
  const assertionDensity =
    functionCount > 0 ? assertionCount / functionCount : 0;

  return {
    assertionDensity,
    mockSurface: detectMockPatterns(content),
    behaviorSurface: classifyBehaviorSurface(assertionCount, functionCount),
  };
}
