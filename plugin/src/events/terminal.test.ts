/**
 * Terminal tests — focused on the tmux rename-window argv safety.
 *
 * Verifies that the tmux rename path uses execFileSync with an argv
 * array rather than a shell-parsed command string, so special
 * characters in the title (backtick, `$`, backslash, newline, `"`)
 * cannot be interpreted as shell syntax.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process BEFORE importing the terminal module so the
// module picks up the mocked exports.
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

// Mock fs to avoid accidentally writing to /dev/tty in CI.
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: actual,
    accessSync: vi.fn(() => {
      throw new Error("no tty");
    }),
    writeFileSync: vi.fn(),
  };
});

describe("tmux rename-window safety", () => {
  const originalTmux = process.env.TMUX;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TMUX = "/tmp/tmux-fake,1234,5";
    // Ensure detection helpers see TTY-less env (return null TTY lookups).
    // The module caches TTY detection — we reimport per-test to reset.
    vi.resetModules();
  });

  afterEach(() => {
    if (originalTmux === undefined) {
      delete process.env.TMUX;
    } else {
      process.env.TMUX = originalTmux;
    }
    vi.clearAllMocks();
  });

  test("setTitle uses execFileSync with argv for rename-window (not execSync with a shell string)", async () => {
    const { execFileSync, execSync } = await import("child_process");
    const term = await import("./terminal");

    term._setTitle("boring-title");

    // execSync is still used for benign static tmux queries (display-message
    // for client_tty / pane_tty). What matters is that rename-window is NOT
    // invoked via the shell-parsed execSync path.
    for (const call of vi.mocked(execSync).mock.calls) {
      const first = call[0];
      if (typeof first === "string") {
        expect(first).not.toMatch(/rename-window/);
      }
    }

    // The argv-based path must be used.
    expect(execFileSync).toHaveBeenCalled();
    const renameCall = vi
      .mocked(execFileSync)
      .mock.calls.find(
        (c) =>
          c[0] === "tmux" && Array.isArray(c[1]) && c[1][0] === "rename-window",
      );
    expect(renameCall).toBeDefined();
    expect(renameCall![1]).toEqual(["rename-window", "boring-title"]);
    expect(renameCall![2]).toMatchObject({
      stdio: "ignore",
      timeout: 1000,
    });
  });

  test("title with backtick is passed raw (no shell substitution)", async () => {
    const { execFileSync } = await import("child_process");
    const term = await import("./terminal");
    const risky = "Improve `error` handling";
    term._setTitle(risky);
    expect(execFileSync).toHaveBeenCalled();
    const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
    expect(args[1]).toBe(risky);
  });

  test("title with dollar sign is passed raw", async () => {
    const { execFileSync } = await import("child_process");
    const term = await import("./terminal");
    const risky = "Price $100 feature";
    term._setTitle(risky);
    const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
    expect(args[1]).toBe(risky);
  });

  test("title with backslash is passed raw", async () => {
    const { execFileSync } = await import("child_process");
    const term = await import("./terminal");
    const risky = "Fix C:\\Users\\path";
    term._setTitle(risky);
    const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
    expect(args[1]).toBe(risky);
  });

  test("title with newline is sanitized before rename-window", async () => {
    const { execFileSync } = await import("child_process");
    const term = await import("./terminal");
    const risky = "Feature\nImplementation";
    term._setTitle(risky);
    const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
    expect(args[1]).toBe("Feature Implementation");
  });

  test("title with BEL and ESC is sanitized before rename-window", async () => {
    const { execFileSync } = await import("child_process");
    const term = await import("./terminal");
    term._setTitle("Feature\x07\x1b]2;pwn\x1b\\Implementation");
    const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
    expect(args[1]).toBe("Feature ]2;pwn \\Implementation");
  });

  test("title with double quotes is passed raw", async () => {
    const { execFileSync } = await import("child_process");
    const term = await import("./terminal");
    const risky = `"quoted" title`;
    term._setTitle(risky);
    const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
    expect(args[1]).toBe(risky);
  });

  test("execFileSync failure is caught and does not propagate", async () => {
    const { execFileSync } = await import("child_process");
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("tmux unavailable");
    });
    const term = await import("./terminal");
    expect(() => term._setTitle("whatever")).not.toThrow();
  });
});

describe("terminal title status contract", () => {
  const originalTmux = process.env.TMUX;
  const originalStdoutIsTTY = process.stdout.isTTY;

  const expectNonAudibleTitleSequence = (
    value: unknown,
    expectedTitle: string,
  ): void => {
    const sequence = String(value);
    expect(sequence).toContain(`\x1b]0;${expectedTitle}\x1b\\`);
    expect(sequence).not.toContain(`\x1b]0;${expectedTitle}\x07`);
    expect(sequence).not.toContain("\x07");
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TMUX;
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    vi.resetModules();
  });

  afterEach(() => {
    if (originalTmux === undefined) {
      delete process.env.TMUX;
    } else {
      process.env.TMUX = originalTmux;
    }
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalStdoutIsTTY,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  test("ATTN without active change writes raw project title", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true as never);
    const term = await import("./terminal");

    term.updateTerminalStatus("ATTN", "advance");

    expect(stdoutSpy).toHaveBeenCalled();
    expectNonAudibleTitleSequence(stdoutSpy.mock.calls.at(-1)?.[0], "advance");
  });

  test("WORK with active change writes raw project + raw change title", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true as never);
    const term = await import("./terminal");

    term.updateTerminalStatus("WORK", "advance", "addFeatureX");

    expect(stdoutSpy).toHaveBeenCalled();
    expectNonAudibleTitleSequence(
      stdoutSpy.mock.calls.at(-1)?.[0],
      "advance: addFeatureX",
    );
  });

  test("BLOCKED without active change keeps simple project title", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true as never);
    const term = await import("./terminal");

    term.updateTerminalStatus("BLOCKED", "advance");

    expect(stdoutSpy).toHaveBeenCalled();
    expectNonAudibleTitleSequence(stdoutSpy.mock.calls.at(-1)?.[0], "advance");
  });

  test("title payload BEL is sanitized before OSC output", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true as never);
    const term = await import("./terminal");

    term.updateTerminalStatus("WORK", "adv\x07ance", "addFeatureX");

    expect(stdoutSpy).toHaveBeenCalled();
    expectNonAudibleTitleSequence(
      stdoutSpy.mock.calls.at(-1)?.[0],
      "adv ance: addFeatureX",
    );
  });

  test("title payload ESC is sanitized before OSC output", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true as never);
    const term = await import("./terminal");

    term.updateTerminalStatus("WORK", "adv\x1b]2;pwn\x1b\\ance");

    expect(stdoutSpy).toHaveBeenCalled();
    const sequence = String(stdoutSpy.mock.calls.at(-1)?.[0]);
    expect(sequence).toContain("\x1b]0;adv ]2;pwn \\ance\x1b\\");
    expect(sequence.split("\x1b").length - 1).toBe(2);
  });
});
