import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const ADV_STATUS_COMMAND = join(REPO_ROOT, ".opencode/command/adv-status.md");
const ADV_AGENT = join(REPO_ROOT, ".opencode/agents/adv.md");
const ADVANCE_META_SPEC = join(REPO_ROOT, ".adv/specs/advance-meta/spec.json");

function readAdvStatusCommand(): string {
  return readFileSync(ADV_STATUS_COMMAND, "utf8");
}

function readAdvAgent(): string {
  return readFileSync(ADV_AGENT, "utf8");
}

function readAdvanceMetaSpec(): {
  requirements?: Array<{
    id?: string;
    priority?: string;
    scenarios?: Array<{ id?: string }>;
  }>;
} {
  return JSON.parse(readFileSync(ADVANCE_META_SPEC, "utf8"));
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

  test("ADV agent routes project status to CLI bridge and health to explicit diagnostics", () => {
    const content = readAdvAgent();

    expect(content).toContain("`/adv-status` for fast project table");
    expect(content).toContain(
      'use `adv_status view:"health"` only for explicit health diagnostics',
    );
  });

  test("advance-meta spec pins the status CLI bridge law", () => {
    const spec = readAdvanceMetaSpec();
    const requirement = spec.requirements?.find(
      (item) => item.id === "rq-statusCliBridge01",
    );

    expect(requirement).toMatchObject({
      id: "rq-statusCliBridge01",
      priority: "must",
    });
    expect(requirement?.scenarios?.map((scenario) => scenario.id)).toEqual([
      "rq-statusCliBridge01.1",
      "rq-statusCliBridge01.2",
      "rq-statusCliBridge01.3",
    ]);
  });
});
