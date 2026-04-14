/**
 * ADV Improve Assets Tests
 *
 * Verifies that /adv-improve ships as an executable read-only utility command:
 * - Command Boundary (read-only, no gate, no state mutation)
 * - Exits section
 * - Target Resolution (broad + scoped)
 * - CHECKLIST reference to improve-checklist.md
 * - External landscape analysis phase (3 competitors + 2 emerging)
 * - Fallback wording for unavailable tools
 * - Read-only contract (no adv_change_create, adv_task_add, adv_gate_complete)
 * - Backing checklist exists with required sections
 *
 * Modeled on adv-tron-assets.test.ts — the canonical read-only utility command pattern.
 */

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-improve.md");
const CHECKLIST_PATH = join(REPO_ROOT, "docs/checklists/improve-checklist.md");

describe("adv-improve command shape", () => {
  test("command doc exists", () => {
    expect(existsSync(COMMAND_PATH)).toBe(true);
  });

  test("contains Command Boundary section", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toContain("## Command Boundary");
  });

  test("Command Boundary declares read-only utility (no gate)", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    // Must explicitly state it's read-only or has no gate
    expect(content).toMatch(/Gate:\s*None|read-only utility/i);
  });

  test("contains Exits section", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toContain("## Exits");
  });

  test("Exits section has at least 3 exit states", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    // Three required exits: Report, Clarify, Partial
    expect(content).toContain("Report");
    expect(content).toContain("Clarify");
    expect(content).toContain("Partial");
  });

  test("contains Target Resolution section", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toContain("## Target Resolution");
  });

  test("Target Resolution supports broad and scoped modes", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(/[Bb]road/);
    expect(content).toMatch(/[Ss]cop/);
  });

  test("contains CHECKLIST reference to improve-checklist.md", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toContain("improve-checklist.md");
    expect(content).toContain("CHECKLIST");
  });

  test("contains external landscape analysis phase", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    // Must explicitly reference competitor/alternatives/emerging analysis
    expect(content).toMatch(
      /[Ee]xternal [Ll]andscape|[Cc]ompetitor|[Ee]merging/,
    );
  });

  test("external landscape phase has explicit cap (3 competitors + 2 emerging)", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(/3\s+competitor|top.?3|competitor.+3/i);
    expect(content).toMatch(/2\s+emerging|emerging.+2/i);
  });

  test("contains fallback wording for unavailable external tools", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    // Must document graceful degradation when Context7 or Kagi unavailable
    expect(content).toMatch(/unavailable|fallback|[Uu]nable|[Cc]annot reach/i);
  });
});

describe("adv-improve read-only contract", () => {
  test("does NOT contain adv_change_create", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).not.toContain("adv_change_create");
  });

  test("does NOT contain adv_task_add", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).not.toContain("adv_task_add");
  });

  test("does NOT contain adv_gate_complete", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).not.toContain("adv_gate_complete");
  });

  test("output block declares no state mutation", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(
      /[Ss]tate [Mm]utation:\s*none|[Nn]o state mutation|read-only/i,
    );
  });
});

describe("adv-improve checklist assets", () => {
  test("improve-checklist.md exists", () => {
    expect(existsSync(CHECKLIST_PATH)).toBe(true);
  });

  test("checklist contains Protocol Steps section", () => {
    const content = readFileSync(CHECKLIST_PATH, "utf8");
    expect(content).toContain("Protocol Steps");
  });

  test("checklist contains evidence rules", () => {
    const content = readFileSync(CHECKLIST_PATH, "utf8");
    expect(content).toMatch(/[Ee]vidence [Rr]ules?|[Ee]vidence [Rr]equirement/);
  });

  test("checklist contains external landscape protocol", () => {
    const content = readFileSync(CHECKLIST_PATH, "utf8");
    expect(content).toMatch(
      /[Ee]xternal [Ll]andscape|[Cc]ompetitor|[Ee]merging/,
    );
  });

  test("checklist contains graceful degradation rules", () => {
    const content = readFileSync(CHECKLIST_PATH, "utf8");
    expect(content).toMatch(
      /[Gg]raceful [Dd]egradation|[Ff]allback|[Uu]navailable/,
    );
  });
});
