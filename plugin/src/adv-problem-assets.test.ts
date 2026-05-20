import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-problem.md");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json");

describe("adv-problem spec-law impact contract", () => {
  const command = readFileSync(COMMAND_PATH, "utf8");
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
    requirements: Array<{
      id: string;
      body: string;
      scenarios?: Array<{ id: string; then?: string[] }>;
    }>;
  };

  test("command requires spec-law impact assessment in triage output", () => {
    expect(command).toContain("Spec-law impact");
    expect(command).toContain("durable product/system behavior");
    expect(command).toContain("Spec-law change required");
    expect(command).toContain("No spec law update required");
    expect(command).toContain(
      "direct fix remains allowed only when all direct-fix guardrails pass",
    );
  });

  test("command defaults uncertain spec-law impact to proposal path", () => {
    expect(command).toContain(
      "When spec-law impact is uncertain, prefer proposal-sized routing",
    );
    expect(command).toContain("/adv-proposal");
  });

  test("command preserves read-only problem triage boundary", () => {
    expect(command).toContain(
      "MUST NOT create changes, tasks, gates, or spec deltas directly",
    );
  });

  test("advance-workflow contains problem spec-law requirement", () => {
    const requirement = spec.requirements.find(
      (item) => item.id === "rq-problemSpecLaw01",
    );

    expect(requirement).toBeDefined();
    expect(requirement?.body).toContain("spec-law impact assessment");
    expect(requirement?.body).toContain("durable product/system behavior");
    expect(requirement?.body).toContain("requires spec-law change");
    expect(requirement?.body).toContain(
      "direct fix remains allowed only when all direct-fix guardrails pass",
    );
    expect(requirement?.body).toContain(
      "uncertain spec-law impact MUST NOT be classified as a trivial direct-fix candidate",
    );
    expect(requirement?.body).toContain(
      "MUST NOT create changes, tasks, gates, or spec deltas directly",
    );
    expect(requirement?.scenarios?.map((scenario) => scenario.id)).toEqual([
      "rq-problemSpecLaw01.1",
      "rq-problemSpecLaw01.2",
      "rq-problemSpecLaw01.3",
    ]);
  });
});
