import { describe, expect, test } from "vitest";
import { EXPLICITLY_BOUND, PUBLIC_TOOL_ENTRIES } from "./tool-registry";

const EXPECTED_EXPLICITLY_BOUND = [
  "adv_spec",
  "adv_wip_state",
  "adv_change_archive",
  "adv_task_cancel",
  "adv_gate_complete",
  "adv_run_test",
  "adv_task_checkpoint",
  "adv_worktree_create",
  "adv_worktree_delete",
  "adv_worktree_cleanup",
  "adv_worktree_triage",
  "adv_tool_invoke",
] as const;

describe("tool-registry bindGroup exclusions", () => {
  test("EXPLICITLY_BOUND contains exactly the non-default bindings", () => {
    expect([...EXPLICITLY_BOUND].sort()).toEqual(
      [...EXPECTED_EXPLICITLY_BOUND].sort(),
    );
  });

  test("every explicitly bound tool exists in the public inventory", () => {
    const publicNames = new Set(PUBLIC_TOOL_ENTRIES.map((entry) => entry.name));

    for (const name of EXPLICITLY_BOUND) {
      expect(
        publicNames.has(name),
        `${name} is not in PUBLIC_TOOL_ENTRIES`,
      ).toBe(true);
    }
  });
});
