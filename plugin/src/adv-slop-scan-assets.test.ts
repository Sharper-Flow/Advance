import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-slop-scan.md");
const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");
const SPEC_PATH = join(REPO_ROOT, "docs/specs/slop-scan.md");

describe("adv-slop-scan anti-recursion assets", () => {
  test("documents single-level-only scanner delegation in command contract", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("No Nested Scanner Delegation (CRITICAL)");
    expect(content).toContain(
      "Scanner workers must NOT spawn additional sub-agents, delegates, or worker agents",
    );
    expect(content).toContain(
      "Scanner workers must NOT invoke any `/adv-*` slash commands; if ADV context is needed they must use ADV tools directly",
    );
  });

  test("documents single-level scanner orchestration in shared ADV instructions", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("slop-scan | Sequential categories | explore × 9 (single-level only)");
    expect(content).toContain(
      "For `/adv-slop-scan`, all `explore` scanner workers must do the scan inline and must not delegate to additional sub-agents or invoke `/adv-*` slash commands",
    );
  });

  test("spec documents that slop-scan scanner workers stay single-level", () => {
    const content = readFileSync(SPEC_PATH, "utf8");

    expect(content).toContain("Scanner Delegation Stays Single-Level");
    expect(content).toContain("No scanner worker spawns nested sub-agents or delegates");
    expect(content).toContain("The worker does not invoke `/adv-*` slash commands");
  });
});
