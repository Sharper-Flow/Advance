import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import { ChangeSchema, type Change } from "../types";
import {
  publishSummaryForChange,
  readCurrentSummaryShard,
  summaryPaths,
  type SummaryIndexPaths,
} from "./change-summary-shard";
import {
  rebuildFromChangesExecutor,
  rebuildSummaryShardExecutor,
} from "./reconcile-action-summary";
import { getProjectPaths, saveChange } from "./json";
import type { ActionContext } from "./reconcile-action-types";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

function makeChange(id: string, overrides: Partial<Change> = {}): Change {
  return ChangeSchema.parse({
    ...SAMPLE_CHANGE,
    id,
    title: `Change ${id}`,
    status: "draft",
    lifecycleState: "open",
    projection_revision: 1,
    state_revision: 1,
    ...overrides,
  });
}

async function fixture() {
  const root = await createTempDir("reconcile-action-summary-");
  roots.push(root);
  const projectPaths = getProjectPaths(root);
  await mkdir(projectPaths.changes, { recursive: true });
  await mkdir(projectPaths.summariesDir, { recursive: true });
  const paths: SummaryIndexPaths = {
    changesDir: projectPaths.changes,
    summariesDir: projectPaths.summariesDir,
  };
  const ctx = {
    storePaths: projectPaths,
    locksHeld: [],
    runId: "reconcile-test",
    writeBeforeState: async () => "",
    auditWriter: async () => undefined,
    coordinateChangeMutation: async () => ({ kind: "committed" }),
    saveEpicOptimistic: async () => ({ status: "skipped" as const }),
  } as ActionContext;
  return { projectPaths, paths, ctx };
}

function record(
  id: string,
  className: ReconcilePlanRecord["class"],
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

async function seedCanonical(
  paths: SummaryIndexPaths,
  change: Change,
): Promise<void> {
  await saveChange(paths.changesDir, change);
}

async function pointerExists(
  paths: SummaryIndexPaths,
  id: string,
): Promise<boolean> {
  try {
    await access(summaryPaths(paths, id).pointerPath);
    return true;
  } catch {
    return false;
  }
}

describe("summary reconcile action executors", () => {
  test("rebuilds a missing current summary pointer and proves it resolves", async () => {
    const { paths, ctx } = await fixture();
    const change = makeChange("missing-pointer");
    await seedCanonical(paths, change);
    await publishSummaryForChange(paths, change);
    await rm(summaryPaths(paths, change.id).pointerPath);

    const outcome = await rebuildSummaryShardExecutor(
      record(
        change.id,
        "summary_pointer_missing",
        "rebuild_summary_shard",
        join(paths.changesDir, change.id, "change.json"),
      ),
      { class: "summary_pointer_missing", action: "rebuild_summary_shard" },
      ctx,
    );

    expect(outcome.status).toBe("mutated");
    expect(outcome.evidence?.pointer_resolves).toBe(true);
    await expect(pointerExists(paths, change.id)).resolves.toBe(true);
    await expect(
      readCurrentSummaryShard(paths, change.id),
    ).resolves.toMatchObject({
      kind: "ok",
      pointer: { projection_revision: 1 },
    });
  });

  test("refreshes a stale pointer and shard from the current canonical projection", async () => {
    const { paths, ctx } = await fixture();
    const original = makeChange("stale-pointer");
    await seedCanonical(paths, original);
    await publishSummaryForChange(paths, original);
    const current = makeChange(original.id, {
      title: "Fresh title",
      projection_revision: 2,
      state_revision: 2,
    });
    await seedCanonical(paths, current);

    const outcome = await rebuildSummaryShardExecutor(
      record(
        current.id,
        "summary_pointer_stale",
        "rebuild_summary_shard",
        join(paths.changesDir, current.id, "change.json"),
      ),
      { class: "summary_pointer_stale", action: "rebuild_summary_shard" },
      ctx,
    );

    expect(outcome.status).toBe("mutated");
    expect(outcome.evidence).toMatchObject({
      pointer_resolves: true,
      projection_revision: 2,
    });
    await expect(
      readCurrentSummaryShard(paths, current.id),
    ).resolves.toMatchObject({
      kind: "ok",
      shard: { title: "Fresh title", projection_revision: 2 },
    });
  });

  test("fails with a typed error when the canonical projection is unparseable", async () => {
    const { paths, ctx } = await fixture();
    const id = "unparseable-canonical";
    const changePath = join(paths.changesDir, id, "change.json");
    await mkdir(join(paths.changesDir, id), { recursive: true });
    await writeFile(changePath, "{ not-json");

    const outcome = await rebuildSummaryShardExecutor(
      record(
        id,
        "summary_pointer_missing",
        "rebuild_summary_shard",
        changePath,
      ),
      { class: "summary_pointer_missing", action: "rebuild_summary_shard" },
      ctx,
    );

    expect(outcome).toMatchObject({
      status: "failed",
      error_class: "canonical_projection_unparseable",
    });
    expect(await pointerExists(paths, id)).toBe(false);
  });

  test("rebuilds a missing summary artifact from the canonical projection", async () => {
    const { paths, ctx } = await fixture();
    const change = makeChange("missing-artifact", {
      projection_revision: 4,
      state_revision: 7,
    });
    await seedCanonical(paths, change);

    const outcome = await rebuildFromChangesExecutor(
      record(
        change.id,
        "store_artifact_missing",
        "rebuild_from_changes",
        join(paths.changesDir, change.id, "change.json"),
      ),
      { class: "store_artifact_missing", action: "rebuild_from_changes" },
      ctx,
    );

    expect(outcome.status).toBe("mutated");
    expect(outcome.evidence?.pointer_resolves).toBe(true);
    const current = await readCurrentSummaryShard(paths, change.id);
    expect(current).toMatchObject({
      kind: "ok",
      shard: { projection_revision: 4, state_revision: 7 },
    });
    const pointer = JSON.parse(
      await readFile(summaryPaths(paths, change.id).pointerPath, "utf8"),
    ) as { shard_path: string };
    await expect(access(pointer.shard_path)).resolves.toBeUndefined();
  });
});
