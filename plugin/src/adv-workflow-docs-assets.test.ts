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
  const content = readFileSync(join(REPO_ROOT, "docs/adv-workflow.md"), "utf8");

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

describe("docs/adv-gates.md Per-Gate Line-Item Map", () => {
  const content = readFileSync(join(REPO_ROOT, "docs/adv-gates.md"), "utf8");

  it("contains the map section header", () => {
    expect(content).toContain("## Per-Gate Line-Item Map");
  });

  it("contains all 7 gates + post-release subsection", () => {
    expect(content).toContain("### 1. Proposal");
    expect(content).toContain("### 2. Discovery");
    expect(content).toContain("### 3. Design");
    expect(content).toContain("### 4. Planning");
    expect(content).toContain("### 5. Execution");
    expect(content).toContain("### 6. Acceptance");
    expect(content).toContain("### 7. Release");
    expect(content).toContain("### Post-Release");
  });

  it("contains the legend section", () => {
    expect(content).toContain("### Legend");
  });

  it("references worktree isolation anchor in execution gate", () => {
    expect(content).toContain("adv_worktree_create");
    expect(content).toContain("Worktree Isolation");
  });

  it("references design-concern disposition tool in acceptance gate", () => {
    expect(content).toContain("adv_design_concern_disposition");
  });

  it("references design-concern spec anchor", () => {
    expect(content).toContain("rq-designQualityEvidence01");
  });

  it("references ops-blocks release blocker checker", () => {
    expect(content).toContain("checkOpsFollowupReleaseBlockers");
  });

  it("marks wisdom capture as advisory", () => {
    expect(content).toContain("Wisdom capture (advisory");
  });

  it("references reflection tool in post-release", () => {
    expect(content).toContain("adv_reflect");
  });

  it("references planning machine-enforcement token", () => {
    expect(content).toContain("userApproved: true");
  });

  it("references Tier B whitelist-only approval type", () => {
    expect(content).toContain("Tier B");
  });

  it("references machine-enforced approval type in legend", () => {
    expect(content).toContain("machine-enforced");
  });

  it("does NOT include verification-evidence disposition rows", () => {
    expect(content).not.toContain("VERIFICATION_EVIDENCE_MISSING");
    expect(content).not.toContain("verification-evidence disposition");
  });
});
