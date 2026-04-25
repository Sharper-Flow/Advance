/**
 * Orphan sweep integration tests.
 *
 * Validates the per-project sweep logic against a simulated multi-project
 * dataset. Mocks the Temporal client at the WorkflowClientLike interface
 * boundary (start/getHandle/describe) since the real Temporal stack is
 * already exercised by P1.9 e2e-tool-calls.itest.ts.
 *
 * Behavioral contract:
 * 1. Valid change with existing workflow → leave alone (no start call)
 * 2. Valid change with missing workflow (orphan) → reseed via reImportChangeState
 * 3. Corrupted change.json → skip with structured warning
 * 4. Multi-project sweep aggregates per-project results
 */

import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import { sweepProject, sweepAllProjects } from "./orphan-sweep";
import { buildChangeWorkflowId } from "./client";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import type { Change } from "../types";

interface RecordedStart {
  workflowId: string;
  taskQueue: string;
  args: [unknown];
}

function makeChange(id: string, title: string): Change {
  return {
    id,
    title,
    status: "draft",
    created_at: "2026-04-25T00:00:00.000Z",
    tasks: [],
    wisdom: [],
    deltas: {},
    gates: {
      proposal: { status: "pending" },
      discovery: { status: "pending" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    reentry_history: [],
  } as unknown as Change;
}

interface MockClient {
  starts: RecordedStart[];
  existing: Set<string>;
  workflow: {
    start: (...args: unknown[]) => Promise<{ workflowId: string }>;
    getHandle: (workflowId: string) => {
      describe: () => Promise<{ workflowId: string }>;
      query: () => Promise<unknown>;
      executeUpdate: () => Promise<unknown>;
    };
  };
}

function createMockClient(existingWorkflowIds: string[] = []): MockClient {
  const existing = new Set(existingWorkflowIds);
  const starts: RecordedStart[] = [];

  const handles = (workflowId: string) => ({
    describe: async () => {
      if (existing.has(workflowId)) {
        return { workflowId };
      }
      const err = new Error(
        `workflow execution not found: ${workflowId}`,
      ) as Error & { code?: number; details?: string };
      // Mimic Temporal SDK NotFoundError shape (code 5 = NOT_FOUND in gRPC)
      err.code = 5;
      err.details = "workflow execution not found";
      throw err;
    },
    query: async () => ({ workflowId }),
    executeUpdate: async () => undefined,
  });

  return {
    starts,
    existing,
    workflow: {
      start: async (
        _workflow: unknown,
        opts: { workflowId: string; taskQueue: string; args: [unknown] },
      ) => {
        starts.push({
          workflowId: opts.workflowId,
          taskQueue: opts.taskQueue,
          args: opts.args,
        });
        existing.add(opts.workflowId);
        return handles(opts.workflowId);
      },
      getHandle: handles,
    },
  };
}

describe("orphan-sweep", () => {
  describe("sweepProject", () => {
    it("reseeds orphans, leaves valid changes alone, skips corrupted", async () => {
      const tempDir = await createTempDir();
      const projectId = "a".repeat(40);
      const changesDir = join(tempDir, projectId, "changes");
      await mkdir(changesDir, { recursive: true });

      // Valid + workflow exists
      const validChange = makeChange("validChange", "Valid Change");
      await mkdir(join(changesDir, validChange.id), { recursive: true });
      await writeFile(
        join(changesDir, validChange.id, "change.json"),
        JSON.stringify(validChange, null, 2),
      );

      // Orphan: valid disk, no workflow
      const orphanChange = makeChange("orphanChange", "Orphan Change");
      await mkdir(join(changesDir, orphanChange.id), { recursive: true });
      await writeFile(
        join(changesDir, orphanChange.id, "change.json"),
        JSON.stringify(orphanChange, null, 2),
      );

      // Corrupted: malformed JSON
      const corruptedId = "corruptedChange";
      await mkdir(join(changesDir, corruptedId), { recursive: true });
      await writeFile(
        join(changesDir, corruptedId, "change.json"),
        "{ this is not valid json",
      );

      const client = createMockClient([
        buildChangeWorkflowId(projectId, validChange.id),
      ]);

      try {
        const result = await sweepProject({
          projectId,
          changesDir,
          client,
        });

        expect(result.projectId).toBe(projectId);
        expect(result.processed).toBe(3);
        expect(result.reseeded).toEqual([orphanChange.id]);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0]).toMatchObject({
          changeId: corruptedId,
        });
        expect(result.skipped[0].reason).toMatch(/parse|schema|json/i);
        expect(result.failed).toEqual([]);

        // Reseed call: exactly one start, for the orphan, with full seed state
        expect(client.starts).toHaveLength(1);
        expect(client.starts[0].workflowId).toBe(
          buildChangeWorkflowId(projectId, orphanChange.id),
        );
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it("returns empty result when changes dir does not exist", async () => {
      const tempDir = await createTempDir();
      const projectId = "b".repeat(40);
      const changesDir = join(tempDir, projectId, "changes");
      // Note: changesDir not created

      const client = createMockClient();

      try {
        const result = await sweepProject({
          projectId,
          changesDir,
          client,
        });

        expect(result.processed).toBe(0);
        expect(result.reseeded).toEqual([]);
        expect(result.skipped).toEqual([]);
        expect(result.failed).toEqual([]);
        expect(client.starts).toEqual([]);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it("classifies workflow.start failures as failed (not skipped)", async () => {
      const tempDir = await createTempDir();
      const projectId = "c".repeat(40);
      const changesDir = join(tempDir, projectId, "changes");
      await mkdir(changesDir, { recursive: true });

      const orphan = makeChange("startFailureChange", "Start Failure");
      await mkdir(join(changesDir, orphan.id), { recursive: true });
      await writeFile(
        join(changesDir, orphan.id, "change.json"),
        JSON.stringify(orphan, null, 2),
      );

      const client = createMockClient();
      // Override start to fail
      client.workflow.start = async () => {
        throw new Error("temporal server is unavailable");
      };

      try {
        const result = await sweepProject({
          projectId,
          changesDir,
          client,
        });

        expect(result.processed).toBe(1);
        expect(result.reseeded).toEqual([]);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0]).toMatchObject({
          changeId: orphan.id,
        });
        expect(result.failed[0].error).toMatch(/temporal server/i);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe("sweepAllProjects", () => {
    it("aggregates results across multiple project dirs", async () => {
      const tempDir = await createTempDir();
      const project1 = "1".repeat(40);
      const project2 = "2".repeat(40);

      // project1: 1 orphan
      const p1Changes = join(tempDir, project1, "changes");
      await mkdir(p1Changes, { recursive: true });
      const p1Orphan = makeChange("p1Orphan", "P1 Orphan");
      await mkdir(join(p1Changes, p1Orphan.id), { recursive: true });
      await writeFile(
        join(p1Changes, p1Orphan.id, "change.json"),
        JSON.stringify(p1Orphan, null, 2),
      );

      // project2: 1 corrupted
      const p2Changes = join(tempDir, project2, "changes");
      await mkdir(p2Changes, { recursive: true });
      await mkdir(join(p2Changes, "p2Corrupted"), { recursive: true });
      await writeFile(
        join(p2Changes, "p2Corrupted", "change.json"),
        "not json",
      );

      // Non-project dir (e.g. cache file at root) — must be ignored
      await writeFile(join(tempDir, "stray-file.txt"), "ignore me");

      const client = createMockClient();

      try {
        const result = await sweepAllProjects({
          stateRoot: tempDir,
          client,
        });

        expect(result.totalProcessed).toBe(2);
        expect(result.totalReseeded).toBe(1);
        expect(result.totalSkipped).toBe(1);
        expect(result.totalFailed).toBe(0);
        expect(result.perProject).toHaveLength(2);

        const p1Result = result.perProject.find(
          (r) => r.projectId === project1,
        );
        expect(p1Result?.reseeded).toEqual([p1Orphan.id]);

        const p2Result = result.perProject.find(
          (r) => r.projectId === project2,
        );
        expect(p2Result?.skipped).toHaveLength(1);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it("only descends into directories whose names look like project IDs", async () => {
      const tempDir = await createTempDir();
      const validProject = "f".repeat(40);
      const invalidProject = "not-a-sha";

      // Both contain change dirs, but only the SHA one is a project
      for (const id of [validProject, invalidProject]) {
        const cd = join(tempDir, id, "changes");
        await mkdir(cd, { recursive: true });
        await mkdir(join(cd, "someChange"), { recursive: true });
        await writeFile(
          join(cd, "someChange", "change.json"),
          JSON.stringify(makeChange("someChange", "Some"), null, 2),
        );
      }

      const client = createMockClient();

      try {
        const result = await sweepAllProjects({
          stateRoot: tempDir,
          client,
        });

        expect(result.perProject).toHaveLength(1);
        expect(result.perProject[0].projectId).toBe(validProject);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });
});
