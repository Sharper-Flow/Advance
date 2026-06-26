import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

interface SpecRequirement {
  id: string;
  title: string;
  body: string;
  scenarios?: Array<{
    id: string;
    title: string;
    given?: string[];
    when?: string;
    then?: string[];
  }>;
}

describe("addAcWarrantGuard — spec law (AC5)", () => {
  const spec = JSON.parse(
    readRepoFile(".adv/specs/advance-workflow/spec.json"),
  ) as { requirements: SpecRequirement[] };
  const req = spec.requirements.find((r) => r.id === "rq-acWarrant01");

  test("rq-acWarrant01 exists in advance-workflow spec", () => {
    expect(req).toBeDefined();
  });

  test("rq-acWarrant01 body covers mint-time warrant validation + reproduction-finding classification", () => {
    expect(req?.body).toMatch(/warrant/i);
    expect(req?.body).toMatch(/contract mint|mint/i);
    expect(req?.body).toMatch(/reproduction/i);
    expect(req?.body).toMatch(
      /broken_capability|unwarranted_operation|unverified/,
    );
  });

  test("rq-acWarrant01 has scenarios for the unresolved-warrant fail and the classification rule", () => {
    const scenarios = req?.scenarios ?? [];
    expect(scenarios.length).toBeGreaterThanOrEqual(2);
    const blob = JSON.stringify(scenarios);
    expect(blob).toMatch(/CONTRACT_UNRESOLVED_WARRANT/);
    expect(blob).toMatch(/unwarranted_operation/);
  });
});

describe("addAcWarrantGuard — discovery command contract (AC4)", () => {
  const discover = readRepoFile(".opencode/command/adv-discover.md");

  test("adv-discover requires reproduction-finding classification", () => {
    expect(discover).toMatch(/Reproduction Finding Classification/i);
    expect(discover).toContain("broken_capability");
    expect(discover).toContain("unwarranted_operation");
    expect(discover).toContain("unverified");
  });

  test("adv-discover forbids unwarranted/unverified findings from seeding must-work criteria", () => {
    expect(discover).toMatch(
      /MUST NOT seed[\s\S]*must-work|must not[\s\S]*capability must work/i,
    );
  });

  test("adv-discover requires a warrant declaration for capability-presuming criteria", () => {
    expect(discover).toMatch(/\[warrant:/);
    expect(discover).toMatch(/capability-presuming/i);
  });
});
