import { describe, expect, test } from "vitest";
import {
  ADV_MORPH_WORKTREE_CAPABILITY,
  authorizeMorphWorktree,
} from "./morph-worktree-authorization";

describe("authorizeMorphWorktree", () => {
  const root = "/worktrees/project/change/fix";
  const base = {
    taskId: "tk-1",
    workdir: root,
  };

  test("injects a non-enumerable session-bound capability only for exact task roots", async () => {
    const args: Record<string, unknown> = { ...base };
    await authorizeMorphWorktree(args, "session-1", {
      getTaskChangeId: async (taskId) => (taskId === "tk-1" ? "fix" : null),
      getExpectedRoot: (changeId) => (changeId === "fix" ? root : null),
      canonicalize: (value) => value,
      isSetupReady: async () => true,
    });

    const descriptor = Object.getOwnPropertyDescriptor(
      args,
      ADV_MORPH_WORKTREE_CAPABILITY,
    );
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.value).toEqual({
      root,
      taskId: "tk-1",
      sessionID: "session-1",
    });
  });

  test("rejects a caller-selected root before injecting a capability", async () => {
    await expect(
      authorizeMorphWorktree({ ...base, workdir: "/other" }, "session-1", {
        getTaskChangeId: async () => "fix",
        getExpectedRoot: () => root,
        canonicalize: (value) => value,
        isSetupReady: async () => true,
      }),
    ).rejects.toThrow("does not match");
  });
});
