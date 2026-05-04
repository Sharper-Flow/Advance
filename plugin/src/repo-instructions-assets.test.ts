import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENTS_PATH = join(REPO_ROOT, "AGENTS.md");
const COST_GOVERNANCE_PATH = join(
  REPO_ROOT,
  ".opencode/instructions/cost-governance.md",
);

describe("repo instruction drift guards (repairDriftContradictions T4)", () => {
  const agents = readFileSync(AGENTS_PATH, "utf8");
  const costGovernance = readFileSync(COST_GOVERNANCE_PATH, "utf8");

  test("AGENTS.md command and storage quick-reference stays count-free and Temporal-only", () => {
    expect(agents).not.toMatch(/24 slash-command workflow files/);
    expect(agents).not.toMatch(/JSON \+ SQLite persistence/);
    expect(agents).toMatch(/Temporal-only persistence/);
    expect(agents).toMatch(/external state/);
  });

  test("cost governance docs say auto thresholds are not a tuning lever", () => {
    expect(costGovernance).toMatch(/changing `auto\.\*` alone does not/);
    expect(costGovernance).toMatch(/Do not tune `auto\.\*`/);
  });
});
