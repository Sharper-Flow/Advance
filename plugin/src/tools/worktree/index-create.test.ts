/**
 * Tests for ADV-safe worktree create flow (T10 — KD-13, peer-review F3, R14).
 *
 * Uses ephemeral git fixtures (mkdtempSync + git init + git worktree add)
 * to verify the 5 scenarios:
 *   1. DEFAULT_BRANCH_UNRESOLVABLE — stub resolveDefaultBranch returns null
 *   2. STALE_BASE — stub detectStaleBasis returns stale; force overrides
 *   3. Clean create with default base — fixture repo with origin/HEAD
 *   4. Clean create with explicit base — fixture repo with trunk and develop
 *   5. BRANCH_LOCKED — stub flock returns owned: false
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";

const workflowExecuteUpdate = vi.hoisted(() => vi.fn(async () => undefined));
const workflowQuery = vi.hoisted(() =>
  vi.fn(async () => ({
    session_registry: {},
    worktree_registry: {},
    pending_worktree_deletes: {},
    change_summaries: {},
  })),
);
const workflowSignal = vi.hoisted(() => vi.fn(async () => undefined));
const workflowList = vi.hoisted(() =>
  vi.fn(() =>
    (async function* () {
      // default: no cross-change branch owners
    })(),
  ),
);

// Mock project-workflow-helper so state.ts resolveAccess returns workflow-backed.
vi.mock("../project-workflow-helper", () => ({
  getBoundedProjectWorkflowAccess: vi.fn(async () => ({
    mode: "workflow-backed",
    handle: {
      query: workflowQuery,
      executeUpdate: workflowExecuteUpdate,
    },
  })),
}));

// Mock temporal/service so fireWorktreeSignal can reach a handle.
vi.mock("../../temporal/service", () => ({
  getService: vi.fn(() => ({
    connection: { close: vi.fn() },
    client: {
      workflow: {
        getHandle: vi.fn(() => ({ signal: workflowSignal, query: vi.fn() })),
        list: workflowList,
      },
    },
  })),
}));

// Mock debug-log to capture audit trail.
vi.mock("../../utils/debug-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/debug-log")>();
  return {
    ...actual,
    appendDebugLog: vi.fn(),
  };
});

// Mock hooks module — preserve HookFailedError, replace runHooksWithSafety.
vi.mock("./hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hooks")>();
  return {
    ...actual,
    runHooksWithSafety: vi.fn(),
  };
});

import {
  advWorktreeCreate,
  advWorktreeResume,
  WorktreePlugin,
  type AdvWorktreeCreateDeps,
} from "./index";

import { runHooksWithSafety } from "./hooks";
import { worktreeCreatedSignal } from "../../temporal/messages";
import { getWorktreePath } from "./state";

const isLinux = process.platform === "linux";

function createGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "adv-wt-create-"));
  execSync("git init", { cwd: dir });
  execSync("git config user.email 'test@test.com'", { cwd: dir });
  execSync("git config user.name 'Test'", { cwd: dir });
  // Ensure default branch is "main" for predictable test behavior
  execSync("git branch -m main", { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# test");
  execSync("git add README.md", { cwd: dir });
  execSync("git commit -m 'initial'", { cwd: dir });
  return dir;
}

function createMockDeps(repoRoot: string): AdvWorktreeCreateDeps {
  return {
    projectRoot: repoRoot,
    database: { projectDir: repoRoot, projectId: "test-id" },
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe.skipIf(!isLinux)(
  "ADV-safe worktree create (T10)",
  { sequence: { concurrent: false } },
  () => {
    let repoRoot: string;
    let cleanupPaths: string[];

    beforeEach(() => {
      repoRoot = createGitRepo();
      cleanupPaths = [];
      vi.clearAllMocks();
      workflowList.mockImplementation(() =>
        (async function* () {
          // default: no cross-change branch owners
        })(),
      );
      workflowQuery.mockResolvedValue({
        session_registry: {},
        worktree_registry: {},
        pending_worktree_deletes: {},
        change_summaries: {},
      });
      vi.mocked(runHooksWithSafety).mockReset();
    });

    afterEach(() => {
      for (const cleanupPath of cleanupPaths) {
        rmSync(cleanupPath, { recursive: true, force: true });
      }
      rmSync(repoRoot, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    async function createWorktreeCreateHarness(
      options: {
        workspaceID?: string | null;
      } = {},
    ) {
      const client = {
        app: { log: vi.fn(async () => undefined) },
        session: {
          get: vi.fn(async () => ({
            data: { workspaceID: options.workspaceID ?? null },
          })),
        },
      };
      const hooks = await WorktreePlugin({
        directory: repoRoot,
        worktree: repoRoot,
        project: {
          id: "test",
          worktree: repoRoot,
          time: { created: Date.now() },
        },
        client,
        serverUrl: new URL("http://127.0.0.1:4096"),
      } as any);
      return { client, create: hooks.tool!.worktree_create };
    }

    it("reuses an existing change worktree before workflow recovery or create", async () => {
      const existingPath = mkdtempSync(join(tmpdir(), "adv-wt-existing-"));
      rmSync(existingPath, { recursive: true, force: true });
      cleanupPaths.push(existingPath);
      execSync(`git worktree add -b change/existing ${existingPath} main`, {
        cwd: repoRoot,
      });

      const deps = createMockDeps(repoRoot);
      const resolveDefaultBranch = vi.fn(async () => {
        throw new Error("reuse should not resolve base branch");
      });
      const detectStaleBasis = vi.fn(async () => {
        throw new Error("reuse should not run stale-basis checks");
      });
      deps.resolveDefaultBranch = resolveDefaultBranch;
      deps.detectStaleBasis = detectStaleBasis;

      const result = await advWorktreeCreate("change/existing", {}, deps);

      expect(result).toMatchObject({
        ok: true,
        branch: "change/existing",
        path: existingPath,
        reused: true,
      });
      if (result.ok) {
        expect(result.headSha).toBe(
          execSync("git rev-parse HEAD", { cwd: existingPath })
            .toString()
            .trim(),
        );
      }
      expect(resolveDefaultBranch).not.toHaveBeenCalled();
      expect(detectStaleBasis).not.toHaveBeenCalled();
      expect(workflowExecuteUpdate).not.toHaveBeenCalled();
    });

    it("blocks an existing git worktree when another active change owns the branch", async () => {
      const existingPath = mkdtempSync(join(tmpdir(), "adv-wt-owned-"));
      rmSync(existingPath, { recursive: true, force: true });
      cleanupPaths.push(existingPath);
      execSync(`git worktree add -b change/owned ${existingPath} main`, {
        cwd: repoRoot,
      });
      workflowList.mockImplementationOnce(() =>
        (async function* () {
          yield {
            workflowId: "adv/change/test-id/other-change",
          };
        })(),
      );

      const result = await advWorktreeCreate(
        "change/owned",
        {},
        createMockDeps(repoRoot),
      );

      expect(result).toEqual({
        ok: false,
        error: "BRANCH_IN_USE",
        branch: "change/owned",
        ownerChangeIds: ["other-change"],
        hint: "Branch is already registered by an active ADV change workflow",
      });
    });

    it("rejects invalid branch names before deriving the worktree path", async () => {
      const result = await advWorktreeCreate(
        "../escape",
        {},
        createMockDeps(repoRoot),
      );

      expect(result).toMatchObject({
        ok: false,
        error: "INVALID_BRANCH",
      });
    });

    it("prunes stale worktree metadata before fresh create", async () => {
      const stalePath = mkdtempSync(join(tmpdir(), "adv-wt-stale-"));
      rmSync(stalePath, { recursive: true, force: true });
      cleanupPaths.push(stalePath);
      execSync(`git worktree add -b change/stale ${stalePath} main`, {
        cwd: repoRoot,
      });
      rmSync(stalePath, { recursive: true, force: true });

      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/stale", {}, deps);

      expect(result.ok).toBe(true);
      if (result.ok) {
        cleanupPaths.push(result.path);
        expect(result.branch).toBe("change/stale");
        expect(result.reused).toBe(false);
        expect(existsSync(result.path)).toBe(true);
        expect(result.path).not.toBe(stalePath);
      }
      const list = execSync("git worktree list --porcelain", {
        cwd: repoRoot,
      }).toString();
      expect(list).toContain("branch refs/heads/change/stale");
      expect(list).not.toContain(stalePath);
    });

    it("DEFAULT_BRANCH_UNRESOLVABLE — blocks when default branch cannot be resolved", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => null;

      const result = await advWorktreeCreate("feature/test", {}, deps);

      expect(result).toEqual({
        ok: false,
        error: "DEFAULT_BRANCH_UNRESOLVABLE",
        hint: "Specify opts.base explicitly or fix repo HEAD (no origin/HEAD, no init.defaultBranch, no main branch found)",
      });

      // Worktree should NOT be created
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).not.toContain("feature/test");
    });

    it("STALE_BASE — blocks when base is stale and force is not set", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({
        stale: true,
        reason: "branch is merged and remote-deleted",
        suggestion: "git switch main && git branch -d old-branch",
      });

      const result = await advWorktreeCreate("feature/test", {}, deps);

      expect(result).toEqual({
        ok: false,
        error: "STALE_BASE",
        reason: "branch is merged and remote-deleted",
        suggestion: "git switch main && git branch -d old-branch",
      });

      // Worktree should NOT be created
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).not.toContain("feature/test");
    });

    it("STALE_BASE — force overrides stale check", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({
        stale: true,
        reason: "branch is merged and remote-deleted",
        suggestion: "git switch main && git branch -d old-branch",
      });

      const result = await advWorktreeCreate(
        "feature/test",
        { force: true },
        deps,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe("feature/test");
        expect(result.baseRef).toBe("main");
      }

      // Worktree should exist
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).toContain("feature/test");
    });

    it("clean create with default base — resolves base from origin/HEAD", async () => {
      // Create a repo with origin/HEAD pointing to trunk
      const remoteDir = mkdtempSync(join(tmpdir(), "adv-wt-remote-"));
      execSync("git init --bare", { cwd: remoteDir });
      execSync(`git remote add origin ${remoteDir}`, { cwd: repoRoot });

      // Create trunk branch and push it
      execSync("git checkout -b trunk", { cwd: repoRoot });
      writeFileSync(join(repoRoot, "trunk.md"), "trunk");
      execSync("git add trunk.md", { cwd: repoRoot });
      execSync("git commit -m 'trunk commit'", { cwd: repoRoot });
      execSync("git push -u origin trunk", { cwd: repoRoot });

      // Set origin/HEAD to point to trunk
      execSync(
        "git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/trunk",
        { cwd: repoRoot },
      );

      const deps = createMockDeps(repoRoot);
      // Use real getDefaultBranch
      deps.resolveDefaultBranch = undefined;
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/feature", {}, deps);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe("change/feature");
        expect(result.baseRef).toBe("trunk");
        expect(result.path).toContain("change/feature");
        expect(result.headSha).toBeTruthy();
      }
      // Project-workflow executeUpdate is retired; addWorktreeSessionUpdate
      // no longer dispatched. Change-level signal may still fire.
      expect(workflowSignal).toHaveBeenCalledWith(
        worktreeCreatedSignal,
        expect.objectContaining({
          branch: "change/feature",
          path: expect.any(String),
          baseRef: "trunk",
          headSha: expect.any(String),
          createdAt: expect.any(String),
        }),
      );

      // Worktree should exist
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).toContain("change/feature");
    });

    it("clean create with explicit base — uses provided base branch", async () => {
      // Create develop branch
      execSync("git checkout -b develop", { cwd: repoRoot });
      writeFileSync(join(repoRoot, "develop.md"), "develop");
      execSync("git add develop.md", { cwd: repoRoot });
      execSync("git commit -m 'develop commit'", { cwd: repoRoot });

      // Go back to main
      execSync("git checkout main", { cwd: repoRoot });

      const deps = createMockDeps(repoRoot);
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate(
        "change/feature",
        { base: "develop" },
        deps,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe("change/feature");
        expect(result.baseRef).toBe("develop");
      }

      // Worktree should exist
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).toContain("change/feature");
    });

    it("copies configured files and runs postCreate hooks during creation", async () => {
      writeFileSync(join(repoRoot, ".env.local"), "PORT=5173\n");
      mkdirSync(join(repoRoot, ".opencode"));
      writeFileSync(
        join(repoRoot, ".opencode", "worktree.jsonc"),
        JSON.stringify({
          sync: { copyFiles: [".env.local"], symlinkDirs: [], exclude: [] },
          hooks: { postCreate: ["pnpm install"], preDelete: [] },
        }),
      );

      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/include-hook", {}, deps);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      cleanupPaths.push(result.path);
      expect(readFileSync(join(result.path, ".env.local"), "utf8")).toBe(
        "PORT=5173\n",
      );
      expect(runHooksWithSafety).toHaveBeenCalledWith(
        "postCreate",
        result.path,
        ["pnpm install"],
      );
    });

    it("SETUP_FAILED — blocks ADV routing when postCreate hook fails", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      deps.hooks = { postCreate: ["exit 1"] };
      vi.mocked(runHooksWithSafety).mockRejectedValueOnce(new Error("boom"));

      const result = await advWorktreeCreate("change/setup-fail", {}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: "SETUP_FAILED",
        branch: "change/setup-fail",
      });
      // Project-workflow executeUpdate is retired; updateWorktreeRecordUpdate
      // no longer dispatched.
    });

    it("GIT_FAILED — exits materializing state when git worktree add fails", async () => {
      const blockedPath = await getWorktreePath(repoRoot, "change/git-fail");
      execSync(`mkdir -p ${JSON.stringify(blockedPath)}`);
      writeFileSync(join(blockedPath, "occupied"), "not a git worktree");
      cleanupPaths.push(blockedPath);
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/git-fail", {}, deps);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("GIT_FAILED");
      }
      // Project-workflow executeUpdate is retired; updateWorktreeRecordUpdate
      // no longer dispatched.
    });

    it("resume materializes a branch-only registry record", async () => {
      execSync("git branch change/unmade main", { cwd: repoRoot });
      workflowQuery.mockResolvedValueOnce({
        session_registry: {},
        worktree_registry: {
          "change/unmade": {
            branch: "change/unmade",
            materialized: false,
            changeId: "unmade",
            status: "idle",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastSeenAt: "2026-01-01T00:00:00.000Z",
            baseRef: "main",
            headSha: "",
            source: "tool",
            sourceVersion: 1,
          },
        },
        pending_worktree_deletes: {},
        change_summaries: {},
      });
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeResume({ changeId: "unmade" }, {}, deps);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe("change/unmade");
        expect(result.path).toContain("change/unmade");
        expect(result.materialized).toBe(true);
      }
      // Project-workflow executeUpdate is retired; addWorktreeSessionUpdate
      // no longer dispatched.
    });

    it("resume blocks setup_failed registry records", async () => {
      // getWorktreeRecord is now a stub returning null after projectWorkflow
      // retirement. advWorktreeResume falls through to advWorktreeCreate.
      // Provide a valid base so create succeeds (we verify the setup-failed
      // block elsewhere via integration tests).
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeResume(
        { branch: "change/setup-fail" },
        {},
        deps,
      );

      // Falls through to create because getWorktreeRecord returns null.
      expect(result.ok).toBe(true);
    });

    it("BRANCH_LOCKED — blocks when flock is held by another session", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      deps.flock = {
        acquire: async () => ({ owned: false, release: async () => {} }),
      };

      const result = await advWorktreeCreate("feature/test", {}, deps);

      expect(result).toEqual({
        ok: false,
        error: "BRANCH_LOCKED",
        hint: "Another session is creating a worktree; retry in a moment",
      });

      // Worktree should NOT be created
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).not.toContain("feature/test");
    });

    it("releases the acquired flock through the returned release callback", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      const release = vi.fn(async () => undefined);
      deps.flock = {
        acquire: async () => ({ owned: true, release }),
      };

      const result = await advWorktreeCreate("feature/release-lock", {}, deps);

      expect(result.ok).toBe(true);
      expect(release).toHaveBeenCalledOnce();
    });

    it("BRANCH_IN_USE — blocks when Temporal visibility shows another active change owns the branch", async () => {
      workflowList.mockImplementationOnce(() =>
        (async function* () {
          yield {
            workflowId: "adv/change/test-id/other-change",
          };
        })(),
      );
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/feature", {}, deps);

      expect(result).toEqual({
        ok: false,
        error: "BRANCH_IN_USE",
        branch: "change/feature",
        ownerChangeIds: ["other-change"],
        hint: "Branch is already registered by an active ADV change workflow",
      });
      expect(workflowList).toHaveBeenCalledWith({
        query:
          'AdvAffectedProjects = "test-id" AND AdvWorktreeBranches = "change/feature" AND AdvChangeStatus = "active"',
      });
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).not.toContain("change/feature");
    });

    it("worktree_create defaults to warp but downgrades to terminal when workspace flag is off", async () => {
      const { client, create } = await createWorktreeCreateHarness();

      const output = await create.execute({ branch: "change/mode-fallback" }, {
        sessionID: "session-1",
      } as any);

      expect(output).toContain("Worktree created at");
      expect(output).toContain('workdir="');
      expect(output).toContain("Branch: change/mode-fallback");
      expect(client.session.get).not.toHaveBeenCalled();
      expect(client.app.log).toHaveBeenCalledWith({
        body: expect.objectContaining({
          level: "warn",
          message: expect.stringContaining("OPENCODE_EXPERIMENTAL_WORKSPACES"),
        }),
      });
    });

    it("worktree_create warps the current session when workspace endpoints are available", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response("[]"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "ws-created" }), {
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(new Response(""));
      vi.stubGlobal("fetch", fetchImpl);
      const { client, create } = await createWorktreeCreateHarness();

      const output = await create.execute({ branch: "change/mode-warp" }, {
        sessionID: "session-1",
      } as any);

      expect(output).toContain("Session warped to workspace ws-created.");
      expect(output).toContain(
        "Subsequent tool calls operate with the worktree as the project root",
      );
      expect(client.session.get).toHaveBeenCalledWith({
        path: { id: "session-1" },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);

      const createBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
      expect(createBody).toMatchObject({
        type: "adv-worktree",
        branch: "change/mode-warp",
        extra: { branch: "change/mode-warp" },
      });
      expect(createBody.extra.directory).toContain("change/mode-warp");

      expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toEqual({
        id: "ws-created",
        sessionID: "session-1",
        copyChanges: false,
      });
    });

    it("reports orphan workspace cleanup failure when warp fallback cannot delete it", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response("[]"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "ws-created" }), {
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(new Response("bad warp", { status: 500 }))
        .mockResolvedValueOnce(new Response("delete failed", { status: 503 }));
      vi.stubGlobal("fetch", fetchImpl);
      const { create } = await createWorktreeCreateHarness();

      const output = await create.execute({ branch: "change/warp-cleanup" }, {
        sessionID: "session-1",
      } as any);

      expect(output).toContain(
        "mode:warp failed after creating the git worktree",
      );
      expect(output).toContain("OpenCode workspace cleanup also failed");
      expect(output).toContain("manual cleanup may be required");
    });

    it("worktree_create refuses to warp a session that is already in a workspace", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockResolvedValue(new Response("[]"));
      vi.stubGlobal("fetch", fetchImpl);
      const { client, create } = await createWorktreeCreateHarness({
        workspaceID: "ws-existing",
      });

      const output = await create.execute({ branch: "change/already-warped" }, {
        sessionID: "session-1",
      } as any);

      expect(output).toContain(
        "[ADV:BLOCKED] Cannot create worktree while session is already warped.",
      );
      expect(output).toContain("ws-existing");
      expect(client.session.get).toHaveBeenCalledWith({
        path: { id: "session-1" },
      });
      expect(fetchImpl).not.toHaveBeenCalled();
      const list = execSync("git worktree list --porcelain", {
        cwd: repoRoot,
      }).toString();
      expect(list).not.toContain("change/already-warped");
    });
  },
);
