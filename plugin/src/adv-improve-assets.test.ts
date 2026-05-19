/**
 * ADV Improve Assets Tests
 *
 * Verifies that /adv-improve ships as an executable utility command that:
 * - Declares a Command Boundary with no ADV state mutation and no gate ownership
 * - Persists a reusable research pack under docs/*-prep.md so /adv-discover
 *   and related research phases can cite it as prior research
 * - Has an Exits section, Target Resolution (broad + scoped),
 *   CHECKLIST reference to improve-checklist.md, external landscape analysis
 *   (3 competitors + 2 emerging), and graceful-degradation wording
 * - Never calls adv_change_create, adv_task_add, or adv_gate_complete
 * - Ships a backing checklist with the research-pack schema
 *
 * Modeled on adv-tron-assets.test.ts for the command-shape surface, extended
 * with a persistence contract specific to /adv-improve.
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

  test("Command Boundary declares no gate and no ADV state mutation", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    // Must explicitly state it has no gate (allow **bold** around Gate:)
    expect(content).toMatch(/Gate:\*{0,2}\s*None/i);
    // Must explicitly forbid ADV state mutation
    expect(content).toMatch(/no ADV state mutation|MUST NOT[^\n]*ADV state/i);
  });

  test("Command Boundary permits persisting a research pack under docs/*-prep.md", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    // Must whitelist docs/*-prep.md as the only permitted write surface
    expect(content).toMatch(/docs\/\*?-?prep\.md|docs\/[^\s`]*-prep\.md/);
    expect(content).toMatch(/research pack/i);
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
    // Must document graceful degradation when Context7 or Exa unavailable
    expect(content).toMatch(/unavailable|fallback|[Uu]nable|[Cc]annot reach/i);
  });
});

describe("adv-improve ADV state mutation contract", () => {
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

  test("output block declares no ADV state mutation", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(
      /ADV State Mutation:\s*none|[Ss]tate [Mm]utation:\s*none|[Nn]o (ADV )?state mutation/i,
    );
  });
});

describe("adv-improve research pack persistence contract", () => {
  test("command doc defines a persistence phase", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(
      /Persist[^\n]*Research Pack|Research Pack[^\n]*Persist/i,
    );
  });

  test("command doc pins artifact path to docs/*-prep.md", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(
      /docs\/\{[^}]*-?prep[^}]*\}\.md|docs\/[a-z0-9-]+-prep\.md/,
    );
  });

  test("command doc specifies broad vs scoped artifact naming", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(/repo-improve-prep\.md/);
    expect(content).toMatch(/\{target-slug\}-prep\.md/);
  });

  test("command doc forbids writes outside docs/*-prep.md", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(
      /(MUST NOT|never)[^\n]*(outside|beyond)[^\n]*docs\/\*?-?prep\.md/i,
    );
  });

  test("command doc requires mandatory artifact sections", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(/Competitors\s*&\s*Alternatives/i);
    expect(content).toMatch(/Emerging Patterns/i);
    expect(content).toMatch(/Applicability/i);
    expect(content).toMatch(/Open Questions/i);
    expect(content).toMatch(/Sources/i);
  });

  test("command doc requires update-in-place behavior on re-run", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(/update in place|overwrites|refresh/i);
  });

  test("doc surfaces the research pack path format", () => {
    // Anti-drift: research-pack file path format is documented (was previously
    // asserted via the /adv-improve COMPLETE trailer line; trailer removed in
    // T3 prose-reduction, assertion broadened to match doc-body references).
    const content = readFileSync(COMMAND_PATH, "utf8");
    expect(content).toMatch(/docs\/[^\n]*prep\.md/);
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

  test("checklist documents research pack persistence contract", () => {
    const content = readFileSync(CHECKLIST_PATH, "utf8");
    expect(content).toMatch(/[Rr]esearch [Pp]ack/);
    expect(content).toMatch(/docs\/[^\s`]*-prep\.md|docs\/\*-prep\.md/);
  });

  test("checklist lists mandatory research pack sections", () => {
    const content = readFileSync(CHECKLIST_PATH, "utf8");
    expect(content).toMatch(/Competitors\s*&\s*Alternatives/);
    expect(content).toMatch(/Emerging Patterns/);
    expect(content).toMatch(/Applicability/);
    expect(content).toMatch(/Open Questions/);
    expect(content).toMatch(/Sources/);
  });
});
