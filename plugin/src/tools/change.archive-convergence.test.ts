/**
 * Tests for the dead-workflow archive convergence recovery writer.
 *
 * These tests exercise `saveRecoveredArchiveConvergence` with real disk fixtures
 * so the conditional projection commit and read-after-write verification are
 * exercised end-to-end.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { saveRecoveredArchiveConvergence } from "./change";
import type { Change, Store } from "../types";
import type { GitFinalizeOutcome } from "./archive-helpers/git-finalize";
import { commitChangeProjection } from "../storage/change-projection-transaction";

vi.mock("../storage/change-projection-transaction", async (importOriginal) => {
  const mod =
    (await importOriginal()) as typeof import("../storage/change-projection-transaction");
  return {
    ...mod,
    commitChangeProjection: vi.fn(mod.commitChangeProjection),
  };
});

const mockedCommitChangeProjection = vi.mocked(commitChangeProjection);

function createStore(paths: Store["paths"]): Store {
  return {
    paths,
    config: { name: "test", features: {} },
    changes: {
      refresh: async () => undefined,
    },
  } as unknown as Store;
}

function createHalfConvergedChange(): Change {
  return {
    id: "fixArchiveConvergence",
    title: "Fix archive convergence durability gap",
    status: "archived",
    lifecycleState: "open",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    projection_revision: 0,
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "done" },
      release: { status: "pending" },
    },
    phase9_status: {
      status: "pending",
      startedAt: "2026-01-01T00:00:00Z",
    },
  } as Change;
}

function shippedFinalization(): GitFinalizeOutcome {
  return {
    status: "shipped",
    repoRoot: "/tmp/main",
    defaultBranch: "trunk",
    route: "direct",
    mergeCommitSha: "abc123",
    pushStatus: "pushed",
  };
}

describe("saveRecoveredArchiveConvergence", () => {
  let tempRoot: string;
  let changesDir: string;
  let archiveDir: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "adv-archive-convergence-"));
    changesDir = join(tempRoot, "changes");
    archiveDir = join(tempRoot, "archive");
    await mkdir(changesDir, { recursive: true });
    await mkdir(archiveDir, { recursive: true });
    mockedCommitChangeProjection.mockClear();
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  async function writeDiskChange(change: Change): Promise<void> {
    const dir = join(changesDir, change.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "change.json"), JSON.stringify(change, null, 2));
  }

  async function writeBundle(change: Change): Promise<void> {
    const bundleDir = join(archiveDir, `2026-01-15-${change.id}`);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(
      join(bundleDir, "change.json"),
      JSON.stringify(change, null, 2),
    );
  }

  test("converges half-converged change with shipped proof and valid bundle", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
      archivedAt: "2026-01-15T00:00:00Z",
    });

    expect(result.kind).toBe("converged");
    expect(mockedCommitChangeProjection).toHaveBeenCalledTimes(1);

    const diskText = await readFile(
      join(changesDir, change.id, "change.json"),
      "utf-8",
    );
    const disk = JSON.parse(diskText) as Change;

    // All four converged fields must be present after a single commit.
    expect(disk.status).toBe("archived");
    expect(disk.lifecycleState).toBe("archived");
    expect(disk.gates?.release?.status).toBe("done");
    expect(disk.phase9_status?.status).toBe("done");
    expect(disk.projection_revision).toBe(1);

    // Recovery audit must be present on the release gate.
    expect(disk.gates?.release?.recovery_audit).toEqual({
      reason: "archive_convergence_recovery",
      evidence:
        "archive_convergence_recovery; operator approved dead-workflow archive convergence",
      recovered_at: "2026-01-15T00:00:00Z",
    });

    // Phase 9 done state must carry the finalization evidence.
    expect(disk.phase9_status?.completedAt).toBe("2026-01-15T00:00:00Z");
    expect(disk.phase9_status?.route).toBe("direct");
  });

  test("refuses when authorization is missing", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "",
        evidence: "",
      },
      finalization: shippedFinalization(),
    });

    expect(result.kind).toBe("refused");
    expect(result.refusalCode).toBe("AUTHORIZATION_MISSING");
  });

  test("refuses when finalization is not shipped", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: {
        ...shippedFinalization(),
        status: "blocked",
      },
    });

    expect(result.kind).toBe("refused");
    expect(result.refusalCode).toBe("PROOF_NOT_SHIPPED");
  });

  test("refuses when archive bundle is missing", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    // No bundle written.

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
    });

    expect(result.kind).toBe("refused");
    expect(result.refusalCode).toBe("PROOF_MISSING_BUNDLE");
  });

  test("refuses when archive bundle change id mismatches", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    const bundleDir = join(archiveDir, `2026-01-15-${change.id}`);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(
      join(bundleDir, "change.json"),
      JSON.stringify({ ...change, id: "someOtherChange" }, null, 2),
    );

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
    });

    expect(result.kind).toBe("refused");
    expect(result.refusalCode).toBe("PROOF_BUNDLE_ID_MISMATCH");
  });

  test("routes the terminal mutation through the conditional projection commit", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
      archivedAt: "2026-01-15T00:00:00Z",
    });

    expect(result.kind).toBe("converged");
    expect(mockedCommitChangeProjection).toHaveBeenCalledTimes(1);
    const commitCall = mockedCommitChangeProjection.mock.calls[0][0];
    expect(commitCall.changesDir).toBe(changesDir);
    expect(commitCall.changeId).toBe(change.id);
    expect(commitCall.mutationKind).toBe("archive_convergence");
    expect(commitCall.expectedRevision).toBe(0);
    expect(commitCall.authority).toEqual({
      kind: "recovery",
      reason: "archive_convergence_recovery",
      evidence: "operator approved dead-workflow archive convergence",
    });
    expect(typeof commitCall.mutateLatest).toBe("function");
    expect(typeof commitCall.verify).toBe("function");
  });

  test("mutateLatest applies terminal fields and verify accepts a converged readback", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
      archivedAt: "2026-01-15T00:00:00Z",
    });

    expect(mockedCommitChangeProjection).toHaveBeenCalledTimes(1);
    const commitCall = mockedCommitChangeProjection.mock.calls[0][0];
    const mutateLatest = commitCall.mutateLatest as (latest: Change) => Change;
    const verify = commitCall.verify as (ctx: {
      readback: Change;
      latest: Change;
      priorRevision: number;
      newRevision: number;
    }) => boolean | { ok: boolean; error?: string };

    const mutated = mutateLatest(change);
    expect(mutated.status).toBe("archived");
    expect(mutated.lifecycleState).toBe("archived");
    expect(mutated.gates?.release?.status).toBe("done");
    expect(mutated.phase9_status?.status).toBe("done");
    expect(mutated.gates?.release?.recovery_audit).toEqual({
      reason: "archive_convergence_recovery",
      evidence:
        "archive_convergence_recovery; operator approved dead-workflow archive convergence",
      recovered_at: "2026-01-15T00:00:00Z",
    });

    const verifyResult = verify({
      readback: mutated,
      latest: change,
      priorRevision: 0,
      newRevision: 1,
    });
    expect(verifyResult).toBe(true);
  });

  test("returns writeFailed and leaves projection and bundle intact when the conditional commit fails before write", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    mockedCommitChangeProjection.mockResolvedValueOnce({
      kind: "write_error",
      error: "disk full",
    });

    const priorDiskText = await readFile(
      join(changesDir, change.id, "change.json"),
      "utf-8",
    );

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
      archivedAt: "2026-01-15T00:00:00Z",
    });

    expect(result.kind).toBe("writeFailed");
    expect((result as { error: string }).error).toContain("disk full");

    const afterDiskText = await readFile(
      join(changesDir, change.id, "change.json"),
      "utf-8",
    );
    expect(afterDiskText).toBe(priorDiskText);
    expect(mockedCommitChangeProjection).toHaveBeenCalledTimes(1);
    await expect(
      readFile(
        join(archiveDir, `2026-01-15-${change.id}`, "change.json"),
        "utf-8",
      ),
    ).resolves.toBeDefined();
  });

  test("returns state_unknown when the conditional commit writes but readback verification cannot confirm the projection", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    mockedCommitChangeProjection.mockResolvedValueOnce({
      kind: "committed_unverified",
      value: change,
      revision: 1,
      readback: change,
      audit: {
        mutation_kind: "archive_convergence",
        authority_kind: "recovery",
        recovery_reason: "missing_workflow",
        recovery_evidence: "archive_convergence_recovery",
        prior_revision: 0,
        new_revision: 1,
        committed_at: "2026-01-15T00:00:00Z",
      },
      postconditionError:
        "mutation-specific postcondition failed: status not archived",
    });

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
      archivedAt: "2026-01-15T00:00:00Z",
    });

    expect(result.kind).toBe("state_unknown");
    const typed = result as { kind: "state_unknown"; error: string };
    expect(typed.error).toContain("postcondition");
    expect(typed.error).not.toContain("converged");
    expect(typed.error).not.toContain("draft");
  });

  test("returns writeFailed when the projection revision is stale", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    mockedCommitChangeProjection.mockResolvedValueOnce({
      kind: "stale_revision",
      expected: 0,
      actual: 3,
    });

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
      archivedAt: "2026-01-15T00:00:00Z",
    });

    expect(result.kind).toBe("writeFailed");
    expect((result as { error: string }).error).toContain("stale");
    expect((result as { error: string }).error).toContain("3");
  });

  test("returns writeFailed when the commit requires operator intervention", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    mockedCommitChangeProjection.mockResolvedValueOnce({
      kind: "operator_required",
      reason: "change not found",
    });

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
      archivedAt: "2026-01-15T00:00:00Z",
    });

    expect(result.kind).toBe("writeFailed");
    expect((result as { error: string }).error).toContain("change not found");
  });

  test("never fires a workflow terminate signal", async () => {
    const change = createHalfConvergedChange();
    await writeDiskChange(change);
    await writeBundle(change);

    const result = await saveRecoveredArchiveConvergence({
      store: createStore({
        root: tempRoot,
        changes: changesDir,
        archive: archiveDir,
      }),
      change,
      changeId: change.id,
      authorization: {
        reason: "archive_convergence_recovery",
        evidence: "operator approved dead-workflow archive convergence",
      },
      finalization: shippedFinalization(),
      archivedAt: "2026-01-15T00:00:00Z",
    });

    expect(result.kind).toBe("converged");
    const commitCall = mockedCommitChangeProjection.mock.calls[0][0];
    expect(commitCall.authority.kind).toBe("recovery");
  });
});
