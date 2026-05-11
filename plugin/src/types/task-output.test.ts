/**
 * Tests for TaskStructuredOutputSchema and related types.
 *
 * Validates schema shape, defaults, passthrough behavior, and constants.
 */
import { describe, expect, it } from "vitest";
import {
  TaskStructuredOutputSchema,
  FileChangeSchema,
  DecisionSchema,
  STRUCTURED_OUTPUT_MAX_BYTES,
} from "./task-output";

describe("TaskStructuredOutputSchema", () => {
  it("parses a full valid object", () => {
    const result = TaskStructuredOutputSchema.parse({
      filesChanged: [{ path: "src/foo.ts", linesAdded: 10, linesRemoved: 5 }],
      testsAdded: 3,
      testsModified: 1,
      decisions: [{ decision: "use Zod", why: "type safety" }],
      followUps: ["refactor bar.ts"],
    });
    expect(result.filesChanged).toHaveLength(1);
    expect(result.filesChanged[0].path).toBe("src/foo.ts");
    expect(result.testsAdded).toBe(3);
    expect(result.testsModified).toBe(1);
    expect(result.decisions).toHaveLength(1);
    expect(result.followUps).toEqual(["refactor bar.ts"]);
  });

  it("applies defaults for empty object", () => {
    const result = TaskStructuredOutputSchema.parse({});
    expect(result.filesChanged).toEqual([]);
    expect(result.testsAdded).toBe(0);
    expect(result.testsModified).toBe(0);
    expect(result.decisions).toEqual([]);
    expect(result.followUps).toEqual([]);
  });

  it("applies defaults for missing fields", () => {
    const result = TaskStructuredOutputSchema.parse({
      filesChanged: [{ path: "a.ts" }],
    });
    expect(result.testsAdded).toBe(0);
    expect(result.testsModified).toBe(0);
    expect(result.decisions).toEqual([]);
    expect(result.followUps).toEqual([]);
  });

  it("allows extra fields via passthrough", () => {
    const result = TaskStructuredOutputSchema.parse({
      filesChanged: [],
      customField: "hello",
      anotherExtra: 42,
    });
    expect(result.filesChanged).toEqual([]);
    expect((result as Record<string, unknown>).customField).toBe("hello");
    expect((result as Record<string, unknown>).anotherExtra).toBe(42);
  });

  it("rejects negative testsAdded", () => {
    expect(() =>
      TaskStructuredOutputSchema.parse({ testsAdded: -1 }),
    ).toThrow();
  });

  it("rejects negative testsModified", () => {
    expect(() =>
      TaskStructuredOutputSchema.parse({ testsModified: -1 }),
    ).toThrow();
  });

  it("rejects non-integer testsAdded", () => {
    expect(() =>
      TaskStructuredOutputSchema.parse({ testsAdded: 1.5 }),
    ).toThrow();
  });

  it("accepts filesChanged without line counts", () => {
    const result = TaskStructuredOutputSchema.parse({
      filesChanged: [{ path: "a.ts" }],
    });
    expect(result.filesChanged[0].linesAdded).toBeUndefined();
    expect(result.filesChanged[0].linesRemoved).toBeUndefined();
  });

  it("rejects filesChanged entry without path", () => {
    expect(() =>
      TaskStructuredOutputSchema.parse({
        filesChanged: [{ linesAdded: 5 }],
      }),
    ).toThrow();
  });
});

describe("FileChangeSchema", () => {
  it("parses full entry", () => {
    const result = FileChangeSchema.parse({
      path: "src/foo.ts",
      linesAdded: 10,
      linesRemoved: 5,
    });
    expect(result.path).toBe("src/foo.ts");
    expect(result.linesAdded).toBe(10);
    expect(result.linesRemoved).toBe(5);
  });

  it("parses with only path", () => {
    const result = FileChangeSchema.parse({ path: "bar.ts" });
    expect(result.path).toBe("bar.ts");
    expect(result.linesAdded).toBeUndefined();
  });

  it("rejects negative linesAdded", () => {
    expect(() =>
      FileChangeSchema.parse({ path: "a.ts", linesAdded: -1 }),
    ).toThrow();
  });
});

describe("DecisionSchema", () => {
  it("parses valid decision", () => {
    const result = DecisionSchema.parse({
      decision: "use Zod",
      why: "type safety",
    });
    expect(result.decision).toBe("use Zod");
    expect(result.why).toBe("type safety");
  });

  it("rejects missing why", () => {
    expect(() => DecisionSchema.parse({ decision: "test" })).toThrow();
  });
});

describe("STRUCTURED_OUTPUT_MAX_BYTES", () => {
  it("is 10KB", () => {
    expect(STRUCTURED_OUTPUT_MAX_BYTES).toBe(10 * 1024);
  });
});
