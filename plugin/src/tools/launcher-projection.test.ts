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
import type { Store } from "../storage/store";

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

function writeChangeProjection(
  changesDir: string,
  changeId: string,
  state: Record<string, unknown>,
) {
  return writeFile(
    join(changesDir, `${changeId}.json`),
    JSON.stringify(
      {
        schemaVersion: 2,
        projectId: "test-project",
        changeId,
        projectedAt: "2026-07-23T12:00:00.000Z",
        state,
      },
      null,
      2,
    ),
  );
}

function makeState(changeId: string): Record<string, unknown> {
  return {
    id: changeId,
    title: `Title ${changeId}`,
    status: "draft",
    createdAt: "2026-07-23T10:00:00.000Z",
    tasks: [],
    gates: {
      proposal: { status: "pending" },
      discovery: { status: "pending" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
  };
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
    await mkdir(changesDir, { recursive: true });
    await mkdir(archiveDir, { recursive: true });

    store = {
      paths: {
        root: tempDir,
        external: externalRoot,
        changes: changesDir,
        archive: archiveDir,
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

  test("regenerates active-launcher-state.json from seeded changes dir", async () => {
    await writeChangeProjection(
      store.paths.changes,
      "change-a",
      makeState("change-a"),
    );
    await writeChangeProjection(
      store.paths.changes,
      "change-b",
      makeState("change-b"),
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
});
