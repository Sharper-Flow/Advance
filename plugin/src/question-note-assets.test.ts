/**
 * Question Note Convention Asset Tests
 *
 * Verifies that the "Note for agent" convention is documented in
 * docs/adv-question-tool.md and that it satisfies structural requirements
 * (header shape, normalization rules, cap discipline, non-checkpoint scope).
 *
 * Citations: agreement AC1, AC3, AC4.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const QUESTION_TOOL_DOC = join(REPO_ROOT, "docs", "adv-question-tool.md");
const ADV_INSTRUCTIONS = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

describe("question note convention in docs/adv-question-tool.md", () => {
  const content = readFileSync(QUESTION_TOOL_DOC, "utf8");

  test("note convention section exists", () => {
    expect(content).toMatch(/^## Note for Agent Convention$/m);
  });

  test("required header shape is documented", () => {
    // The convention must specify the exact header: "Note for agent"
    expect(content).toMatch(/`"Note for agent"`/);
  });

  test("single 'No note' option is documented", () => {
    expect(content).toMatch(/"No note"/);
  });

  test("normalization rules are documented", () => {
    // Empty string, "No note", missing element → absent
    const section = extractSection(content, "Note for Agent Convention");
    expect(section).toMatch(/empty string/i);
    expect(section).toMatch(/"No note"/);
    expect(section).toMatch(/missing/i);
    expect(section).toMatch(/absent/);
  });

  test("question cap discipline is documented", () => {
    const section = extractSection(content, "Note for Agent Convention");
    expect(section).toMatch(/4 real questions/);
    expect(section).toMatch(/5 total/);
  });

  test("edge case for 5 real questions is documented", () => {
    const section = extractSection(content, "Note for Agent Convention");
    expect(section).toMatch(/5 real questions/);
  });

  test("non-checkpoint scope is documented", () => {
    const section = extractSection(content, "Note for Agent Convention");
    expect(section).toMatch(/non-checkpoint/);
    expect(section).toMatch(/rq-inlineApproval01/);
  });

  test("optional usage is documented", () => {
    const section = extractSection(content, "Note for Agent Convention");
    expect(section).toMatch(/optional/i);
  });
});

describe("question note convention in ADV_INSTRUCTIONS.md", () => {
  const content = readFileSync(ADV_INSTRUCTIONS, "utf8");

  test("Question Tool UX section references note convention", () => {
    const section = extractSection(content, "Question Tool UX");
    expect(section).toMatch(/note/i);
    expect(section).toMatch(/adv-question-tool/);
  });

  test("note convention stays non-checkpoint", () => {
    const section = extractSection(content, "Question Tool UX");
    expect(section).toMatch(/non-checkpoint/);
  });
});

/**
 * Extract a section from markdown content by header name.
 * Returns text from the header line until the next same-or-higher-level header.
 */
function extractSection(content: string, header: string): string {
  const regex = new RegExp(`^##+\\s+.*${escapeRegex(header)}.*$`, "m");
  const match = content.match(regex);
  if (!match || match.index === undefined) {
    // Return empty string so assertions fail clearly
    return "";
  }
  const headerLevel = (match[0].match(/^#+/) || [""])[0].length;
  const startIdx = match.index;
  const afterHeader = content.indexOf("\n", startIdx) + 1;

  // Find the next header at same or higher level
  const remaining = content.slice(afterHeader);
  const nextHeaderRegex = new RegExp(`^#{1,${headerLevel}}\\s`, "m");
  const nextMatch = remaining.match(nextHeaderRegex);

  if (nextMatch && nextMatch.index !== undefined) {
    return content.slice(startIdx, afterHeader + nextMatch.index);
  }
  return content.slice(startIdx);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
