import { describe, expect, test } from "vitest";
import { TIER_4_MCP_TOOLS } from "./tool-tier4-catalog.js";

describe("TIER_4_MCP_TOOLS", () => {
  const EXPECTED = [
    "status",
    "spec",
    "wisdom_list",
    "reflection_list",
    "project_context",
    "backlog_list",
    "backlog_show",
    "epic_list",
    "epic_show",
    "wip_state",
    "worktree_triage",
    "tool_catalog",
    "tool_describe",
  ];

  test("contains exactly the 13 expected unprefixed names", () => {
    expect(TIER_4_MCP_TOOLS).toHaveLength(13);
    expect(TIER_4_MCP_TOOLS).toEqual(EXPECTED);
  });

  test("no entry is prefixed with adv_", () => {
    for (const name of TIER_4_MCP_TOOLS) {
      expect(name.startsWith("adv_")).toBe(false);
    }
  });
});
