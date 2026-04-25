/**
 * Checkpoint asset tests — drift guards for adv_task_checkpoint contract.
 *
 * Asserts that all the files touched by the perTaskGitCheckpointCommits
 * change contain the expected content. These tests prevent accidental
 * regression (e.g., removing the tool from an agent allowlist, deleting
 * the checkpoint step from the apply command, or removing the instructions
 * section).
 *
 * Separate from adv-command-routing-assets.test.ts to keep concerns focused.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { ADV_TOOL_NAMES } from "./tool-registry";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const AGENT_DIR = join(REPO_ROOT, ".opencode/agents");
const INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

function readAgent(name: string): string {
  return readFileSync(join(AGENT_DIR, name), "utf8");
}

function readCommand(name: string): string {
  return readFileSync(join(COMMAND_DIR, name), "utf8");
}

function getFrontmatter(content: string): string {
  return content.split("---")[1] ?? "";
}

describe("adv_task_checkpoint drift guards", () => {
  // 1. ADV_TOOL_NAMES includes the tool
  test("ADV_TOOL_NAMES includes adv_task_checkpoint", () => {
    expect(ADV_TOOL_NAMES).toContain("adv_task_checkpoint");
  });

  // 2. adv-apply.md mentions checkpoint in 3c→3c.5→3d ordering + cancel path
  test("adv-apply.md has checkpoint step between green and complete", () => {
    const content = readCommand("adv-apply.md");
    // Step 3c.5 exists between Green Phase and Complete
    expect(content).toContain("3c.5");
    expect(content).toContain("adv_task_checkpoint");
    // Verify ordering: 3c Green comes before 3c.5 Checkpoint
    const greenIdx = content.indexOf("3c. Green Phase:");
    const checkpointIdx = content.indexOf("3c.5. Checkpoint:");
    const completeIdx = content.indexOf("3d. Complete:");
    expect(greenIdx).toBeGreaterThan(0);
    expect(checkpointIdx).toBeGreaterThan(greenIdx);
    expect(completeIdx).toBeGreaterThan(checkpointIdx);
  });

  test("adv-apply.md cancellation uses checkpoint mode:'cancel'", () => {
    const content = readCommand("adv-apply.md");
    // The cancellation workflow mentions mode:'cancel' for checkpoint
    expect(content).toMatch(/mode.*cancel/);
    // The cancellation section mentions adv_task_checkpoint before adv_task_cancel
    const cancelSection = content.slice(
      content.indexOf("## Cancellation Policy"),
    );
    expect(cancelSection).toContain("adv_task_checkpoint");
    expect(cancelSection).toMatch(
      /adv_task_checkpoint.*mode.*cancel.*adv_task_cancel/s,
    );
  });

  // 3. adv.md allows adv_task_checkpoint
  test("adv.md allows adv_task_checkpoint", () => {
    const frontmatter = getFrontmatter(readAgent("adv.md"));
    expect(frontmatter).toMatch(/adv_task_checkpoint:\s*true/);
  });

  // 4. build.md allows adv_task_checkpoint
  test("build.md allows adv_task_checkpoint", () => {
    const frontmatter = getFrontmatter(readAgent("build.md"));
    expect(frontmatter).toMatch(/adv_task_checkpoint:\s*true/);
  });

  // 5. plan.md does NOT allow adv_task_checkpoint
  test("plan.md does NOT allow adv_task_checkpoint", () => {
    const planContent = readAgent("plan.md");
    const frontmatter = getFrontmatter(planContent);
    expect(frontmatter).not.toMatch(/adv_task_checkpoint/);
  });

  // 6. ADV_INSTRUCTIONS.md contains Task Checkpoint Commits section
  test("ADV_INSTRUCTIONS.md has Task Checkpoint Commits section", () => {
    const content = readFileSync(INSTRUCTIONS_PATH, "utf8");
    expect(content).toContain("### Task Checkpoint Commits");
  });

  // ─── New guardrail tests for optimized checkpoint ordering (RED phase) ───

  // 7. adv-apply.md mentions clean baseline capture before Red Phase
  test("adv-apply.md has clean baseline capture before Red Phase", () => {
    const content = readCommand("adv-apply.md");
    const redPhaseIdx = content.indexOf("3b. Red Phase:");
    const baselineIdx = content.indexOf("Clean Baseline Capture");
    expect(redPhaseIdx).toBeGreaterThan(0);
    expect(baselineIdx).toBeGreaterThan(0);
    expect(baselineIdx).toBeLessThan(redPhaseIdx);
  });

  // 8. adv-apply.md has incremental verification BEFORE checkpoint
  test("adv-apply.md places incremental verification before checkpoint", () => {
    const content = readCommand("adv-apply.md");
    const verificationIdx = content.indexOf("Incremental Verification");
    const checkpointIdx = content.indexOf("3c.5. Checkpoint:");
    expect(verificationIdx).toBeGreaterThan(0);
    expect(checkpointIdx).toBeGreaterThan(0);
    expect(verificationIdx).toBeLessThan(checkpointIdx);
  });

  // 9. adv-apply.md passes strict checkpoint args
  test("adv-apply.md passes changeId to adv_task_checkpoint", () => {
    const content = readCommand("adv-apply.md");
    const checkpointSection = content.slice(content.indexOf("3c.5. Checkpoint:"));
    expect(checkpointSection).toContain("changeId");
  });

  test("adv-apply.md passes expectedBranch to adv_task_checkpoint", () => {
    const content = readCommand("adv-apply.md");
    const checkpointSection = content.slice(content.indexOf("3c.5. Checkpoint:"));
    expect(checkpointSection).toContain("expectedBranch");
  });

  test("adv-apply.md passes expectedHeadSha to adv_task_checkpoint", () => {
    const content = readCommand("adv-apply.md");
    const checkpointSection = content.slice(content.indexOf("3c.5. Checkpoint:"));
    expect(checkpointSection).toContain("expectedHeadSha");
  });

  test("adv-apply.md passes verification to adv_task_checkpoint", () => {
    const content = readCommand("adv-apply.md");
    const checkpointSection = content.slice(content.indexOf("3c.5. Checkpoint:"));
    expect(checkpointSection).toContain("verification");
  });

  // 10. ADV_INSTRUCTIONS.md has correct ordering in the table
  test("ADV_INSTRUCTIONS.md orders incremental verification before checkpoint in table", () => {
    const content = readFileSync(INSTRUCTIONS_PATH, "utf8");
    const checkpointSection = content.slice(content.indexOf("### Task Checkpoint Commits"));
    const tableStart = checkpointSection.indexOf("| Step |");
    const tableEnd = checkpointSection.indexOf("**Failure classification:**");
    const table = checkpointSection.slice(tableStart, tableEnd);
    const verifyIdx = table.indexOf("3c.4");
    const checkpointIdx = table.indexOf("3c.5");
    expect(verifyIdx).toBeGreaterThan(0);
    expect(checkpointIdx).toBeGreaterThan(0);
    expect(verifyIdx).toBeLessThan(checkpointIdx);
  });

  // 11. No publication authority in checkpoint section
  test("ADV_INSTRUCTIONS.md checkpoint section states checkpoints are local-only", () => {
    const content = readFileSync(INSTRUCTIONS_PATH, "utf8");
    const checkpointSection = content.slice(content.indexOf("### Task Checkpoint Commits"));
    const nextSectionIdx = checkpointSection.indexOf("###", 1);
    const relevantText = nextSectionIdx > 0
      ? checkpointSection.slice(0, nextSectionIdx)
      : checkpointSection;
    // Must explicitly state that checkpoints are local/audit points only
    expect(relevantText).toMatch(/local\s+rollback|audit\s+points|local-only/);
    // Must explicitly prohibit publication actions
    expect(relevantText).toMatch(/Do NOT push|Do NOT merge|Do NOT archive|Do NOT release/);
  });
});
