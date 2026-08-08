/** Disk-only archive release-gate verification. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Store } from "../../storage/store";
import type { Change, Gates } from "../../types";
import {
  buildReleaseCompletionEvidence,
  getArchiveGatePreflightError,
  resolveArchiveGateState,
  verifyReleaseGateDurableForArchive,
} from "./archive-gate";
import { PROJECTION_DOCUMENT_BYTE_LIMIT } from "../../storage/change-projection-reader";

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
