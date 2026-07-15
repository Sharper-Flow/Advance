import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-arch-scan.md");
const SKILL_PATH = join(REPO_ROOT, "skills/adv-arch-detection/SKILL.md");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/arch-scan/spec.json");
const DOC_PATH = join(REPO_ROOT, "docs/specs/arch-scan.md");
const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

describe("adv-arch-scan structural correctness assets", () => {
  test("spec defines P33 structural correctness boundary detection", () => {
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      name: string;
      requirements: Array<{ id: string; title: string }>;
    };

    expect(spec.name).toBe("arch-scan");
    expect(spec.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rq-archp33",
          title: "Structural Correctness Boundary Detection",
        }),
      ]),
    );
  });

  test("command scans structural correctness boundaries (P33)", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("Structural Correctness Boundary Checks (P33)");
    expect(content).toContain("parser/schema/allowlist recognition");
    expect(content).toContain("Gate/spec/compliance boundaries");
    expect(content).toContain(
      "heuristic-owned persistence/gates/spec/security",
    );
  });

  test("skill carries structural correctness scan methodology", () => {
    const content = readFileSync(SKILL_PATH, "utf8");

    expect(content).toContain("<!-- rq-archp33 -->");
    expect(content).toContain("structural ownership");
    expect(content).toContain(
      "workflow state, gate completion, or spec compliance",
    );
    expect(content).toContain("Structural-correctness severity");
  });

  test("spec defines stack packs before generic fallback", () => {
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string; title: string }>;
    };

    expect(spec.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rq-archstack01",
          title: "Stack Packs Before Generic Fallback",
        }),
      ]),
    );
  });

  test("docs mirror architecture spec requirement ids", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      version: string;
      requirements: Array<{ id: string }>;
    };

    expect(doc).toContain(`**Version:** ${spec.version}`);
    for (const requirement of spec.requirements) {
      expect(doc).toContain(`**ID:** \`${requirement.id}\``);
    }
  });

  test("command and skill document initial ADV stack pack", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SKILL_PATH, "utf8");
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string }>;
    };

    expect(spec.requirements.map((rq) => rq.id)).toContain("rq-archstack02");
    expect(command).toContain("Stack Packs");
    expect(command).toContain("ADV stack pack");
    expect(command).toContain("TypeScript/Bun/OpenCode plugin/Temporal");
    expect(command).toContain("workflow bundle boundary");
    expect(command).toContain("command/manifest symmetry");
    expect(command).toContain("spec/asset anchors");
    expect(skill).toContain("Stack Packs");
    expect(skill).toContain("ADV stack pack");
    expect(skill).toContain("workflow bundle boundary");
  });

  test("command and skill document architecture scanner coverage reporting", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SKILL_PATH, "utf8");
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string }>;
    };

    expect(spec.requirements.map((rq) => rq.id)).toContain("rq-archcov01");
    expect(command).toContain("Architecture Scanner Coverage Report");
    expect(command).toContain("coverage.detectedStacks");
    expect(command).toContain("coverage.appliedPacks");
    expect(command).toContain("coverage.missingPacks");
    expect(command).toContain("coverage.skippedDetectors");
    expect(command).toContain("coverage.degradedDetectors");
    expect(skill).toContain("coverage.detectedStacks");
    expect(skill).toContain("coverage.missingPacks");
  });

  test("command and skill document phase 3 trigger semantics", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SKILL_PATH, "utf8");

    expect(command).toContain("--phase 3");
    expect(command).toContain(
      "only when Phase 1 and Phase 2 produce no findings",
    );
    expect(command).toContain("single-phase heuristic scan");
    expect(skill).toContain("when the user requests `--phase 3`");
    expect(skill).toContain("produce no findings");
  });

  test("command and skill document evidence-backed rewrite assessment", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SKILL_PATH, "utf8");

    for (const content of [command, skill]) {
      expect(content).toContain("Rewrite Assessment");
      expect(content).toContain(
        "If the project/app were completely rewritten, what architecture would definitely change?",
      );
      expect(content).toContain(
        "If the project/app were completely rewritten, what would definitely not be carried over?",
      );
      expect(content).toContain("No definite conclusion from scan evidence");
      expect(content).toContain("indeterminate");
      expect(content).toContain("never a no-change conclusion");
      expect(content).toContain("never authorize deletion");
      expect(content).toContain("rewriteAssessment");
    }
    expect(command).toContain('"rewriteAssessment"');
    expect(command).toContain('"complete" | "indeterminate"');
    expect(command).toContain('"wouldChange": {');
    expect(command).toContain('"wouldNotCarryOver": {');
    expect(command).toContain('"confidence": "confirmed" | "tentative"');
    expect(command).toContain("wouldChange");
    expect(command).toContain("wouldNotCarryOver");
    expect(command).toContain("tentative");
    expect(command).toContain("command-level `rewriteAssessment`");
  });

  test("ADV instructions classify arch-scan as inline with dedicated skill", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("| arch-scan");
    expect(content).toContain("/adv-arch-scan");
    expect(content).toContain("adv-arch-scan` → `adv-arch-detection");
  });
});
