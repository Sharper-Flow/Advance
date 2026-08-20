/**
 * Briefing Packet Renderer Tests
 *
 * TDD tests for the pure, storage-free briefing packet renderer.
 */

import { describe, expect, it } from "vitest";
import {
  renderBriefingPacket,
  type BriefingPacketRendererInput,
} from "./briefing-packet-renderer";
import {
  BriefingPacketSchema,
  BRIEFING_PACKET_LANE_SCHEMA_VERSION,
} from "../types";
import { getSubagentReportPacketAnchors } from "../types/subagent-reports";

const baseInput: BriefingPacketRendererInput = {
  change_id: "addBriefingPackets",
  title: "Add briefing packets",
  lane: "engineer",
  origin: { kind: "adhoc" },
  scope: {
    proposal: "## User outcomes\n- Outcome one\n- Outcome two\n",
    in_scope: ["renderer", "tests"],
    out_of_scope: ["storage wiring", "command rewrites"],
  },
  contract: {
    items: [
      {
        id: "AC2",
        kind: "acceptance_criterion",
        text: "Lane-specific bounded sections",
        status: "pass",
      },
      {
        id: "C1",
        kind: "constraint",
        text: "No storage/tool imports in renderer",
        status: "respected",
      },
    ],
  },
  tasks: [
    {
      id: "tk-cb9e107ca5ef",
      title: "Implement renderer",
      status: "in_progress",
    },
    { id: "tk-eb2cc01eed52", title: "Add types", status: "done" },
  ],
  affected_files: ["plugin/src/utils/briefing-packet-renderer.ts"],
  verification_expectations: ["targeted renderer tests pass"],
  durable_facts: [
    {
      id: "fact-1",
      outcome: "unresolved_action",
      source_label: "required_main_agent_actions",
      source_ref: "report/1",
      content: "Wire renderer into adv_change_show",
    },
  ],
  generated_by: "adv-engineer",
};

function render(input: BriefingPacketRendererInput = baseInput) {
  const packet = renderBriefingPacket(input);
  return BriefingPacketSchema.parse(packet);
}

function sectionKinds(packet: { sections: Array<{ kind: string }> }) {
  return packet.sections.map((s) => s.kind);
}

describe("renderBriefingPacket", () => {
  it("emits a valid schema-versioned packet", () => {
    const packet = render();
    expect(packet.schema_version).toBe(BRIEFING_PACKET_LANE_SCHEMA_VERSION);
    expect(packet.change_id).toBe("addBriefingPackets");
    expect(packet.lane).toBe("engineer");
  });

  it("uses worker-lane identity anchors derived from sub-agent report authority", () => {
    const packet = render();
    const identity = packet.sections.find((s) => s.kind === "identity_anchors");
    expect(identity).toBeDefined();
    expect(identity?.source_label).toBe("subagent-report.packet_anchors");
    const content = identity?.content as {
      change_id: string;
      title: string;
      anchors: string[];
      required_from: string;
      note: string;
    };
    expect(content.anchors).toEqual(
      getSubagentReportPacketAnchors("adv-engineer"),
    );
    // Self-documenting hint: anchor values must come from the orchestrator's
    // spawn prompt — the briefing packet only carries anchor NAMES. Without
    // this field, readers can misinterpret the names as informational-only
    // and skip populating the required packet header.
    expect(content.required_from).toBe("orchestrator_packet_header");
    expect(content.note).toEqual(expect.any(String));
    expect(content.note.length).toBeGreaterThan(0);
  });

  it("uses archive anchors for the archive lane", () => {
    const packet = render({ ...baseInput, lane: "archive" });
    const identity = packet.sections.find((s) => s.kind === "identity_anchors");
    const content = identity?.content as {
      anchors: string[];
      required_from: string;
    };
    expect(content.anchors).toEqual([
      "CHANGE",
      "STATUS",
      "TERMINAL_GATE_SUMMARY",
    ]);
    // Archive lane also carries the required_from hint (the renderer applies
    // it uniformly so any reader knows where the values must come from).
    expect(content.required_from).toBe("orchestrator_packet_header");
  });

  it("selects lane-specific sections for engineer lane", () => {
    const packet = render();
    expect(sectionKinds(packet)).toEqual(
      expect.arrayContaining([
        "identity_anchors",
        "scope",
        "contract",
        "tasks",
        "affected_files",
        "epic_context",
        "verification_expectations",
        "durable_facts",
      ]),
    );
    expect(sectionKinds(packet)).not.toContain("archive_digest");
  });

  it("selects archive-specific sections for archive lane", () => {
    const packet = render({
      ...baseInput,
      lane: "archive",
      archive_digest: {
        status: "archived",
        terminal_gate_summary: { release: "done" },
      },
    });
    expect(sectionKinds(packet)).toContain("archive_digest");
    expect(sectionKinds(packet)).not.toContain("tasks");
    expect(sectionKinds(packet)).not.toContain("verification_expectations");
  });

  it("labels every section with a non-empty source_label", () => {
    const packet = render();
    for (const section of packet.sections) {
      expect(section.source_label).toBeTruthy();
      expect(typeof section.source_label).toBe("string");
      expect(section.source_label.length).toBeGreaterThan(0);
    }
  });

  it("produces valid non-Epic output with compact marker", () => {
    const packet = render({ ...baseInput, epic_membership: null });
    const epic = packet.sections.find((s) => s.kind === "epic_context");
    expect(epic).toBeDefined();
    const content = epic?.content as { present: boolean; summary: string };
    expect(content.present).toBe(false);
    expect(content.summary).toMatch(/no epic/i);
  });

  it("renders compact Epic membership when present", () => {
    const packet = render({
      ...baseInput,
      epic_membership: {
        epic_id: "epicCleanup",
        entry_id: "entry-1",
        order: 2,
        title: "Cleanup initiative",
        linked_at: "2026-07-02T18:00:00.000Z",
      },
    });
    const epic = packet.sections.find((s) => s.kind === "epic_context");
    const content = epic?.content as {
      present: boolean;
      epic_id: string;
      title: string;
      order: number;
    };
    expect(content.present).toBe(true);
    expect(content.epic_id).toBe("epicCleanup");
    expect(content.title).toBe("Cleanup initiative");
    expect(content.order).toBe(2);
    // No raw Epic entries/hydration should leak
    expect(Object.keys(content)).not.toEqual(
      expect.arrayContaining(["linked_at", "entry_id"]),
    );
  });

  it("points an unverified Epic membership at reconcile", () => {
    const packet = render({
      ...baseInput,
      epic_membership: {
        epic_id: "epicCleanup",
        entry_id: "entry-1",
        order: 2,
        title: "Cleanup initiative",
        linked_at: "2026-07-02T18:00:00.000Z",
      },
      epic_membership_verification: "entry_missing",
    });
    const epic = packet.sections.find((s) => s.kind === "epic_context");
    const content = epic?.content as {
      verification: string;
      reconcile: string;
    };
    expect(content.verification).toBe("entry_missing");
    expect(content.reconcile).toMatch(/reconcile/i);
  });

  it("emits explicit unavailable markers and section when state is missing", () => {
    const packet = render({
      change_id: "addBriefingPackets",
      title: "Add briefing packets",
      lane: "engineer",
      generated_by: "adv-engineer",
    });
    expect(packet.unavailable_markers.length).toBeGreaterThan(0);
    const unavailable = packet.sections.find(
      (s) => s.kind === "unavailable_state",
    );
    expect(unavailable).toBeDefined();
    expect(unavailable?.unavailable_warning).toBeTruthy();
    const content = unavailable?.content as {
      missing: Array<{ label: string; reason: string }>;
    };
    expect(content.missing.length).toBeGreaterThan(0);
  });

  it("does not dump raw artifact text into sections", () => {
    const proposal = "## User outcomes\n".repeat(100);
    const packet = render({ ...baseInput, scope: { proposal } });
    const scope = packet.sections.find((s) => s.kind === "scope");
    const scopeStr = JSON.stringify(scope?.content);
    expect(scopeStr.length).toBeLessThan(proposal.length);
    expect(scopeStr).not.toContain("## User outcomes\n## User outcomes");
  });

  it("does not dump raw reports or session state", () => {
    const packet = render();
    const allContent = JSON.stringify(packet);
    expect(allContent).not.toContain("workdir_used");
    expect(allContent).not.toContain('"attempt"');
    expect(allContent).not.toContain("subagent_report");
    // durable facts are compact structured facts, not full reports
    expect(allContent).not.toContain('"blockers"');
    expect(allContent).not.toContain('"changes_made"');
  });

  it("omits empty sections rather than rendering them", () => {
    const packet = render({
      ...baseInput,
      durable_facts: [],
      affected_files: [],
      verification_expectations: [],
    });
    expect(sectionKinds(packet)).not.toContain("durable_facts");
    expect(sectionKinds(packet)).not.toContain("affected_files");
    expect(sectionKinds(packet)).not.toContain("verification_expectations");
  });

  it("bounds sections and facts to schema limits", () => {
    const manyFacts = Array.from({ length: 150 }, (_, i) => ({
      id: `fact-${i}`,
      outcome: "unresolved_action" as const,
      source_label: "test",
      content: `content ${i}`,
    }));
    const manyTasks = Array.from({ length: 50 }, (_, i) => ({
      id: `tk-${i}`,
      title: `Task ${i}`,
      status: "pending",
    }));
    const packet = render({
      ...baseInput,
      durable_facts: manyFacts,
      tasks: manyTasks,
    });
    expect(packet.sections.length).toBeLessThanOrEqual(20);
    expect(packet.facts.length).toBeLessThanOrEqual(100);
  });

  it("tracks omission metadata for truncated content", () => {
    const manyFacts = Array.from({ length: 150 }, (_, i) => ({
      id: `fact-${i}`,
      outcome: "unresolved_action" as const,
      source_label: "test",
      content: `content ${i}`,
    }));
    const packet = render({ ...baseInput, durable_facts: manyFacts });
    const factsSection = packet.sections.find(
      (s) => s.kind === "durable_facts",
    );
    const content = factsSection?.content as {
      included: number;
      omitted: number;
      total: number;
    };
    expect(content.included).toBeLessThan(content.total);
    expect(content.omitted).toBeGreaterThan(0);
  });

  it("is deterministic for the same input", () => {
    const a = JSON.stringify(render());
    const b = JSON.stringify(render());
    expect(a).toBe(b);
  });

  // =============================================================================
  // AC2 / AC6 — Structured criterion rendering
  // =============================================================================

  it("AC2: renders behavioral variant parts distinguishably for review/agent briefing", () => {
    const packet = render({
      ...baseInput,
      contract: {
        items: [
          {
            id: "AC2",
            kind: "acceptance_criterion",
            text: "Given a request, when it is valid, then it succeeds.",
            status: "pass",
            variant: {
              kind: "behavioral",
              context: "a request",
              trigger: "it is valid",
              outcome: "it succeeds",
              boundaries: [
                "and no side effects leak",
                "and errors are bounded",
              ],
            },
          },
        ],
      },
    });

    const contractSection = packet.sections.find((s) => s.kind === "contract");
    expect(contractSection).toBeDefined();
    const content = contractSection?.content as {
      items: Array<{
        id: string;
        text: string;
        variant: {
          kind: string;
          context: string;
          trigger: string;
          outcome: string;
          boundaries?: string[];
        };
      }>;
    };
    expect(content.items).toHaveLength(1);
    const item = content.items[0]!;
    expect(item.variant.kind).toBe("behavioral");
    expect(item.variant.context).toBe("a request");
    expect(item.variant.trigger).toBe("it is valid");
    expect(item.variant.outcome).toBe("it succeeds");
    expect(item.variant.boundaries).toEqual([
      "and no side effects leak",
      "and errors are bounded",
    ]);
  });

  it("AC6: renders variant kind and canonical obligation without inventing a second authoritative representation", () => {
    const packet = render({
      ...baseInput,
      contract: {
        items: [
          {
            id: "AC6",
            kind: "acceptance_criterion",
            text: "Given a request, when it is valid, then it succeeds.",
            status: "pass",
            variant: {
              kind: "behavioral",
              context: "a request",
              trigger: "it is valid",
              outcome: "it succeeds",
            },
          },
        ],
      },
    });

    const contractSection = packet.sections.find((s) => s.kind === "contract");
    const content = contractSection?.content as {
      items: Array<{ id: string; text: string; variant: { kind: string } }>;
    };
    const item = content.items[0]!;
    // Variant is visible
    expect(item.variant).toBeDefined();
    expect(item.variant.kind).toBe("behavioral");
    // Canonical text remains the authoritative one-line obligation
    expect(item.text).toBe(
      "Given a request, when it is valid, then it succeeds.",
    );
    // No invented/synthetic secondary text is introduced
    expect(item).not.toHaveProperty("synthetic_text");
    expect(item).not.toHaveProperty("display");
  });

  it("AC3: legacy flat-text contract items render without a variant field", () => {
    const packet = render({
      ...baseInput,
      contract: {
        items: [
          {
            id: "AC3",
            kind: "acceptance_criterion",
            text: "Legacy flat-text criterion.",
            status: "pass",
          },
        ],
      },
    });

    const contractSection = packet.sections.find((s) => s.kind === "contract");
    const content = contractSection?.content as {
      items: Array<{ id: string; text: string; variant?: unknown }>;
    };
    expect(content.items).toHaveLength(1);
    expect(content.items[0]!.text).toBe("Legacy flat-text criterion.");
    expect(content.items[0]!.variant).toBeUndefined();
  });
});
