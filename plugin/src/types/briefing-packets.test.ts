import { describe, expect, it } from "vitest";

import {
  BriefingFactOutcomeSchema,
  BriefingFactSchema,
  BriefingPacketLaneSchema,
  BriefingPacketSchema,
  BriefingPacketSectionKindSchema,
  BRIEFING_PACKET_LANE_SCHEMA_VERSION,
  BRIEFING_PACKET_LANE_TO_AGENT,
  getBriefingPacketArchiveAnchors,
  getBriefingPacketLaneAnchors,
} from "./briefing-packets";
import {
  getSubagentReportPacketAnchors,
  SubagentAgentSchema,
} from "./subagent-reports";

describe("Briefing packet type foundations", () => {
  it("defines the expected lane set including archive", () => {
    expect(BriefingPacketLaneSchema.options).toEqual([
      "researcher",
      "engineer",
      "designer",
      "reviewer",
      "scanner",
      "verifier",
      "archive",
    ]);
  });

  it("maps every non-archive lane to a persisted sub-agent report agent", () => {
    expect(BRIEFING_PACKET_LANE_TO_AGENT).toEqual({
      researcher: "adv-researcher",
      engineer: "adv-engineer",
      designer: "adv-designer",
      reviewer: "adv-reviewer",
      scanner: "adv-scanner-bundle",
      verifier: "adv-verification-triage-bundle",
    });

    for (const agent of Object.values(BRIEFING_PACKET_LANE_TO_AGENT)) {
      expect(SubagentAgentSchema.options).toContain(agent);
    }
  });

  it("derives lane identity anchors from sub-agent report field sources", () => {
    expect(getBriefingPacketLaneAnchors("engineer")).toEqual(
      getSubagentReportPacketAnchors("adv-engineer"),
    );
    expect(getBriefingPacketLaneAnchors("reviewer")).toEqual(
      getSubagentReportPacketAnchors("adv-reviewer"),
    );
    expect(getBriefingPacketLaneAnchors("scanner")).toEqual(
      getSubagentReportPacketAnchors("adv-scanner-bundle"),
    );
    expect(getBriefingPacketLaneAnchors("verifier")).toEqual(
      getSubagentReportPacketAnchors("adv-verification-triage-bundle"),
    );
  });

  it("does not treat archive as a worker lane", () => {
    expect(() =>
      // @ts-expect-error archive is not a worker lane
      getBriefingPacketLaneAnchors("archive"),
    ).toThrow();
    expect(getBriefingPacketArchiveAnchors()).not.toEqual(
      getSubagentReportPacketAnchors("adv-engineer"),
    );
    expect(getBriefingPacketArchiveAnchors()).toContain("CHANGE");
    expect(getBriefingPacketArchiveAnchors()).toContain("STATUS");
  });

  it("classifies durable facts into the expected outcomes", () => {
    expect(BriefingFactOutcomeSchema.options).toEqual([
      "transient_prompt_context",
      "agenda",
      "wisdom_candidate",
      "spec_delta_candidate",
      "epic_terminal_note",
      "archive_only_evidence",
      "unresolved_action",
    ]);
  });

  it("parses a valid briefing fact", () => {
    const fact = BriefingFactSchema.parse({
      id: "fact-1",
      outcome: "unresolved_action",
      source_label: "required_main_agent_actions",
      source_ref: "report/1",
      content: "Promote briefing packet spec law",
    });

    expect(fact.dispositioned).toBe(false);
  });

  it("parses a valid briefing packet with bounded sections and facts", () => {
    const packet = BriefingPacketSchema.parse({
      schema_version: BRIEFING_PACKET_LANE_SCHEMA_VERSION,
      change_id: "addBriefingPackets",
      lane: "engineer",
      generated_at: "2026-07-02T18:00:00.000Z",
      sections: [
        {
          kind: "identity_anchors",
          source_label: "SUBAGENT_REPORT_PACKET_ANCHORS",
          content: {
            change_id: "addBriefingPackets",
            task_id: "tk-eb2cc01eed52",
          },
        },
      ],
      facts: [
        {
          id: "fact-1",
          outcome: "unresolved_action",
          source_label: "required_main_agent_actions",
          source_ref: "report/1",
          content: "Promote briefing packet spec law",
        },
      ],
      unavailable_markers: [],
      session_metadata: { generated_by: "adv-engineer", audit_only: true },
    });

    expect(packet.lane).toBe("engineer");
    expect(packet.session_metadata?.audit_only).toBe(true);
  });

  it("rejects packets with fabricated non-audit session metadata", () => {
    expect(() =>
      BriefingPacketSchema.parse({
        schema_version: BRIEFING_PACKET_LANE_SCHEMA_VERSION,
        change_id: "addBriefingPackets",
        lane: "engineer",
        sections: [],
        facts: [],
        session_metadata: { generated_by: "adv-engineer", audit_only: false },
      }),
    ).toThrow();
  });

  it("rejects unknown fields at the briefing packet boundary", () => {
    expect(() =>
      BriefingPacketSchema.parse({
        schema_version: BRIEFING_PACKET_LANE_SCHEMA_VERSION,
        change_id: "addBriefingPackets",
        lane: "engineer",
        sections: [],
        facts: [],
        untyped_extra: true,
      }),
    ).toThrow();
  });

  it("exposes bounded section kinds", () => {
    expect(BriefingPacketSectionKindSchema.options).toContain(
      "identity_anchors",
    );
    expect(BriefingPacketSectionKindSchema.options).toContain("durable_facts");
    expect(BriefingPacketSectionKindSchema.options).toContain(
      "unavailable_state",
    );
    expect(BriefingPacketSectionKindSchema.options).toContain("archive_digest");
  });
});
