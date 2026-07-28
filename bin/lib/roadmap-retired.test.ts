/**
 * Structural guard: the roadmap CLI surface stays retired.
 *
 * rq-roadmapCliBridge01 [MUST]: "The /adv-roadmap command, adv roadmap CLI
 * subcommand, adv_roadmap MCP tool, and bin/lib/roadmap implementation are
 * retired and MUST remain absent. What's-next and portfolio-balancing requests
 * route to /adv-triage."
 *
 * The implementation was present and wired despite that requirement, and it
 * carried the same worker-dependent getState defect this change removes
 * elsewhere. This test makes the retirement structural rather than aspirational
 * so it cannot silently return.
 *
 * fixWorkerDependentResume — AC7, SC4
 *
 * Run with: bun test bin/lib/roadmap-retired.test.ts
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const BIN_ADV = join(REPO_ROOT, "bin/adv");

describe("roadmap CLI surface is retired", () => {
  test("bin/lib/roadmap.ts does not exist", () => {
    expect(existsSync(join(REPO_ROOT, "bin/lib/roadmap.ts"))).toBe(false);
  });

  test("bin/lib/roadmap.test.ts does not exist", () => {
    expect(existsSync(join(REPO_ROOT, "bin/lib/roadmap.test.ts"))).toBe(false);
  });

  test("bin/adv does not import the roadmap implementation", () => {
    const source = readFileSync(BIN_ADV, "utf8");

    expect(source).not.toContain("./lib/roadmap");
    expect(source).not.toContain("runRoadmapCommand");
  });

  test("bin/adv does not dispatch a roadmap subcommand", () => {
    const source = readFileSync(BIN_ADV, "utf8");

    expect(source).not.toContain('subcommand === "roadmap"');
  });

  test("bin/adv help output does not advertise roadmap", () => {
    const source = readFileSync(BIN_ADV, "utf8");

    // Catches help text, usage lines, and error strings alike.
    expect(source.toLowerCase()).not.toContain("roadmap");
  });
});
