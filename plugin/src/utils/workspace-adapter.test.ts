import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildAdvWorktreeAdapter } from "./workspace-adapter.js";

describe("buildAdvWorktreeAdapter", () => {
  let worktreeRoot: string;

  const baseInfo = () => ({
    id: "ws-123",
    type: "adv-worktree",
    name: "change/fixWorktreeSessionRoot",
    branch: "change/fixWorktreeSessionRoot",
    directory: null,
    extra: {
      directory: join(
        worktreeRoot,
        "opencode/worktree/proj-123/change/fixWorktreeSessionRoot",
      ),
      branch: "change/fixWorktreeSessionRoot",
    },
    projectID: "proj-123",
  });

  beforeEach(() => {
    worktreeRoot = mkdtempSync(join(tmpdir(), "adv-workspace-adapter-"));
    vi.stubEnv("XDG_DATA_HOME", worktreeRoot);
    vi.stubEnv("ADV_WORKTREE_HOME", "");
    // Test mode otherwise redirects getDataHome away from the explicit XDG
    // namespace this suite is verifying.
    vi.stubEnv("ADV_TEST_DATA_HOME", "0");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(worktreeRoot, { recursive: true, force: true });
  });

  it("identifies the custom ADV worktree adapter", () => {
    const adapter = buildAdvWorktreeAdapter();

    expect(adapter.name).toBe("adv-worktree");
    expect(adapter.description).toContain("ADV-managed git worktree");
  });

  it("configures the workspace directory from extra.directory", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(adapter.configure(baseInfo())).resolves.toEqual({
      ...baseInfo(),
      directory: join(
        worktreeRoot,
        "opencode/worktree/proj-123/change/fixWorktreeSessionRoot",
      ),
    });
  });

  it("rejects missing extra.directory structurally", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.configure({ ...baseInfo(), extra: { branch: "change/test" } }),
    ).rejects.toThrow("adv-worktree adapter requires info.extra.directory");
  });

  it("rejects a non-string extra.directory", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.configure({ ...baseInfo(), extra: { directory: 123 } }),
    ).rejects.toThrow("adv-worktree adapter requires info.extra.directory");
  });

  it("rejects missing or invalid branch metadata", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.configure({
        ...baseInfo(),
        extra: { directory: baseInfo().extra.directory },
      }),
    ).rejects.toThrow("adv-worktree adapter requires info.extra.branch");

    await expect(
      adapter.configure({
        ...baseInfo(),
        extra: { ...baseInfo().extra, branch: "../bad" },
      }),
    ).rejects.toThrow("adv-worktree adapter branch is invalid");
  });

  it("rejects directories that do not match the workspace project and branch", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.configure({
        ...baseInfo(),
        extra: {
          directory: join(
            worktreeRoot,
            "opencode/worktree/proj-123/change/other",
          ),
          branch: "change/fixWorktreeSessionRoot",
        },
      }),
    ).rejects.toThrow(
      "adv-worktree adapter directory does not match project/branch",
    );
  });

  it("rejects missing project ownership", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.configure({ ...baseInfo(), projectID: "" }),
    ).rejects.toThrow("adv-worktree adapter requires info.projectID");
  });

  it("returns a local target rooted at the configured worktree directory", async () => {
    const adapter = buildAdvWorktreeAdapter();
    const directory = baseInfo().extra.directory;

    await expect(adapter.target({ ...baseInfo(), directory })).resolves.toEqual(
      {
        type: "local",
        directory,
      },
    );
  });

  it("rejects target rows whose configured directory does not match ADV metadata", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.target({
        ...baseInfo(),
        directory: join(
          worktreeRoot,
          "opencode/worktree/proj-123/change/other",
        ),
      }),
    ).rejects.toThrow(
      "adv-worktree adapter target does not match project/branch",
    );
  });

  it("rejects directories outside the ADV worktree namespace", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(
      adapter.configure({
        ...baseInfo(),
        extra: { directory: "/tmp/not-an-adv-worktree", branch: "change/test" },
      }),
    ).rejects.toThrow("outside allowed namespace");

    await expect(
      adapter.target({ ...baseInfo(), directory: "/tmp/not-an-adv-worktree" }),
    ).rejects.toThrow("outside allowed namespace");
  });

  it("rejects target resolution before configure populates directory", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(adapter.target(baseInfo())).rejects.toThrow(
      "adv-worktree adapter target requires info.directory",
    );
  });

  it("leaves git worktree create and remove ownership to ADV", async () => {
    const adapter = buildAdvWorktreeAdapter();

    await expect(adapter.create(baseInfo(), {})).resolves.toBeUndefined();
    await expect(adapter.remove(baseInfo())).resolves.toBeUndefined();
  });
});
