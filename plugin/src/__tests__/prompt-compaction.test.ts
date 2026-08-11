/**
 * Consumer Containment + Fallback Durable Sink Tests
 *
 * `experimental.chat.messages.transform` path in `index.ts` for the
 * boundSubAgentReportContract change.
 *
 * Layer 1 (AC5 recency skip, AC6 tool-type protection, AC7 honest full-drop
 * marker) and Layer 2 (AC3/AC4 fallback durable sink) are both covered here.
 *
 * The existing `compaction.test.ts` owns the compacting-hook enrichment path;
 * this file owns the messages-transform containment + sink path.
 *
 * Contract refs: implements AC3/AC4/AC5/AC6/AC7; respects SC1 (count
 * preservation), DONT1 (no threshold raise), DONT3 (no silent drop),
 * DONT4 (keep the fallback safety valve).
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compactPromptMessages,
  compactToolPart,
  persistFallbackContent,
  fallbackPersistedMarker,
} from "../index";

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

describe("compactToolPart — AC6 tool-type protection (conforming returns)", () => {
  test("task output under threshold is protected (untouched)", () => {
    const original = oversized(THRESHOLD - 1);
    const part = toolPart({ tool: "task", output: original });
    expect(compactToolPart(part)).toBe(false);
    expect(part.output).toBe(original);
  });

  test("skill output under threshold is protected (untouched)", () => {
    const original = oversized(1000);
    const part = toolPart({ tool: "skill", output: original });
    expect(compactToolPart(part)).toBe(false);
    expect(part.output).toBe(original);
  });

  test("protection is case-insensitive (Task, TASK)", () => {
    for (const name of ["Task", "TASK"]) {
      const original = oversized(500);
      const part = toolPart({ tool: name, output: original });
      expect(compactToolPart(part)).toBe(false);
      expect(part.output).toBe(original);
    }
  });

  test("task state.output under threshold is protected", () => {
    const original = oversized(2000);
    const part = toolPart({ tool: "task", state: { output: original } });
    expect(compactToolPart(part)).toBe(false);
    expect(part.state?.output).toBe(original);
  });
});

describe("compactToolPart — AC3/AC4 fallback durable sink (oversized protected returns)", () => {
  let sinkDir: string;

  beforeEach(() => {
    sinkDir = mkdtempSync(join(tmpdir(), "adv-sink-"));
    process.env.ADV_FALLBACK_SINK_DIR = sinkDir;
  });

  afterEach(async () => {
    delete process.env.ADV_FALLBACK_SINK_DIR;
    await rm(sinkDir, { recursive: true, force: true });
  });

  test("oversized task output is persisted and replaced with a persisted-marker", () => {
    const content = oversized(THRESHOLD + 5000);
    const part = toolPart({ tool: "task", output: content });
    expect(compactToolPart(part)).toBe(true);

    const out = part.output as string;
    expect(out).toMatch(/\[ADV:FALLBACK_RESULT_PERSISTED\]/);
    expect(out).toContain("task");
    expect(out).toContain(String(content.length));
    // Marker carries a path into the configured sink dir.
    expect(out).toContain(sinkDir);
  });

  test("marker names the number of chars elided (AC4), not a head-and-tail excerpt", () => {
    const content = oversized(THRESHOLD + 5000);
    const part = toolPart({ tool: "task", output: content });
    compactToolPart(part);
    const out = part.output as string;

    // AC4: explicit elided count.
    expect(out).toMatch(/elided/);
    // Not the deceptive head/tail excerpt format.
    expect(out).not.toMatch(/first \d+ chars/);
    expect(out).not.toMatch(/last \d+ chars/);
  });

  test("persisted file contains the full content", async () => {
    const content = oversized(THRESHOLD + 1000);
    const part = toolPart({ tool: "task", output: content });
    compactToolPart(part);
    const out = part.output as string;

    // Extract the path from the marker.
    const pathMatch = out.match(/at (.+\.md)/);
    expect(pathMatch).not.toBeNull();
    const filePath = pathMatch![1];

    const persisted = await readFile(filePath, "utf8");
    expect(persisted).toBe(content);
  });

  test("oversized skill output is also persisted", () => {
    const part = toolPart({
      tool: "skill",
      output: oversized(THRESHOLD + 2000),
    });
    expect(compactToolPart(part)).toBe(true);
    expect(part.output).toMatch(/\[ADV:FALLBACK_RESULT_PERSISTED\]/);
  });

  test("oversized task state.output is persisted", () => {
    const part = toolPart({
      tool: "task",
      state: { output: oversized(THRESHOLD + 3000) },
    });
    expect(compactToolPart(part)).toBe(true);
    expect(part.state?.output).toMatch(/\[ADV:FALLBACK_RESULT_PERSISTED\]/);
  });

  test("sink-write failure falls back to an honest full-drop marker", () => {
    // A file cannot be used as a directory, so persistence returns null.
    // The replacement must still be an explicit full drop rather than an
    // exception or a retained oversized protected return.
    process.env.ADV_FALLBACK_SINK_DIR = join(sinkDir, "not-a-directory");
    const part = toolPart({
      tool: "task",
      output: oversized(THRESHOLD + 3000),
    });
    // Make the configured sink path a file by persisting it through the
    // existing test helper's temporary directory.
    const sinkPath = process.env.ADV_FALLBACK_SINK_DIR;
    writeFileSync(sinkPath, "not a directory");

    expect(compactToolPart(part)).toBe(true);
    const out = part.output as string;
    expect(out).toMatch(/\[ADV:OUTPUT_DROPPED\]/);
    expect(out).not.toMatch(/\[ADV:FALLBACK_RESULT_PERSISTED\]/);
    expect(out).not.toMatch(/first \d+ chars/i);
    expect(out).not.toMatch(/last \d+ chars/i);
  });
});

describe("compactToolPart — AC7 honest full-drop (oversized unprotected content)", () => {
  test("non-protected oversized tool output gets a full-drop marker", () => {
    const part = toolPart({
      tool: "bash",
      output: oversized(THRESHOLD + 5000),
    });
    expect(compactToolPart(part)).toBe(true);
    const out = part.output as string;
    expect(out).toMatch(/\[ADV:OUTPUT_DROPPED\]/);
    expect(out).toContain("bash");
    expect(out).toContain(String(THRESHOLD + 5000));
  });

  test("full-drop marker is NOT a head-and-tail excerpt", () => {
    const part = toolPart({
      tool: "bash",
      output: oversized(THRESHOLD + 5000),
    });
    compactToolPart(part);
    const out = part.output as string;
    expect(out).not.toContain("first");
    expect(out).not.toContain("last");
    expect(out).not.toContain("---");
  });

  test("non-protected oversized state.output is full-dropped", () => {
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
        messageWithParts([
          toolPart({ tool: "bash", output: oversized(THRESHOLD + 1000) }),
        ]),
      );
    }
    const result = compactPromptMessages(messages);

    // Default recency window = 6 → indices 2-7 protected; 0-1 compacted.
    expect(result.compactedToolOutputs).toBe(2);
    expect((messages[7].parts[0] as ToolPart).output).toBe(
      oversized(THRESHOLD + 1000),
    );
    expect((messages[2].parts[0] as ToolPart).output).toBe(
      oversized(THRESHOLD + 1000),
    );
    expect((messages[0].parts[0] as ToolPart).output).toMatch(
      /\[ADV:OUTPUT_DROPPED\]/,
    );
    expect((messages[1].parts[0] as ToolPart).output).toMatch(
      /\[ADV:OUTPUT_DROPPED\]/,
    );
  });

  test("recency protection applies even to oversized protected tool types in the recent window", () => {
    // A recent oversized task output is protected by recency and NOT persisted.
    const messages = [];
    for (let i = 0; i < 6; i++) {
      messages.push(messageWithParts([]));
    }
    messages.push(
      messageWithParts([
        toolPart({ tool: "task", output: oversized(THRESHOLD + 5000) }),
      ]),
    );
    const result = compactPromptMessages(messages);
    expect(result.compactedToolOutputs).toBe(0);
    expect((messages[6].parts[0] as ToolPart).output).toBe(
      oversized(THRESHOLD + 5000),
    );
  });

  test("blank-message splicing does not consume a recency-protected slot", () => {
    const messages = [];
    for (let i = 0; i < 7; i++) {
      messages.push(
        messageWithParts([
          toolPart({ tool: "bash", output: oversized(THRESHOLD + 1000) }),
        ]),
      );
    }
    // This is the exact blank shape removed by the consumer transform.
    messages.push({ info: { role: "assistant", finish: null }, parts: [] });

    const result = compactPromptMessages(messages);

    // Six non-blank messages remain protected; the seventh is compacted.
    expect(result.droppedBlank).toBe(1);
    expect(result.compactedToolOutputs).toBe(1);
    expect((messages[0].parts[0] as ToolPart).output).toMatch(
      /\[ADV:OUTPUT_DROPPED\]/,
    );
    expect((messages[1].parts[0] as ToolPart).output).toBe(
      oversized(THRESHOLD + 1000),
    );
  });
});

describe("compactPromptMessages — SC1 count preservation (DC7)", () => {
  test("oversized unprotected content increments the count (banner fires)", () => {
    const messages = [];
    for (let i = 0; i < 8; i++) {
      messages.push(
        messageWithParts([
          toolPart({ tool: "bash", output: oversized(THRESHOLD + 100) }),
        ]),
      );
    }
    const result = compactPromptMessages(messages);
    expect(result.compactedToolOutputs).toBe(2);
  });

  test("oversized persisted protected content increments the count (DC7)", () => {
    process.env.ADV_FALLBACK_SINK_DIR = mkdtempSync(
      join(tmpdir(), "adv-sink-"),
    );
    try {
      const messages = [];
      for (let i = 0; i < 8; i++) {
        messages.push(
          messageWithParts([
            toolPart({ tool: "task", output: oversized(THRESHOLD + 5000) }),
          ]),
        );
      }
      const result = compactPromptMessages(messages);
      // 2 old task outputs persisted (increment) + 6 recent protected.
      expect(result.compactedToolOutputs).toBe(2);
    } finally {
      delete process.env.ADV_FALLBACK_SINK_DIR;
    }
  });

  test("conforming protected outputs do not increment the count", () => {
    const messages = [];
    for (let i = 0; i < 8; i++) {
      messages.push(
        messageWithParts([
          toolPart({ tool: "task", output: oversized(THRESHOLD - 1) }),
        ]),
      );
    }
    const result = compactPromptMessages(messages);
    expect(result.compactedToolOutputs).toBe(0);
  });
});

describe("persistFallbackContent + fallbackPersistedMarker — unit", () => {
  let sinkDir: string;

  beforeEach(() => {
    sinkDir = mkdtempSync(join(tmpdir(), "adv-sink-"));
  });

  afterEach(async () => {
    await rm(sinkDir, { recursive: true, force: true });
  });

  test("writes full content to the sink and returns the path", async () => {
    const content = oversized(1000);
    const path = persistFallbackContent(content, sinkDir);
    expect(path).not.toBeNull();
    expect(path).toContain(sinkDir);
    const persisted = await readFile(path!, "utf8");
    expect(persisted).toBe(content);
  });

  test("is idempotent (same content → same path)", () => {
    const content = oversized(2000);
    const path1 = persistFallbackContent(content, sinkDir);
    const path2 = persistFallbackContent(content, sinkDir);
    expect(path1).toBe(path2);
  });

  test("different content → different path", () => {
    const path1 = persistFallbackContent(oversized(1000), sinkDir);
    const path2 = persistFallbackContent(
      oversized(1000) + "different",
      sinkDir,
    );
    expect(path1).not.toBe(path2);
  });

  test("marker format is AC4-compliant (path + elided count + preview, no head/tail)", () => {
    const content = oversized(29000);
    const marker = fallbackPersistedMarker(
      "task",
      content,
      "/tmp/opencode/fallback-report-abc.md",
    );
    expect(marker).toMatch(/\[ADV:FALLBACK_RESULT_PERSISTED\]/);
    expect(marker).toContain("task");
    expect(marker).toContain("29000");
    expect(marker).toContain("/tmp/opencode/fallback-report-abc.md");
    expect(marker).toMatch(/elided/);
    // Small honest preview, not head+tail.
    expect(marker).not.toMatch(/last/);
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
    expect(result.compactedToolOutputs).toBe(0); // 1 message, recency-protected
  });
});
