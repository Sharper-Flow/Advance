/**
 * Snapshot Repair Audit Store — Tests
 *
 * Purpose-specific, append-only audit log for adv_snapshot_health repairs.
 * Replaces the legacy Agenda-based audit trail per retireAgendaWorkflow AC4:
 * every successful snapshot repair retains a durable audit record without
 * creating Agenda work, and the audit log stays outside planning, gates,
 * backlog, and Epic state.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import {
  appendSnapshotRepairAudit,
  listSnapshotRepairAudits,
  getSnapshotRepairAuditPath,
  SNAPSHOT_REPAIR_AUDIT_FILENAME,
} from "./snapshot-repair-audit";

describe("snapshot-repair-audit storage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("adv-snapshot-repair-audit-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("getSnapshotRepairAuditPath honors override", () => {
    const override = join(tempDir, "custom-audit.jsonl");
    expect(getSnapshotRepairAuditPath("/project", override)).toBe(override);
  });

  test("getSnapshotRepairAuditPath falls back to legacy .adv path", () => {
    expect(getSnapshotRepairAuditPath("/project")).toBe(
      join("/project", ".adv", SNAPSHOT_REPAIR_AUDIT_FILENAME),
    );
  });

  test("appendSnapshotRepairAudit creates the file on first append", async () => {
    const path = join(tempDir, "audit.jsonl");
    await appendSnapshotRepairAudit(
      "/project",
      {
        pattern: "stale_lock",
        action: "delete_stale_locks",
        target_path: "/snap/proj/wt/index.lock",
        before_summary: "stale index.lock older than 5 minutes, no lsof holder",
        after_summary: "lock file removed",
        outcome: "success",
      },
      path,
    );

    const content = await readFile(path, "utf8");
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test("appendSnapshotRepairAudit is append-only and records all required fields", async () => {
    const path = join(tempDir, "audit.jsonl");
    await appendSnapshotRepairAudit(
      "/project",
      {
        pattern: "stale_lock",
        action: "delete_stale_locks",
        target_path: "/snap/proj/wt/index.lock",
        before_summary: "stale index.lock older than 5 minutes",
        after_summary: "lock file removed",
        outcome: "success",
      },
      path,
    );
    await appendSnapshotRepairAudit(
      "/project",
      {
        pattern: "zero_byte_object",
        action: "delete_zero_byte_objects",
        target_path: "/snap/proj/wt/objects/ab/cdef",
        before_summary: "zero-byte git object",
        after_summary: "object file removed",
        outcome: "success",
      },
      path,
    );

    const entries = await listSnapshotRepairAudits("/project", path);
    expect(entries).toHaveLength(2);

    const [first, second] = entries;
    // Required fields per retireAgendaWorkflow design: pattern, target path,
    // before/after summary, timestamp, outcome.
    expect(first.pattern).toBe("stale_lock");
    expect(first.action).toBe("delete_stale_locks");
    expect(first.target_path).toBe("/snap/proj/wt/index.lock");
    expect(first.before_summary).toContain("stale index.lock");
    expect(first.after_summary).toContain("removed");
    expect(first.outcome).toBe("success");
    expect(typeof first.recorded_at).toBe("string");
    expect(new Date(first.recorded_at).toString()).not.toBe("Invalid Date");
    expect(typeof first.id).toBe("string");
    expect(first.id.length).toBeGreaterThan(0);

    expect(second.pattern).toBe("zero_byte_object");
    expect(second.target_path).toBe("/snap/proj/wt/objects/ab/cdef");
    // Append-only: entries stay in insertion order, both present.
    expect(entries[0].id).not.toBe(entries[1].id);
    expect(new Date(second.recorded_at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.recorded_at).getTime(),
    );
  });

  test("appendSnapshotRepairAudit never mutates existing entries", async () => {
    const path = join(tempDir, "audit.jsonl");
    await appendSnapshotRepairAudit(
      "/project",
      {
        pattern: "stale_lock",
        action: "delete_stale_locks",
        target_path: "/snap/proj/wt/a.lock",
        before_summary: "before a",
        after_summary: "after a",
        outcome: "success",
      },
      path,
    );

    const firstRead = await readFile(path, "utf8");
    const firstEntry = JSON.parse(firstRead.trim().split("\n")[0]);

    await appendSnapshotRepairAudit(
      "/project",
      {
        pattern: "orphan_bare_repo",
        action: "delete_orphan_bare_repos",
        target_path: "/snap/proj/wt/repo",
        before_summary: "orphan bare repo, no worktree",
        after_summary: "bare repo removed",
        outcome: "success",
      },
      path,
    );

    const secondRead = await readFile(path, "utf8");
    const lines = secondRead.trim().split("\n");
    expect(lines).toHaveLength(2);
    // First entry unchanged on disk.
    expect(JSON.parse(lines[0])).toEqual(firstEntry);
  });

  test("listSnapshotRepairAudits returns empty array when file is missing", async () => {
    const path = join(tempDir, "missing.jsonl");
    await expect(access(path)).rejects.toThrow();
    const entries = await listSnapshotRepairAudits("/project", path);
    expect(entries).toEqual([]);
  });

  test("audit schema rejects entries missing required fields", async () => {
    const path = join(tempDir, "audit.jsonl");
    await expect(
      appendSnapshotRepairAudit(
        "/project",
        {
          // Missing pattern.
          action: "delete_stale_locks",
          target_path: "/x",
          before_summary: "b",
          after_summary: "a",
          outcome: "success",
        } as never,
        path,
      ),
    ).rejects.toThrow();
  });
});
