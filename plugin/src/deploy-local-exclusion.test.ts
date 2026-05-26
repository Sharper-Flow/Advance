/**
 * Deploy-Local Exclusion List Tests
 *
 * `scripts/deploy-local.sh` deploys `.opencode/agents/*.md` to the global
 * agents directory by default, EXCEPT for agents named in two exclusion lists:
 *
 *   REPO_LOCAL_ONLY     — agents that stay repo-local (e.g. `adv-tron.md`)
 *   SHARED_OVERLAY_ONLY — overlay-managed shared globals (build/general/plan)
 *
 * This test pins those exclusion lists so `adv-reviewer.md` cannot silently
 * drift into either list and stop deploying as a bundled global agent.
 *
 * Realizes design Decision 6 (deploy path) and Decision 4 (asset-test
 * enforcement). Pins agreement AC9 and C3.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const DEPLOY_SCRIPT_PATH = resolve(REPO_ROOT, "scripts/deploy-local.sh");

/**
 * Extract the literal value assigned to a bash variable like:
 *   REPO_LOCAL_ONLY="adv-tron.md"
 *
 * Returns the space-separated tokens (e.g. ["adv-tron.md"]) or null if the
 * assignment is not found. Only matches simple double-quoted assignments;
 * anything more dynamic would require executing bash and is intentionally
 * out of scope.
 */
function extractList(script: string, varName: string): string[] | null {
  // Match: ^\s*VARNAME="..."  (optionally with leading export, indent)
  const re = new RegExp(`^\\s*(?:export\\s+)?${varName}="([^"]*)"`, "m");
  const match = script.match(re);
  if (!match) return null;
  return match[1]
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe("deploy-local.sh exclusion lists", () => {
  const script = readFileSync(DEPLOY_SCRIPT_PATH, "utf8");

  test("scripts/deploy-local.sh exists and is readable", () => {
    expect(script.length).toBeGreaterThan(0);
  });

  test("REPO_LOCAL_ONLY contains adv-tron.md (sanity check)", () => {
    const list = extractList(script, "REPO_LOCAL_ONLY");
    expect(list).not.toBeNull();
    expect(list).toContain("adv-tron.md");
  });

  test("REPO_LOCAL_ONLY does NOT contain adv-reviewer.md", () => {
    const list = extractList(script, "REPO_LOCAL_ONLY");
    expect(list).not.toBeNull();
    expect(list).not.toContain("adv-reviewer.md");
  });

  test("SHARED_OVERLAY_ONLY does NOT contain adv-reviewer.md", () => {
    const list = extractList(script, "SHARED_OVERLAY_ONLY");
    expect(list).not.toBeNull();
    expect(list).not.toContain("adv-reviewer.md");
  });

  test("SHARED_OVERLAY_ONLY contains expected overlay-managed agents", () => {
    const list = extractList(script, "SHARED_OVERLAY_ONLY");
    expect(list).not.toBeNull();
    // These are the three overlay-managed shared globals per
    // scripts/deploy-local.sh §5 comment block. Pin them so any future
    // change to the overlay model surfaces in this test.
    expect(list).toContain("build.md");
    expect(list).toContain("general.md");
    expect(list).toContain("plan.md");
  });

  test("REPO_LOCAL_ONLY does NOT contain adv-engineer.md or adv-researcher.md", () => {
    // adv-engineer and adv-researcher are bundled global agents — they must
    // deploy via the standard loop, same as adv-reviewer will.
    const list = extractList(script, "REPO_LOCAL_ONLY");
    expect(list).not.toBeNull();
    expect(list).not.toContain("adv-engineer.md");
    expect(list).not.toContain("adv-researcher.md");
  });

  test("REPO_LOCAL_ONLY does NOT contain adv-designer.md", () => {
    // adv-designer is a bundled global apply-phase frontend worker — it must
    // deploy via the standard loop alongside adv-engineer / adv-reviewer.
    const list = extractList(script, "REPO_LOCAL_ONLY");
    expect(list).not.toBeNull();
    expect(list).not.toContain("adv-designer.md");
  });

  test("SHARED_OVERLAY_ONLY does NOT contain adv-designer.md", () => {
    const list = extractList(script, "SHARED_OVERLAY_ONLY");
    expect(list).not.toBeNull();
    expect(list).not.toContain("adv-designer.md");
  });
});
