import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

import {
  classifyBehaviorSurface,
  computeQualitySignals,
  detectMockPatterns,
  extractTestFilePath,
} from "./test-quality";

describe("extractTestFilePath", () => {
  test.each([
    ["pnpm test -- src/foo.test.ts", "src/foo.test.ts"],
    ["pnpm test src/foo.test.ts", "src/foo.test.ts"],
    ["bin/oc-test targeted -- src/foo.test.ts", "src/foo.test.ts"],
    ["npx vitest run src/foo.test.ts", "src/foo.test.ts"],
    ["vitest run src/foo.test.ts", "src/foo.test.ts"],
    ["jest src/foo.test.ts", "src/foo.test.ts"],
    ["npx jest src/foo.test.ts", "src/foo.test.ts"],
    ["pytest tests/test_foo.py", "tests/test_foo.py"],
    ["python -m pytest tests/test_foo.py", "tests/test_foo.py"],
    ["pytest src/foo_test.py", "src/foo_test.py"],
    ["go test ./foo/bar_test.go", "./foo/bar_test.go"],
    ["pnpm test -- src/foo.spec.tsx", "src/foo.spec.tsx"],
  ])("extracts %p -> %p", (cmd, expected) => {
    expect(extractTestFilePath(cmd)).toBe(expected);
  });

  test.each([
    "pnpm test",
    "npm run check",
    "pnpm run lint",
    "vitest run",
    "jest",
  ])("returns undefined for broad command %p", (cmd) => {
    expect(extractTestFilePath(cmd)).toBeUndefined();
  });
});

describe("detectMockPatterns", () => {
  const cases: [string, string, number][] = [
    ["vi.mock", "vi.mock('./a'); vi.mock('./b'); vi.mock('./c');", 3],
    ["vi.fn", "const f = vi.fn(); const g = vi.fn(); const h = vi.fn();", 3],
    [
      "vi.spyOn",
      "vi.spyOn(obj, 'x'); vi.spyOn(obj, 'y'); vi.spyOn(obj, 'z');",
      3,
    ],
    ["jest.mock", "jest.mock('./a'); jest.mock('./b'); jest.mock('./c');", 3],
    [
      "jest.fn",
      "const f = jest.fn(); const g = jest.fn(); const h = jest.fn();",
      3,
    ],
    [
      "jest.spyOn",
      "jest.spyOn(obj, 'x'); jest.spyOn(obj, 'y'); jest.spyOn(obj, 'z');",
      3,
    ],
    [
      "sinon.stub",
      "sinon.stub(obj, 'x'); sinon.stub(obj, 'y'); sinon.stub(obj, 'z');",
      3,
    ],
    [
      "sinon.spy",
      "sinon.spy(obj, 'x'); sinon.spy(obj, 'y'); sinon.spy(obj, 'z');",
      3,
    ],
    [
      "sinon.createStubInstance",
      "sinon.createStubInstance(A); sinon.createStubInstance(B); sinon.createStubInstance(C);",
      3,
    ],
    [
      "unittest.mock.patch",
      "@unittest.mock.patch('x')\n@unittest.mock.patch('y')\n@unittest.mock.patch('z')",
      3,
    ],
    ["mock.patch", "mock.patch('x')\nmock.patch('y')\nmock.patch('z')", 3],
    [
      "mocker.patch",
      "mocker.patch('x'); mocker.spy('y'); mocker.stub('z');",
      3,
    ],
  ];

  test.each(cases)("detects %s with count %d", (name, code, count) => {
    const result = detectMockPatterns(code);
    expect(result).toContainEqual({ pattern: name, count });
  });

  test("does not match bare mock tokens", () => {
    const code = `
      // mock is used a lot here
      const mock = 1;
      let mocked = false;
      function mockable() {}
      /* mock comment */
    `;
    expect(detectMockPatterns(code)).toEqual([]);
  });

  test("ignores bare mock when qualified pattern is absent", () => {
    expect(detectMockPatterns("const x = mock")).toEqual([]);
    expect(detectMockPatterns("// vi fn jest sinon")).toEqual([]);
  });
});

describe("classifyBehaviorSurface", () => {
  test.each([
    [1, 1, "small"],
    [2, 1, "medium"],
    [1, 2, "medium"],
    [2, 2, "medium"],
    [3, 2, "large"],
    [4, 2, "large"],
    [3, 1, "medium"],
    [2, 3, "medium"],
  ])("assertions=%i functions=%i -> %s", (assertions, functions, expected) => {
    expect(classifyBehaviorSurface(assertions, functions)).toBe(expected);
  });
});

describe("computeQualitySignals", () => {
  test("returns null for missing files", () => {
    expect(computeQualitySignals("/non/existent/path.ts")).toBeNull();
  });

  test("computes signals for a fixture file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "adv-tq-"));
    try {
      const file = join(dir, "sample.test.ts");
      await writeFile(
        file,
        `import { describe, expect, test } from "vitest";
import { add } from "./math";

function helper() {
  return 1;
}

describe("add", () => {
  test("returns sum", () => {
    expect(add(1, 2)).toBe(3);
    expect(add(0, 0)).toEqual(0);
  });

  test("throws on bad input", () => {
    expect(() => add("a", 1)).toThrow();
  });
});

const arrow = () => 42;
`,
      );
      const signals = computeQualitySignals(file);
      expect(signals).not.toBeNull();
      expect(signals!.mockSurface).toEqual([]);
      expect(signals!.assertionDensity).toBeCloseTo(6 / 9); // 6 assertions / 9 function-like constructs
      expect(signals!.behaviorSurface).toBe("large");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("detects mock surface in fixture file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "adv-tq-"));
    try {
      const file = join(dir, "mocked.test.ts");
      await writeFile(
        file,
        `import { describe, test, vi } from "vitest";
import { fetchData } from "./api";

vi.mock("./api");

describe("fetchData", () => {
  test("uses mock", () => {
    vi.spyOn(console, "log");
    const fn = vi.fn();
    expect(fn()).toBeUndefined();
  });
});
`,
      );
      const signals = computeQualitySignals(file);
      expect(signals).not.toBeNull();
      expect(signals!.mockSurface).toEqual(
        expect.arrayContaining([
          { pattern: "vi.mock", count: 1 },
          { pattern: "vi.spyOn", count: 1 },
          { pattern: "vi.fn", count: 1 },
        ]),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
