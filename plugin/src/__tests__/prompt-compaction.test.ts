/**
 * Consumer Containment Tests — `experimental.chat.messages.transform`
 *
 * Layer 1 of the bound sub-agent report contract (boundSubAgentReportContract).
 * Covers AC5 (recency skip), AC6 (tool-type protection), and AC7 (honest
 * full-drop marker) for the prompt-message compaction path in `index.ts`.
 *
 * These are unit tests against the pure compaction helpers
 * (`compactPromptMessages`, `compactToolPart`). They do NOT exercise the full
 * plugin hook (the existing `compaction.test.ts` covers the compacting-hook
 * enrichment path; this file owns the messages-transform containment path).
 *
 * Contract refs: implements AC5/AC6/AC7; respects SC1 (count preservation),
 * DONT1 (no threshold raise), DONT3 (no silent drop).
 */

import { describe, test, expect } from "vitest";
import { compactPromptMessages, compactToolPart } from "../index";

const THRESHOLD = 24_000;
const oversized = (n: number): string => "x".repeat(n);

interface ToolPart {
  type: string;
  tool?: string;
  callID?: string;
  output?: string;
  state?: { output?: string };
}

const toolPart = (overrides: Partial<ToolPart> = {}): ToolPart => ({
  type: "tool",
  tool: "bash",
  ...overrides,
});

const messageWithParts = (parts: unknown[]) => ({
  info: { role: "user" },
  parts,
});

describe("compactToolPart — AC6 tool-type protection", () => {
  test("task tool output exceeding threshold is protected (untouched)", () => {
    const original = oversized(THRESHOLD + 1000);
    const part = toolPart({ tool: "task", output: original });
    expect(compactToolPart(part)).toBe(false);
    expect(part.output).toBe(original);
  });

  test("skill tool output exceeding threshold is protected (untouched)", () => {
    const original = oversized(THRESHOLD + 1000);
    const part = toolPart({ tool: "skill", output: original });
    expect(compactToolPart(part)).toBe(false);
    expect(part.output).toBe(original);
  });

  test("task tool output is case-insensitive (Task, TASK protected)", () => {
    for (const name of ["Task", "TASK", "Task"]) {
      const original = oversized(THRESHOLD + 500);
      const part = toolPart({ tool: name, output: original });
      expect(compactToolPart(part)).toBe(false);
      expect(part.output).toBe(original);
    }
  });

  test("task tool output via state.output is also protected", () => {
    const original = oversized(THRESHOLD + 1000);
    const part = toolPart({ tool: "task", state: { output: original } });
    expect(compactToolPart(part)).toBe(false);
    expect(part.state?.output).toBe(original);
  });
});

describe("compactToolPart — AC7 honest full-drop marker", () => {
  test("non-protected oversized tool output is replaced with a full-drop marker", () => {
    const part = toolPart({ tool: "bash", output: oversized(THRESHOLD + 5000) });
    expect(compactToolPart(part)).toBe(true);
    const out = part.output as string;

    // Honest full-drop: names what was removed and the size.
    expect(out).toMatch(/\[ADV:OUTPUT_DROPPED\]/);
    expect(out).toContain("bash");
    expect(out).toContain(String(THRESHOLD + 5000));
  });

  test("full-drop marker is NOT a head-and-tail excerpt", () => {
    const part = toolPart({ tool: "bash", output: oversized(THRESHOLD + 5000) });
    compactToolPart(part);
    const out = part.output as string;

    // The deceptive head/tail format must be gone.
    expect(out).not.toContain("first");
    expect(out).not.toContain("last");
    expect(out).not.toContain("---");
  });

  test("non-protected oversized output via state.output is full-dropped", () => {
    const part = toolPart({
      tool: "read",
      state: { output: oversized(THRESHOLD + 2000) },
    });
    expect(compactToolPart(part)).toBe(true);
    expect(part.state?.output).toMatch(/\[ADV:OUTPUT_DROPPED\]/);
  });

  test("output under threshold is never compacted", () => {
    const part = toolPart({ tool: "bash", output: oversized(THRESHOLD - 1) });
    expect(compactToolPart(part)).toBe(false);
    expect(part.output).toBe(oversized(THRESHOLD - 1));
  });

  test("unidentifiable tool output (generic fallback name) is compacted, not protected", () => {
    // No tool name → falls back to "tool output" → NOT a protected type.
    const part = toolPart({ output: oversized(THRESHOLD + 1000) });
    delete part.tool;
    expect(compactToolPart(part)).toBe(true);
    expect(part.output).toMatch(/\[ADV:OUTPUT_DROPPED\]/);
  });
});

describe("compactPromptMessages — AC5 recency skip", () => {
  test("most recent N messages are protected from tool-output truncation", () => {
    const messages = [];
    for (let i = 0; i < 8; i++) {
      messages.push(
        messageWithParts([toolPart({ tool: "bash", output: oversized(THRESHOLD + 1000) })]),
      );
    }
    const result = compactPromptMessages(messages);

    // Default recency window = 6 → the 6 most recent (indices 2-7) are
    // protected; only the 2 oldest (indices 0-1) are compacted.
    expect(result.compactedToolOutputs).toBe(2);
    // Most-recent message untouched.
    expect((messages[7].parts[0] as ToolPart).output).toBe(oversized(THRESHOLD + 1000));
    // Boundary of recency window (index 2) untouched.
    expect((messages[2].parts[0] as ToolPart).output).toBe(oversized(THRESHOLD + 1000));
    // Oldest messages full-dropped.
    expect((messages[0].parts[0] as ToolPart).output).toMatch(/\[ADV:OUTPUT_DROPPED\]/);
    expect((messages[1].parts[0] as ToolPart).output).toMatch(/\[ADV:OUTPUT_DROPPED\]/);
  });

  test("recency protection applies even to protected tool types in the recent window", () => {
    // A task tool output in the recent window is protected by BOTH recency
    // and tool-type; an old bash output is full-dropped.
    const messages = [];
    for (let i = 0; i < 6; i++) {
      messages.push(messageWithParts([]));
    }
    // 7th message: recent task output (within last 6).
    messages.push(
      messageWithParts([toolPart({ tool: "task", output: oversized(THRESHOLD + 5000) })]),
    );
    const result = compactPromptMessages(messages);
    expect(result.compactedToolOutputs).toBe(0);
    expect((messages[6].parts[0] as ToolPart).output).toBe(oversized(THRESHOLD + 5000));
  });
});

describe("compactPromptMessages — SC1 count preservation", () => {
  test("compactedToolOutputs count reflects full-drop events (banner still fires)", () => {
    // Two old oversized bash outputs (outside recency) + recent ones protected.
    const messages = [];
    for (let i = 0; i < 8; i++) {
      messages.push(
        messageWithParts([toolPart({ tool: "bash", output: oversized(THRESHOLD + 100) })]),
      );
    }
    const result = compactPromptMessages(messages);
    // 2 old messages full-dropped → count = 2 → SC1 banner condition holds.
    expect(result.compactedToolOutputs).toBeGreaterThan(0);
    expect(result.compactedToolOutputs).toBe(2);
  });

  test("protected tool-type outputs do not increment the count (nothing sanitized)", () => {
    const messages = [];
    for (let i = 0; i < 8; i++) {
      messages.push(
        messageWithParts([toolPart({ tool: "task", output: oversized(THRESHOLD + 1000) })]),
      );
    }
    const result = compactPromptMessages(messages);
    // All task outputs protected (6 recent by recency + 2 old by tool-type).
    expect(result.compactedToolOutputs).toBe(0);
  });
});

describe("compactPromptMessages — edge cases", () => {
  test("empty messages array is a no-op", () => {
    const result = compactPromptMessages([]);
    expect(result).toEqual({
      droppedBlank: 0,
      compactedToolOutputs: 0,
      compactedDiffs: 0,
    });
  });

  test("non-tool parts are ignored", () => {
    const messages = [
      messageWithParts([
        { type: "text", text: oversized(THRESHOLD + 5000) },
        toolPart({ tool: "bash", output: oversized(THRESHOLD + 1000) }),
      ]),
    ];
    const result = compactPromptMessages(messages);
    expect(result.compactedToolOutputs).toBe(0); // only 1 message, recency-protected
  });
});
