import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-idea.md");

describe("adv-idea entry-point contract", () => {
  const command = readFileSync(COMMAND_PATH, "utf8");

  test("command declares all four exit paths", () => {
    expect(command).toContain("one-change");
    expect(command).toContain("`/adv-proposal`");
    expect(command).toContain("initiative");
    expect(command).toContain("`/adv-epic`");
    expect(command).toContain("iterate");
    expect(command).toContain("stop");
  });

  test("command dispatches a subagent via the task tool", () => {
    expect(command).toMatch(/subagent/i);
    expect(command).toMatch(/`task`[\s\S]*?subagent_type|dispatch a subagent|Task-tool subagent/i);
  });

  test("command invokes adv-researcher with validation status flow", () => {
    expect(command).toContain("adv-researcher");
    expect(command).toContain("validation.status");
  });

  test("command contains initiative-sizing consensus test", () => {
    expect(command).toContain("≥3 sub-problems");
    expect(command).toContain("≥3 distinct regions");
    expect(command).toContain(">1 repo touched");
  });

  test("command routes initiative-sized work to /adv-epic", () => {
    expect(command).toMatch(
      /initiative[\s\S]*?`\/adv-epic`|route[\s\S]*?`\/adv-epic`[\s\S]*?initiative/i,
    );
  });

  test("command forbids direct mutation tools", () => {
    expect(command).toContain("adv_change_create");
    expect(command).toContain("adv_gate_complete");
    expect(command).toContain("adv_task_add");
    expect(command).toContain("adv_epic_create");
    expect(command).not.toContain("adv_change_create(");
    expect(command).not.toContain("adv_gate_complete(");
    expect(command).not.toContain("adv_task_add(");
    expect(command).not.toContain("adv_epic_create(");
  });

  test("command references canonical sub-agent resilience source", () => {
    expect(command).toContain("adv-research.md:111-135");
  });
});
