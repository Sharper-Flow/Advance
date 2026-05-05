import { describe, expect, it, vi } from "vitest";

import { createDefaultGates } from "../types";
import type { ChangeWorkflowState } from "./contracts";
import {
  ADV_SEARCH_ATTRIBUTES,
  buildChangeSearchAttributes,
  ensureAdvSearchAttributes,
  requiredAdvSearchAttributes,
} from "./search-attributes";

function makeState(): ChangeWorkflowState {
  return {
    id: "chg1",
    projectId: "proj1",
    changeId: "chg1",
    title: "Exact title",
    status: "active",
    initializedAt: "2026-05-05T00:00:00.000Z",
    createdAt: "2026-05-05T00:00:00.000Z",
    tasks: [],
    wisdom: [],
    gates: createDefaultGates(),
    reentry_history: [],
    artifacts: {},
    affectedProjects: ["proj1", "proj2"],
    affectedPaths: ["plugin/src/temporal"],
    lastSignalAt: "2026-05-05T00:00:01.000Z",
  };
}

describe("ADV search attributes", () => {
  it("declares the signal-driven search attribute schema with Temporal type names", () => {
    expect(ADV_SEARCH_ATTRIBUTES).toEqual({
      AdvChangeId: "Keyword",
      AdvChangeStatus: "Keyword",
      AdvChangeTitle: "Keyword",
      AdvAffectedProjects: "KeywordList",
      AdvAffectedPaths: "KeywordList",
      AdvCurrentGate: "Keyword",
      AdvCurrentBucket: "Keyword",
      AdvLastSignalAt: "Datetime",
      AdvCreatedAt: "Datetime",
    });
  });

  it("maps required attributes to canonical Temporal IndexedValueType codes", () => {
    expect(requiredAdvSearchAttributes()).toEqual([
      { name: "AdvChangeId", type: "Keyword", typeCode: 2 },
      { name: "AdvChangeStatus", type: "Keyword", typeCode: 2 },
      { name: "AdvChangeTitle", type: "Keyword", typeCode: 2 },
      { name: "AdvAffectedProjects", type: "KeywordList", typeCode: 7 },
      { name: "AdvAffectedPaths", type: "KeywordList", typeCode: 7 },
      { name: "AdvCurrentGate", type: "Keyword", typeCode: 2 },
      { name: "AdvCurrentBucket", type: "Keyword", typeCode: 2 },
      { name: "AdvLastSignalAt", type: "Datetime", typeCode: 6 },
      { name: "AdvCreatedAt", type: "Datetime", typeCode: 6 },
    ]);
  });

  it("builds workflow upsert attributes from change state", () => {
    const attrs = buildChangeSearchAttributes(makeState(), {
      nowMs: Date.parse("2026-05-05T00:00:02.000Z"),
    });

    expect(attrs).toMatchObject({
      AdvChangeId: ["chg1"],
      AdvChangeStatus: ["active"],
      AdvChangeTitle: ["Exact title"],
      AdvAffectedProjects: ["proj1", "proj2"],
      AdvAffectedPaths: ["plugin/src/temporal"],
      AdvCurrentGate: ["proposal"],
      AdvCurrentBucket: ["in_flight"],
    });
    expect(attrs.AdvLastSignalAt?.[0]).toEqual(
      new Date("2026-05-05T00:00:01.000Z"),
    );
    expect(attrs.AdvCreatedAt?.[0]).toEqual(
      new Date("2026-05-05T00:00:00.000Z"),
    );
  });

  it("registers missing attributes idempotently", async () => {
    const addSearchAttributes = vi.fn().mockResolvedValue({});
    const listSearchAttributes = vi.fn().mockResolvedValue({
      customAttributes: {
        AdvChangeId: { indexedValueType: 2 },
      },
    });

    const result = await ensureAdvSearchAttributes(
      { operatorService: { addSearchAttributes, listSearchAttributes } },
      "default",
    );

    expect(result.ok).toBe(true);
    expect(result.created.map((attr) => attr.name)).toEqual([
      "AdvChangeStatus",
      "AdvChangeTitle",
      "AdvAffectedProjects",
      "AdvAffectedPaths",
      "AdvCurrentGate",
      "AdvCurrentBucket",
      "AdvLastSignalAt",
      "AdvCreatedAt",
    ]);
    expect(addSearchAttributes).toHaveBeenCalledWith({
      namespace: "default",
      searchAttributes: {
        AdvChangeStatus: 2,
        AdvChangeTitle: 2,
        AdvAffectedProjects: 7,
        AdvAffectedPaths: 7,
        AdvCurrentGate: 2,
        AdvCurrentBucket: 2,
        AdvLastSignalAt: 6,
        AdvCreatedAt: 6,
      },
    });
  });
});
