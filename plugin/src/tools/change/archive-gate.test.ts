/** Disk-only archive release-gate verification. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Store } from "../../storage/store";
import type { Change, Gates } from "../../types";
import {
  buildReleaseCompletionEvidence,
  completeMergedArchiveReplay,
  detectMergedArchiveReplay,
  getArchiveGatePreflightError,
  resolveArchiveGateState,
  verifyReleaseGateDurableForArchive,
} from "./archive-gate";
import { PROJECTION_DOCUMENT_BYTE_LIMIT } from "../../storage/change-projection-reader";

const archiveMocks = vi.hoisted(() => ({
  refreshArchiveBundleProjectionUnderLock: vi.fn(),
}));

vi.mock("../../archive/archive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../archive/archive")>();
  return {
    ...actual,
    refreshArchiveBundleProjectionUnderLock:
      archiveMocks.refreshArchiveBundleProjectionUnderLock,
  };
});

const gateDone = {
  status: "done" as const,
  completed_at: "2026-01-01T00:00:00Z",
  completed_by: "tester",
  approval_evidence: "release evidence",
};

function makeChange(status: Change["status"] = "active"): Change {
  const gates: Gates = {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "done" },
    execution: { status: "done" },
    acceptance: { status: "done" },
    release: gateDone,
  };
  return {
    id: "example",
    title: "Example",
    status,
    created_at: "2026-01-01T00:00:00Z",
    created_by: "tester",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates,
  };
}

function makeStore(changesDir: string, gates: Gates): Store {
  return {
    paths: { root: changesDir, changes: changesDir, archive: changesDir },
    gates: { get: vi.fn(async () => gates) },
    changes: { invalidate: vi.fn(async () => undefined) },
  } as unknown as Store;
}

async function writeDiskChange(
  changesDir: string,
  change: Change,
): Promise<void> {
  const dir = join(changesDir, change.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "change.json"), JSON.stringify(change));
  await writeFile(
    join(changesDir, `${change.id}.json`),
    JSON.stringify({ schemaVersion: 2, state: change }),
  );
}

describe("archive-gate disk projection", () => {
  it("does not rewrite an already terminal merged replay bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-replay-terminal-"));
    try {
      const archiveDir = join(root, "archive");
      const bundlePath = join(archiveDir, "2026-08-08-example");
      const change = {
        ...makeChange("archived"),
        lifecycleState: "archived" as const,
        phase9_status: {
          status: "done" as const,
          startedAt: "2026-08-08T00:00:00Z",
          completedAt: "2026-08-08T00:01:00Z",
        },
      };
      await mkdir(bundlePath, { recursive: true });
      await writeFile(join(bundlePath, "change.json"), JSON.stringify(change));

      archiveMocks.refreshArchiveBundleProjectionUnderLock.mockClear();
      archiveMocks.refreshArchiveBundleProjectionUnderLock.mockResolvedValue(
        {},
      );
      const result = await completeMergedArchiveReplay({
        store: makeStore(root, change.gates),
        changeId: change.id,
        finalization: {
          status: "shipped",
          repoRoot: "/repo",
          defaultBranch: "trunk",
          pushStatus: "skipped",
          route: "pr_manual",
        },
        existingBundlePath: bundlePath,
      });

      expect(result).toMatchObject({ ok: true, alreadyDone: true });
      expect(
        archiveMocks.refreshArchiveBundleProjectionUnderLock,
      ).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refreshes only the canonical external bundle during nonterminal merged replay", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "adv-archive-replay-nonterminal-"),
    );
    try {
      const archiveDir = join(root, "archive");
      const bundlePath = join(archiveDir, "2026-08-08-example");
      const change = {
        ...makeChange("archived"),
        lifecycleState: "archived" as const,
        phase9_status: {
          status: "pending_merge" as const,
          startedAt: "2026-08-08T00:00:00Z",
        },
      };
      await mkdir(bundlePath, { recursive: true });
      await writeFile(join(bundlePath, "change.json"), JSON.stringify(change));

      archiveMocks.refreshArchiveBundleProjectionUnderLock.mockClear();
      const result = await completeMergedArchiveReplay({
        store: makeStore(root, change.gates),
        changeId: change.id,
        finalization: {
          status: "shipped",
          repoRoot: "/repo",
          defaultBranch: "trunk",
          pushStatus: "skipped",
          route: "pr_manual",
        },
        existingBundlePath: bundlePath,
      });

      expect(result).toMatchObject({ ok: true, alreadyDone: false });
      expect(
        archiveMocks.refreshArchiveBundleProjectionUnderLock,
      ).toHaveBeenCalledTimes(1);
      expect(
        archiveMocks.refreshArchiveBundleProjectionUnderLock.mock.calls.every(
          ([input]) =>
            !("inRepoArchivePath" in input) && input.archivePath === bundlePath,
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("proves a merged replay and its committed tracked bundle before writers", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-replay-"));
    try {
      const archiveDir = join(root, "archive");
      const bundlePath = join(archiveDir, "2026-08-08-example");
      const change = {
        ...makeChange("archived"),
        phase9_status: {
          status: "pending_merge" as const,
          startedAt: "2026-08-08T00:00:00Z",
          repo: "owner/repo",
          prNumber: 42,
          changeTipSha: "a".repeat(40),
          preArchiveTipSha: "b".repeat(40),
        },
      };
      await mkdir(bundlePath, { recursive: true });
      await writeFile(join(bundlePath, "change.json"), JSON.stringify(change));

      const runGit = vi.fn((_: string, args: string[]) => {
        if (args[0] === "remote")
          return {
            status: 0,
            stdout: "https://github.com/owner/repo.git",
            stderr: "",
          };
        if (args[0] === "symbolic-ref")
          return { status: 0, stdout: "origin/trunk", stderr: "" };
        if (args[0] === "fetch" || args[0] === "ls-remote")
          return { status: 0, stdout: "default-sha", stderr: "" };
        if (args[0] === "rev-parse")
          return { status: 0, stdout: "default-sha", stderr: "" };
        if (args[0] === "merge-base")
          return { status: 0, stdout: "", stderr: "" };
        if (args[0] === "ls-tree")
          return {
            status: 0,
            stdout: ".adv/archive/2026-08-08-example/change.json\n",
            stderr: "",
          };
        if (args[0] === "show")
          return { status: 0, stdout: JSON.stringify(change), stderr: "" };
        return { status: 0, stdout: "", stderr: "" };
      });
      const runGh = vi.fn((_: string, args: string[]) => {
        if (args[0] === "api") return { status: 0, stdout: "[]", stderr: "" };
        if (args[0] === "pr" && args[1] === "view")
          return {
            status: 0,
            stdout: JSON.stringify({
              state: "MERGED",
              mergedAt: "2026-08-08T00:01:00Z",
              mergeCommit: { oid: "merge-sha" },
              autoMergeRequest: null,
            }),
            stderr: "",
          };
        return {
          status: 0,
          stdout: JSON.stringify([
            {
              number: 42,
              url: "https://github.com/owner/repo/pull/42",
              state: "MERGED",
              mergedAt: "2026-08-08T00:01:00Z",
              mergeCommit: { oid: "merge-sha" },
              headRefName: "change/example",
              headRefOid: "a".repeat(40),
              baseRefName: "trunk",
              headRepositoryOwner: { login: "owner" },
              headRepository: { name: "repo", nameWithOwner: "owner/repo" },
              isCrossRepository: false,
            },
          ]),
          stderr: "",
        };
      });

      const result = await detectMergedArchiveReplay({
        store: Object.assign(makeStore(root, change.gates), {
          paths: {
            root,
            changes: root,
            archive: archiveDir,
          },
        }),
        changeId: "example",
        archiveMode: "pr",
        change,
        deps: { runGit, runGh },
      });

      expect(result).toMatchObject({
        kind: "verified_merged_replay",
        existingBundlePath: bundlePath,
        finalization: {
          status: "shipped",
          repo: "owner/repo",
          prHeadSha: "a".repeat(40),
          defaultBranch: "trunk",
          defaultBranchSha: "default-sha",
          releasedCommitSha: "merge-sha",
        },
      });
      expect(runGit).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["commit"]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records exact PR and current default reachability in durable evidence", () => {
    const evidence = buildReleaseCompletionEvidence({
      status: "shipped",
      repoRoot: "/repo",
      defaultBranch: "trunk",
      pushStatus: "pushed",
      route: "direct",
      repo: "owner/repo",
      prNumber: 405,
      prHeadSha: "pr-head-sha",
      mergeCommitSha: "merge-commit-sha",
      defaultBranchSha: "current-default-sha",
      releasedCommitSha: "current-default-sha",
    });
    expect(evidence).toContain("prNumber=405");
    expect(evidence).toContain("prHeadSha=pr-head-sha");
    expect(evidence).toContain("mergeCommitSha=merge-commit-sha");
    expect(evidence).toContain(
      "defaultBranchReachability=origin/trunk@current-default-sha",
    );
  });

  it("accepts audited disk release proof with matching finalization evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-gate-"));
    try {
      const change = makeChange();
      await writeDiskChange(root, change);
      const finalization = {
        status: "pending_merge" as const,
        repoRoot: "/repo",
        defaultBranch: "trunk",
        pushStatus: "not_attempted" as const,
        route: "pr_manual" as const,
      };
      const evidence = buildReleaseCompletionEvidence(finalization);
      const diskChange = {
        ...change,
        gates: {
          ...change.gates,
          release: {
            ...gateDone,
            approval_evidence: evidence,
            recovery_audit: {
              reason: "completed_workflow_release_gate_recovery",
              evidence,
              recovered_at: "2026-01-01T00:00:01Z",
            },
          },
        },
      };
      await writeDiskChange(root, diskChange);
      const pendingGates = {
        ...diskChange.gates,
        release: { status: "pending" },
      } as Gates;
      const result = await verifyReleaseGateDurableForArchive({
        store: makeStore(root, pendingGates),
        changeId: change.id,
        evidence,
        finalization,
      });
      expect(result).toMatchObject({ ok: true, source: "disk" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses non-shipped disk proof with mismatched evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-gate-"));
    try {
      const change = makeChange();
      await writeDiskChange(root, change);
      const result = await verifyReleaseGateDurableForArchive({
        store: makeStore(root, {
          ...change.gates,
          release: { status: "pending" },
        } as Gates),
        changeId: change.id,
        evidence: "new finalization evidence",
        finalization: {
          status: "pending_merge",
          repoRoot: "/repo",
          defaultBranch: "trunk",
          pushStatus: "not_attempted",
          route: "pr_manual",
        },
      });
      expect(result.ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps a corrupt durable release proof distinct from an absent one", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-gate-projection-"));
    try {
      const change = makeChange();
      await writeDiskChange(root, change);
      await writeFile(join(root, change.id, "change.json"), "{not-json");

      const corrupt = await verifyReleaseGateDurableForArchive({
        store: makeStore(root, change.gates),
        changeId: change.id,
        evidence: "release evidence",
      });
      expect(corrupt).toMatchObject({
        ok: false,
        code: "CHANGE_PROJECTION_LOAD_FAILED",
        projectionFailureType: "corrupt",
      });

      const missing = await verifyReleaseGateDurableForArchive({
        store: makeStore(root, change.gates),
        changeId: "missing-change",
        evidence: "release evidence",
      });
      expect(missing).toMatchObject({ ok: false });
      if (!missing.ok) expect(missing.code).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("carries corrupt projection failure into the archive preflight refusal", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-gate-projection-"));
    try {
      const change = makeChange();
      await writeDiskChange(root, change);
      await writeFile(join(root, change.id, "change.json"), "{not-json");

      const state = await resolveArchiveGateState(
        makeStore(root, change.gates),
        change.id,
        change,
      );

      expect(state.projectionLoadFailure?.type).toBe("corrupt");
      expect(state.effectiveGates).toEqual(change.gates);

      const refusal = getArchiveGatePreflightError(change.id, state, false);
      expect(refusal).not.toBeNull();
      expect(JSON.parse(refusal!)).toMatchObject({
        code: "CHANGE_PROJECTION_LOAD_FAILED",
        projectionFailureType: "corrupt",
        changeId: change.id,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses an oversized projection before evaluating stale gates", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-gate-projection-"));
    try {
      const change = makeChange();
      await writeDiskChange(root, change);
      await writeFile(
        join(root, change.id, "change.json"),
        "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
      );

      const state = await resolveArchiveGateState(
        makeStore(root, change.gates),
        change.id,
        change,
      );
      expect(state.projectionLoadFailure?.type).toBe("oversized");

      const refusal = getArchiveGatePreflightError(change.id, state, false);
      expect(JSON.parse(refusal!)).toMatchObject({
        code: "CHANGE_PROJECTION_LOAD_FAILED",
        projectionFailureType: "oversized",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("passes archive preflight with a healthy projection", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-gate-projection-"));
    try {
      const change = makeChange();
      await writeDiskChange(root, change);

      const state = await resolveArchiveGateState(
        makeStore(root, { ...change.gates, release: { status: "pending" } }),
        change.id,
        change,
      );

      expect(state.projectionLoadFailure).toBeUndefined();
      expect(getArchiveGatePreflightError(change.id, state, false)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
