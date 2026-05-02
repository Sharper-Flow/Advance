/**
 * Change Diagnose Tool Tests
 *
 * TDD tests for adv_change_diagnose divergence inspector.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { changeDiagnoseTools } from "./change-diagnose";
import { createLegacyStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";

describe("Change Diagnose Tool", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("detects gate divergences between disk and Temporal", async () => {
    // Write a change to disk with specific gate state
    const changeDir = join(tempDir, ".adv/changes/divergentChange");
    await mkdir(changeDir, { recursive: true });
    await writeFile(
      join(changeDir, "change.json"),
      JSON.stringify(
        {
          $schema: "https://advance.dev/schemas/change.v1.json",
          id: "divergentChange",
          title: "Divergent Change",
          status: "active",
          created_at: "2026-01-21T00:00:00Z",
          tasks: [],
          deltas: {},
          gates: {
            proposal: { status: "done" },
            discovery: { status: "done" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
        },
        null,
        2,
      ),
    );

    // Mock Temporal store to return DIFFERENT gate state
    const temporalChange = {
      id: "divergentChange",
      title: "Divergent Change",
      status: "active",
      created_at: "2026-01-21T00:00:00Z",
      tasks: [],
      deltas: {},
      gates: {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" }, // DIFFERENT: done on Temporal, pending on disk
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      },
    };

    store.changes.get = vi.fn(async () => ({
      success: true,
      data: temporalChange as any,
    }));

    const result = await changeDiagnoseTools.adv_change_diagnose.execute(
      { changeId: "divergentChange" },
      store,
    );

    const parsed = parseToolOutput(result);

    expect(parsed.changeId).toBe("divergentChange");
    expect(parsed.disk.status).toBe("active");
    expect(parsed.temporal.status).toBe("active");
    expect(parsed.disk.gates.design).toBe("pending");
    expect(parsed.temporal.gates.design).toBe("done");
    expect(parsed.divergences).toHaveLength(1);
    expect(parsed.divergences[0]).toMatchObject({
      field: "gates.design.status",
      disk: "pending",
      temporal: "done",
    });
    expect(parsed.recommendedFix).toBe(
      "Gates differ between disk and Temporal. Run `adv_workflow_repair changeId: <id>` to rebind.",
    );
  });

  test("detects status divergence between disk and Temporal", async () => {
    const changeDir = join(tempDir, ".adv/changes/statusDiverge");
    await mkdir(changeDir, { recursive: true });
    await writeFile(
      join(changeDir, "change.json"),
      JSON.stringify(
        {
          $schema: "https://advance.dev/schemas/change.v1.json",
          id: "statusDiverge",
          title: "Status Diverge",
          status: "active",
          created_at: "2026-01-21T00:00:00Z",
          tasks: [],
          deltas: {},
          gates: {
            proposal: { status: "done" },
            discovery: { status: "done" },
            design: { status: "done" },
            planning: { status: "done" },
            execution: { status: "done" },
            acceptance: { status: "done" },
            release: { status: "done" },
          },
        },
        null,
        2,
      ),
    );

    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "statusDiverge",
        title: "Status Diverge",
        status: "archived", // DIFFERENT
        created_at: "2026-01-21T00:00:00Z",
        tasks: [],
        deltas: {},
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "done" },
        },
      } as any,
    }));

    const result = await changeDiagnoseTools.adv_change_diagnose.execute(
      { changeId: "statusDiverge" },
      store,
    );

    const parsed = parseToolOutput(result);

    expect(parsed.divergences).toHaveLength(1);
    expect(parsed.divergences[0]).toMatchObject({
      field: "status",
      disk: "active",
      temporal: "archived",
    });
  });

  test("reports no divergences when disk and Temporal agree", async () => {
    const changeDir = join(tempDir, ".adv/changes/inSync");
    await mkdir(changeDir, { recursive: true });
    await writeFile(
      join(changeDir, "change.json"),
      JSON.stringify(
        {
          $schema: "https://advance.dev/schemas/change.v1.json",
          id: "inSync",
          title: "In Sync",
          status: "active",
          created_at: "2026-01-21T00:00:00Z",
          tasks: [
            {
              id: "tk-1",
              title: "Task",
              section: "A",
              status: "pending",
              priority: 0,
              deps: [],
              created_at: "2026-01-21T00:00:00Z",
            },
          ],
          deltas: {},
          gates: {
            proposal: { status: "done" },
            discovery: { status: "done" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
        },
        null,
        2,
      ),
    );

    // Temporal returns the SAME data
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "inSync",
        title: "In Sync",
        status: "active",
        created_at: "2026-01-21T00:00:00Z",
        tasks: [
          {
            id: "tk-1",
            title: "Task",
            section: "A",
            status: "pending",
            priority: 0,
            deps: [],
            created_at: "2026-01-21T00:00:00Z",
          },
        ],
        deltas: {},
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "pending" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
      } as any,
    }));

    const result = await changeDiagnoseTools.adv_change_diagnose.execute(
      { changeId: "inSync" },
      store,
    );

    const parsed = parseToolOutput(result);

    expect(parsed.divergences).toHaveLength(0);
    expect(parsed.recommendedFix).toBe(
      "No divergence detected. Both disk and Temporal agree.",
    );
    expect(parsed.disk.taskCount).toBe(1);
  });

  test("detects change missing on Temporal but present on disk", async () => {
    const changeDir = join(tempDir, ".adv/changes/orphanDisk");
    await mkdir(changeDir, { recursive: true });
    await writeFile(
      join(changeDir, "change.json"),
      JSON.stringify(
        {
          $schema: "https://advance.dev/schemas/change.v1.json",
          id: "orphanDisk",
          title: "Orphan Disk",
          status: "active",
          created_at: "2026-01-21T00:00:00Z",
          tasks: [],
          deltas: {},
        },
        null,
        2,
      ),
    );

    // Temporal does not have this change
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: null,
    }));

    const result = await changeDiagnoseTools.adv_change_diagnose.execute(
      { changeId: "orphanDisk" },
      store,
    );

    const parsed = parseToolOutput(result);

    expect(parsed.divergences).toHaveLength(1);
    expect(parsed.divergences[0]).toMatchObject({
      field: "existence",
      disk: "present",
      temporal: "missing",
    });
    expect(parsed.recommendedFix).toBe(
      "Change exists on disk but not in Temporal. Run `adv_change_import source_path: <dir>`.",
    );
  });

  test("detects change present on Temporal but missing on disk", async () => {
    // No change written to disk for "ghostTemporal"
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "ghostTemporal",
        title: "Ghost Temporal",
        status: "active",
        created_at: "2026-01-21T00:00:00Z",
        tasks: [],
        deltas: {},
      } as any,
    }));

    const result = await changeDiagnoseTools.adv_change_diagnose.execute(
      { changeId: "ghostTemporal" },
      store,
    );

    const parsed = parseToolOutput(result);

    expect(parsed.divergences).toHaveLength(1);
    expect(parsed.divergences[0]).toMatchObject({
      field: "existence",
      disk: "missing",
      temporal: "present",
    });
    expect(parsed.recommendedFix).toBe(
      "Temporal has change but disk does not. Likely cleanup-after-archive race; run `adv_archive_sweep_orphans dryRun: true includeClosed: true` to investigate.",
    );
  });
});
