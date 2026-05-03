/**
 * Tests for Linux /proc CWD worktree-use detection.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  readdirSync: vi.fn(),
  readlinkSync: vi.fn(),
}));

vi.mock("node:fs", () => fsMock);

const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value });
}

function restorePlatform(): void {
  if (ORIGINAL_PLATFORM) {
    Object.defineProperty(process, "platform", ORIGINAL_PLATFORM);
  }
}

describe("isWorktreeInUse", () => {
  afterEach(() => {
    vi.clearAllMocks();
    restorePlatform();
  });

  it("returns false on non-Linux without reading /proc", async () => {
    setPlatform("darwin");
    const { isWorktreeInUse } = await import("./in-use");

    expect(isWorktreeInUse("/repo/wt")).toBe(false);
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
  });

  it("ignores non-numeric /proc entries", async () => {
    setPlatform("linux");
    fsMock.readdirSync.mockReturnValue(["self", "sys", "123"]);
    fsMock.readlinkSync.mockReturnValue("/other");
    const { isWorktreeInUse } = await import("./in-use");

    expect(isWorktreeInUse("/repo/wt")).toBe(false);
    expect(fsMock.readlinkSync).toHaveBeenCalledTimes(1);
    expect(fsMock.readlinkSync).toHaveBeenCalledWith("/proc/123/cwd");
  });

  it("detects exact worktree cwd", async () => {
    setPlatform("linux");
    fsMock.readdirSync.mockReturnValue(["123"]);
    fsMock.readlinkSync.mockReturnValue("/repo/wt");
    const { isWorktreeInUse } = await import("./in-use");

    expect(isWorktreeInUse("/repo/wt")).toBe(true);
  });

  it("detects subdirectory cwd and normalizes trailing slash", async () => {
    setPlatform("linux");
    fsMock.readdirSync.mockReturnValue(["123"]);
    fsMock.readlinkSync.mockReturnValue("/repo/wt/plugin");
    const { isWorktreeInUse } = await import("./in-use");

    expect(isWorktreeInUse("/repo/wt/")).toBe(true);
  });

  it("swallows per-pid readlink errors", async () => {
    setPlatform("linux");
    fsMock.readdirSync.mockReturnValue(["123", "456"]);
    fsMock.readlinkSync
      .mockImplementationOnce(() => {
        throw new Error("EACCES");
      })
      .mockReturnValueOnce("/repo/wt");
    const { isWorktreeInUse } = await import("./in-use");

    expect(isWorktreeInUse("/repo/wt")).toBe(true);
  });

  it("returns false when /proc cannot be read", async () => {
    setPlatform("linux");
    fsMock.readdirSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const { isWorktreeInUse } = await import("./in-use");

    expect(isWorktreeInUse("/repo/wt")).toBe(false);
  });
});
