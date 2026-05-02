import { describe, expect, it, vi } from "vitest";
import { detectConcurrentSessions } from "./concurrent-sessions";

vi.mock("fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("fs/promises")>("fs/promises");
  return {
    ...actual,
    readdir: vi.fn(),
    readlink: vi.fn(),
  };
});

import { readdir, readlink } from "fs/promises";

const mockedReaddir = vi.mocked(readdir);
const mockedReadlink = vi.mocked(readlink);

describe("detectConcurrentSessions", () => {
  it("returns empty array on non-linux non-darwin platforms", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    );
    Object.defineProperty(process, "platform", { value: "win32" });

    const peers = await detectConcurrentSessions("/some/project");
    expect(peers).toEqual([]);

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("detects peer opencode sessions on Linux via /proc", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    );
    Object.defineProperty(process, "platform", { value: "linux" });

    mockedReaddir.mockResolvedValue([
      "1",
      "2",
      "self",
      "thread-self",
      "3",
      "notapid",
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    mockedReadlink.mockImplementation(async (path: string) => {
      if (path === "/proc/1/exe") return "/usr/bin/opencode";
      if (path === "/proc/1/cwd") return "/some/project";
      if (path === "/proc/2/exe") return "/usr/bin/opencode";
      if (path === "/proc/2/cwd") return "/other/project";
      if (path === "/proc/3/exe") return "/usr/bin/node";
      if (path === "/proc/3/cwd") return "/some/project";
      throw new Error("ENOENT");
    });

    const myPid = process.pid;
    // Mock process.pid to be different from the test PIDs
    Object.defineProperty(process, "pid", { value: 9999 });

    const peers = await detectConcurrentSessions("/some/project");
    expect(peers).toEqual([1]);

    // Restore
    Object.defineProperty(process, "pid", { value: myPid });
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("skips own PID on Linux", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    );
    Object.defineProperty(process, "platform", { value: "linux" });

    const myPid = process.pid;
    mockedReaddir.mockResolvedValue([String(myPid), "2"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    mockedReadlink.mockImplementation(async (path: string) => {
      if (path === `/proc/${myPid}/exe`) return "/usr/bin/opencode";
      if (path === `/proc/${myPid}/cwd`) return "/some/project";
      if (path === "/proc/2/exe") return "/usr/bin/opencode";
      if (path === "/proc/2/cwd") return "/other/project";
      throw new Error("ENOENT");
    });

    const peers = await detectConcurrentSessions("/some/project");
    expect(peers).toEqual([]);

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("returns empty array when no matching peers on Linux", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    );
    Object.defineProperty(process, "platform", { value: "linux" });

    mockedReaddir.mockResolvedValue(["1", "2"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    mockedReadlink.mockImplementation(async (path: string) => {
      if (path.includes("exe")) return "/usr/bin/node";
      if (path.includes("cwd")) return "/some/project";
      throw new Error("ENOENT");
    });

    Object.defineProperty(process, "pid", { value: 9999 });

    const peers = await detectConcurrentSessions("/some/project");
    expect(peers).toEqual([]);

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("handles readlink errors gracefully on Linux", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    );
    Object.defineProperty(process, "platform", { value: "linux" });

    mockedReaddir.mockResolvedValue(["1", "2"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    mockedReadlink.mockRejectedValue(new Error("Permission denied"));

    Object.defineProperty(process, "pid", { value: 9999 });

    const peers = await detectConcurrentSessions("/some/project");
    expect(peers).toEqual([]);

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });
});
