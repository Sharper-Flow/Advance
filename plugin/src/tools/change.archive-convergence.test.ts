/**
 * Tests for the dead-workflow archive convergence recovery writer.
 *
 * These tests exercise `saveRecoveredArchiveConvergence` with real disk fixtures
 * so the single `saveChange` call and read-after-write verification are exercised
 * end-to-end.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { saveRecoveredArchiveConvergence } from "./change";
import type { Change, Store } from "../types";
import type { GitFinalizeOutcome } from "./archive-helpers/git-finalize";

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
    mainCheckout: "/tmp/main",
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

    const diskText = await readFile(
      join(changesDir, change.id, "change.json"),
      "utf-8",
    );
    const disk = JSON.parse(diskText) as Change;

    // All four converged fields must be present after a single save.
    expect(disk.status).toBe("archived");
    expect(disk.lifecycleState).toBe("archived");
    expect(disk.gates?.release?.status).toBe("done");
    expect(disk.phase9_status?.status).toBe("done");

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
});
