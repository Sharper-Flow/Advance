import { describe, expect, it } from "vitest";
import {
  ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES,
  buildTemporalSearchAttributes,
  checkAdvSearchAttributes,
  registerMissingAdvSearchAttributes,
  requiredAdvSearchAttributes,
} from "./observability";

const SIGNAL_SEARCH_ATTRIBUTE_NAMES = [
  "AdvChangeId",
  "AdvChangeStatus",
  "AdvLifecycleState",
  "AdvChangeTitle",
  "AdvAffectedProjects",
  "AdvCurrentGate",
  "AdvCurrentBucket",
  "AdvLastSignalAt",
  "AdvCreatedAt",
  "AdvWorktreeBranches",
  "AdvWorktreePaths",
  // rq-backlogCoord01 — single-value Keyword indexing the per-change claim
  // on a GitHub Project issue. Does not consume a KeywordList slot.
  "AdvBacklogIssueNumber",
  // rq-epicTemporalConstraints01 — single-value Keyword indexing the per-change Epic.
  "AdvEpicId",
] as const;

const SIGNAL_REQUIRED_SEARCH_ATTRIBUTES = [
  { name: "AdvChangeId", type: "Keyword", typeCode: 2 },
  { name: "AdvChangeStatus", type: "Keyword", typeCode: 2 },
  { name: "AdvLifecycleState", type: "Keyword", typeCode: 2 },
  { name: "AdvChangeTitle", type: "Keyword", typeCode: 2 },
  { name: "AdvAffectedProjects", type: "KeywordList", typeCode: 7 },
  { name: "AdvCurrentGate", type: "Keyword", typeCode: 2 },
  { name: "AdvCurrentBucket", type: "Keyword", typeCode: 2 },
  { name: "AdvLastSignalAt", type: "Datetime", typeCode: 6 },
  { name: "AdvCreatedAt", type: "Datetime", typeCode: 6 },
  { name: "AdvWorktreeBranches", type: "KeywordList", typeCode: 7 },
  { name: "AdvWorktreePaths", type: "KeywordList", typeCode: 7 },
  // rq-backlogCoord01 — added by agenticBacklogCoordination v1.
  { name: "AdvBacklogIssueNumber", type: "Keyword", typeCode: 2 },
  // rq-epicTemporalConstraints01 — added by advance-epics v1.
  { name: "AdvEpicId", type: "Keyword", typeCode: 2 },
] as const;

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
      AdvChangeId: ["chg1"],
      AdvChangeStatus: ["active"],
      AdvAffectedProjects: ["proj1"],
      AdvCurrentGate: ["execution"],
    });
  });

  it("includes AdvEpicId when epicId is provided", () => {
    const attrs = buildTemporalSearchAttributes({
      projectId: "proj1",
      changeId: "chg1",
      changeStatus: "active",
      activeGate: "execution",
      epicId: "addAuthEpic",
    });

    expect(attrs.AdvEpicId).toEqual(["addAuthEpic"]);
  });

  it("omits AdvEpicId when epicId is not provided", () => {
    const attrs = buildTemporalSearchAttributes({
      projectId: "proj1",
      changeId: "chg1",
      changeStatus: "active",
      activeGate: "execution",
    });

    expect(attrs.AdvEpicId).toBeUndefined();
  });

  it("declares required ADV search attributes with server types", () => {
    expect(requiredAdvSearchAttributes()).toEqual(
      SIGNAL_REQUIRED_SEARCH_ATTRIBUTES,
    );
  });

  // Drift-catch: pin Temporal IndexedValueType numeric codes to the canonical
  // proto values from temporal/api/enums/v1/common.proto. If Temporal changes
  // these (or the local constants drift), this test fails clearly with a
  // pointer to the proto source.
  //
  // Source: https://github.com/temporalio/api/blob/master/temporal/api/enums/v1/common.proto
  //   INDEXED_VALUE_TYPE_UNSPECIFIED = 0;
  //   INDEXED_VALUE_TYPE_TEXT        = 1;
  //   INDEXED_VALUE_TYPE_KEYWORD     = 2;
  //   INDEXED_VALUE_TYPE_INT         = 3;
  //   INDEXED_VALUE_TYPE_DOUBLE      = 4;
  //   INDEXED_VALUE_TYPE_BOOL        = 5;
  //   INDEXED_VALUE_TYPE_DATETIME    = 6;
  //   INDEXED_VALUE_TYPE_KEYWORD_LIST = 7;
  it("uses canonical Temporal IndexedValueType numeric codes", () => {
    const CANONICAL_KEYWORD = 2;
    const CANONICAL_BOOL = 5;
    const attrs = requiredAdvSearchAttributes();
    for (const attr of attrs) {
      if (attr.type === "Keyword") {
        expect(attr.typeCode).toBe(CANONICAL_KEYWORD);
      } else if (attr.type === "Bool") {
        expect(attr.typeCode).toBe(CANONICAL_BOOL);
      }
    }
  });

  it("classifies present, missing, and wrong-type search attributes", async () => {
    // Mock fixture types use canonical IndexedValueType codes:
    //   Keyword = 2, Int = 3 (used here as wrong-type sentinel), Bool = 5.
    // AdvChangeStatus is intentionally registered as Int (3) to exercise
    // wrong-type classification — it must NOT equal Keyword (2) or Bool (5).
    const operatorService = {
      listSearchAttributes: async () => ({
        customAttributes: {
          AdvChangeId: { indexedValueType: 2 },
          AdvChangeStatus: { indexedValueType: 3 },
          AdvCurrentGate: { indexedValueType: 2 },
        },
      }),
    };

    const result = await checkAdvSearchAttributes(
      { operatorService },
      "default",
    );

    expect(result.ok).toBe(false);
    expect(result.verificationStatus).toBe("verified");
    expect(result.present.map((attr) => attr.name)).toEqual([
      "AdvChangeId",
      "AdvCurrentGate",
    ]);
    expect(result.missing.map((attr) => attr.name)).toEqual([
      "AdvLifecycleState",
      "AdvChangeTitle",
      "AdvAffectedProjects",
      "AdvCurrentBucket",
      "AdvLastSignalAt",
      "AdvCreatedAt",
      "AdvWorktreeBranches",
      "AdvWorktreePaths",
      "AdvBacklogIssueNumber",
      "AdvEpicId",
    ]);
    expect(result.wrongType).toEqual([
      {
        name: "AdvChangeStatus",
        expected: "Keyword",
        expectedCode: 2,
        actualCode: 3,
      },
    ]);
  });

  it("marks search attribute checks unverified when list is unavailable", async () => {
    const result = await checkAdvSearchAttributes(
      { operatorService: {} },
      "default",
    );

    expect(result.ok).toBe(false);
    expect(result.verificationStatus).toBe("unverified");
    expect(result.missing.map((attr) => attr.name)).toEqual([
      ...SIGNAL_SEARCH_ATTRIBUTE_NAMES,
    ]);
    expect(result.error).toBe(
      "OperatorService.listSearchAttributes unavailable",
    );
  });

  it("marks search attribute checks unverified when list throws", async () => {
    const operatorService = {
      listSearchAttributes: async () => {
        throw new Error("search attribute RPC unavailable");
      },
    };

    const result = await checkAdvSearchAttributes(
      { operatorService },
      "default",
    );

    expect(result.ok).toBe(false);
    expect(result.verificationStatus).toBe("unverified");
    expect(result.missing.map((attr) => attr.name)).toEqual([
      ...SIGNAL_SEARCH_ATTRIBUTE_NAMES,
    ]);
    expect(result.error).toBe("search attribute RPC unavailable");
  });

  it("registers only missing search attributes and reports method", async () => {
    const addSearchAttributes = vi.fn().mockResolvedValue({});
    const operatorService = {
      listSearchAttributes: async () => ({
        customAttributes: {
          AdvChangeId: { indexedValueType: 2 },
          AdvChangeStatus: { indexedValueType: 2 },
          AdvCurrentGate: { indexedValueType: 2 },
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
      searchAttributes: {
        AdvLifecycleState: 2,
        AdvChangeTitle: 2,
        AdvAffectedProjects: 7,
        AdvCurrentBucket: 2,
        AdvLastSignalAt: 6,
        AdvCreatedAt: 6,
        AdvWorktreeBranches: 7,
        AdvWorktreePaths: 7,
        AdvBacklogIssueNumber: 2,
        AdvEpicId: 2,
      },
    });
    expect(result).toEqual({
      ok: true,
      method: "operatorService.addSearchAttributes",
      verificationStatus: "verified",
      created: [
        { name: "AdvLifecycleState", type: "Keyword", typeCode: 2 },
        { name: "AdvChangeTitle", type: "Keyword", typeCode: 2 },
        { name: "AdvAffectedProjects", type: "KeywordList", typeCode: 7 },
        { name: "AdvCurrentBucket", type: "Keyword", typeCode: 2 },
        { name: "AdvLastSignalAt", type: "Datetime", typeCode: 6 },
        { name: "AdvCreatedAt", type: "Datetime", typeCode: 6 },
        { name: "AdvWorktreeBranches", type: "KeywordList", typeCode: 7 },
        { name: "AdvWorktreePaths", type: "KeywordList", typeCode: 7 },
        { name: "AdvBacklogIssueNumber", type: "Keyword", typeCode: 2 },
        { name: "AdvEpicId", type: "Keyword", typeCode: 2 },
      ],
      skipped: [
        { name: "AdvChangeId", type: "Keyword", typeCode: 2 },
        { name: "AdvChangeStatus", type: "Keyword", typeCode: 2 },
        { name: "AdvCurrentGate", type: "Keyword", typeCode: 2 },
      ],
      refused: [],
    });
  });
});
