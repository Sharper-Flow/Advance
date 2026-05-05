import { describe, expect, it } from "vitest";
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { join } from "path";

import { createDefaultGates } from "../types";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import type { ChangeWorkflowState } from "./contracts";
import { deleteActiveProjection, writeChangeProjection } from "./activities";

function makeState(changeId = "projection-change"): ChangeWorkflowState {
  return {
    projectId: "projection-project",
    changeId,
    id: changeId,
    title: "Projection test",
    initializedAt: "2026-05-05T00:00:00.000Z",
    status: "active",
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
