import { readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const REVIEW_COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-review.md");
const HARDEN_COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-harden.md");
const ARCHIVE_COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-archive.md");
const ADV_AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv.md");

const REQUIRED_CATEGORIES = [
  "delivered value",
  "enabling-only/follow-up dependency",
  "ops readiness",
  "migration/data impact",
  "frontend/preview impact",
  "collision/release risk",
  "open follow-ups",
  "next action",
];

describe("approval consequence context command assets", () => {
  test("adv-review wires consequence context before acceptance prompt and executive summary", () => {
    const review = readFileSync(REVIEW_COMMAND_PATH, "utf8");

    expect(review).toContain("Approval Consequence Context");
    expect(review).toContain("buildApprovalConsequenceContext");
    expect(review).toContain("plugin/src/utils/approval-consequence-context.ts");

    const contextIndex = review.indexOf("Approval Consequence Context");
    const promptIndex = review.indexOf("### Ask for Acceptance (Inline)");
    expect(contextIndex).toBeGreaterThan(-1);
    expect(promptIndex).toBeGreaterThan(-1);
    expect(contextIndex).toBeLessThan(promptIndex);

    const executiveSummarySection = review.slice(
      review.indexOf("### Persist Executive Summary"),
      promptIndex,
    );
    expect(executiveSummarySection).toContain("## Consequence Context");

    for (const category of REQUIRED_CATEGORIES) {
      expect(review).toContain(category);
    }
  });

  test("adv-harden carries release readiness forward for archive consequence context", () => {
    const harden = readFileSync(HARDEN_COMMAND_PATH, "utf8");

    expect(harden).toContain("Release Readiness Summary");
    expect(harden).toContain("Approval Consequence Context");
    expect(harden).toContain("buildApprovalConsequenceContext");
    expect(harden).toContain("adv_change_update");
    expect(harden).toContain("executiveSummary");
    expect(harden).toContain("harden evidence unavailable");

    for (const category of [
      "ops readiness",
      "migration/data impact",
      "frontend/preview impact",
      "collision/release risk",
      "open follow-ups",
      "next action",
    ]) {
      expect(harden).toContain(category);
    }
  });

  test("adv-archive and ADV sign-off render consequence context before Tier B approval", () => {
    const archive = readFileSync(ARCHIVE_COMMAND_PATH, "utf8");
    const advAgent = readFileSync(ADV_AGENT_PATH, "utf8");

    for (const content of [archive, advAgent]) {
      expect(content).toContain("Approval Consequence Context");
      expect(content).toContain("Release Readiness Summary");
      expect(content).toContain("harden evidence unavailable");
      expect(content).toContain("checkOpsFollowupReleaseBlockers");
      expect(content).toContain("getOpenOpsFollowupObligations");
    }

    const contextIndex = archive.indexOf("Approval Consequence Context");
    const tierBIndex = archive.indexOf("Reply `sign off`");
    expect(contextIndex).toBeGreaterThan(-1);
    expect(tierBIndex).toBeGreaterThan(-1);
    expect(contextIndex).toBeLessThan(tierBIndex);
  });
});
