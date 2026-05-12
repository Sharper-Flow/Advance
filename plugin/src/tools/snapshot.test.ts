/**
 * Snapshot Health Tool — Integration Tests
 *
 * Tests for adv_snapshot_health tool wrapper over snapshot-scan.ts.
 * Mocks getDataHome to route snapshot scanning into temp fixtures.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, utimes, access } from "node:fs/promises";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { snapshotHealthTools } from "./snapshot";
import {
  STALE_LOCK_THRESHOLD_MS,
  SNAPSHOT_HEALTH_SCHEMA_VERSION,
} from "./snapshot-scan";
import type { Store } from "../storage/store";

// =============================================================================
// Mocks
// =============================================================================

const mocks = vi.hoisted(() => ({
  getProjectId: vi.fn(async () => "test-project-id"),
  getDataHome: vi.fn(() => ""),
  agendaAddExecute: vi.fn(async () =>
    JSON.stringify({ success: true, item: { id: "agenda-1" } }),
  ),
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
    getDataHome: mocks.getDataHome,
  };
});

vi.mock("./agenda", async () => {
  const actual = await vi.importActual<typeof import("./agenda")>("./agenda");
  return {
    ...actual,
    agendaTools: {
      ...actual.agendaTools,
      adv_agenda_add: {
        ...actual.agendaTools.adv_agenda_add,
        execute: mocks.agendaAddExecute,
      },
    },
  };
});

// =============================================================================
// Fixture Builders
// =============================================================================

async function makeBareRepo(path: string): Promise<void> {
  await mkdir(join(path, "refs", "heads"), { recursive: true });
  await mkdir(join(path, "objects", "info"), { recursive: true });
  await mkdir(join(path, "objects", "pack"), { recursive: true });
  await writeFile(join(path, "HEAD"), "ref: refs/heads/main\n");
  await writeFile(
    join(path, "config"),
    "[core]\n\trepositoryformatversion = 0\n",
  );
}

async function addStaleLock(
  repoPath: string,
  lockName: string,
  ageMs: number,
): Promise<string> {
  const lockPath = join(repoPath, `${lockName}.lock`);
  await writeFile(lockPath, "lock");
  const now = Date.now();
  const mtime = new Date(now - ageMs);
  await utimes(lockPath, mtime, mtime);
  return lockPath;
}

function createMockStore(root: string): Store {
  return {
    paths: {
      root,
      external: join(root, "external", "test-project-id"),
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {} as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {} as Store["gates"],
    status: vi.fn(),
  } as unknown as Store;
}

// =============================================================================
// Tests
// =============================================================================

describe("adv_snapshot_health", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir("adv-snapshot-health-");
    mocks.getDataHome.mockReturnValue(tempDir);
    store = createMockStore(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    vi.clearAllMocks();
  });

  test("scan happy path — clean snapshot dir returns SnapshotHealthOutput with schema_version 1", async () => {
    const result = await snapshotHealthTools.adv_snapshot_health.execute(
      { action: "scan", scope: "project" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.schema_version).toBe(SNAPSHOT_HEALTH_SCHEMA_VERSION);
    expect(parsed.scope).toBe("project");
    expect(parsed.project_id).toBe("test-project-id");
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.summary.projects_scanned).toBe(0);
    expect(parsed.summary.bare_repos_scanned).toBe(0);
    expect(parsed.summary.critical).toBe(0);
    expect(parsed.summary.warnings).toBe(0);
    expect(parsed.summary.info).toBe(0);
    expect(typeof parsed.scan_duration_ms).toBe("number");
  });

  test("repair rejects without approvedByUser", async () => {
    const result = await snapshotHealthTools.adv_snapshot_health.execute(
      {
        action: "repair",
        scope: "project",
        repair_actions: ["delete_stale_locks"],
        approvalEvidence: "user approved",
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("approvedByUser");
  });

  test("repair rejects without approvalEvidence", async () => {
    const result = await snapshotHealthTools.adv_snapshot_health.execute(
      {
        action: "repair",
        scope: "project",
        repair_actions: ["delete_stale_locks"],
        approvedByUser: true,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("approvalEvidence");
  });

  test("repair rejects empty approvalEvidence", async () => {
    const result = await snapshotHealthTools.adv_snapshot_health.execute(
      {
        action: "repair",
        scope: "project",
        repair_actions: ["delete_stale_locks"],
        approvedByUser: true,
        approvalEvidence: "",
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("approvalEvidence");
  });

  test("repair rejects unknown action string", async () => {
    const result = await snapshotHealthTools.adv_snapshot_health.execute(
      {
        action: "repair",
        scope: "project",
        repair_actions: ["bad_action"] as any,
        approvedByUser: true,
        approvalEvidence: "user approved",
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error.toLowerCase()).toContain("invalid");
  });

  test("dryRun returns preview without mutations", async () => {
    const snapshotRoot = join(tempDir, "opencode", "snapshot");
    const repoPath = join(snapshotRoot, "test-project-id", "abc123");
    await makeBareRepo(repoPath);
    const lockPath = await addStaleLock(
      repoPath,
      "index",
      STALE_LOCK_THRESHOLD_MS + 1000,
    );

    const result = await snapshotHealthTools.adv_snapshot_health.execute(
      {
        action: "repair",
        scope: "project",
        repair_actions: ["delete_stale_locks"],
        approvedByUser: true,
        approvalEvidence: "test",
        dryRun: true,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.repair_preview).toBeDefined();
    expect(parsed.repair_preview.actions_planned).toBe(1);
    expect(parsed.repair_preview.details).toHaveLength(1);
    expect(parsed.repair_preview.details[0].status).toBe("success");
    expect(parsed.repair_preview.details[0].reason).toBe("dryRun");
    // Lock file still exists
    await expect(access(lockPath)).resolves.toBeUndefined();
    // No agenda entry written
    expect(mocks.agendaAddExecute).not.toHaveBeenCalled();
  });

  test("audit entry written on successful repair", async () => {
    const snapshotRoot = join(tempDir, "opencode", "snapshot");
    const repoPath = join(snapshotRoot, "test-project-id", "abc123");
    await makeBareRepo(repoPath);
    const lockPath = await addStaleLock(
      repoPath,
      "index",
      STALE_LOCK_THRESHOLD_MS + 1000,
    );

    const result = await snapshotHealthTools.adv_snapshot_health.execute(
      {
        action: "repair",
        scope: "project",
        repair_actions: ["delete_stale_locks"],
        approvedByUser: true,
        approvalEvidence: "test",
        dryRun: false,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.repair_preview.details[0].status).toBe("success");
    expect(parsed.repair_preview.details[0].reason).not.toBe("dryRun");
    // Agenda entry written
    expect(mocks.agendaAddExecute).toHaveBeenCalledTimes(1);
    const agendaCall = mocks.agendaAddExecute.mock.calls[0];
    expect(agendaCall[0].category).toBe("snapshot-repair");
    expect(agendaCall[0].title).toContain("delete_stale_locks");
    expect(agendaCall[0].priority).toBe("low");
    // Lock deleted
    await expect(access(lockPath)).rejects.toThrow();
  });

  test("output schema validates — all required fields present", async () => {
    const snapshotRoot = join(tempDir, "opencode", "snapshot");
    const repoPath = join(snapshotRoot, "test-project-id", "abc123");
    await makeBareRepo(repoPath);
    await addStaleLock(repoPath, "index", STALE_LOCK_THRESHOLD_MS + 1000);

    const result = await snapshotHealthTools.adv_snapshot_health.execute(
      { action: "scan", scope: "project" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty("schema_version");
    expect(parsed).toHaveProperty("scan_duration_ms");
    expect(parsed).toHaveProperty("scope");
    expect(parsed).toHaveProperty("project_id");
    expect(parsed).toHaveProperty("summary");
    expect(parsed.summary).toHaveProperty("projects_scanned");
    expect(parsed.summary).toHaveProperty("bare_repos_scanned");
    expect(parsed.summary).toHaveProperty("critical");
    expect(parsed.summary).toHaveProperty("warnings");
    expect(parsed.summary).toHaveProperty("info");
    expect(parsed).toHaveProperty("findings");
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.schema_version).toBe(SNAPSHOT_HEALTH_SCHEMA_VERSION);
  });
});
