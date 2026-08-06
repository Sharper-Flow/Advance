/** Disk-only archive release-gate verification. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../storage/store";
import type { Change, Gates } from "../../types";
import {
  buildReleaseCompletionEvidence,
  getArchiveGatePreflightError,
  persistConfirmedReleaseGateReadback,
  verifyReleaseGateDurableForArchive,
  waitForArchiveReleaseGateCompletion,
} from "./archive-gate";

const recoveryWriter = vi.hoisted(() => vi.fn());
const commitProjection = vi.hoisted(() => vi.fn());

vi.mock("../_recovery-writers", () => ({
  saveRecoveredGateCompletion: recoveryWriter,
}));

vi.mock("../../storage/change-projection-transaction", () => ({
  commitChangeProjection: commitProjection,
}));

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
    worker_bundle_impact: { kind: "not_applicable", rationale: "test" },
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
  beforeEach(() => {
    recoveryWriter.mockReset();
    commitProjection.mockReset();
  });

  it("polls the release gate from the disk projection", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-gate-"));
    try {
      await writeDiskChange(root, makeChange());
      await expect(
        waitForArchiveReleaseGateCompletion(
          "0".repeat(40),
          "example",
          { attempts: 1, delayMs: 0 },
          root,
        ),
      ).resolves.toEqual(gateDone);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns no terminal gate when the disk projection is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-archive-gate-"));
    try {
      await expect(
        waitForArchiveReleaseGateCompletion(
          "0".repeat(40),
          "example",
          { attempts: 1, delayMs: 0 },
          root,
        ),
      ).rejects.toThrow("Change projection unavailable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

  it("rejects persistence unless the confirmed gate is complete", async () => {
    const result = await persistConfirmedReleaseGateReadback({
      store: {} as Store,
      change: makeChange(),
      changeId: "example",
      gate: { status: "pending" },
    });
    expect(result).toEqual({
      ok: false,
      error: "Refusing to persist a non-done release gate",
      retryable: false,
    });
    expect(commitProjection).not.toHaveBeenCalled();
  });

  it("blocks archive preflight when worker-bundle provenance is missing", () => {
    const change = {
      ...makeChange(),
      gates: { ...makeChange().gates, release: { status: "pending" } },
      worker_bundle_impact: { kind: "required" },
    } as Change;
    const result = getArchiveGatePreflightError(
      change.id,
      {
        effectiveGates: change.gates as Gates,
        storeGates: change.gates as Gates,
        source: "store",
      },
      true,
      undefined,
      change,
    );
    expect(result).toContain("worker-bundle release provenance");
  });
});
