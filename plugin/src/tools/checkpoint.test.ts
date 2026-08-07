/** Checkpoint behavior that remains after the Temporal transport removal. */

import { describe, expect, test } from "vitest";
import { createTempGitWorktree } from "../__tests__/setup";
import { buildCommitMessage, detectRepoState } from "./checkpoint";

describe("checkpoint helpers", () => {
  test("builds a task checkpoint commit message with verification context", () => {
    expect(
      buildCommitMessage(
        "tk-abc",
        "complete",
        undefined,
        "change-1",
        "tests pass",
      ),
    ).toMatchObject({
      subject: expect.stringContaining("tk-abc"),
      body: expect.stringContaining("Verification: tests pass"),
    });
  });

  test("detects a clean repository state", async () => {
    const fixture = await createTempGitWorktree("checkpoint-state-");
    try {
      const result = await detectRepoState(fixture.worktreePath);
      expect(result).toBe("ok");
    } finally {
      await fixture.cleanup();
    }
  });
});
