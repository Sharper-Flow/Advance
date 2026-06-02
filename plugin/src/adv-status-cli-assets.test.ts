import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const ADV_STATUS_COMMAND = join(
  REPO_ROOT,
  ".opencode/command/adv-status.md",
);

function readAdvStatusCommand(): string {
  return readFileSync(ADV_STATUS_COMMAND, "utf8");
}

describe("adv-status CLI bridge command contract", () => {
  test("default slash command runs the installed ADV status CLI without color", () => {
    const content = readAdvStatusCommand();

    expect(content).toContain("!`adv status --no-color`");
  });

  test("default slash command requires verbatim output and forbids analysis", () => {
    const content = readAdvStatusCommand();

    expect(content).toMatch(/return this command output verbatim/i);
    expect(content).toMatch(/do not analyze/i);
    expect(content).toMatch(/do not .*recommendations/i);
  });

  test("default slash command does not instruct ADV MCP fanout", () => {
    const content = readAdvStatusCommand();
    const forbidden = [
      "adv_status",
      "adv_change_list",
      "adv_change_show",
      "adv_gate_status",
      "adv_spec",
      "Cross-Change Health",
      "Roadmap Freshness",
      "Recommendations:",
    ];

    expect(
      forbidden.filter((token) => content.includes(token)),
      "adv-status.md must stay a CLI bridge, not a prompt-driven status workflow",
    ).toEqual([]);
  });
});
