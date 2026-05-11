/**
 * Tests for extractStructuredOutput utility.
 *
 * Covers: no tag, valid full, partial+defaults, invalid JSON, schema fail,
 * multiple tags (last wins), fences, oversized, tag in second field,
 * extra fields passthrough, empty tag, whitespace-only tag.
 */
import { describe, expect, it, vi } from "vitest";
import { extractStructuredOutput } from "./extract-structured-output";

describe("extractStructuredOutput", () => {
  it("returns null when no <adv-output> tag present", () => {
    expect(extractStructuredOutput("Just regular prose here.")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractStructuredOutput("")).toBeNull();
  });

  it("parses a full valid <adv-output> block", () => {
    const text = `Some prose
<adv-output>
{
  "filesChanged": [{"path": "src/foo.ts", "linesAdded": 10}],
  "testsAdded": 3,
  "testsModified": 1,
  "decisions": [{"decision": "use Zod", "why": "type safety"}],
  "followUps": ["refactor bar.ts"]
}
</adv-output>`;
    const result = extractStructuredOutput(text);
    expect(result).not.toBeNull();
    expect(result!.filesChanged).toHaveLength(1);
    expect(result!.filesChanged[0].path).toBe("src/foo.ts");
    expect(result!.testsAdded).toBe(3);
    expect(result!.decisions[0].decision).toBe("use Zod");
    expect(result!.followUps).toEqual(["refactor bar.ts"]);
  });

  it("applies defaults for partial object", () => {
    const text = `<adv-output>{"filesChanged": []}</adv-output>`;
    const result = extractStructuredOutput(text);
    expect(result).not.toBeNull();
    expect(result!.testsAdded).toBe(0);
    expect(result!.decisions).toEqual([]);
    expect(result!.followUps).toEqual([]);
  });

  it("returns null for invalid JSON inside tag", () => {
    const text = `<adv-output>{not valid json}</adv-output>`;
    expect(extractStructuredOutput(text)).toBeNull();
  });

  it("returns null when JSON fails schema validation", () => {
    const text = `<adv-output>{"testsAdded": -5}</adv-output>`;
    expect(extractStructuredOutput(text)).toBeNull();
  });

  it("takes last occurrence when multiple tags present", () => {
    const text = `First:
<adv-output>{"testsAdded": 1}</adv-output>
Second:
<adv-output>{"testsAdded": 2}</adv-output>`;
    const result = extractStructuredOutput(text);
    expect(result).not.toBeNull();
    expect(result!.testsAdded).toBe(2);
  });

  it("strips markdown code fences", () => {
    const text = `<adv-output>
\`\`\`json
{"testsAdded": 5}
\`\`\`
</adv-output>`;
    const result = extractStructuredOutput(text);
    expect(result).not.toBeNull();
    expect(result!.testsAdded).toBe(5);
  });

  it("returns null for oversized output (>10KB)", () => {
    const bigContent = "x".repeat(11 * 1024);
    const text = `<adv-output>{"data": "${bigContent}"}</adv-output>`;
    expect(extractStructuredOutput(text)).toBeNull();
  });

  it("extracts from second argument text when first is empty", () => {
    const text = `No tag here.\n\n<adv-output>{"testsAdded": 7}</adv-output>`;
    const result = extractStructuredOutput(text);
    expect(result).not.toBeNull();
    expect(result!.testsAdded).toBe(7);
  });

  it("preserves extra fields via passthrough", () => {
    const text = `<adv-output>{"testsAdded": 1, "customField": "hello"}</adv-output>`;
    const result = extractStructuredOutput(text);
    expect(result).not.toBeNull();
    expect(result!.testsAdded).toBe(1);
    expect((result as Record<string, unknown>).customField).toBe("hello");
  });

  it("returns null for empty tag content", () => {
    const text = `<adv-output></adv-output>`;
    expect(extractStructuredOutput(text)).toBeNull();
  });

  it("returns null for whitespace-only tag content", () => {
    const text = `<adv-output>   \n  \t  </adv-output>`;
    expect(extractStructuredOutput(text)).toBeNull();
  });
});
