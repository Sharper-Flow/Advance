/**
 * Bun tests for bin/lib/roadmap
 *
 * Run with: bun test bin/lib/roadmap.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  hasContextPacket,
  renderRoadmap,
  type RoadmapPayload,
} from "./roadmap";

function makePayload(
  overrides: Partial<RoadmapPayload> = {},
): RoadmapPayload {
  return {
    source: "temporal",
    live: true,
    generated_at: "2026-07-23T12:00:00.000Z",
    project_id: "test-project",
    epic_id: "demoEpic",
    epic_title: "Demo Epic",
    entries: [],
    backlog: [],
    ...overrides,
  };
}

describe("hasContextPacket", () => {
  test("returns false for undefined, null, and empty object", () => {
    expect(hasContextPacket(undefined)).toBe(false);
    expect(hasContextPacket(null)).toBe(false);
    expect(hasContextPacket({})).toBe(false);
  });

  test("returns true for any non-empty packet field", () => {
    expect(hasContextPacket({ background: "seed" })).toBe(true);
    expect(hasContextPacket({ references: [{ label: "x", locator: "y" }] })).toBe(
      true,
    );
    expect(hasContextPacket({ constraints: ["keep it small"] })).toBe(true);
  });

  test("returns false when only empty/undefined fields are present", () => {
    expect(hasContextPacket({ background: "", references: [] })).toBe(false);
    expect(hasContextPacket({ background: undefined })).toBe(false);
  });
});

describe("renderRoadmap", () => {
  test("marks a shell with context_packet and omits marker for one without", () => {
    const payload = makePayload({
      entries: [
        {
          kind: "shell",
          order: 0,
          title: "Seed shell",
          hasContextPacket: true,
        },
        {
          kind: "shell",
          order: 1,
          title: "Plain shell",
          hasContextPacket: false,
        },
      ],
    });
    const output = renderRoadmap(payload, true);
    expect(output).toContain("[shell] Seed shell [ctx]");
    expect(output).toContain("[shell] Plain shell");
    expect(output).not.toContain("[shell] Plain shell [ctx]");
  });

  test("renders a Backlog section with markers", () => {
    const payload = makePayload({
      backlog: [
        { id: "bl-1", title: "Packet item", hasContextPacket: true },
        { id: "bl-2", title: "Empty item", hasContextPacket: false },
      ],
    });
    const output = renderRoadmap(payload, true);
    expect(output).toContain("## Backlog");
    expect(output).toContain("- Packet item [ctx]");
    expect(output).toContain("- Empty item");
    expect(output).not.toContain("- Empty item [ctx]");
  });

  test("does not dump packet contents", () => {
    const payload = makePayload({
      entries: [
        {
          kind: "shell",
          order: 0,
          title: "Seed shell",
          hasContextPacket: true,
        },
      ],
    });
    const output = renderRoadmap(payload, true);
    expect(output).not.toContain("background");
    expect(output).not.toContain("design_seed");
    expect(output).not.toContain("references");
  });

  test("renders a no-rows message when both sections are empty", () => {
    const payload = makePayload();
    const output = renderRoadmap(payload, true);
    expect(output).toContain("(no future-work rows)");
  });
});
