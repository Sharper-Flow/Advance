/**
 * Phantom Sub-Agent Roster Tests
 *
 * Active ADV guidance MUST NOT route work to sub-agents that are not shipped
 * as `.opencode/agents/*.md` assets. This test scans active guidance surfaces
 * for forbidden routing patterns referencing the phantom names:
 *
 *   - `librarian`  (replaced by `adv-researcher`)
 *   - `mechanic`   (replaced by inline diagnosis)
 *   - `prioritizer` (replaced by `skill("prioritizer")` inline)
 *
 * Historical references in CHANGELOG.md, docs/archive/, and .adv/specs/_archive/
 * are explicitly out of scope per agreement DONT1.
 *
 * Realizes design Decision 4 (asset-test enforcement) and discovery deltas
 * `rq-supportedSubagentRoster01`, `rq-researchRouting01`.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

const PHANTOMS = ["librarian", "mechanic", "prioritizer"] as const;
type Phantom = (typeof PHANTOMS)[number];

interface PatternSpec {
  kind: string;
  pattern: RegExp;
}

/**
 * Build forbidden-pattern set for one phantom name.
 *
 * Patterns are targeted at active spawnable routing — table rows, spawn args,
 * spawn/delegate prose, numbered agent lists, and slash-separated routing
 * paths. We deliberately do NOT add a blanket `\bnametest\b` pattern because
 * `skill("prioritizer")` is a legitimate inline-skill invocation we must NOT
 * flag.
 */
function buildPatterns(name: Phantom): PatternSpec[] {
  return [
    // Sub-agent table row: | `name` |
    {
      kind: "agent-table-row",
      pattern: new RegExp(`\\|\\s*\`${name}\`\\s*\\|`, "g"),
    },
    // Task tool spawn argument: subagent_type: "name" / 'name'
    {
      kind: "subagent_type-arg",
      pattern: new RegExp(`subagent_type:\\s*["']${name}["']`, "gi"),
    },
    // Imperative spawn: "spawn name" / "Spawn `name`"
    {
      kind: "spawn-prose",
      pattern: new RegExp(`\\bspawn\\s+\`?${name}\`?\\b`, "gi"),
    },
    // Delegation prose: "delegate to name" / "Delegate to `name`"
    {
      kind: "delegate-prose",
      pattern: new RegExp(`\\bdelegate\\s+to\\s+\`?${name}\`?\\b`, "gi"),
    },
    // Numbered emphasized agent reference: "1. **name** — ..."
    {
      kind: "numbered-bold-agent",
      pattern: new RegExp(`^\\s*\\d+\\.\\s*\\*\\*${name}\\*\\*`, "gim"),
    },
    // Slash-separated routing path option: "(X/name/Y)" or "X/name/Y"
    {
      kind: "slash-routing",
      pattern: new RegExp(`[(/]\\s*${name}\\s*[/)]`, "gi"),
    },
  ];
}

const ACTIVE_SURFACES = [
  "ADV_INSTRUCTIONS.md",
  "SETUP.md",
  ".opencode/agents/adv.md",
  ".opencode/agents/plan.md",
  ".opencode/command/adv-research.md",
  ".opencode/command/adv-review.md",
  ".opencode/command/adv-harden.md",
  ".opencode/command/adv-prep.md",
  ".opencode/command/adv-task.md",
] as const;

// Historical/archive paths are intentionally excluded per agreement DONT1:
//   - CHANGELOG.md (release history)
//   - docs/archive/** (archived decision packs)
//   - .adv/specs/_archive/** (archived spec versions)
// These are preserved as historical record and should NOT be scanned.

interface Finding {
  surface: string;
  phantom: Phantom;
  kind: string;
  line: number;
  text: string;
}

function scanSurface(surface: string): Finding[] {
  const path = join(REPO_ROOT, surface);
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");
  const findings: Finding[] = [];

  for (const phantom of PHANTOMS) {
    for (const { kind, pattern } of buildPatterns(phantom)) {
      // Reset lastIndex defensively (regex objects keep state across exec)
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum =
          content.substring(0, match.index).split("\n").length;
        const lineText = (lines[lineNum - 1] ?? "").trim();
        findings.push({
          surface,
          phantom,
          kind,
          line: lineNum,
          text: lineText,
        });
        // Guard against zero-width matches stalling the loop
        if (match.index === pattern.lastIndex) pattern.lastIndex++;
      }
    }
  }

  return findings;
}

function formatFindings(findings: Finding[]): string {
  return findings
    .map(
      (f) =>
        `  L${f.line} [${f.phantom}:${f.kind}] ${f.text.length > 120 ? f.text.slice(0, 117) + "..." : f.text}`,
    )
    .join("\n");
}

describe("phantom sub-agent roster", () => {
  for (const surface of ACTIVE_SURFACES) {
    test(`${surface} contains no forbidden phantom sub-agent routing`, () => {
      const findings = scanSurface(surface);
      if (findings.length > 0) {
        const message =
          `${surface} contains ${findings.length} forbidden phantom sub-agent routing reference(s).\n` +
          `Phantoms must be replaced per design Decision 2:\n` +
          `  librarian  → adv-researcher\n` +
          `  mechanic   → inline by main ADV agent\n` +
          `  prioritizer → skill("prioritizer") inline\n\n` +
          `Findings:\n${formatFindings(findings)}`;
        throw new Error(message);
      }
      // Explicit positive assertion so the test reports something on success
      expect(findings.length).toBe(0);
    });
  }

  test("PHANTOMS list matches design Decision 2", () => {
    // Pin the phantom list so the test can't be silently weakened.
    expect(PHANTOMS).toEqual(["librarian", "mechanic", "prioritizer"]);
  });
});
