import { describe, expect, test } from "vitest";
import {
  classifyCoalescePairs,
  parseCoalesceApproval,
} from "./triage/coalesce";

const changes = [
  {
    id: "fixAuthRace",
    title: "Fix auth refresh race",
    proposalBody: "Fix token refresh collision. Closes #42.",
    problemStatement: "Concurrent refresh requests lose the valid token.",
    linkedIssueNumbers: [] as number[],
    epicMemberIssueNumbers: [] as number[],
  },
  {
    id: "addBillingExport",
    title: "Add billing data export",
    proposalBody: "Export billing rows as CSV.",
    problemStatement: "Customers need billing data export.",
    linkedIssueNumbers: [] as number[],
    epicMemberIssueNumbers: [] as number[],
  },
];

const issues = [
  {
    number: 42,
    title: "Fix auth refresh race",
    body: "Refresh requests race.",
  },
  {
    number: 77,
    title: "Add billing data export",
    body: "Export billing rows as CSV.",
  },
];

describe("classifyCoalescePairs", () => {
  test("prefers structural stable-reference evidence", () => {
    const pairs = classifyCoalescePairs({
      activeChanges: changes,
      openIssues: issues,
    });
    expect(pairs).toContainEqual(
      expect.objectContaining({
        changeId: "fixAuthRace",
        issueNumber: 42,
        tier: "structural",
      }),
    );
  });

  test("recognizes exact distinctive body excerpts structurally", () => {
    const pairs = classifyCoalescePairs({
      activeChanges: changes,
      openIssues: issues,
    });
    expect(pairs).toContainEqual(
      expect.objectContaining({
        changeId: "addBillingExport",
        issueNumber: 77,
        tier: "structural",
      }),
    );
  });

  test("uses title similarity only as heuristic evidence", () => {
    const pairs = classifyCoalescePairs({
      activeChanges: [
        { ...changes[1], proposalBody: "", problemStatement: "" },
      ],
      openIssues: [{ number: 88, title: "Billing data export", body: "" }],
    });
    expect(pairs).toEqual([
      expect.objectContaining({ tier: "heuristic", issueNumber: 88 }),
    ]);
  });

  test("excludes origin/url and typed-Epic existing links", () => {
    const pairs = classifyCoalescePairs({
      activeChanges: [
        { ...changes[0], linkedIssueNumbers: [42] },
        { ...changes[1], epicMemberIssueNumbers: [77] },
      ],
      openIssues: issues,
    });
    expect(pairs).toEqual([]);
  });
});

describe("parseCoalesceApproval", () => {
  test.each([
    ["approve all", { kind: "approve_all" }],
    ["reject all", { kind: "reject_all" }],
    ["stop", { kind: "stop" }],
    ["abort", { kind: "stop" }],
  ])("parses %s", (input, expected) => {
    expect(parseCoalesceApproval(input, 3)).toEqual(expected);
  });

  test("parses bounded selective link and skip lists", () => {
    expect(parseCoalesceApproval("link 1,3", 3)).toEqual({
      kind: "link",
      indices: [1, 3],
    });
    expect(parseCoalesceApproval("skip 2", 3)).toEqual({
      kind: "skip",
      indices: [2],
    });
  });

  test("rejects hidden/out-of-range and free-form authority", () => {
    expect(parseCoalesceApproval("link 4", 3).kind).toBe("unparsed");
    expect(parseCoalesceApproval("looks good", 3).kind).toBe("unparsed");
  });
});
