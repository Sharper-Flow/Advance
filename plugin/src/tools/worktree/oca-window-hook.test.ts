import { describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { createOcaEnsureWindowHook } from "./oca-window-hook";

describe("createOcaEnsureWindowHook", () => {
  it("calls `oca session ensure-window` with session, name, and cwd", async () => {
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      callback(null, "window ensured\n", "");
    });

    const hook = createOcaEnsureWindowHook();
    const result = await hook("oca-opencodeadvance", "change-one", "/repo/wt");

    expect(result).toEqual({ ok: true });
    expect(execFileMock).toHaveBeenCalledWith(
      "oca",
      [
        "session",
        "ensure-window",
        "--session",
        "oca-opencodeadvance",
        "--name",
        "change-one",
        "--cwd",
        "/repo/wt",
      ],
      expect.objectContaining({
        cwd: "/repo/wt",
        timeout: expect.any(Number),
        env: expect.objectContaining({
          CI: "true",
          GIT_TERMINAL_PROMPT: "0",
        }),
      }),
      expect.any(Function),
    );
  });

  it("returns non-fatal error details when oca is unavailable", async () => {
    const err = Object.assign(new Error("spawn oca ENOENT"), {
      code: "ENOENT",
    });
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      callback(err, "", "");
    });

    const hook = createOcaEnsureWindowHook();
    const result = await hook("oca-opencodeadvance", "change-one", "/repo/wt");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("ENOENT");
      expect(result.error).toContain("spawn oca ENOENT");
    }
  });

  it("includes stderr in non-fatal failure details", async () => {
    const err = Object.assign(new Error("Command failed"), { code: 1 });
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      callback(err, "", "tmux server unreachable");
    });

    const hook = createOcaEnsureWindowHook();
    const result = await hook("oca-opencodeadvance", "change-one", "/repo/wt");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("exit=1");
      expect(result.error).toContain("tmux server unreachable");
    }
  });
});
