/** Deterministic reset coverage for disk-backed status-health caches. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetWorktreeCensus = vi.hoisted(() => vi.fn());
const mockScanSnapshotHealth = vi.hoisted(() => vi.fn());

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: mockGetWorktreeCensus,
}));
vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: mockScanSnapshotHealth,
}));

import {
  fetchStatusSnapshotHealth,
  fetchStatusWorktreeCensus,
  healthSnapshotCache,
} from "./status-health";
import { resetStatusHealthForTest } from "./status-health-test-reset";

const HEALTHY_CENSUS = {
  total: 1,
  stale: [],
  records: [{ path: "/tmp/main", stale: false, age_ms: 0 }],
  warnings: [],
};
const DIRTY_CENSUS = { total: 0, stale: [], records: [], warnings: ["boom"] };
const HEALTHY_SNAPSHOT = {
  schema_version: 1,
  scan_duration_ms: 1,
  scope: "project",
  project_id: "unknown",
  summary: {
    projects_scanned: 1,
    bare_repos_scanned: 1,
    critical: 0,
    warnings: 0,
    info: 0,
  },
  findings: [],
};
const DIRTY_SNAPSHOT = {
  ...HEALTHY_SNAPSHOT,
  summary: { ...HEALTHY_SNAPSHOT.summary, critical: 4 },
};

describe("resetStatusHealthForTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorktreeCensus.mockResolvedValue(HEALTHY_CENSUS);
    mockScanSnapshotHealth.mockResolvedValue(HEALTHY_SNAPSHOT);
    resetStatusHealthForTest();
  });

  afterEach(() => resetStatusHealthForTest());

  it("clears the long-lived health snapshot cache", () => {
    healthSnapshotCache.set("key", {
      snapshot: {
        leaked_source_dirs: 1,
        leaked_archived_source_dirs: 0,
        archive_dirs: 0,
        closed_to_active_ratio: 0,
      },
      computedAt: 1,
    });
    expect(healthSnapshotCache.size).toBe(1);

    resetStatusHealthForTest();

    expect(healthSnapshotCache.size).toBe(0);
  });

  it("clears the worktree census cache so the next fetch sees new disk evidence", async () => {
    const first = await fetchStatusWorktreeCensus("/repo");
    expect(first.value.total).toBe(1);

    mockGetWorktreeCensus.mockResolvedValue(DIRTY_CENSUS);
    resetStatusHealthForTest();

    const second = await fetchStatusWorktreeCensus("/repo");
    expect(second.value.total).toBe(0);
    expect(second.value.warnings).toEqual(["boom"]);
  });

  it("clears the snapshot-health cache so the next fetch sees new integrity evidence", async () => {
    const first = await fetchStatusSnapshotHealth("project-1");
    expect(first.value.summary.critical).toBe(0);

    mockScanSnapshotHealth.mockResolvedValue(DIRTY_SNAPSHOT);
    resetStatusHealthForTest();

    const second = await fetchStatusSnapshotHealth("project-1");
    expect(second.value.summary.critical).toBe(4);
  });

  it("is a single reset surface for both disk probe caches", async () => {
    await fetchStatusWorktreeCensus("project-1");
    await fetchStatusSnapshotHealth("project-1");
    resetStatusHealthForTest();

    mockGetWorktreeCensus.mockResolvedValue(DIRTY_CENSUS);
    mockScanSnapshotHealth.mockResolvedValue(DIRTY_SNAPSHOT);
    const census = await fetchStatusWorktreeCensus("project-1");
    const snapshot = await fetchStatusSnapshotHealth("project-1");
    expect(census.value.warnings).toEqual(["boom"]);
    expect(snapshot.value.summary.critical).toBe(4);
  });
});
