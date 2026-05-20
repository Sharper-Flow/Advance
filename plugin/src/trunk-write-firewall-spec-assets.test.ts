import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("trunk write firewall spec assets", () => {
  test("rq-twf01 requires worktree_guard_enforce opt-in semantics", () => {
    const spec = JSON.parse(
      readRepoFile(".adv/specs/advance-meta/spec.json"),
    ) as {
      requirements: Array<{
        id: string;
        body: string;
        scenarios?: Array<{ id: string; title: string; given?: string[]; then?: string[] }>;
      }>;
    };

    const requirement = spec.requirements.find((req) => req.id === "rq-twf01");

    expect(requirement?.body).toContain("feature_flags.worktree_guard_enforce");
    expect(requirement?.body).toContain("omitted or false");
    expect(requirement?.body).toContain("true");

    const scenarios = requirement?.scenarios ?? [];
    expect(scenarios.some((scenario) => scenario.id === "rq-twf01.1")).toBe(true);
    expect(
      scenarios.some(
        (scenario) =>
          scenario.title.toLowerCase().includes("flag-off") &&
          [...(scenario.given ?? []), ...(scenario.then ?? [])].some((line) =>
            line.includes("omitted or false"),
          ),
      ),
    ).toBe(true);
    expect(
      scenarios.some(
        (scenario) =>
          scenario.title.toLowerCase().includes("strict") &&
          [...(scenario.given ?? []), ...(scenario.then ?? [])].some((line) =>
            line.includes("worktree_guard_enforce is true"),
          ),
      ),
    ).toBe(true);
  });

  test("advance project config opts into strict worktree enforcement", () => {
    const projectConfig = JSON.parse(readRepoFile("project.json")) as {
      features?: { worktree_guard_enforce?: unknown };
    };

    expect(projectConfig.features?.worktree_guard_enforce).toBe(true);
  });
});
