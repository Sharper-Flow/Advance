import { describe, expect, it } from "vitest";
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { join } from "path";

import { createDefaultGates } from "../types";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import type { ChangeWorkflowState } from "./contracts";
import { deleteActiveProjection, writeChangeProjection } from "./activities";
import { LauncherProjectionSchema } from "../storage/launcher-projection";

function makeState(changeId = "projection-change"): ChangeWorkflowState {
  return {
    projectId: "0000ec00000000ec000000000000000000000000",
    changeId,
    id: changeId,
    title: "Projection test",
    initializedAt: "2026-05-05T00:00:00.000Z",
    status: "draft",
    createdAt: "2026-05-05T00:00:00.000Z",
    tasks: [],
    wisdom: [],
    gates: createDefaultGates(),
    artifacts: {},
    reentry_history: [],
  };
}

describe("writeChangeProjection", () => {
  it("writes a schemaVersion 2 projection and creates parent dirs", async () => {
    const dir = await createTempDir();
    try {
      const projectionChangesDir = join(dir, "external", "changes");
      const state = makeState("my-change");

      const result = await writeChangeProjection({
        projectionChangesDir,
        state,
        projectedAt: "2026-05-05T01:00:00.000Z",
      });

      expect(result.ok).toBe(true);
      expect(result.path).toBe(join(projectionChangesDir, "my-change.json"));
      const raw = await readFile(result.path!, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.schemaVersion).toBe(2);
      expect(parsed.projectedAt).toBe("2026-05-05T01:00:00.000Z");
      expect(parsed.state.changeId).toBe("my-change");
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("uses tmp+rename atomicity and leaves no temp files after success", async () => {
    const dir = await createTempDir();
    try {
      const projectionChangesDir = join(dir, "changes");
      const result = await writeChangeProjection({
        projectionChangesDir,
        state: makeState("atomic-change"),
        projectedAt: "2026-05-05T01:00:00.000Z",
      });

      expect(result.ok).toBe(true);
      const files = await readdir(projectionChangesDir);
      expect(files).toEqual(["atomic-change.json"]);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("is idempotent for identical input", async () => {
    const dir = await createTempDir();
    try {
      const projectionChangesDir = join(dir, "changes");
      const input = {
        projectionChangesDir,
        state: makeState("idempotent-change"),
        projectedAt: "2026-05-05T01:00:00.000Z",
      };

      const first = await writeChangeProjection(input);
      const firstRaw = await readFile(first.path!, "utf-8");
      const second = await writeChangeProjection(input);
      const secondRaw = await readFile(second.path!, "utf-8");

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      expect(secondRaw).toBe(firstRaw);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("keeps valid JSON when concurrent writes race", async () => {
    const dir = await createTempDir();
    try {
      const projectionChangesDir = join(dir, "changes");
      const states = ["one", "two", "three"].map((suffix) => ({
        ...makeState("race-change"),
        title: `Projection ${suffix}`,
      }));

      const results = await Promise.all(
        states.map((state) =>
          writeChangeProjection({
            projectionChangesDir,
            state,
            projectedAt: "2026-05-05T01:00:00.000Z",
          }),
        ),
      );

      expect(results.every((result) => result.ok)).toBe(true);
      const raw = await readFile(
        join(projectionChangesDir, "race-change.json"),
        "utf-8",
      );
      const parsed = JSON.parse(raw);
      expect(parsed.schemaVersion).toBe(2);
      expect([
        "Projection one",
        "Projection two",
        "Projection three",
      ]).toContain(parsed.state.title);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("also writes the aggregate active-launcher-state.json", async () => {
    const dir = await createTempDir();
    try {
      const externalRoot = join(dir, "external");
      const projectionChangesDir = join(externalRoot, "changes");
      const state = makeState("aggregate-change");
      state.status = "active";

      const result = await writeChangeProjection({
        projectionChangesDir,
        state,
        projectedAt: "2026-05-05T01:00:00.000Z",
      });

      expect(result.ok).toBe(true);
      const aggregatePath = join(externalRoot, "active-launcher-state.json");
      const aggregateRaw = await readFile(aggregatePath, "utf-8");
      const aggregate = JSON.parse(aggregateRaw);
      const validated = LauncherProjectionSchema.parse(aggregate);
      expect(validated.schema_version).toBe(1);
      expect(validated.source).toBe("disk_projection");
      expect(validated.active_count).toBe(1);
      expect(validated.changes[0]?.id).toBe("aggregate-change");
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("does not fail the per-change write when the aggregate write fails", async () => {
    const dir = await createTempDir();
    try {
      const externalRoot = join(dir, "external");
      const projectionChangesDir = join(externalRoot, "changes");
      await mkdir(projectionChangesDir, { recursive: true });
      // Make the aggregate target a directory so atomicWriteFile cannot overwrite it.
      await mkdir(join(externalRoot, "active-launcher-state.json"));

      const result = await writeChangeProjection({
        projectionChangesDir,
        state: makeState("aggregate-fail-change"),
        projectedAt: "2026-05-05T01:00:00.000Z",
      });

      expect(result.ok).toBe(true);
      expect(result.path).toBe(
        join(projectionChangesDir, "aggregate-fail-change.json"),
      );
      const perChangeRaw = await readFile(
        join(projectionChangesDir, "aggregate-fail-change.json"),
        "utf-8",
      );
      expect(JSON.parse(perChangeRaw).state.changeId).toBe(
        "aggregate-fail-change",
      );
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("publishes a summary pointer and exposes its projection_revision in the aggregate", async () => {
    const dir = await createTempDir();
    try {
      const externalRoot = join(dir, "external");
      const projectionChangesDir = join(externalRoot, "changes");
      const state = makeState("revision-change");
      state.status = "draft";
      state.state_revision = 7;

      const result = await writeChangeProjection({
        projectionChangesDir,
        state,
        projectedAt: "2026-05-05T01:00:00.000Z",
      });

      expect(result.ok).toBe(true);
      const pointerPath = join(
        externalRoot,
        "summaries",
        "revision-change",
        "current.json",
      );
      const pointerRaw = JSON.parse(await readFile(pointerPath, "utf-8"));
      expect(pointerRaw.projection_revision).toBe(7);

      const aggregatePath = join(externalRoot, "active-launcher-state.json");
      const aggregate = LauncherProjectionSchema.parse(
        JSON.parse(await readFile(aggregatePath, "utf-8")),
      );
      expect(aggregate.active_count).toBe(1);
      expect(aggregate.changes[0]?.id).toBe("revision-change");
      expect(aggregate.changes[0]?.projection_revision).toBe(7);
    } finally {
      await cleanupTempDir(dir);
    }
  });
});

describe("deleteActiveProjection", () => {
  it("removes the active projection and treats missing files as success", async () => {
    const dir = await createTempDir();
    try {
      const projectionChangesDir = join(dir, "changes");
      await mkdir(projectionChangesDir, { recursive: true });
      const projectionPath = join(projectionChangesDir, "delete-me.json");
      await writeFile(projectionPath, "{}", "utf-8");

      const removed = await deleteActiveProjection({
        projectionChangesDir,
        changeId: "delete-me",
      });
      const missing = await deleteActiveProjection({
        projectionChangesDir,
        changeId: "delete-me",
      });

      expect(removed.ok).toBe(true);
      expect(missing.ok).toBe(true);
      await expect(stat(projectionPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });
});
