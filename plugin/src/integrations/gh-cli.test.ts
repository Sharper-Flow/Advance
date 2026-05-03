/**
 * GH CLI Integration Tests
 *
 * Tests for execGh, detectGhAuth, isGhAvailable, getGhAuthStatus
 * using mocked execFile.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import type { GhExecResult, GhAuthStatus } from "./gh-cli";

// Mock child_process before importing the module under test
const mockExecFile = vi.fn();
vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// Import after mock setup
import {
  execGh,
  detectGhAuth,
  isGhAvailable,
  getGhAuthStatus,
} from "./gh-cli";

function callbackArg(callIndex = 0): (...cbArgs: unknown[]) => void {
  const call = mockExecFile.mock.calls[callIndex];
  if (!call) throw new Error(`No mock call at index ${callIndex}`);
  return call[call.length - 1] as (...cbArgs: unknown[]) => void;
}

describe("execGh", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  test("resolves with stdout on success", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        cb(null, "success output\n", "");
      },
    );

    const result = await execGh(["issue", "list"], "/some/repo");
    expect(result.stdout).toBe("success output\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("passes correct env with GIT_TERMINAL_PROMPT=0", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: Record<string, unknown>,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        expect(opts.env).toHaveProperty("GIT_TERMINAL_PROMPT", "0");
        cb(null, "", "");
      },
    );

    await execGh(["auth", "status"], "/repo");
  });

  test("passes cwd option", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: Record<string, unknown>,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        expect(opts.cwd).toBe("/my/repo");
        cb(null, "", "");
      },
    );

    await execGh(["issue", "list"], "/my/repo");
  });

  test("resolves with stderr and exitCode on failure", async () => {
    const error = new Error("Command failed");
    (error as NodeJS.ErrnoException).code = "1";
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: Error, stdout: string, stderr: string) => void,
      ) => {
        cb(error, "", "error: not authenticated\n");
      },
    );

    const result = await execGh(["auth", "status"], "/repo");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not authenticated");
  });

  test("handles ENOENT when gh is not found", async () => {
    const error = new Error("spawn gh ENOENT");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: Error) => void,
      ) => {
        cb(error);
      },
    );

    const result = await execGh(["issue", "list"], "/repo");
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain("ENOENT");
    expect(result.ghNotFound).toBe(true);
  });

  test("handles timeout", async () => {
    const error = new Error("signal SIGTERM");
    (error as NodeJS.ErrnoException).killed = true;
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: Error) => void,
      ) => {
        cb(error);
      },
    );

    const result = await execGh(["issue", "list"], "/repo");
    expect(result.exitCode).toBe(-1);
    expect(result.timedOut).toBe(true);
  });

  test("captures rate limit headers from stderr", async () => {
    const error = new Error("HTTP 429");
    (error as NodeJS.ErrnoException).code = "1";
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: Error, stdout: string, stderr: string) => void,
      ) => {
        cb(
          error,
          "",
          "gh: HTTP 429: rate limit exceeded (remaining: 0, reset at: 2026-01-01T00:00:00Z)\n",
        );
      },
    );

    const result = await execGh(["issue", "list"], "/repo");
    expect(result.exitCode).toBe(1);
    expect(result.rateLimited).toBe(true);
  });

  test("uses default timeout of 30s", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: Record<string, unknown>,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        expect(opts.timeout).toBe(30_000);
        cb(null, "", "");
      },
    );

    await execGh(["issue", "list"], "/repo");
  });
});

describe("detectGhAuth", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  test("returns authenticated when gh auth status succeeds", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        cb(
          null,
          "",
          "github.com\n  ✓ Logged in to github.com as testuser (oauth_token)\n",
        );
      },
    );

    const status = await detectGhAuth();
    expect(status.authenticated).toBe(true);
    expect(status.username).toBe("testuser");
    expect(status.host).toBe("github.com");
  });

  test("returns not authenticated when auth fails", async () => {
    const error = new Error("exit status 1");
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: Error, stdout: string, stderr: string) => void,
      ) => {
        cb(error, "", "gh: You are not logged in\n");
      },
    );

    const status = await detectGhAuth();
    expect(status.authenticated).toBe(false);
  });

  test("returns unavailable when gh not found", async () => {
    const error = new Error("spawn gh ENOENT");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: Error) => void,
      ) => {
        cb(error);
      },
    );

    const status = await detectGhAuth();
    expect(status.authenticated).toBe(false);
    expect(status.available).toBe(false);
  });
});

describe("isGhAvailable", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  test("returns true when gh --version succeeds", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        cb(null, "gh version 2.42.0 (2024-01-15)\n", "");
      },
    );

    expect(await isGhAvailable()).toBe(true);
  });

  test("returns false when gh not found", async () => {
    const error = new Error("spawn gh ENOENT");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: Error) => void,
      ) => {
        cb(error);
      },
    );

    expect(await isGhAvailable()).toBe(false);
  });
});

describe("getGhAuthStatus", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  test("returns full auth status object", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        cb(
          null,
          "",
          "github.com\n  ✓ Logged in to github.com as myuser (oauth_token)\n",
        );
      },
    );

    const status = await getGhAuthStatus();
    expect(status.available).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(status.username).toBe("myuser");
  });

  test("returns available but unauthenticated", async () => {
    const error = new Error("exit status 1");
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: Error, stdout: string, stderr: string) => void,
      ) => {
        cb(error, "", "You are not logged into any GitHub hosts.\n");
      },
    );

    const status = await getGhAuthStatus();
    expect(status.available).toBe(true);
    expect(status.authenticated).toBe(false);
  });
});
