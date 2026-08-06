/** Disk-backed status/health integration coverage after Temporal removal. */

process.env.ADV_TOOL_MAX_CHARS = "1000000";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
import { createDiskStore } from "../storage/store-disk";
import type { Store } from "../storage/store";
import { statusTools } from "./status";
import * as worktree from "./worktree";

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: vi.fn(async () => ({
    total: 0,
    stale: [],
    records: [],
    warnings: [],
  })),
}));
vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: vi.fn(async () => ({
    schema_version: 1,
    scan_duration_ms: 0,
    scope: "project",
    project_id: "unknown",
    summary: {
      projects_scanned: 0,
      bare_repos_scanned: 0,
      critical: 0,
      warnings: 0,
      info: 0,
    },
    findings: [],
  })),
}));

function change(id: string, createdAt: string): Record<string, unknown> {
  return {
    id,
    title: `Change ${id}`,
    status: "draft",
    created_at: createdAt,
    tasks: [],
    deltas: {},
    gates: {},
    wisdom: [],
  };
}

describe("disk-backed status and health integration", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir("adv-status-health-");
    await createTestProject(tempDir, { withChanges: false, withSpecs: true });
    store = await createDiskStore(tempDir);
  });

  afterEach(async () => {
    store?.close();
    await cleanupTempDir(tempDir);
  });

  test("source-ranked disk reads admit only the requested recent limit", async () => {
    for (let i = 0; i < 15; i++) {
      await store.changes.save(
        change(
          `change-${i.toString().padStart(2, "0")}`,
          `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        ) as never,
      );
    }

    const result = await store.status({ recentLimit: 10, sourceRanked: true });
    expect(result.changes.recent).toHaveLength(10);
    expect(result.hydrationStats?.boundedOmitted).toBeGreaterThanOrEqual(5);
    expect(result.changes.recent[0]?.id).toBe("change-14");
  });

  test("health view preserves bounded execution metadata", async () => {
    const parsed = parseToolOutput(
      await statusTools.adv_status.execute({ view: "health" }, store),
    );

    expect(parsed._health_execution).toMatchObject({
      schema_version: "1.0",
      response_deadline_ms: 8000,
      execution_cutoff_ms: 7500,
      composition_reserve_ms: 500,
      max_concurrency: 4,
      candidate_limit: 10,
    });
    expect(parsed._health_execution.outcomes).not.toHaveProperty(
      "temporal_health",
    );
  }, 20_000);

  test("health view does not invoke destructive worktree cleanup", async () => {
    const cleanupSpy = vi
      .spyOn(worktree, "advWorktreeCleanup")
      .mockResolvedValue({ total: 0, classes: {} } as never);

    const result = parseToolOutput(
      await statusTools.adv_status.execute({ view: "health" }, store),
    );

    expect(cleanupSpy).not.toHaveBeenCalled();
    expect(result.terminal_cleanup_retained).toBeDefined();
    expect(JSON.stringify(result.terminal_cleanup_retained)).not.toMatch(
      /drained|deleted/i,
    );
  }, 20_000);
});
