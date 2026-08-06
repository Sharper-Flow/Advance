/**
 * Archive terminal-proof tests.
 *
 * Temporal is intentionally absent from this surface. Archive completion is
 * proven only by the disk projection and a matching archive bundle.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../storage/store";
import type { Change, Gates } from "../types";
import type { GitFinalizeOutcome } from "./archive-helpers/git-finalize";
import { changeTools } from "./change";
import {
  buildReleaseCompletionEvidence,
  completeReleaseGateAfterFinalization,
  verifyReleaseGateDurableForArchive,
} from "./change/archive-gate";

const recoveryWriter = vi.hoisted(() => vi.fn());

vi.mock("../../temporal/service", () => ({
  getService: vi.fn(() => null),
}));

vi.mock("./_recovery-writers", () => ({
  saveRecoveredGateCompletion: recoveryWriter,
}));

const allDoneGates = (): Gates => ({
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "done" },
  execution: { status: "done" },
  acceptance: { status: "done" },
  release: {
    status: "done",
    completed_at: "2026-01-01T00:00:00Z",
    completed_by: "tester",
    approval_evidence: "disk proof",
  },
});

function makeChange(status: Change["status"] = "archived"): Change {
  return {
    id: "example",
    title: "Example",
    status,
    created_at: "2026-01-01T00:00:00Z",
    created_by: "tester",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: allDoneGates(),
    worker_bundle_impact: { kind: "not_applicable", rationale: "test" },
  };
}

function makeStore(
  changesDir: string,
  archiveDir: string,
  gates: Gates = {
    ...allDoneGates(),
    release: { status: "pending" },
  },
): Store {
  return {
    paths: { root: changesDir, changes: changesDir, archive: archiveDir },
    config: { name: "test", features: {} },
    changes: {
      invalidate: vi.fn(async () => undefined),
      get: vi.fn(async () => ({ success: true, data: makeChange("active") })),
    },
    gates: { get: vi.fn(async () => gates) },
  } as unknown as Store;
}

async function writeProjection(
  changesDir: string,
  change: Change,
): Promise<void> {
  await mkdir(changesDir, { recursive: true });
  await writeFile(
    join(changesDir, `${change.id}.json`),
    JSON.stringify({
      schemaVersion: 2,
      projectId: "0".repeat(40),
      changeId: change.id,
      projectedAt: "2026-01-01T00:00:00Z",
      state: change,
    }),
  );
}

async function writeBundle(
  archiveDir: string,
  change: Change,
): Promise<string> {
  const bundleDir = join(archiveDir, `2026-01-01-${change.id}`);
  await mkdir(bundleDir, { recursive: true });
  await writeFile(join(bundleDir, "change.json"), JSON.stringify(change));
  return bundleDir;
}

const shipped: GitFinalizeOutcome = {
  status: "shipped",
  repoRoot: "/repo",
  defaultBranch: "trunk",
  pushStatus: "pushed",
  releasedCommitSha: "merge-sha",
  mergeCommitSha: "merge-sha",
  route: "direct",
};

describe("archive terminal proof", () => {
  beforeEach(() => {
    recoveryWriter.mockReset();
    recoveryWriter.mockImplementation(
      async ({
        change,
        completion,
      }: {
        change: Change;
        completion: unknown;
      }) => ({
        ...change,
        gates: { ...(change.gates ?? {}), release: completion },
      }),
    );
  });

  it("accepts terminal state only when projection and matching bundle agree", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-proof-"));
    try {
      const changesDir = join(root, "changes");
      const archiveDir = join(root, "archive");
      const change = makeChange();
      await writeProjection(changesDir, change);
      const bundlePath = await writeBundle(archiveDir, change);
      const store = makeStore(changesDir, archiveDir);

      const result = await completeReleaseGateAfterFinalization({
        store,
        change,
        changeId: change.id,
        finalization: shipped,
        existingBundlePath: bundlePath,
      });

      expect(result).toMatchObject({ ok: true, recoveryMutation: true });
      expect(recoveryWriter).toHaveBeenCalledTimes(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when the archived projection has no matching bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-proof-"));
    try {
      const changesDir = join(root, "changes");
      const archiveDir = join(root, "archive");
      const change = makeChange();
      await writeProjection(changesDir, change);
      const result = await completeReleaseGateAfterFinalization({
        store: makeStore(changesDir, archiveDir),
        change,
        changeId: change.id,
        finalization: shipped,
      });

      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toContain(
        "Temporal service not available",
      );
      expect(recoveryWriter).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when the bundle identity or status does not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-proof-"));
    try {
      const changesDir = join(root, "changes");
      const archiveDir = join(root, "archive");
      const archived = makeChange();
      await writeProjection(changesDir, archived);
      const bundlePath = await writeBundle(archiveDir, {
        ...archived,
        id: "different-change",
        status: "active",
      });

      const result = await completeReleaseGateAfterFinalization({
        store: makeStore(changesDir, archiveDir),
        change: archived,
        changeId: archived.id,
        finalization: shipped,
        existingBundlePath: bundlePath,
      });

      expect(result.ok).toBe(false);
      expect(recoveryWriter).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not treat a bundle alone as terminal proof", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-proof-"));
    try {
      const changesDir = join(root, "changes");
      const archiveDir = join(root, "archive");
      const change = makeChange();
      const bundlePath = await writeBundle(archiveDir, change);
      const result = await completeReleaseGateAfterFinalization({
        store: makeStore(changesDir, archiveDir),
        change,
        changeId: change.id,
        finalization: shipped,
        existingBundlePath: bundlePath,
      });

      expect(result.ok).toBe(false);
      expect(recoveryWriter).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses a durable disk gate for archive verification without a workflow read", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-proof-"));
    try {
      const changesDir = join(root, "changes");
      const archiveDir = join(root, "archive");
      const change = makeChange();
      await writeProjection(changesDir, change);
      const store = makeStore(changesDir, archiveDir);
      const evidence = buildReleaseCompletionEvidence(shipped);
      const result = await verifyReleaseGateDurableForArchive({
        store,
        changeId: change.id,
        evidence,
        finalization: shipped,
        change,
      });

      expect(result).toMatchObject({
        ok: true,
        source: "shipped-finalization",
      });
      expect(store.gates.get).toHaveBeenCalledWith(change.id);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("retains the projection envelope on disk while proving the bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-proof-"));
    try {
      const changesDir = join(root, "changes");
      const archiveDir = join(root, "archive");
      const change = makeChange();
      await writeProjection(changesDir, change);
      const bundlePath = await writeBundle(archiveDir, change);
      const before = await readFile(join(changesDir, "example.json"), "utf8");
      await completeReleaseGateAfterFinalization({
        store: makeStore(changesDir, archiveDir),
        change,
        changeId: change.id,
        finalization: shipped,
        existingBundlePath: bundlePath,
      });
      const after = await readFile(join(changesDir, "example.json"), "utf8");
      expect(JSON.parse(before).state.status).toBe("archived");
      expect(JSON.parse(after).state.status).toBe("archived");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("invokes the archive tool against the disk-backed change record", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-tool-"));
    try {
      const changesDir = join(root, "changes");
      const archiveDir = join(root, "archive");
      const change = makeChange("active");
      change.gates = {
        ...change.gates,
        release: { status: "pending" },
      };
      await writeProjection(changesDir, change);
      const store = {
        paths: { root, changes: changesDir, archive: archiveDir },
        config: { name: "test", features: {} },
        changes: {
          get: vi.fn(async () => ({ success: true, data: change })),
          list: vi.fn(async () => ({ changes: [change] })),
          save: vi.fn(async () => undefined),
          invalidate: vi.fn(async () => undefined),
        },
        specs: { list: vi.fn(async () => ({ specs: [] })) },
        tasks: { ready: vi.fn(async () => ({ ready: [], blocked: [] })) },
        gates: { get: vi.fn(async () => change.gates) },
      } as unknown as Store;

      const output = await changeTools.adv_change_archive.execute(
        { changeId: change.id, dryRun: true },
        store,
      );
      const parsed = JSON.parse(output);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.changeId).toBe(change.id);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
