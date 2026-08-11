import { readFile, writeFile, mkdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import { ChangeSchema, type Change } from "../types";
import { createDiskStore } from "./store-disk";
import type { ActionContext } from "./reconcile-action-types";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";
import {
  classifyTerminalNoopExecutor,
  migrateRecordExecutor,
  setMarkerAutoExecutor,
  setMarkerLegacyExecutor,
} from "./reconcile-action-artifact-metadata";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

function changeFixture(id: string, overrides: Partial<Change> = {}): Change {
  return ChangeSchema.parse({
    ...SAMPLE_CHANGE,
    id,
    title: id,
    status: "draft",
    created_at: "2026-08-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    ...overrides,
  });
}

async function fixture(
  id: string,
  overrides: Partial<Change> = {},
  withWorktree = false,
): Promise<{
  root: string;
  paths: Awaited<ReturnType<typeof createDiskStore>>["paths"];
  sourcePath: string;
  change: Change;
  ctx: ActionContext;
  beforeWrites: Array<{ id: string; bytes: Uint8Array | string }>;
}> {
  const root = await createTempDir("reconcile-artifact-metadata-");
  roots.push(root);
  const externalRoot = join(root, "state");
  const store = await createDiskStore(root, { externalRoot });
  const change = changeFixture(id, overrides);
  await store.changes.save(change);
  if (withWorktree) {
    execSync("git init -b trunk", { cwd: root, stdio: "ignore" });
    execSync("git config user.email test@example.com", { cwd: root });
    execSync("git config user.name test", { cwd: root });
    writeFileSync(join(root, "README.md"), "fixture\n");
    execSync("git add README.md && git commit -m initial", {
      cwd: root,
      stdio: "ignore",
    });
    execSync(
      `git worktree add -b change/${id} ${join(root, "managed-worktree")}`,
      { cwd: root, stdio: "ignore" },
    );
  }
  const sourcePath = join(store.paths.changes, id, "change.json");
  const beforeWrites: Array<{ id: string; bytes: Uint8Array | string }> = [];
  const ctx: ActionContext = {
    storePaths: store.paths,
    locksHeld: [],
    runId: "reconcile-artifact-metadata-test",
    writeBeforeState: async (recordId, bytes) => {
      beforeWrites.push({ id: recordId, bytes });
      return join(store.paths.reconcileDir, "before", `${recordId}.bin`);
    },
    auditWriter: async () => undefined,
    coordinateChangeMutation: async (intent) => {
      const latest = ChangeSchema.parse(
        JSON.parse(await readFile(sourcePath, "utf8")),
      );
      const next = intent.mutateLatestProjection(latest);
      await writeFile(sourcePath, JSON.stringify(next, null, 2));
      return {
        kind: "verified" as const,
        value: next,
        revision: next.projection_revision ?? 0,
        audit: {} as never,
      };
    },
    saveEpicOptimistic: async () => ({ status: "skipped" as const }),
  };
  return { root, paths: store.paths, sourcePath, change, ctx, beforeWrites };
}

function record(
  id: string,
  className: "unmigrated_artifact_metadata" | "unmigrated_worktree_marker",
  action: ReconcileAction["action"],
  sourcePath: string,
): ReconcilePlanRecord {
  return {
    record_id: id,
    source_path: sourcePath,
    class: className,
    evidence: ["fixture"],
    actions: [{ class: className, action } as ReconcileAction],
  } as ReconcilePlanRecord;
}

/** Retired evidence enum owned by the schema-drift reconcile action. */
const RETIRED_TEST_RUNS = {
  "tk-retired": [
    {
      runId: "tr-retired",
      exitCode: 0,
      classification: "pass",
      command: "pnpm test",
      durationMs: 10,
      evidence_kind: "build_worker",
      recordedAt: "2026-08-07T00:00:00.000Z",
    },
  ],
};

const DISK_ARTIFACTS = {
  proposal: { source: "disk", updatedAt: "2026-08-07T00:00:00.000Z" },
};

const TEMPORAL_ARTIFACTS = {
  proposal: {
    source: "temporal",
    updatedAt: "2026-08-07T00:00:00.000Z",
    readable: true,
  },
};

/**
 * Writes a projection document that the current ChangeSchema may reject, so
 * completion-gate behavior can be exercised against real residue shapes.
 */
async function writeRawProjection(
  changesDir: string,
  id: string,
  document: unknown,
): Promise<void> {
  const dir = join(changesDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "change.json"), JSON.stringify(document, null, 2));
}

async function markerOrNull(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

describe("artifact metadata reconcile action executors", () => {
  test("migrates temporal metadata through the coordinated active projection path", async () => {
    const data = await fixture("artifact-migration", {
      documents: { proposal: "preserve this" },
      artifacts: {
        proposal: {
          source: "temporal",
          updatedAt: "2026-08-07T00:00:00.000Z",
          readable: true,
        },
        design: {
          source: "archive",
          updatedAt: "2026-08-07T00:00:00.000Z",
          readable: true,
        },
      },
    });

    const before = await readFile(data.sourcePath);
    const outcome = await migrateRecordExecutor(
      record(
        "artifact-migration",
        "unmigrated_artifact_metadata",
        "migrate_record",
        data.sourcePath,
      ),
      { class: "unmigrated_artifact_metadata", action: "migrate_record" },
      data.ctx,
    );

    expect(outcome.status).toBe("mutated");
    expect(data.beforeWrites).toHaveLength(1);
    expect(Buffer.from(data.beforeWrites[0].bytes)).toEqual(before);
    const after = JSON.parse(await readFile(data.sourcePath, "utf8"));
    expect(after.artifacts).toMatchObject({
      proposal: { source: "disk" },
      design: { source: "archive" },
    });
    expect(after.documents.proposal).toBe("preserve this");
    expect(
      JSON.parse(
        await readFile(data.paths.artifactMetadataMigrationMarker, "utf8"),
      ),
    ).toMatchObject({
      version: 1,
      dispositions: { "artifact-migration": "migrated" },
    });
  });

  test("refuses to synthesize a malformed projection and leaves it unchanged", async () => {
    const data = await fixture("artifact-malformed");
    const malformed = "{ not-json\n";
    await writeFile(data.sourcePath, malformed);

    const outcome = await migrateRecordExecutor(
      record(
        "artifact-malformed",
        "unmigrated_artifact_metadata",
        "migrate_record",
        data.sourcePath,
      ),
      { class: "unmigrated_artifact_metadata", action: "migrate_record" },
      data.ctx,
    );

    expect(outcome).toMatchObject({
      status: "failed",
      error_class: "projection_read_failed",
    });
    expect(await readFile(data.sourcePath, "utf8")).toBe(malformed);
    expect(data.beforeWrites).toHaveLength(0);
    await expect(
      readFile(data.paths.artifactMetadataMigrationMarker),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("classifies an already-repaired record as a terminal no-op", async () => {
    const data = await fixture("artifact-terminal", {
      artifacts: {
        proposal: {
          source: "disk",
          updatedAt: "2026-08-07T00:00:00.000Z",
        },
      },
    });

    const outcome = await classifyTerminalNoopExecutor(
      record(
        "artifact-terminal",
        "unmigrated_artifact_metadata",
        "classify_terminal_noop",
        data.sourcePath,
      ),
      {
        class: "unmigrated_artifact_metadata",
        action: "classify_terminal_noop",
      },
      data.ctx,
    );

    expect(outcome).toMatchObject({
      status: "skipped",
      residual: expect.stringContaining("terminal_noop"),
    });
    expect(data.beforeWrites).toHaveLength(0);
  });

  test.each([
    ["set_marker_auto", true, "worktree-marker-auto", true],
    ["set_marker_legacy", false, "worktree-marker-legacy", false],
  ] as const)(
    "normalizes missing worktree marker to %s from registry evidence",
    async (action, expected, id, withWorktree) => {
      const data = await fixture(id, {}, withWorktree);

      const outcome = await (
        expected ? setMarkerAutoExecutor : setMarkerLegacyExecutor
      )(
        record(id, "unmigrated_worktree_marker", action, data.sourcePath),
        { class: "unmigrated_worktree_marker", action },
        data.ctx,
      );

      expect(outcome.status).toBe("mutated");
      const after = JSON.parse(await readFile(data.sourcePath, "utf8"));
      expect(after.worktree_auto_managed).toBe(expected);
      expect(data.beforeWrites).toHaveLength(1);
    },
  );

  test("normalizes a missing marker to false when registry evidence is absent", async () => {
    const data = await fixture("worktree-marker-absent");

    const outcome = await setMarkerLegacyExecutor(
      record(
        "worktree-marker-absent",
        "unmigrated_worktree_marker",
        "set_marker_legacy",
        data.sourcePath,
      ),
      {
        class: "unmigrated_worktree_marker",
        action: "set_marker_legacy",
      },
      data.ctx,
    );

    expect(outcome.status).toBe("mutated");
    expect(
      JSON.parse(await readFile(data.sourcePath, "utf8")).worktree_auto_managed,
    ).toBe(false);
  });

  test("records foreign-owned residue as a benign residual without blocking the marker", async () => {
    const data = await fixture("artifact-foreign-sibling", {
      artifacts: TEMPORAL_ARTIFACTS,
    });
    await writeRawProjection(data.paths.changes, "sibling-retired-enum", {
      ...changeFixture("sibling-retired-enum", { artifacts: DISK_ARTIFACTS }),
      test_runs: RETIRED_TEST_RUNS,
    });

    const outcome = await migrateRecordExecutor(
      record(
        "artifact-foreign-sibling",
        "unmigrated_artifact_metadata",
        "migrate_record",
        data.sourcePath,
      ),
      { class: "unmigrated_artifact_metadata", action: "migrate_record" },
      data.ctx,
    );

    expect(outcome.status).toBe("mutated");
    expect(
      await markerOrNull(data.paths.artifactMetadataMigrationMarker),
    ).toMatchObject({
      dispositions: {
        "artifact-foreign-sibling": "migrated",
        "sibling-retired-enum": "benign_residual_foreign_owned",
      },
    });
  });

  test("fails closed on an unreadable sibling projection", async () => {
    const data = await fixture("artifact-unreadable-sibling", {
      artifacts: TEMPORAL_ARTIFACTS,
    });
    await mkdir(join(data.paths.changes, "sibling-corrupt"), {
      recursive: true,
    });
    await writeFile(
      join(data.paths.changes, "sibling-corrupt", "change.json"),
      "{ not-json\n",
    );

    const outcome = await migrateRecordExecutor(
      record(
        "artifact-unreadable-sibling",
        "unmigrated_artifact_metadata",
        "migrate_record",
        data.sourcePath,
      ),
      { class: "unmigrated_artifact_metadata", action: "migrate_record" },
      data.ctx,
    );

    expect(outcome.status).toBe("mutated");
    expect(
      await markerOrNull(data.paths.artifactMetadataMigrationMarker),
    ).toBeNull();
  });

  test("fails closed when a sibling is invalid for a reason no action owns", async () => {
    const data = await fixture("artifact-unowned-sibling", {
      artifacts: TEMPORAL_ARTIFACTS,
    });
    await writeRawProjection(data.paths.changes, "sibling-unowned", {
      ...changeFixture("sibling-unowned", { artifacts: DISK_ARTIFACTS }),
      status: "not-a-status",
    });

    const outcome = await migrateRecordExecutor(
      record(
        "artifact-unowned-sibling",
        "unmigrated_artifact_metadata",
        "migrate_record",
        data.sourcePath,
      ),
      { class: "unmigrated_artifact_metadata", action: "migrate_record" },
      data.ctx,
    );

    expect(outcome.status).toBe("mutated");
    expect(
      await markerOrNull(data.paths.artifactMetadataMigrationMarker),
    ).toBeNull();
  });

  test("classifies a terminal no-op whose document carries foreign-owned residue", async () => {
    const data = await fixture("artifact-foreign-noop", {
      artifacts: DISK_ARTIFACTS,
    });
    await writeRawProjection(data.paths.changes, "artifact-foreign-noop", {
      ...changeFixture("artifact-foreign-noop", { artifacts: DISK_ARTIFACTS }),
      test_runs: RETIRED_TEST_RUNS,
    });

    const outcome = await classifyTerminalNoopExecutor(
      record(
        "artifact-foreign-noop",
        "unmigrated_artifact_metadata",
        "classify_terminal_noop",
        data.sourcePath,
      ),
      {
        class: "unmigrated_artifact_metadata",
        action: "classify_terminal_noop",
      },
      data.ctx,
    );

    expect(outcome.status).toBe("skipped");
    expect(outcome.error_class).toBeUndefined();
  });

  test("keeps whole-document validation on the worktree-marker path", async () => {
    const data = await fixture("worktree-marker-foreign");
    await writeRawProjection(data.paths.changes, "worktree-marker-foreign", {
      ...changeFixture("worktree-marker-foreign"),
      test_runs: RETIRED_TEST_RUNS,
    });

    const outcome = await setMarkerLegacyExecutor(
      record(
        "worktree-marker-foreign",
        "unmigrated_worktree_marker",
        "set_marker_legacy",
        data.sourcePath,
      ),
      {
        class: "unmigrated_worktree_marker",
        action: "set_marker_legacy",
      },
      data.ctx,
    );

    expect(outcome).toMatchObject({
      status: "failed",
      error_class: "projection_validation_failed",
    });
  });
});
