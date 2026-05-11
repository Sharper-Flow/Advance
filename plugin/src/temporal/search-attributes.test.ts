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
    worktrees: {
      "change/example": {
        branch: "change/example",
        path: "/repo/example",
        baseRef: "main",
        headSha: "abc123",
        status: "created",
        createdAt: "2026-05-05T00:00:00.500Z",
      },
      "change/deleted": {
        branch: "change/deleted",
        path: "/repo/deleted",
        status: "deleted",
        deletedAt: "2026-05-05T00:00:00.750Z",
      },
    },
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
      AdvCurrentGate: "Keyword",
      AdvCurrentBucket: "Keyword",
      AdvLastSignalAt: "Datetime",
      AdvCreatedAt: "Datetime",
      AdvWorktreeBranches: "KeywordList",
      AdvWorktreePaths: "KeywordList",
      // rq-backlogCoord01: single-value Keyword (NOT KeywordList — no slot pressure on the 3-KeywordList dev-server limit).
      AdvBacklogIssueNumber: "Keyword",
    });
  });

  it("maps required attributes to canonical Temporal IndexedValueType codes", () => {
    expect(requiredAdvSearchAttributes()).toEqual([
      { name: "AdvChangeId", type: "Keyword", typeCode: 2 },
      { name: "AdvChangeStatus", type: "Keyword", typeCode: 2 },
      { name: "AdvChangeTitle", type: "Keyword", typeCode: 2 },
      { name: "AdvAffectedProjects", type: "KeywordList", typeCode: 7 },
      { name: "AdvCurrentGate", type: "Keyword", typeCode: 2 },
      { name: "AdvCurrentBucket", type: "Keyword", typeCode: 2 },
      { name: "AdvLastSignalAt", type: "Datetime", typeCode: 6 },
      { name: "AdvCreatedAt", type: "Datetime", typeCode: 6 },
      { name: "AdvWorktreeBranches", type: "KeywordList", typeCode: 7 },
      { name: "AdvWorktreePaths", type: "KeywordList", typeCode: 7 },
      { name: "AdvBacklogIssueNumber", type: "Keyword", typeCode: 2 },
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
      AdvCurrentGate: ["proposal"],
      AdvCurrentBucket: ["in_flight"],
      AdvWorktreeBranches: ["change/example"],
      AdvWorktreePaths: ["/repo/example"],
    });
    expect(attrs.AdvAffectedPaths).toBeUndefined();
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
      "AdvCurrentGate",
      "AdvCurrentBucket",
      "AdvLastSignalAt",
      "AdvCreatedAt",
      "AdvWorktreeBranches",
      "AdvWorktreePaths",
      "AdvBacklogIssueNumber",
    ]);
    expect(addSearchAttributes).toHaveBeenCalledWith({
      namespace: "default",
      searchAttributes: {
        AdvChangeStatus: 2,
        AdvChangeTitle: 2,
        AdvAffectedProjects: 7,
        AdvCurrentGate: 2,
        AdvCurrentBucket: 2,
        AdvLastSignalAt: 6,
        AdvCreatedAt: 6,
        AdvWorktreeBranches: 7,
        AdvWorktreePaths: 7,
        AdvBacklogIssueNumber: 2,
      },
    });
  });

  describe("rq-backlogCoord01: AdvBacklogIssueNumber population from state.origin", () => {
    it("populates AdvBacklogIssueNumber when state.origin.issue_number is set", () => {
      const state = makeState();
      state.origin = { kind: "roadmap", issue_number: 42 };

      const attrs = buildChangeSearchAttributes(state);

      expect(attrs.AdvBacklogIssueNumber).toEqual(["42"]);
    });

    it("omits AdvBacklogIssueNumber when state.origin is undefined", () => {
      const state = makeState();
      // state.origin remains undefined

      const attrs = buildChangeSearchAttributes(state);

      expect(attrs.AdvBacklogIssueNumber).toBeUndefined();
    });

    it("omits AdvBacklogIssueNumber when state.origin.issue_number is undefined", () => {
      const state = makeState();
      // origin.kind set but issue_number not — legitimate for kind='discovery'/'adhoc'
      state.origin = { kind: "discovery" };

      const attrs = buildChangeSearchAttributes(state);

      expect(attrs.AdvBacklogIssueNumber).toBeUndefined();
    });

    it("stringifies the issue number as a Keyword value (Temporal Keyword requires string)", () => {
      const state = makeState();
      state.origin = { kind: "triage", issue_number: 7 };

      const attrs = buildChangeSearchAttributes(state);

      // Keyword search attributes carry string values, not numbers.
      expect(attrs.AdvBacklogIssueNumber).toEqual(["7"]);
      expect(typeof attrs.AdvBacklogIssueNumber?.[0]).toBe("string");
    });
  });
});
