/**
 * Tests for worktree migration (T8).
 *
 * 4 scenarios:
 * 1. Synthetic SQLite fixture → migration + backup
 * 2. Idempotent re-run → no-op
 * 3. Disk-with-no-registry adoption
 * 4. Project workflow missing → rethrow
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import {
  assertProjectWorkflowReachable,
  WorkflowNotReadyError,
} from "../../temporal/contracts";
import * as migration from "./migration";

// =============================================================================
// Mocks
// =============================================================================

const executeUpdate = vi.fn(async () => undefined);
const query = vi.fn(async () => ({}));

const mockHandle = {
  query,
  executeUpdate,
};

vi.mock("../project-workflow-helper", () => ({
  getBoundedProjectWorkflowAccess: vi.fn(async () => ({
    mode: "workflow-backed",
    handle: mockHandle,
  })),
}));

vi.mock("./state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./state")>();
  return {
    ...actual,
    initStateDb: vi.fn(),
    listWorktrees: vi.fn(),
    listSessions: vi.fn(),
    addSession: vi.fn(),
    unregisterSession: vi.fn(),
  };
});

vi.mock("../session/index", () => ({
  isPidAlive: vi.fn(() => true),
}));

vi.mock("../../temporal/contracts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../temporal/contracts")>();
  return {
    ...actual,
    assertProjectWorkflowReachable: vi.fn(),
  };
});

vi.mock("bun:sqlite", () => ({
  Database: class MockDatabase {
    constructor() {}
    query() {
      return {
        all: () => [
          {
            id: "sess1",
            branch: "change/test1",
            path: "/wt1",
            createdAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "sess2",
            branch: "change/test2",
            path: "/wt2",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      };
    }
  },
}));

import {
  initStateDb,
  listWorktrees,
  listSessions,
  addSession,
  unregisterSession,
} from "./state";
import { isPidAlive } from "../session/index";

// =============================================================================
// Helpers
// =============================================================================

function setupInitStateDb(projectId = "test-project-id") {
  vi.mocked(initStateDb).mockResolvedValue({
    projectDir: "/test/project",
    projectId,
  });
}

function createGitRepo(dir: string) {
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  writeFileSync(join(dir, "a"), "a");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
}

// =============================================================================
// Tests
// =============================================================================

describe("migrateAndReconcile (T8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInitStateDb();
    vi.mocked(listWorktrees).mockResolvedValue([]);
    vi.mocked(listSessions).mockResolvedValue([]);
    vi.mocked(addSession).mockResolvedValue(undefined);
    vi.mocked(unregisterSession).mockResolvedValue(undefined);
    vi.mocked(isPidAlive).mockReturnValue(true);
    vi.mocked(assertProjectWorkflowReachable).mockImplementation(() => {
      // no-op
    });
  });

  it("migrates legacy SQLite rows and creates backup", async () => {
    const tmpDir = join(process.cwd(), "tmp-test-sqlite-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    createGitRepo(tmpDir);

    const oldHome = process.env.HOME;
    process.env.HOME = tmpDir;

    try {
      // Create legacy SQLite path
      const legacyDir = join(
        tmpDir,
        ".local",
        "share",
        "opencode",
        "plugins",
        "worktree",
      );
      mkdirSync(legacyDir, { recursive: true });
      const sqlitePath = join(legacyDir, "test-project-id.sqlite");
      writeFileSync(sqlitePath, "dummy-sqlite-data");

      const result = await migration.migrateAndReconcile(tmpDir);

      expect(result.sqlite.found).toBe(true);
      expect(result.sqlite.migratedRows).toBe(2);
      expect(result.sqlite.backupPath).toBe(`${sqlitePath}.bak`);
      expect(existsSync(sqlitePath)).toBe(false);
      expect(existsSync(`${sqlitePath}.bak`)).toBe(true);
      expect(addSession).toHaveBeenCalledTimes(2);
      expect(addSession).toHaveBeenNthCalledWith(
        1,
        { projectDir: "/test/project", projectId: "test-project-id" },
        { sessionId: "sess1", branch: "change/test1", path: "/wt1" },
      );
      expect(addSession).toHaveBeenNthCalledWith(
        2,
        { projectDir: "/test/project", projectId: "test-project-id" },
        { sessionId: "sess2", branch: "change/test2", path: "/wt2" },
      );
    } finally {
      process.env.HOME = oldHome;
      // Cleanup
      try {
        execFileSync("rm", ["-rf", tmpDir]);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("is idempotent on second run", async () => {
    const tmpDir = join(process.cwd(), "tmp-test-idempotent-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    createGitRepo(tmpDir);

    const oldHome = process.env.HOME;
    process.env.HOME = tmpDir;

    try {
      const legacyDir = join(
        tmpDir,
        ".local",
        "share",
        "opencode",
        "plugins",
        "worktree",
      );
      mkdirSync(legacyDir, { recursive: true });
      const sqlitePath = join(legacyDir, "test-project-id.sqlite");
      writeFileSync(sqlitePath, "dummy-sqlite-data");

      // First run
      const result1 = await migration.migrateAndReconcile(tmpDir);
      expect(result1.sqlite.migratedRows).toBe(2);
      expect(addSession).toHaveBeenCalledTimes(2);

      vi.clearAllMocks();
      setupInitStateDb();

      // Second run — .bak exists
      const result2 = await migration.migrateAndReconcile(tmpDir);
      expect(result2.sqlite.found).toBe(true);
      expect(result2.sqlite.skippedReason).toBe("backup_already_exists");
      expect(result2.sqlite.migratedRows).toBeUndefined();
      expect(addSession).not.toHaveBeenCalled();
    } finally {
      process.env.HOME = oldHome;
      try {
        execFileSync("rm", ["-rf", tmpDir]);
      } catch {
        // ignore
      }
    }
  });

  it("adopts disk worktrees not in registry", async () => {
    const tmpDir = join(process.cwd(), "tmp-test-adopt-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });

    const oldHome = process.env.HOME;
    process.env.HOME = tmpDir;

    try {
      // Create a real git repo with a worktree
      createGitRepo(tmpDir);
      const worktreePath = join(tmpDir, "wt-orphan");
      execFileSync(
        "git",
        ["worktree", "add", "-b", "change/orphan", worktreePath],
        { cwd: tmpDir },
      );

      vi.mocked(listWorktrees).mockResolvedValue([]);

      const result = await migration.migrateAndReconcile(tmpDir);

      expect(result.reconciliation.adopted.length).toBe(1);
      expect(result.reconciliation.adopted[0].branch).toBe("change/orphan");
      expect(result.reconciliation.adopted[0].path).toBe(worktreePath);
    } finally {
      process.env.HOME = oldHome;
      try {
        execFileSync("rm", ["-rf", tmpDir]);
      } catch {
        // ignore
      }
    }
  });

  it("rethrows WorkflowNotReadyError when project workflow is missing", async () => {
    vi.mocked(assertProjectWorkflowReachable).mockImplementation(() => {
      throw new WorkflowNotReadyError(["worktree_registry"]);
    });

    await expect(
      migration.migrateAndReconcile("/test/project"),
    ).rejects.toThrow(WorkflowNotReadyError);

    expect(addSession).not.toHaveBeenCalled();
  });

  it("dryRun skips all writes but populates result fields", async () => {
    const tmpDir = join(process.cwd(), "tmp-test-dryrun-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    createGitRepo(tmpDir);

    const oldHome = process.env.HOME;
    process.env.HOME = tmpDir;

    try {
      const legacyDir = join(
        tmpDir,
        ".local",
        "share",
        "opencode",
        "plugins",
        "worktree",
      );
      mkdirSync(legacyDir, { recursive: true });
      const sqlitePath = join(legacyDir, "test-project-id.sqlite");
      writeFileSync(sqlitePath, "dummy-sqlite-data");

      // Create git repo with orphan worktree
      createGitRepo(tmpDir);
      const worktreePath = join(tmpDir, "wt-orphan");
      execFileSync(
        "git",
        ["worktree", "add", "-b", "change/orphan", worktreePath],
        { cwd: tmpDir },
      );

      vi.mocked(listWorktrees).mockResolvedValue([]);
      vi.mocked(listSessions).mockResolvedValue([
        {
          sessionId: "sess_dead",
          pid: 99999,
          startedAt: "2026-01-01T00:00:00Z",
          lastSeenAt: "2026-01-01T00:00:00Z",
          worktreePath: "/some/path",
        } as any,
      ]);
      vi.mocked(isPidAlive).mockReturnValue(false);

      const result = await migration.migrateAndReconcile(tmpDir, {
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.sqlite.migratedRows).toBe(2);
      expect(result.reconciliation.adopted.length).toBe(1);
      expect(result.staleSessionsSwept.length).toBe(1);

      // Writes should be skipped
      expect(addSession).not.toHaveBeenCalled();
      expect(unregisterSession).not.toHaveBeenCalled();
      expect(existsSync(sqlitePath)).toBe(true);
      expect(existsSync(`${sqlitePath}.bak`)).toBe(false);
    } finally {
      process.env.HOME = oldHome;
      try {
        execFileSync("rm", ["-rf", tmpDir]);
      } catch {
        // ignore
      }
    }
  });
});

describe("parseGitWorktreeList", () => {
  it("parses porcelain output with branches", async () => {
    const tmpDir = join(process.cwd(), "tmp-test-porcelain-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    createGitRepo(tmpDir);

    try {
      const worktrees = await migration.parseGitWorktreeList(tmpDir);
      expect(worktrees.length).toBeGreaterThanOrEqual(1);
      expect(worktrees[0]).toHaveProperty("path");
      expect(worktrees[0]).toHaveProperty("branch");
    } finally {
      try {
        execFileSync("rm", ["-rf", tmpDir]);
      } catch {
        // ignore
      }
    }
  });
});
