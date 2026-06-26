import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-optimizer.md");

describe("adv-optimizer command assets", () => {
  test("command doc exists", () => {
    expect(existsSync(COMMAND_PATH)).toBe(true);
  });

  test("declares read-only command boundary with no ADV state mutation", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("## Command Boundary");
    expect(content).toMatch(/Gate:\*{0,2}\s*None/i);
    expect(content).toMatch(/ADV State Mutation:\s*none/i);
    expect(content).toMatch(/MUST NOT[^\n]*(code edits|edit code)/i);
    expect(content).toMatch(/MUST NOT[^\n]*ADV state mutation/i);
    expect(content).toMatch(/MUST NOT[^\n]*(agenda creation|task creation)/i);
    expect(content).toMatch(/MUST NOT[^\n]*automatic deletion/i);
  });

  test("documents first-level-only scanner delegation", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("No Nested Scanner Delegation");
    expect(content).toContain("WORKING DIRECTORY");
    expect(content).toContain("EXPECTED OUTPUT");
    expect(content).toContain(
      "Scanner workers must NOT spawn additional sub-agents, delegates, or worker agents",
    );
    expect(content).toContain(
      "Scanner workers must NOT invoke any `/adv-*` slash commands",
    );
  });

  test("requires source-backed findings and separates actionability", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("Source Evidence Requirement");
    expect(content).toMatch(/file:line|symbol|metric|source citation/i);
    expect(content).toContain("evidence-free findings are omitted");
    expect(content).toContain("low-confidence");
    expect(content).toContain("user-review");
    expect(content).toContain("actionable");
  });

  test("defines proposal-shaped optimizer output", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("OPTIMIZER PROPOSAL");
    expect(content).toContain("Current State");
    expect(content).toContain("Ranked Simplification Opportunities");
    expect(content).toContain("Recommended Long-Term Direction");
    expect(content).toContain("Risks");
    expect(content).toContain("Non-Goals");
    expect(content).toContain("Next ADV Command");
  });

  test("defines degraded execution behavior", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("## Degraded Execution");
    expect(content).toMatch(/partial report/i);
    expect(content).toMatch(/deterministic evidence only/i);
    expect(content).toMatch(/fail|timeout/i);
  });

  test("keeps optimizer distinct from slop-scan and mutation tools", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("does not replace `/adv-slop-scan`");
    expect(content).toContain("proposal synthesis");
    expect(content).not.toContain("adv_change_create");
    expect(content).not.toContain("adv_task_add");
    expect(content).not.toContain("adv_gate_complete");
  });
});
