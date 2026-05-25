import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-task.md");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv.md");
const INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json");

describe("adv-task fast-track spec-law tracking contract", () => {
  const command = readFileSync(COMMAND_PATH, "utf8");
  const agent = readFileSync(AGENT_PATH, "utf8");
  const instructions = readFileSync(INSTRUCTIONS_PATH, "utf8");
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
    requirements: Array<{
      id: string;
      body: string;
      scenarios?: Array<{ id: string; then?: string[] }>;
    }>;
  };

  test("command requires explicit spec-law impact assessment", () => {
    expect(command).toContain("Spec-Law Impact Assessment");
    expect(command).toContain("Add");
    expect(command).toContain("Modify");
    expect(command).toContain("Remove");
    expect(command).toContain("No spec law update required");
    expect(command).toContain("Uncertain");
  });

  test("command requires concrete delta obligations or no-delta rationale before planning", () => {
    expect(command).toContain("draft spec-delta obligations");
    expect(command).toContain("concrete `rq-*` requirement IDs");
    expect(command).toContain("Given/When/Then scenario");
    expect(command).toContain("MUST NOT complete planning");
  });

  test("agent routes small durable changes to tracked fast path", () => {
    expect(agent).toContain("Small tracked change");
    expect(agent).toContain("well-understood durable change");
    expect(agent).toContain("/adv-task workflow");
    expect(agent).toContain("change/task state exists before implementation");
  });

  test("instructions describe adv-task as tracked fast path", () => {
    expect(instructions).toContain("tracked fast path");
    expect(instructions).toContain("spec-law impact assessment");
    expect(instructions).toContain("crash recovery");
  });

  test("advance-workflow contains adv-task spec-law requirement", () => {
    const requirement = spec.requirements.find(
      (item) => item.id === "rq-taskSpecLaw01",
    );

    expect(requirement).toBeDefined();
    expect(requirement?.body).toContain(
      "/adv-task MUST include a spec-law impact assessment",
    );
    expect(requirement?.body).toContain("add, modify, remove");
    expect(requirement?.body).toContain("No spec law update required");
    expect(requirement?.body).toContain("Uncertain");
    expect(requirement?.body).toContain(
      "durable change/task state exists before implementation",
    );
    expect(requirement?.scenarios?.map((scenario) => scenario.id)).toEqual([
      "rq-taskSpecLaw01.1",
      "rq-taskSpecLaw01.2",
      "rq-taskSpecLaw01.3",
    ]);
  });
});
