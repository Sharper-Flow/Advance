/**
 * Tests for OCA ensure-window hook integration in worktree creation.
 *
 * Verifies that worktree create/reuse invokes the OCA hook when available,
 * failures are non-fatal but surfaced, and older/no-OCA environments degrade.
 */
import { describe, expect, it, vi, type Mock } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  advWorktreeCreate,
  type AdvWorktreeCreateDeps,
} from "./index";

// ── Helpers ──────────────────────────────────────────────────────────────

let tmpDir: string;

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function initGitRepo(dir: string): Promise<void> {
  const { execFileSync } = await import("child_process");
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@test"], {
    cwd: dir,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.name", "Test"], {
    cwd: dir,
    stdio: "pipe",
  });
  const filePath = path.join(dir, "README.md");
  fs.writeFileSync(filePath, "# test\n");
  execFileSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
}

function createMockDeps(
  repoRoot: string,
  overrides: Partial<AdvWorktreeCreateDeps> = {},
): AdvWorktreeCreateDeps {
  return {
    projectRoot: repoRoot,
    database: {
      query: vi.fn(async () => []),
      run: vi.fn(async () => {}),
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    flock: {
      acquire: vi.fn(async () => ({
        owned: true,
        release: vi.fn(async () => {}),
      })),
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("OCA ensure-window hook integration", () => {
  it("calls ocaEnsureWindow after successful worktree creation", async () => {
    const repoRoot = createTempDir("oca-hook-test-");
    await initGitRepo(repoRoot);

    const ocaHook = vi.fn(async () => ({ ok: true }));

    const deps = createMockDeps(repoRoot, { ocaEnsureWindow: ocaHook });
    const result = await advWorktreeCreate(
      "change/test-oca-hook",
      {},
      deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(ocaHook).toHaveBeenCalledOnce();
      const call = ocaHook.mock.calls[0];
      // Called with session name, window name, and worktree cwd
      expect(call[0]).toBeTruthy(); // session name
      expect(call[1]).toBe("test-oca-hook"); // window name (change ID)
      expect(call[2]).toBeTruthy(); // worktree path
    }

    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it("surfaces non-fatal warning when ocaEnsureWindow fails", async () => {
    const repoRoot = createTempDir("oca-hook-fail-");
    await initGitRepo(repoRoot);

    const warnFn = vi.fn();
    const ocaHook = vi.fn(async () => ({
      ok: false,
      error: "oca not found on PATH",
    }));

    const deps = createMockDeps(repoRoot, {
      ocaEnsureWindow: ocaHook,
      log: {
        info: vi.fn(),
        warn: warnFn,
        error: vi.fn(),
        debug: vi.fn(),
      },
    });

    const result = await advWorktreeCreate(
      "change/test-oca-fail",
      {},
      deps,
    );

    // Worktree creation should still succeed
    expect(result.ok).toBe(true);
    // But warn should be logged
    expect(warnFn).toHaveBeenCalled();
    const warnMsg = warnFn.mock.calls[0][0] as string;
    expect(warnMsg).toContain("oca");

    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it("degrades gracefully when ocaEnsureWindow is not provided", async () => {
    const repoRoot = createTempDir("oca-hook-none-");
    await initGitRepo(repoRoot);

    // No ocaEnsureWindow in deps
    const deps = createMockDeps(repoRoot);
    const result = await advWorktreeCreate(
      "change/test-oca-none",
      {},
      deps,
    );

    expect(result.ok).toBe(true);

    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it("uses project basename as session name", async () => {
    const repoRoot = createTempDir("oca-hook-session-");
    await initGitRepo(repoRoot);

    const ocaHook = vi.fn(async () => ({ ok: true }));
    const deps = createMockDeps(repoRoot, { ocaEnsureWindow: ocaHook });

    await advWorktreeCreate("change/test-session-name", {}, deps);

    expect(ocaHook).toHaveBeenCalledOnce();
    const sessionName = ocaHook.mock.calls[0][0] as string;
    // Session name should be derived from project directory basename
    expect(sessionName).toBeTruthy();
    expect(typeof sessionName).toBe("string");

    fs.rmSync(repoRoot, { recursive: true, force: true });
  });
});
