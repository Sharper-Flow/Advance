import { describe, expect, it } from "vitest";

import { buildAdvWorktreeAdapter } from "./workspace-adapter.js";

const baseInfo = {
  id: "ws-123",
  type: "adv-worktree",
  name: "change/fixWorktreeSessionRoot",
  branch: "change/fixWorktreeSessionRoot",
  directory: null,
  extra: {
    directory: "/tmp/advance-worktree",
    branch: "change/fixWorktreeSessionRoot",
  },
  projectID: "proj-123",
};

describe("buildAdvWorktreeAdapter", () => {
  it("identifies the custom ADV worktree adapter", () => {
    const adapter = buildAdvWorktreeAdapter();

    expect(adapter.name).toBe("adv-worktree");
    expect(adapter.description).toContain("ADV-managed git worktree");
  });

  it("configures the workspace directory from extra.directory", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(adapter.configure(baseInfo)).resolves.toEqual({
      ...baseInfo,
      directory: "/tmp/advance-worktree",
    });
  });

  it("rejects missing extra.directory structurally", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.configure({ ...baseInfo, extra: { branch: "change/test" } }),
    ).rejects.toThrow("adv-worktree adapter requires info.extra.directory");
  });

  it("rejects a non-string extra.directory", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.configure({ ...baseInfo, extra: { directory: 123 } }),
    ).rejects.toThrow("adv-worktree adapter requires info.extra.directory");
  });

  it("returns a local target rooted at the configured worktree directory", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.target({ ...baseInfo, directory: "/tmp/advance-worktree" }),
    ).resolves.toEqual({ type: "local", directory: "/tmp/advance-worktree" });
  });

  it("rejects target resolution before configure populates directory", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(adapter.target(baseInfo)).rejects.toThrow(
      "adv-worktree adapter target requires info.directory",
    );
  });

  it("leaves git worktree create and remove ownership to ADV", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(adapter.create(baseInfo, {})).resolves.toBeUndefined();
    await expect(adapter.remove(baseInfo)).resolves.toBeUndefined();
  });
});
