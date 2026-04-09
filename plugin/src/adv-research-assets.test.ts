import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-research.md");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-researcher.md");
const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

describe("adv-research anti-recursion assets", () => {
  test("documents retirement redirect in adv-research command", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("# ADV Research — Retired Command");
    expect(content).toContain("/adv-discover <change-id>");
    expect(content).toContain("/adv-design <change-id>");
    expect(content).toContain("/adv-research RETIRED");
  });

  test("documents inline-only execution in adv-researcher agent", () => {
    const content = readFileSync(AGENT_PATH, "utf8");

    expect(content).toContain(
      "Perform all research inline with your own tools; NEVER spawn or request additional sub-agents/delegates",
    );
    expect(content).toContain(
      "NEVER invoke `/adv-*` slash commands from inside this sub-agent; use ADV tools directly when you need ADV state",
    );
  });

  test("documents slash command boundary in shared ADV instructions", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("### Slash Command Boundary");
    expect(content).toContain(
      "Agents must NOT invoke `/adv-*` from inside another agent workflow or sub-agent prompt",
    );
    expect(content).toContain(
      "OpenCode may re-dispatch slash commands through command frontmatter `agent:` routing",
    );
  });
});
