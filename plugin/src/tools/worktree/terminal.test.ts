/**
 * Tests for terminal detection dispatch.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const terminalDetectMock = vi.hoisted(() => ({
  isInsideTmux: vi.fn(() => false),
}));

vi.mock("../../utils/terminal-detect", () => terminalDetectMock);

const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value });
}

function restorePlatform(): void {
  if (ORIGINAL_PLATFORM) {
    Object.defineProperty(process, "platform", ORIGINAL_PLATFORM);
  }
}

describe("detectTerminalType", () => {
  afterEach(() => {
    vi.clearAllMocks();
    terminalDetectMock.isInsideTmux.mockReturnValue(false);
    delete process.env.WSL_DISTRO_NAME;
    delete process.env.WSLENV;
    restorePlatform();
  });

  it("prefers tmux over platform detection", async () => {
    terminalDetectMock.isInsideTmux.mockReturnValue(true);
    setPlatform("linux");
    const { detectTerminalType } = await import("./terminal");

    expect(detectTerminalType()).toBe("tmux");
  });

  it("detects WSL as windows terminal on Linux", async () => {
    setPlatform("linux");
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    const { detectTerminalType } = await import("./terminal");

    expect(detectTerminalType()).toBe("windows");
  });

  it("maps darwin to macOS terminal", async () => {
    setPlatform("darwin");
    const { detectTerminalType } = await import("./terminal");

    expect(detectTerminalType()).toBe("macos");
  });

  it("maps win32 to windows terminal", async () => {
    setPlatform("win32");
    const { detectTerminalType } = await import("./terminal");

    expect(detectTerminalType()).toBe("windows");
  });

  it("defaults unknown platforms to linux-desktop", async () => {
    setPlatform("aix");
    const { detectTerminalType } = await import("./terminal");

    expect(detectTerminalType()).toBe("linux-desktop");
  });
});
