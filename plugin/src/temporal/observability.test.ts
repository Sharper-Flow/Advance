import { describe, expect, it } from "vitest";
import {
  ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES,
  buildTemporalSearchAttributes,
} from "./observability";

describe("temporal observability helpers", () => {
  it("exports stable search attribute keys", () => {
    expect(ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.projectId).toBe("AdvProjectId");
    expect(ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeId).toBe("AdvChangeId");
    expect(ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeStatus).toBe(
      "AdvChangeStatus",
    );
    expect(ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.activeGate).toBe("AdvActiveGate");
    expect(ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.doomLoop).toBe(
      "AdvDoomLoopActive",
    );
  });

  it("builds a minimal search attribute map for change workflows", () => {
    const attrs = buildTemporalSearchAttributes({
      projectId: "proj1",
      changeId: "chg1",
      changeStatus: "active",
      activeGate: "execution",
      doomLoopActive: true,
    });
    expect(attrs).toEqual({
      AdvProjectId: ["proj1"],
      AdvChangeId: ["chg1"],
      AdvChangeStatus: ["active"],
      AdvActiveGate: ["execution"],
      AdvDoomLoopActive: [true],
    });
  });
});
