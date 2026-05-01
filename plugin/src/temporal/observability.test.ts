import { describe, expect, it } from "vitest";
import {
  ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES,
  buildTemporalSearchAttributes,
  checkAdvSearchAttributes,
  registerMissingAdvSearchAttributes,
  requiredAdvSearchAttributes,
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

  it("declares required ADV search attributes with server types", () => {
    expect(requiredAdvSearchAttributes()).toEqual([
      { name: "AdvProjectId", type: "Keyword", typeCode: 1 },
      { name: "AdvChangeId", type: "Keyword", typeCode: 1 },
      { name: "AdvChangeStatus", type: "Keyword", typeCode: 1 },
      { name: "AdvActiveGate", type: "Keyword", typeCode: 1 },
      { name: "AdvDoomLoopActive", type: "Bool", typeCode: 4 },
    ]);
  });

  it("classifies present, missing, and wrong-type search attributes", async () => {
    const operatorService = {
      listSearchAttributes: async () => ({
        customAttributes: {
          AdvProjectId: { indexedValueType: 1 },
          AdvChangeId: { indexedValueType: 1 },
          AdvChangeStatus: { indexedValueType: 2 },
          AdvActiveGate: { indexedValueType: 1 },
        },
      }),
    };

    const result = await checkAdvSearchAttributes(
      { operatorService },
      "default",
    );

    expect(result.ok).toBe(false);
    expect(result.present.map((attr) => attr.name)).toEqual([
      "AdvProjectId",
      "AdvChangeId",
      "AdvActiveGate",
    ]);
    expect(result.missing.map((attr) => attr.name)).toEqual([
      "AdvDoomLoopActive",
    ]);
    expect(result.wrongType).toEqual([
      {
        name: "AdvChangeStatus",
        expected: "Keyword",
        expectedCode: 1,
        actualCode: 2,
      },
    ]);
  });

  it("registers only missing search attributes and reports method", async () => {
    const addSearchAttributes = vi.fn().mockResolvedValue({});
    const operatorService = {
      listSearchAttributes: async () => ({
        customAttributes: {
          AdvProjectId: { indexedValueType: 1 },
          AdvChangeId: { indexedValueType: 1 },
          AdvChangeStatus: { indexedValueType: 1 },
          AdvActiveGate: { indexedValueType: 1 },
        },
      }),
      addSearchAttributes,
    };

    const result = await registerMissingAdvSearchAttributes(
      { operatorService },
      "default",
    );

    expect(addSearchAttributes).toHaveBeenCalledWith({
      namespace: "default",
      searchAttributes: { AdvDoomLoopActive: 4 },
    });
    expect(result).toEqual({
      ok: true,
      method: "operatorService.addSearchAttributes",
      created: [{ name: "AdvDoomLoopActive", type: "Bool", typeCode: 4 }],
      skipped: [
        { name: "AdvProjectId", type: "Keyword", typeCode: 1 },
        { name: "AdvChangeId", type: "Keyword", typeCode: 1 },
        { name: "AdvChangeStatus", type: "Keyword", typeCode: 1 },
        { name: "AdvActiveGate", type: "Keyword", typeCode: 1 },
      ],
      refused: [],
    });
  });
});
