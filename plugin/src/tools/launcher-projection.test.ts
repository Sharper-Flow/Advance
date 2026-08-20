/**
 * Launcher Projection Tool Tests
 */

import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { launcherProjectionTools } from "./launcher-projection";
import {
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { getProjectId, getExternalRoot } from "../utils/project-id";
import type { Store } from "../storage/store-types";
import { ChangeSchema } from "../types";
import { SAMPLE_CHANGE } from "../__tests__/setup";

async function initGitRepo(dir: string): Promise<void> {
  const { execFile } = await import("child_process");
  await new Promise<void>((resolve, reject) => {
    execFile("git", ["init"], { cwd: dir }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    execFile(
      "git",
      ["config", "user.email", "test@example.com"],
      { cwd: dir },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
  await new Promise<void>((resolve, reject) => {
    execFile(
      "git",
      ["config", "user.name", "Test User"],
      { cwd: dir },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
  await writeFile(join(dir, "initial.txt"), "initial", "utf-8");
  await new Promise<void>((resolve, reject) => {
    execFile("git", ["add", "."], { cwd: dir }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    execFile("git", ["commit", "-m", "initial"], { cwd: dir }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function writeSummaryProjection(
  summariesDir: string,
  changesDir: string,
  changeId: string,
  writeCanonical = true,
): Promise<void> {
  const changeDir = join(summariesDir, changeId);
  const revDir = join(changeDir, "revisions");
  await mkdir(revDir, { recursive: true });

  const shardPath = join(revDir, "1.json");
  const pointerPath = join(changeDir, "current.json");
  const shard = {
    schema_version: 1,
    id: changeId,
    title: `Title ${changeId}`,
    status: "draft",
    phase: "proposal",
    created_at: "2026-07-23T10:00:00.000Z",
    last_activity_at: new Date().toISOString(),
    task_count: 0,
    completed_tasks: 0,
    state_revision: 0,
    operation_id: "test",
    projection_revision: 1,
    capabilities: [],
  };
  const pointer = {
    schema_version: 1,
    change_id: changeId,
    state_revision: 0,
    projection_revision: 1,
    operation_id: "test",
    shard_path: shardPath,
    snapshot_path: join(changesDir, changeId, "change.json"),
    committed_at: "2026-07-23T12:00:00.000Z",
  };

  await writeFile(shardPath, JSON.stringify(shard, null, 2));
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2));
  if (writeCanonical) {
    await mkdir(join(changesDir, changeId), { recursive: true });
    await writeFile(
      join(changesDir, changeId, "change.json"),
      JSON.stringify({
        ...SAMPLE_CHANGE,
        id: changeId,
        status: "active",
        lastSignalAt: new Date().toISOString(),
      }),
    );
  }
}

describe("adv_launcher_projection_rebuild", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir("adv-launcher-rebuild-");
    await initGitRepo(tempDir);
    const projectId = await getProjectId(tempDir);
    if (!projectId) {
      throw new Error("Failed to resolve test projectId");
    }
    const externalRoot = getExternalRoot(projectId);
    const changesDir = join(externalRoot, "changes");
    const archiveDir = join(externalRoot, "archive");
    const summariesDir = join(externalRoot, "summaries");
    await mkdir(changesDir, { recursive: true });
    await mkdir(archiveDir, { recursive: true });
    await mkdir(summariesDir, { recursive: true });

    store = {
      paths: {
        root: tempDir,
        external: externalRoot,
        changes: changesDir,
        archive: archiveDir,
        summariesDir,
        specs: join(tempDir, ".adv/specs"),
        docs: join(tempDir, "docs/specs"),
        config: join(tempDir, "project.json"),
        retiredEpics: join(externalRoot, "retired-epics"),
        wisdom: join(externalRoot, "wisdom.jsonl"),
        reflections: join(externalRoot, "reflections.jsonl"),
        projectMetadata: join(externalRoot, "project-metadata.json"),
        snapshotRepairAudit: join(externalRoot, "snapshot-repair-audit.jsonl"),
      },
      config: null,
    } as unknown as Store;
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("regenerates active-launcher-state.json from seeded summary pointers", async () => {
    await writeSummaryProjection(
      store.paths.summariesDir,
      store.paths.changes,
      "change-a",
    );
    await writeSummaryProjection(
      store.paths.summariesDir,
      store.paths.changes,
      "change-b",
    );

    const result =
      await launcherProjectionTools.adv_launcher_projection_rebuild.execute(
        {},
        store,
      );

    const parsed = parseToolOutput<{
      ok: boolean;
      path: string;
      active_count: number;
      generated_at: string;
      degraded: boolean;
    }>(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.active_count).toBe(2);
    expect(parsed.degraded).toBe(false);
    expect(parsed.path).toBe(
      join(store.paths.external!, "active-launcher-state.json"),
    );

    const raw = await import("fs/promises").then((m) =>
      m.readFile(parsed.path, "utf-8"),
    );
    const aggregate = JSON.parse(raw);
    expect(aggregate.schema_version).toBe(1);
    expect(aggregate.active_count).toBe(2);
    expect(aggregate.changes.map((c: { id: string }) => c.id).sort()).toEqual([
      "change-a",
      "change-b",
    ]);
  });

  test("regenerates stale summary counts from canonical change.json, never flat state", async () => {
    const changeId = "promotePptPricesCanonical";
    const canonical = ChangeSchema.parse({
      ...SAMPLE_CHANGE,
      id: changeId,
      title: "Canonical prices",
      status: "draft",
      lifecycleState: "open",
      projection_revision: 21,
      state_revision: 21,
      tasks: Array.from({ length: 12 }, (_, i) => ({
        id: `tk-${i}`,
        title: `Task ${i}`,
        type: "code",
        status: "pending",
        priority: i,
        created_at: "2026-07-23T10:00:00.000Z",
      })),
    });
    await mkdir(join(store.paths.changes, changeId), { recursive: true });
    await writeFile(
      join(store.paths.changes, changeId, "change.json"),
      JSON.stringify(canonical),
    );
    await writeFile(
      join(store.paths.changes, `${changeId}.json`),
      JSON.stringify({
        state: { tasks: [], projection_revision: 0, state_revision: 0 },
      }),
    );
    await writeSummaryProjection(
      store.paths.summariesDir,
      store.paths.changes,
      changeId,
      false,
    );

    const result =
      await launcherProjectionTools.adv_launcher_projection_rebuild.execute(
        {},
        store,
      );
    const parsed = parseToolOutput<{
      ok: boolean;
      degraded: boolean;
    }>(result);
    expect(parsed.ok).toBe(true);

    const pointer = JSON.parse(
      await import("fs/promises").then((m) =>
        m.readFile(
          join(store.paths.summariesDir, changeId, "current.json"),
          "utf-8",
        ),
      ),
    );
    const shard = JSON.parse(
      await import("fs/promises").then((m) =>
        m.readFile(pointer.shard_path, "utf-8"),
      ),
    );
    expect(pointer.projection_revision).toBe(21);
    expect(shard.task_count).toBe(12);
    expect(shard.projection_revision).toBe(21);
  });
});
