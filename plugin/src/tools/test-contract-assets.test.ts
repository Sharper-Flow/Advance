import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../..");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function readSpec(path: string): {
  requirements: Array<{
    id: string;
    body: string;
    scenarios?: Array<{
      id: string;
      title: string;
      given?: string[];
      when?: string;
      then?: string[];
    }>;
  }>;
} {
  return JSON.parse(readRepoFile(path));
}

describe("adv_run_test contract assets", () => {
  test("advance-meta spec defines the typed adv_run_test result contract", () => {
    const spec = readSpec(".adv/specs/advance-meta/spec.json");
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-advRunTestLatency01",
    );

    expect(requirement).toBeDefined();
    expect(requirement!.body).toContain("passed");
    expect(requirement!.body).toContain("classification");
    expect(requirement!.body).toContain("durationMs");
    expect(requirement!.body).toContain("outputBytesSeen");
    expect(requirement!.body).toContain("outputBytesRetained");
    expect(requirement!.body).toContain("typed evidence-recording status");
    expect(requirement!.body).toContain("adv_run_test.v1");

    const scenario = requirement!.scenarios?.find(
      (entry) => entry.id === "rq-advRunTestLatency01.3",
    );
    expect(scenario).toBeDefined();
    expect(scenario!.then?.join("\n")).toContain("legacy fields remain");

    const recording = requirement!.scenarios?.find(
      (entry) => entry.id === "rq-advRunTestLatency01.4",
    );
    expect(recording).toBeDefined();
    expect(recording!.then?.join("\n")).toContain("recorded, degraded, or not_applicable");
    expect(recording!.then?.join("\n")).toContain("not swallowed silently");
  });

  test("tdd-contract spec defines phase as descriptive metadata", () => {
    const spec = readSpec(".adv/specs/tdd-contract/spec.json");
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-TDD008path",
    );

    expect(requirement).toBeDefined();
    expect(requirement!.body).toContain("phase");
    expect(requirement!.body).toContain("descriptive");
    expect(requirement!.body).toContain("not gate enforcement");

    const scenario = requirement!.scenarios?.find(
      (entry) => entry.id === "rq-TDD008path.4",
    );
    expect(scenario).toBeDefined();
    expect(scenario!.then?.join("\n")).toContain("red");
    expect(scenario!.then?.join("\n")).toContain("green");
    expect(scenario!.then?.join("\n")).toContain("verify");
  });

  test("agent-facing instructions describe the same phase semantics", () => {
    const instructions = readRepoFile("ADV_INSTRUCTIONS.md");
    const applyCommand = readRepoFile(".opencode/command/adv-apply.md");
    const tddDoc = readRepoFile("docs/specs/tdd-contract.md");

    for (const doc of [instructions, applyCommand, tddDoc]) {
      expect(doc).toContain("phase:'red'");
      expect(doc).toContain("phase:'green'");
      expect(doc).toContain("phase:'verify'");
      expect(doc).toContain("descriptive");
      expect(doc).toContain("not gate enforcement");
    }
  });

  test("repo-local oc-test wrapper is documented for throttled suites", () => {
    expect(existsSync(join(REPO_ROOT, "bin/oc-test"))).toBe(true);

    const agents = readRepoFile("AGENTS.md");
    expect(agents).toContain("bin/oc-test targeted --");
    expect(agents).toContain("bin/oc-test smoke");
    expect(agents).toContain("bin/oc-test full");
  });
});
