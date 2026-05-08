import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-arch-scan.md");
const SKILL_PATH = join(REPO_ROOT, "skills/adv-arch-detection/SKILL.md");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/arch-scan/spec.json");

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

  test("command cites rq-archp33 and scans structural correctness boundaries", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("<!-- rq-archp33 -->");
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
});
