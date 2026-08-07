/** Release-gate fail-closed tests for rq-releaseFinalization01. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanupTempDir,
  createTempDir,
  createTempGitWorktree,
} from "../__tests__/setup";
import { gateTools } from "./gate";
import type { Change, Store } from "../types";

const git = vi.hoisted(() => ({
  detectArchiveMode: vi.fn(() => ({ archiveMode: "direct", autoPush: true })),
  resolveRepoRoot: vi.fn((root: string) => root),
  detectDefaultBranch: vi.fn(() => ({
    branch: "trunk",
    source: "local-trunk",
  })),
  classifyFinalizationRoute: vi.fn(() => ({
    route: "direct",
    repo: "owner/repo",
  })),
  resolveReleaseReachability: vi.fn(() => ({
    reachable: false,
    proof: "origin_unmerged",
    details: ["tip not on origin/trunk"],
  })),
  verifyChangeBranchPushed: vi.fn(() => ({
    pushed: false,
    reason: "change branch not pushed",
  })),
}));

vi.mock("./archive-helpers/git-finalize", async () => {
  const actual = await vi.importActual<
    typeof import("./archive-helpers/git-finalize")
  >("./archive-helpers/git-finalize");
  return { ...actual, ...git };
});

function change(overrides: Partial<Change> = {}): Change {
  return {
    id: "release-change",
    title: "Release change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "done" },
      release: { status: "pending" },
    },
    ...overrides,
  } as Change;
}

async function storeFor(root: string, current: Change): Promise<Store> {
  await mkdir(join(root, current.id), { recursive: true });
  await writeFile(
    join(root, current.id, "change.json"),
    JSON.stringify(current),
  );
  return {
    paths: {
      root,
      changes: root,
      archive: join(root, "archive"),
    } as Store["paths"],
    config: {
      archive_mode: "direct",
      auto_push: true,
      features: {},
    } as Store["config"],
    changes: { get: vi.fn(async () => ({ success: true, data: current })) },
    tasks: {},
    specs: {},
    wisdom: {},
    gates: {},
  } as unknown as Store;
}

describe("release gate fail-closed enforcement", () => {
  let cleanupWorktree: (() => Promise<void>) | undefined;
  let restoreCwd: (() => void) | undefined;

  beforeEach(async () => {
    const fixture = await createTempGitWorktree("adv-release-gate-");
    cleanupWorktree = fixture.cleanup;
    // Mutation tools derive their session workdir from process.cwd(). Keep
    // that dependency explicit and isolated from the checkout running Vitest.
    const cwdSpy = vi
      .spyOn(process, "cwd")
      .mockReturnValue(fixture.worktreePath);
    restoreCwd = () => cwdSpy.mockRestore();
  });

  afterEach(async () => {
    restoreCwd?.();
    restoreCwd = undefined;
    await cleanupWorktree?.();
    cleanupWorktree = undefined;
    git.resolveReleaseReachability.mockReturnValue({
      reachable: false,
      proof: "origin_unmerged",
      details: ["tip not on origin/trunk"],
    });
  });

  test("refuses release completion when trunk reachability proof is absent", async () => {
    const root = await createTempDir("adv-release-gate-");
    try {
      const current = change();
      const store = await storeFor(root, current);
      const parsed = JSON.parse(
        await gateTools.adv_gate_complete.execute(
          { changeId: current.id, gateId: "release" },
          store,
        ),
      );
      expect(parsed.success).toBeUndefined();
      expect(parsed.code).toBe("RELEASE_REQUIRES_TRUNK_MERGE");
      expect(parsed.requirement).toBe("rq-releaseFinalization01");
      expect(
        JSON.parse(
          await readFile(join(root, current.id, "change.json"), "utf8"),
        ).gates.release.status,
      ).toBe("pending");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("allows release completion only after durable reachability proof", async () => {
    git.resolveReleaseReachability.mockReturnValue({
      reachable: true,
      proof: "origin_default",
      releasedCommitSha: "released-sha",
    });
    const root = await createTempDir("adv-release-gate-");
    try {
      const current = change({
        phase9_status: {
          status: "done",
          startedAt: "2026-01-01T00:00:00Z",
          completedAt: "2026-01-01T00:00:01Z",
          defaultBranch: "trunk",
          pushStatus: "pushed",
        } as Change["phase9_status"],
      });
      const store = await storeFor(root, current);
      const parsed = JSON.parse(
        await gateTools.adv_gate_complete.execute(
          {
            changeId: current.id,
            gateId: "release",
            notes:
              "Phase 9 finalization shipped; defaultBranch=trunk; pushStatus=pushed",
          },
          store,
        ),
      );
      expect(parsed.success).toBe(true);
      const readback = JSON.parse(
        await readFile(join(root, current.id, "change.json"), "utf8"),
      );
      expect(readback.gates.release.status).toBe("done");
      expect(readback.gates.release.approval_evidence).toContain(
        "proof=origin_default",
      );
      expect(readback.gates.release.approval_evidence).toContain(
        "releasedCommitSha=released-sha",
      );
    } finally {
      git.resolveReleaseReachability.mockReturnValue({
        reachable: false,
        proof: "origin_unmerged",
        details: ["tip not on origin/trunk"],
      });
      await cleanupTempDir(root);
    }
  });

  test("refuses a reachable result that lacks durable commit proof", async () => {
    git.resolveReleaseReachability.mockReturnValue({
      reachable: true,
    } as never);
    const root = await createTempDir("adv-release-gate-");
    try {
      const current = change({
        phase9_status: {
          status: "done",
          startedAt: "2026-01-01T00:00:00Z",
          completedAt: "2026-01-01T00:00:01Z",
          defaultBranch: "trunk",
          pushStatus: "pushed",
        } as Change["phase9_status"],
      });
      const store = await storeFor(root, current);
      const parsed = JSON.parse(
        await gateTools.adv_gate_complete.execute(
          { changeId: current.id, gateId: "release" },
          store,
        ),
      );
      expect(parsed.success).toBeUndefined();
      expect(parsed.code).toBe("RELEASE_REQUIRES_DURABLE_PROOF");
      expect(
        JSON.parse(
          await readFile(join(root, current.id, "change.json"), "utf8"),
        ).gates.release.status,
      ).toBe("pending");
    } finally {
      git.resolveReleaseReachability.mockReturnValue({
        reachable: false,
        proof: "origin_unmerged",
        details: ["tip not on origin/trunk"],
      });
      await cleanupTempDir(root);
    }
  });
});
