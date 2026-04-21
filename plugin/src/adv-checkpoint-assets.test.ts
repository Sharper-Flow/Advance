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
});
