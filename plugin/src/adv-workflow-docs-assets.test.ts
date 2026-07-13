/**
 * ADV Workflow Docs Asset Contract Tests
 *
 * Presence-based asset tests for docs/adv-workflow.md.
 * Pins the workflow diagram and gate ownership table to stable anchors
 * so doc drift is caught at test time rather than discovered manually.
 *
 * Covers:
 * - AC1: adv-workflow.md no longer claims proposal produces success criteria;
 *        ownership table lists both problem-statement.md + proposal.md
 * - AC4: cross-reference to Per-Gate Line-Item Map in docs/adv-gates.md
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

describe("docs/adv-workflow.md asset contract", () => {
  const content = readFileSync(
    join(REPO_ROOT, "docs/adv-workflow.md"),
    "utf8",
  );

  it("does not claim proposal gate produces success criteria", () => {
    expect(content).not.toContain("success criteria");
  });

  it("ownership table proposal row lists both problem-statement.md and proposal.md", () => {
    const proposalRowMatch = content.match(/^\| proposal\s+\|.*$/m);
    expect(proposalRowMatch).not.toBeNull();
    const row = proposalRowMatch![0];
    expect(row).toContain("problem-statement.md");
    expect(row).toContain("proposal.md");
  });

  it("cross-references the Per-Gate Line-Item Map in docs/adv-gates.md", () => {
    expect(content).toContain("Per-Gate Line-Item Map");
    expect(content).toContain("adv-gates.md");
  });
});
