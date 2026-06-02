import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const CHECKLIST_DIR = join(REPO_ROOT, "docs/checklists");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function readCommand(name: string): string {
  return readFileSync(join(COMMAND_DIR, name), "utf8");
}

function readChecklist(name: string): string {
  return readFileSync(join(CHECKLIST_DIR, name), "utf8");
}

function expectNoFixedFindingQuota(content: string): void {
  expect(content).not.toMatch(/minimum findings threshold/i);
  expect(content).not.toMatch(/at least\s+\*\*?3\s+non-nit findings/i);
  expect(content).not.toMatch(/fewer than\s+3\s+non-nit/i);
  expect(content).not.toMatch(/if\s*<\s*3\s+non-nit/i);
}

describe("workflow noise reduction policy", () => {
  test("advance-workflow law replaces fixed review quota with evidence-backed clean verdicts", () => {
    const spec = readRepoFile(".adv/specs/advance-workflow/spec.json");

    expect(spec).toContain('"id": "rq-R3v13wR1"');
    expectNoFixedFindingQuota(spec);
    expect(spec).toMatch(/evidence-backed clean verdict/i);
    expect(spec).toMatch(/checked dimensions/i);
    expect(spec).toMatch(/red-flag invalidators/i);
    expect(spec).toMatch(/validated in-scope findings/i);
    expect(spec).toMatch(/blocker\/issue/i);
  });

  test("review and harden commands do not require manufactured findings", () => {
    const review = readCommand("adv-review.md");
    const harden = readCommand("adv-harden.md");

    for (const content of [review, harden]) {
      expectNoFixedFindingQuota(content);
      expect(content).toMatch(/evidence-backed clean verdict/i);
      expect(content).toMatch(/red-flag invalidators/i);
      expect(content).toMatch(/mandatory remediation/i);
    }
  });

  test("review and harden checklists encode clean-evidence path instead of quota", () => {
    const reviewChecklist = readChecklist("review-checklist.md");
    const hardenChecklist = readChecklist("harden-checklist.md");

    for (const content of [reviewChecklist, hardenChecklist]) {
      expectNoFixedFindingQuota(content);
      expect(content).toMatch(/Clean verdict evidence/i);
      expect(content).toMatch(/checked dimensions/i);
      expect(content).toMatch(/red flags/i);
    }
  });

  test("review and harden responsibilities are split without duplicate scanner fan-out", () => {
    const review = readCommand("adv-review.md");
    const harden = readCommand("adv-harden.md");

    expect(review).toMatch(
      /Review owns.*contract.*correctness.*security.*tests.*scope/is,
    );
    expect(harden).toMatch(
      /Harden owns.*release.*deploy.*production.*docs.*cleanup/is,
    );
    expect(review).toMatch(/critical blocker backstop/i);
    expect(harden).toMatch(/critical blocker backstop/i);

    expect(review).not.toMatch(/Spawn \*\*5 sub-agents/i);
    expect(harden).not.toMatch(/Spawn \*\*6 sub-agents/i);
    expect(harden).not.toMatch(/Every hardening pass must run all 6 scanners/i);
    expect(`${review}\n${harden}`).toMatch(/risk-triggered scanner/i);
  });
});

describe("discovery opportunity scout and ambiguity noise policy", () => {
  test("discover spec makes opportunity scout trigger-based", () => {
    const spec = readRepoFile(".adv/specs/adv-discover/spec.json");

    expect(spec).toContain("rq-discOpportunityScout01");
    expect(spec).toMatch(/trigger-based Discovery Opportunity Scout/i);
    expect(spec).toMatch(/strategic|architecture|product|external-option/i);
    expect(spec).toMatch(/narrow low-opportunity changes/i);
    expect(spec).toMatch(/Scout: skipped/i);
    expect(spec).toMatch(/Scout: inconclusive/i);
    expect(spec).not.toMatch(/for every full proposal workflow/i);
  });

  test("discover command records trigger, skip, and inconclusive scout paths", () => {
    const discover = readCommand("adv-discover.md");

    expect(discover).toMatch(/Trigger Conditions/i);
    expect(discover).toMatch(/strategic|architecture|product|external-option/i);
    expect(discover).toMatch(/narrow low-opportunity changes/i);
    expect(discover).toMatch(/Scout: skipped/i);
    expect(discover).toMatch(/Scout: inconclusive/i);
    expect(discover).not.toMatch(
      /Run a mandatory bounded opportunity-scout pass/i,
    );
  });

  test("discover checklist distinguishes blocking ambiguity from concise advisory findings", () => {
    const command = readCommand("adv-discover.md");
    const checklist = readChecklist("discover-checklist.md");

    for (const content of [command, checklist]) {
      expect(content).toMatch(/Blocking ambiguity/i);
      expect(content).toMatch(/Advisory ambiguity/i);
      expect(content).toMatch(/evidence quotes/i);
      expect(content).toMatch(/concise advisory/i);
    }
  });
});

describe("investment report removal", () => {
  const activeSurfaces = [
    "plugin/src/tool-registry.ts",
    "plugin/src/utils/tool-title.ts",
    "plugin/src/adv-reviewer-asset.test.ts",
    "plugin/src/tools/investment.ts",
    "plugin/src/tools/investment.test.ts",
    ".opencode/agents/adv.md",
    ".opencode/agents/adv-atc.md",
    ".opencode/agents/adv-reviewer.md",
    ".opencode/agents/adv-designer.md",
    ".opencode/agents/adv-engineer.md",
    ".opencode/command/adv-discover.md",
    ".opencode/command/adv-review.md",
    ".opencode/command/adv-archive.md",
    ".opencode/command/adv-reflect.md",
  ];

  test("active command, agent, registry, and tool surfaces do not expose adv_investment_report", () => {
    for (const path of activeSurfaces) {
      const fullPath = join(REPO_ROOT, path);
      if (!existsSync(fullPath)) continue;
      expect(readFileSync(fullPath, "utf8"), path).not.toContain(
        "adv_investment_report",
      );
    }
  });

  test("reflection owns local metric extraction without importing investment tool surface", () => {
    const reflection = readRepoFile("plugin/src/tools/reflection.ts");

    expect(reflection).not.toMatch(/from\s+["']\.\/investment["']/);
    expect(reflection).toContain("computePerGateDurations");
    expect(reflection).toContain("computePerGateWorkDurations");
  });
});
