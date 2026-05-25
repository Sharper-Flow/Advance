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

  test("command requires explicit spec-law impact assessment table", () => {
    expect(command).toContain("Spec-Law Impact Assessment");
    expect(command).toContain("| Outcome | Meaning | Required action |");
    expect(command).toContain(
      "| **Add** | New durable behavior, capability, or requirement is introduced | Persist draft spec-delta obligations |",
    );
    expect(command).toContain(
      "| **Modify** | Existing spec law needs behavior, acceptance, or constraint changes | Persist draft spec-delta obligations |",
    );
    expect(command).toContain(
      "| **Remove** | Existing durable behavior or requirement is removed/subtracted | Persist draft spec-delta obligations |",
    );
    expect(command).toContain(
      "| **No spec law update required** | Implementation-only change preserves existing law | Persist explicit no-delta rationale |",
    );
    expect(command).toContain(
      "| **Uncertain** | Impact cannot be resolved quickly | Stop fast-track; continue the same change through `/adv-proposal` or deeper discovery |",
    );
  });

  test("command requires concrete delta obligations or no-delta rationale before planning", () => {
    expect(command).toContain("draft spec-delta obligations");
    expect(command).toContain("concrete `rq-*` requirement IDs");
    expect(command).toContain("Given/When/Then scenario");
    expect(command).toContain("MUST NOT complete planning");
  });

  test("command routes uncertain scope without duplicate changes or handoff", () => {
    expect(command).toContain(
      "Carry the same change forward into `/adv-proposal` or keep investigating until impact is clear",
    );
    expect(command).toContain("Do not create a duplicate change");
    expect(command).toContain(
      "- Spec-law impact: {Add|Modify|Remove|No spec law update required}",
    );
    expect(command).not.toContain(
      "- Spec-law impact: {Add|Modify|Remove|No spec law update required|Uncertain}",
    );
  });

  test("agent routes small durable changes to tracked fast path", () => {
    expect(agent).toContain("Small tracked change");
    expect(agent).toContain("well-understood durable change");
    expect(agent).toContain("/adv-task workflow");
    expect(agent).toContain("change/task state exists before implementation");
  });

  test("agent owns typed worker packet identity defects internally", () => {
    expect(agent).toContain("Typed worker packet contract");
    expect(agent).toContain("WORKING DIRECTORY, CHANGE, TASK, ATTEMPT");
    expect(agent).toContain("adv-reviewer");
    expect(agent).toContain("PHASE");
    expect(agent).toContain("orchestrator-owned");
    expect(agent).toContain("never ask the user");
    expect(agent).toContain("retry with a corrected packet");
    expect(agent).toContain("continue inline");
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
      "rq-taskSpecLaw01.4",
    ]);
    expect(
      requirement?.scenarios?.find(
        (scenario) => scenario.id === "rq-taskSpecLaw01.4",
      )?.then,
    ).toEqual([
      "/adv-task does not complete planning for the uncertain scope",
      "/adv-task creates no implementation tasks for the uncertain scope",
      "The change routes to /adv-proposal or deeper discovery before implementation planning resumes",
    ]);
  });
});
