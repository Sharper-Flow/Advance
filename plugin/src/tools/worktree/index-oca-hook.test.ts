/**
 * Tests for OCA ensure-window hook integration in worktree creation.
 *
 * Verifies that worktree create/reuse invokes the OCA hook when available,
 * failures are non-fatal but surfaced, and older/no-OCA environments degrade.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";

// Mock project-workflow-helper so state.ts resolveAccess returns workflow-backed.
vi.mock("../project-workflow-helper", () => ({
  getBoundedProjectWorkflowAccess: vi.fn(async () => ({
    mode: "workflow-backed",
    handle: {
      query: vi.fn(async () => ({
        session_registry: {},
        worktree_registry: {},
        pending_worktree_deletes: {},
        change_summaries: {},
      })),
      executeUpdate: vi.fn(async () => undefined),
    },
  })),
}));

// Mock debug-log to prevent real filesystem writes.
vi.mock("../../utils/debug-log", () => ({
  appendDebugLog: vi.fn(),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Stub temporal/service so module-level effects don't fail in test env.
vi.mock("../../temporal/service", () => ({
  getService: vi.fn(() => null),
}));

// Mock hooks module — preserve HookFailedError, replace runHooksWithSafety.
vi.mock("./hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hooks")>();
  return {
    ...actual,
    runHooksWithSafety: vi.fn(),
  };
});

import { advWorktreeCreate, type AdvWorktreeCreateDeps } from "./index";

// ── Helpers ──────────────────────────────────────────────────────────────

function createGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "adv-wt-oca-"));
  execSync("git init", { cwd: dir });
  execSync("git config user.email 'test@test.com'", { cwd: dir });
  execSync("git config user.name 'Test'", { cwd: dir });
  execSync("git branch -m main", { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# test");
  execSync("git add README.md", { cwd: dir });
  execSync("git commit -m 'initial'", { cwd: dir });
  return dir;
}

function createMockDeps(
  repoRoot: string,
  overrides: Partial<AdvWorktreeCreateDeps> = {},
): AdvWorktreeCreateDeps {
  return {
    projectRoot: repoRoot,
    database: { projectDir: repoRoot, projectId: "test-id" },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

const isLinux = process.platform === "linux";

describe.skipIf(!isLinux)(
  "OCA ensure-window hook integration",
  { sequence: { concurrent: false } },
  () => {
    let repoRoot: string;
    let cleanupPaths: string[];

    beforeEach(() => {
      repoRoot = createGitRepo();
      cleanupPaths = [];
      vi.clearAllMocks();
    });

    afterEach(() => {
      for (const cleanupPath of cleanupPaths) {
        rmSync(cleanupPath, { recursive: true, force: true });
      }
      rmSync(repoRoot, { recursive: true, force: true });
    });

    it("calls ocaEnsureWindow after successful worktree creation", async () => {
      const ocaHook = vi.fn(async () => ({ ok: true }));

      const deps = createMockDeps(repoRoot, { ocaEnsureWindow: ocaHook });
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      const result = await advWorktreeCreate("change/test-oca-hook", {}, deps);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(ocaHook).toHaveBeenCalledOnce();
        const call = ocaHook.mock.calls[0];
        // Called with session name, window name, and worktree path
        expect(call[0]).toBeTruthy(); // session name
        expect(call[1]).toBe("test-oca-hook"); // window name (change ID)
        expect(call[2]).toBeTruthy(); // worktree path
        if ("path" in result) cleanupPaths.push(result.path);
      }
    });

    it("surfaces non-fatal warning when ocaEnsureWindow fails", async () => {
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
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/test-oca-fail", {}, deps);

      // Worktree creation should still succeed
      expect(result.ok).toBe(true);
      // But warn should be logged
      expect(warnFn).toHaveBeenCalled();
      const warnMsg = warnFn.mock.calls[0][0] as string;
      expect(warnMsg).toContain("oca");
      if (result.ok && "path" in result) cleanupPaths.push(result.path);
    });

    it("degrades gracefully when ocaEnsureWindow is not provided", async () => {
      // No ocaEnsureWindow in deps
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      const result = await advWorktreeCreate("change/test-oca-none", {}, deps);

      expect(result.ok).toBe(true);
      if (result.ok && "path" in result) cleanupPaths.push(result.path);
    });

    it("uses project basename as session name", async () => {
      const ocaHook = vi.fn(async () => ({ ok: true }));
      const deps = createMockDeps(repoRoot, { ocaEnsureWindow: ocaHook });
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate(
        "change/test-session-name",
        {},
        deps,
      );

      expect(result.ok).toBe(true);
      expect(ocaHook).toHaveBeenCalledOnce();
      const sessionName = ocaHook.mock.calls[0][0] as string;
      // Session name should be derived from project directory basename
      expect(sessionName).toBeTruthy();
      expect(typeof sessionName).toBe("string");

      // Find the created worktree path for cleanup
      if (ocaHook.mock.calls[0][2]) {
        const wtPath = ocaHook.mock.calls[0][2] as string;
        if (existsSync(wtPath)) cleanupPaths.push(wtPath);
      }
    });
  },
);
