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
import { snapshotHealthHandler } from "./snapshot";
import {
  STALE_LOCK_THRESHOLD_MS,
  SNAPSHOT_HEALTH_SCHEMA_VERSION,
} from "./snapshot-scan";
import { listSnapshotRepairAudits } from "../storage/snapshot-repair-audit";
import { appendSnapshotRepairAudit } from "../storage/snapshot-repair-audit";
import type { Store } from "../storage/store";

// =============================================================================
// Mocks
// =============================================================================

const mocks = vi.hoisted(() => ({
  getProjectId: vi.fn(async () => "test-project-id"),
  getDataHome: vi.fn(() => ""),
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
    const result = await snapshotHealthHandler(
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
    const result = await snapshotHealthHandler(
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
    const result = await snapshotHealthHandler(
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
    const result = await snapshotHealthHandler(
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
    const result = await snapshotHealthHandler(
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

  test("dryRun returns preview without mutations or audit entries", async () => {
    const snapshotRoot = join(tempDir, "opencode", "snapshot");
    const repoPath = join(snapshotRoot, "test-project-id", "abc123");
    await makeBareRepo(repoPath);
    const lockPath = await addStaleLock(
      repoPath,
      "index",
      STALE_LOCK_THRESHOLD_MS + 1000,
    );

    const result = await snapshotHealthHandler(
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
    // Lock file still exists.
    await expect(access(lockPath)).resolves.toBeUndefined();
    // No snapshot-repair audit entry written for dryRun — only durable
    // successful repairs produce audit records.
    const audits = await listSnapshotRepairAudits(
      tempDir,
      store.paths.snapshotRepairAudit,
    );
    expect(audits).toEqual([]);
  });

  test("successful repair appends a durable snapshot-repair audit entry (no Agenda write)", async () => {
    const snapshotRoot = join(tempDir, "opencode", "snapshot");
    const repoPath = join(snapshotRoot, "test-project-id", "abc123");
    await makeBareRepo(repoPath);
    const lockPath = await addStaleLock(
      repoPath,
      "index",
      STALE_LOCK_THRESHOLD_MS + 1000,
    );

    const result = await snapshotHealthHandler(
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

    // Audit entry is written to the purpose-specific snapshot-repair audit
    // log, NOT to the Agenda store. The audit log lives outside planning,
    // gates, backlog, and Epic state.
    const audits = await listSnapshotRepairAudits(
      tempDir,
      store.paths.snapshotRepairAudit,
    );
    expect(audits).toHaveLength(1);
    const audit = audits[0];
    expect(audit.action).toBe("delete_stale_locks");
    expect(audit.pattern).toBe("stale_lock");
    expect(audit.target_path).toContain("index.lock");
    expect(audit.outcome).toBe("success");
    expect(typeof audit.before_summary).toBe("string");
    expect(audit.before_summary.length).toBeGreaterThan(0);
    expect(typeof audit.after_summary).toBe("string");
    expect(audit.after_summary.length).toBeGreaterThan(0);
    expect(new Date(audit.recorded_at).toString()).not.toBe("Invalid Date");

    // Lock deleted.
    await expect(access(lockPath)).rejects.toThrow();

    // No Agenda entry is created — the audit trail lives in the
    // purpose-specific snapshot-repair audit log, not in agenda.jsonl.
    await expect(
      access(store.paths.agenda),
      "adv_snapshot_health must not write to the Agenda store; audit goes to the purpose-specific snapshot-repair audit log",
    ).rejects.toThrow();
  });

  test("failed repairs do not produce audit entries", async () => {
    // Set up a stale_lock finding whose target we delete before repair runs
    // so the unlink fails (ENOENT), proving that failed repairs are not
    // logged as successful audit entries.
    const snapshotRoot = join(tempDir, "opencode", "snapshot");
    const repoPath = join(snapshotRoot, "test-project-id", "abc123");
    await makeBareRepo(repoPath);
    // Do NOT add a stale lock — the repair will try to delete a non-existent
    // path and the finding will not match the whitelist, so no audit write
    // should occur.
    const result = await snapshotHealthHandler(
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
    expect(parsed.repair_preview.actions_executed).toBe(0);
    const audits = await listSnapshotRepairAudits(
      tempDir,
      store.paths.snapshotRepairAudit,
    );
    expect(audits).toEqual([]);
  });

  test("output schema validates — all required fields present", async () => {
    const snapshotRoot = join(tempDir, "opencode", "snapshot");
    const repoPath = join(snapshotRoot, "test-project-id", "abc123");
    await makeBareRepo(repoPath);
    await addStaleLock(repoPath, "index", STALE_LOCK_THRESHOLD_MS + 1000);

    const result = await snapshotHealthHandler(
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

  // ── audit_history (AC3 / DDC2): bounded, project-scoped repair-audit reads ─

  async function seedAuditEntries(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await appendSnapshotRepairAudit(
        tempDir,
        {
          pattern: "stale_lock",
          action: "delete_stale_locks",
          target_path: `/tmp/repo-${i}/index.lock`,
          before_summary: `Finding stale_lock at /tmp/repo-${i}/index.lock`,
          after_summary: `Repair succeeded; target index.lock removed`,
          outcome: "success",
        },
        store.paths.snapshotRepairAudit,
      );
    }
  }

  test("audit_history returns recent entries newest-first with default limit 20", async () => {
    await seedAuditEntries(3);

    const result = await snapshotHealthHandler(
      { action: "audit_history", scope: "project" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.schema_version).toBe(SNAPSHOT_HEALTH_SCHEMA_VERSION);
    expect(parsed.action).toBe("audit_history");
    expect(parsed.project_id).toBe("test-project-id");
    expect(parsed.limit).toBe(20);
    expect(parsed.total_entries).toBe(3);
    expect(parsed.returned).toBe(3);
    expect(parsed.audits).toHaveLength(3);
    // Newest first: last appended entry leads.
    expect(parsed.audits[0].target_path).toBe("/tmp/repo-2/index.lock");
    expect(parsed.audits[2].target_path).toBe("/tmp/repo-0/index.lock");
  });

  test("audit_history bounds results to the requested limit", async () => {
    await seedAuditEntries(25);

    const result = await snapshotHealthHandler(
      { action: "audit_history", scope: "project", limit: 5 },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.total_entries).toBe(25);
    expect(parsed.returned).toBe(5);
    expect(parsed.limit).toBe(5);
    expect(parsed.audits).toHaveLength(5);
    // Tail of the log, newest first.
    expect(parsed.audits[0].target_path).toBe("/tmp/repo-24/index.lock");
    expect(parsed.audits[4].target_path).toBe("/tmp/repo-20/index.lock");
  });

  test("audit_history applies the default limit of 20", async () => {
    await seedAuditEntries(25);

    const result = await snapshotHealthHandler(
      { action: "audit_history", scope: "project" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.limit).toBe(20);
    expect(parsed.returned).toBe(20);
    expect(parsed.audits).toHaveLength(20);
  });

  test("audit_history clamps limit to the 100 maximum", async () => {
    await seedAuditEntries(3);

    const result = await snapshotHealthHandler(
      { action: "audit_history", scope: "project", limit: 500 },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.limit).toBe(100);
    expect(parsed.returned).toBe(3);
  });

  test("audit_history refuses scope: global (no cross-project audit data)", async () => {
    const result = await snapshotHealthHandler(
      { action: "audit_history", scope: "global" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("project");
  });

  test("audit_history returns an empty list when no audit log exists", async () => {
    const result = await snapshotHealthHandler(
      { action: "audit_history", scope: "project" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.total_entries).toBe(0);
    expect(parsed.returned).toBe(0);
    expect(parsed.audits).toEqual([]);
  });

  test("audit_history entries expose only audit-schema fields (no secrets)", async () => {
    await seedAuditEntries(1);

    const result = await snapshotHealthHandler(
      { action: "audit_history", scope: "project" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.audits).toHaveLength(1);
    expect(Object.keys(parsed.audits[0]).sort()).toEqual(
      [
        "id",
        "pattern",
        "action",
        "target_path",
        "before_summary",
        "after_summary",
        "outcome",
        "recorded_at",
      ].sort(),
    );
  });
});
