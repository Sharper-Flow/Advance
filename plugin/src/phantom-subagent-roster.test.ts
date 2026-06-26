/**
 * Phantom Sub-Agent Roster Tests
 *
 * Active ADV guidance MUST NOT route work to sub-agents that are not shipped
 * as `.opencode/agents/*.md` assets. This test scans active guidance surfaces
 * for forbidden routing patterns referencing:
 *
 * Phantom names (retired agents):
 *   - `librarian`  (replaced by `adv-researcher`)
 *   - `mechanic`   (replaced by inline diagnosis)
 *   - `prioritizer` (replaced by `skill("prioritizer")` inline)
 *
 * Primary agents (never spawnable as sub-agents):
 *   - `adv`        (top-level orchestrator)
 *   - `plan`       (top-level planning agent)
 *   - `build`      (top-level build agent)
 *
 * Historical references in CHANGELOG.md, docs/archive/, and .adv/specs/_archive/
 * are explicitly out of scope per agreement DONT1.
 *
 * Realizes design Decision 4 (asset-test enforcement), discovery deltas
 * `rq-supportedSubagentRoster01`, `rq-researchRouting01`, and
 * `rq-delDefaults06` (primary agent routing prevention).
 */

import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

const PHANTOMS = ["librarian", "mechanic", "prioritizer"] as const;
type Phantom = (typeof PHANTOMS)[number];

/**
 * Primary agents that are mode: primary and MUST NOT appear as sub-agent
 * routing targets. Per rq-delDefaults06, these agents are user-selectable
 * top-level agents, not spawnable workers.
 */
const PRIMARIES = ["adv", "plan", "build"] as const;
type Primary = (typeof PRIMARIES)[number];

interface PatternSpec {
  kind: string;
  pattern: RegExp;
}

/**
 * Build forbidden-pattern set for one agent name (phantom or primary).
 *
 * Patterns are targeted at active spawnable routing — table rows, spawn args,
 * spawn/delegate prose, numbered agent lists, and slash-separated routing
 * paths. We deliberately do NOT add a blanket `\b${name}\b` pattern because
 * `skill("prioritizer")` is a legitimate inline-skill invocation we must NOT
 * flag.
 */
function buildPatterns(name: string): PatternSpec[] {
  // Negative lookahead to prevent matching compound names.
  // e.g., "adv" should not match "adv-researcher", "adv-reviewer", etc.
  const notCompound = `(?![\\-\\w])`;
  return [
    // Sub-agent table row: | `name` |
    {
      kind: "agent-table-row",
      pattern: new RegExp(`\\|\\s*\`${name}\`\\s*\\|`, "g"),
    },
    // Task tool spawn argument: subagent_type: "name" / 'name' / "subagent_type": "name"
    {
      kind: "subagent_type-arg",
      pattern: new RegExp(
        `["']?subagent_type["']?\\s*:\\s*["']${name}["']`,
        "gi",
      ),
    },
    // Imperative spawn: "spawn name" / "Spawn `name`"
    {
      kind: "spawn-prose",
      pattern: new RegExp(`\\bspawn\\s+\`?${name}\`?${notCompound}`, "gi"),
    },
    // Delegation prose: "delegate to name" / "Delegate to `name`"
    {
      kind: "delegate-prose",
      pattern: new RegExp(
        `\\bdelegate\\s+to\\s+\`?${name}\`?${notCompound}`,
        "gi",
      ),
    },
    // Numbered emphasized agent reference: "1. **name** — ..."
    {
      kind: "numbered-bold-agent",
      pattern: new RegExp(`^\\s*\\d+\\.\\s*\\*\\*${name}\\*\\*`, "gim"),
    },
    // Plus-separated parallel routing option: "explore + name" / "name + explore".
    {
      kind: "plus-routing",
      pattern: new RegExp(
        "(?:\\b(?:explore|general|adv-engineer|adv-reviewer|adv-designer|adv-researcher|adv-tron)\\b\\s*\\+\\s*`?" +
          name +
          "`?" +
          notCompound +
          "|`?" +
          name +
          "`?" +
          notCompound +
          "\\s*\\+\\s*\\b(?:explore|general|adv-engineer|adv-reviewer|adv-designer|adv-researcher|adv-tron)\\b)",
        "gi",
      ),
    },
    // Slash-separated routing path option: "(X/name/Y)" or "X/name/Y"
    {
      kind: "slash-routing",
      pattern: new RegExp(`[(/]\\s*${name}\\s*[/)]`, "gi"),
    },
  ];
}

function markdownFilesUnder(relativeDir: string): string[] {
  const absoluteDir = join(REPO_ROOT, relativeDir);
  return readdirSync(absoluteDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => `${relativeDir}/${entry}`)
    .sort();
}

const ACTIVE_SURFACES = [
  "ADV_INSTRUCTIONS.md",
  "SETUP.md",
  ...markdownFilesUnder(".opencode/agents"),
  ...markdownFilesUnder(".opencode/command"),
  ...markdownFilesUnder(".opencode/overlays"),
];

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

/**
 * Finding for primary agent routing violations.
 */
interface PrimaryFinding {
  surface: string;
  primary: Primary;
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
        const lineNum = content.substring(0, match.index).split("\n").length;
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

function formatPrimaryFindings(findings: PrimaryFinding[]): string {
  return findings
    .map(
      (f) =>
        `  L${f.line} [${f.primary}:${f.kind}] ${f.text.length > 120 ? f.text.slice(0, 117) + "..." : f.text}`,
    )
    .join("\n");
}

/**
 * Scan a surface for forbidden primary agent routing patterns.
 * Uses the same pattern detection as phantoms but targets primary agents.
 */
function scanForPrimaries(surface: string): PrimaryFinding[] {
  const path = join(REPO_ROOT, surface);
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");
  const findings: PrimaryFinding[] = [];

  for (const primary of PRIMARIES) {
    for (const { kind, pattern } of buildPatterns(primary)) {
      // Primary names like "build" appear frequently in filesystem paths.
      // Slash-routing is useful for phantom names, but too noisy for primary
      // agent enforcement; spawn/delegate/table/subagent_type patterns own it.
      if (kind === "slash-routing") continue;
      // Reset lastIndex defensively (regex objects keep state across exec)
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split("\n").length;
        const lineText = (lines[lineNum - 1] ?? "").trim();
        findings.push({
          surface,
          primary,
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

describe("primary agent routing prevention", () => {
  for (const surface of ACTIVE_SURFACES) {
    test(`${surface} contains no forbidden primary agent routing`, () => {
      const findings = scanForPrimaries(surface);
      if (findings.length > 0) {
        const message =
          `${surface} contains ${findings.length} forbidden primary agent routing reference(s).\n` +
          `Primary agents must never be used as sub-agent targets per rq-delDefaults06:\n` +
          `  adv      → top-level orchestrator (mode: primary)\n` +
          `  plan     → top-level planning agent (mode: primary)\n` +
          `  build    → top-level build agent (mode: primary)\n\n` +
          `Findings:\n${formatPrimaryFindings(findings)}`;
        throw new Error(message);
      }
      expect(findings.length).toBe(0);
    });
  }

  test("PRIMARIES list matches design delegation defaults", () => {
    // Pin the primary list so the test can't be silently weakened.
    expect(PRIMARIES).toEqual(["adv", "plan", "build"]);
  });
});
