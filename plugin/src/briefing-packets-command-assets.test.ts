/**
 * Briefing packet command/agent asset tests
 *
 * Verifies that command and agent prompt assets consume the generated
 * `_briefingPacket` read projection instead of duplicating packet correctness
 * prose (AFFECTED FILES, ACCEPTANCE CRITERIA, EPIC CONTEXT, CONTRACT ITEMS,
 * etc.) while preserving required worker packet identity anchors.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import {
  getSubagentReportPacketAnchors,
  SUBAGENT_REPORT_PACKET_ANCHORS,
  SUBAGENT_WARN_FIRST_PACKET_ANCHORS,
} from "./types";
import { readCommandSurface } from "./__tests__/command-surface";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const AGENT_DIR = join(REPO_ROOT, ".opencode/agents");

type NonArchiveLane =
  | "researcher"
  | "engineer"
  | "designer"
  | "reviewer"
  | "scanner"
  | "verifier";

interface PacketExpectation {
  file: string;
  heading: string;
  lane: NonArchiveLane;
  anchors: string[];
  warnFirst: boolean;
  bannedManualSections: string[];
}

function readCommand(file: string): string {
  return readFileSync(join(COMMAND_DIR, file), "utf8");
}

function readAgent(file: string): string {
  return readFileSync(join(AGENT_DIR, file), "utf8");
}

function sectionAfterHeading(content: string, heading: string): string {
  // Try a Markdown heading first, then a bold label like **Heading:**
  const re = new RegExp(
    `\\n(?:#{1,4}\\s+|\\*\\*)${heading}(?::\\*\\*)?\\s*\\n`,
  );
  const match = re.exec(content);
  if (!match) return "";

  const rest = content.slice(match.index + match[0].length);
  const nextHeading = rest.search(/\n#{3,4} /);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function firstFencedBlock(section: string): string {
  return section.match(/```\n([\s\S]*?)```/)?.[1] ?? "";
}

const ENGINEER_ANCHORS = getSubagentReportPacketAnchors("adv-engineer");
const DESIGNER_ANCHORS = getSubagentReportPacketAnchors("adv-designer");
const REVIEWER_ANCHORS = getSubagentReportPacketAnchors("adv-reviewer");
const RESEARCHER_ANCHORS = getSubagentReportPacketAnchors("adv-researcher");

const PACKET_EXPECTATIONS: PacketExpectation[] = [
  {
    file: "adv-apply.md",
    heading: "Apply Context Packet",
    lane: "engineer",
    anchors: ENGINEER_ANCHORS,
    warnFirst: true,
    bannedManualSections: [
      "AFFECTED FILES:",
      "ACCEPTANCE CRITERIA:",
      "EPIC CONTEXT:",
    ],
  },
  {
    file: "adv-apply.md",
    heading: "Designer Apply Context Packet",
    lane: "designer",
    anchors: DESIGNER_ANCHORS,
    warnFirst: true,
    bannedManualSections: [
      "AFFECTED FILES:",
      "ACCEPTANCE CRITERIA:",
      "EPIC CONTEXT:",
    ],
  },
  {
    file: "adv-review.md",
    heading: "Review Scanner Context Packet",
    lane: "scanner",
    anchors: ["WORKING DIRECTORY", "CHANGE", "ATTEMPT"],
    warnFirst: false,
    bannedManualSections: [
      "AFFECTED FILES:",
      "ACCEPTANCE CRITERIA:",
      "CONTRACT ITEMS:",
      "EPIC CONTEXT:",
    ],
  },
  {
    file: "adv-review.md",
    heading: "Review Reviewer Remediation Packet",
    lane: "reviewer",
    anchors: REVIEWER_ANCHORS,
    warnFirst: true,
    bannedManualSections: ["ACCEPTANCE CRITERIA:", "EPIC CONTEXT:"],
  },
  {
    file: "adv-review.md",
    heading: "Review Engineer Remediation Packet",
    lane: "engineer",
    anchors: ENGINEER_ANCHORS,
    warnFirst: true,
    bannedManualSections: ["ACCEPTANCE CRITERIA:", "EPIC CONTEXT:"],
  },
  {
    file: "adv-harden.md",
    heading: "Harden Scanner Context Packet",
    lane: "scanner",
    anchors: ["WORKING DIRECTORY", "CHANGE", "ATTEMPT"],
    warnFirst: false,
    bannedManualSections: [
      "AFFECTED FILES:",
      "ACCEPTANCE CRITERIA:",
      "CONTRACT PROOF:",
      "EPIC CONTEXT:",
    ],
  },
  {
    file: "adv-harden.md",
    heading: "Harden Reviewer Remediation Packet",
    lane: "reviewer",
    anchors: REVIEWER_ANCHORS,
    warnFirst: true,
    bannedManualSections: ["ACCEPTANCE CRITERIA:", "EPIC CONTEXT:"],
  },
  {
    file: "adv-harden.md",
    heading: "Harden Engineer Remediation Packet",
    lane: "engineer",
    anchors: ENGINEER_ANCHORS,
    warnFirst: true,
    bannedManualSections: ["ACCEPTANCE CRITERIA:", "EPIC CONTEXT:"],
  },
  {
    file: "adv-design.md",
    heading: "Validator prompt template",
    lane: "researcher",
    anchors: RESEARCHER_ANCHORS,
    warnFirst: false,
    bannedManualSections: ["AGREEMENT CONTEXT:"],
  },
  {
    file: "adv-discover.md",
    heading: "Researcher Scout Packet",
    lane: "researcher",
    anchors: RESEARCHER_ANCHORS,
    warnFirst: false,
    bannedManualSections: [
      "AFFECTED FILES:",
      "ACCEPTANCE CRITERIA:",
      "EPIC CONTEXT:",
    ],
  },
];

const COMMANDS_IN_SCOPE = [
  "adv-apply.md",
  "adv-review.md",
  "adv-harden.md",
  "adv-design.md",
  "adv-discover.md",
];

const AGENTS_IN_SCOPE = [
  "adv-engineer.md",
  "adv-reviewer.md",
  "adv-designer.md",
  "adv-researcher.md",
];

describe("briefing packet command consumption", () => {
  test.each(COMMANDS_IN_SCOPE)(
    "%s instructs generation of a lane-specific briefing packet",
    (file) => {
      const content = readCommand(file);
      expect(content).toContain("briefingPacket: true");
      expect(content).toContain("_briefingPacket");
    },
  );

  test.each(PACKET_EXPECTATIONS)(
    "$file › $heading consumes generated briefing packet slices",
    ({ file, heading, lane, anchors, warnFirst, bannedManualSections }) => {
      const content =
        file === "adv-review.md"
          ? readCommandSurface("adv-review.md")
          : readCommand(file);
      const section = sectionAfterHeading(content, heading);
      expect(section, `missing section: ${heading}`).not.toBe("");

      const packet = firstFencedBlock(section);
      expect(packet, `no fenced packet in ${heading}`).not.toBe("");

      expect(
        packet,
        `${heading} must reference the generated BRIEFING PACKET slice`,
      ).toContain("BRIEFING PACKET:");

      for (const anchor of anchors) {
        expect(
          packet,
          `${heading} missing required packet anchor ${anchor}`,
        ).toContain(`${anchor}:`);
      }

      if (warnFirst) {
        for (const anchor of SUBAGENT_WARN_FIRST_PACKET_ANCHORS) {
          expect(
            packet,
            `${heading} missing warn-first anchor ${anchor}`,
          ).toContain(`${anchor}:`);
        }
      }

      for (const manual of bannedManualSections) {
        expect(
          packet,
          `${heading} still duplicates manual ${manual} instead of consuming the briefing packet`,
        ).not.toContain(manual);
      }

      expect(packet).toContain(`lane: ${lane}`);
    },
  );
});

describe("briefing packet agent consumption", () => {
  test.each(AGENTS_IN_SCOPE)(
    "%s instructs workers to consume generated briefing packet slices",
    (file) => {
      const content = readAgent(file);
      expect(content).toMatch(/BRIEFING PACKET|_briefingPacket/i);
      expect(content).toMatch(
        /consume|inject|authority|source.*briefing packet/i,
      );
    },
  );
});

// =============================================================================
// AC5 — Pin strict-identity vs warn-first-context anchor boundary.
//
// The packet-contract asset tests already verify that warn-first anchors
// appear in packet fenced blocks. The assertions below additionally pin the
// exact tier membership so an accidental strictening of the warn-first set
// (or demotion of an identity anchor) becomes a test failure rather than a
// silent protocol change. See strengthenAgentEvidence AC5 / DONT1.
// =============================================================================

describe("packet anchor tier boundary (AC5/DONT1)", () => {
  test("strict identity anchor vocabulary is exactly the field-source set", () => {
    expect(Object.values(SUBAGENT_REPORT_PACKET_ANCHORS).sort()).toEqual(
      [
        "ATTEMPT",
        "CHANGE",
        "PHASE",
        "SCOPE KEY",
        "TASK",
        "WORKING DIRECTORY",
      ].sort(),
    );
  });

  test("warn-first anchor vocabulary is exactly the pinned context set", () => {
    expect([...SUBAGENT_WARN_FIRST_PACKET_ANCHORS]).toEqual([
      "TASK_SCOPE",
      "IN_SCOPE",
      "OUT_OF_SCOPE",
      "DONE_WHEN",
      "STOP_WHEN",
      "VERIFICATION",
    ]);
  });

  test("strict and warn-first anchor sets are disjoint", () => {
    const strict = new Set(Object.values(SUBAGENT_REPORT_PACKET_ANCHORS));
    for (const anchor of SUBAGENT_WARN_FIRST_PACKET_ANCHORS) {
      expect(strict.has(anchor)).toBe(false);
    }
  });

  test.each([
    "adv-engineer",
    "adv-reviewer",
    "adv-designer",
    "adv-researcher",
    "adv-scanner-bundle",
    "adv-verification-triage-bundle",
  ] as const)("%s identity anchors include no warn-first anchor", (agent) => {
    const identityAnchors = getSubagentReportPacketAnchors(agent);
    for (const anchor of SUBAGENT_WARN_FIRST_PACKET_ANCHORS) {
      expect(
        identityAnchors,
        `${agent} identity anchors must not include warn-first ${anchor}`,
      ).not.toContain(anchor);
    }
  });

  test("engineer agent file pins warn-first anchors as warn-first (not strict)", () => {
    const content = readAgent("adv-engineer.md");
    expect(content).toContain("warn-first");
    expect(content).toContain(
      "Missing new non-identity anchors are warn-first rollout defects",
    );
    // Strict identity anchors must NOT be described as warn-first.
    const scopeLockSection =
      content
        .split("## Scope Lock")[1]
        ?.split("## Working Directory Lock")[0] ?? "";
    expect(scopeLockSection).toContain("TASK_SCOPE:");
    expect(scopeLockSection).toContain("IN_SCOPE:");
    expect(scopeLockSection).toContain("OUT_OF_SCOPE:");
    expect(scopeLockSection).toContain("DONE_WHEN:");
    expect(scopeLockSection).toContain("STOP_WHEN:");
    expect(scopeLockSection).toContain("VERIFICATION:");
  });
});
