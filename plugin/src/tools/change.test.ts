/**
 * Change Tools Tests
 *
 * TDD tests for change management tools
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { readFile, writeFile, symlink, access, mkdir } from "fs/promises";
import { join } from "path";
import { getProjectId, getExternalRoot } from "../utils/project-id";
import { changeTools } from "./change";
import { gateTools } from "./gate";
import { createLegacyStore, type Store } from "../storage/store";
import { listProjectWisdom } from "../storage/project-wisdom";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";

describe("Change Tools", () => {
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

  describe("adv_change_list", () => {
    test("returns active changes with task counts", async () => {
      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(1);
      expect(parsed.changes[0]).toMatchObject({
        id: "addFeature",
        title: "Add New Feature",
        status: "active",
        taskCount: 3,
        completedTasks: 0,
      });
    });

    test("filters by status", async () => {
      const result = await changeTools.adv_change_list.execute(
        { status: "draft" },
        store,
      );
      const parsed = parseToolOutput(result);

      // No draft changes in sample data
      expect(parsed.changes).toHaveLength(0);
    });

    test("status: in-flight returns draft, pending, and active changes", async () => {
      // We already have 1 active change: addFeature
      // Create additional changes and set their statuses
      const createDraft = await changeTools.adv_change_create.execute(
        { summary: "Draft change" },
        store,
      );
      const draftId = parseToolOutput(createDraft).changeId;
      const draftChange = await store.changes.get(draftId);
      expect(draftChange.success).toBe(true);
      draftChange.data!.status = "draft";
      await store.changes.save(draftChange.data!);

      const createPending = await changeTools.adv_change_create.execute(
        { summary: "Pending change" },
        store,
      );
      const pendingId = parseToolOutput(createPending).changeId;
      const pendingChange = await store.changes.get(pendingId);
      expect(pendingChange.success).toBe(true);
      pendingChange.data!.status = "pending";
      await store.changes.save(pendingChange.data!);

      const createArchived = await changeTools.adv_change_create.execute(
        { summary: "Archived change" },
        store,
      );
      const archivedId = parseToolOutput(createArchived).changeId;
      const archivedChange = await store.changes.get(archivedId);
      expect(archivedChange.success).toBe(true);
      archivedChange.data!.status = "archived";
      await store.changes.save(archivedChange.data!);

      const createClosed = await changeTools.adv_change_create.execute(
        { summary: "Closed change" },
        store,
      );
      const closedId = parseToolOutput(createClosed).changeId;
      const closedChange = await store.changes.get(closedId);
      expect(closedChange.success).toBe(true);
      closedChange.data!.status = "closed";
      await store.changes.save(closedChange.data!);

      const result = await changeTools.adv_change_list.execute(
        { status: "in-flight" },
        store,
      );
      const parsed = parseToolOutput(result);

      // Should return exactly draft, pending, active — not archived or closed
      expect(parsed.changes).toHaveLength(3);
      const statuses = parsed.changes.map((c: { status: string }) => c.status);
      expect(statuses).toContain("draft");
      expect(statuses).toContain("pending");
      expect(statuses).toContain("active");
      expect(statuses).not.toContain("archived");
      expect(statuses).not.toContain("closed");
    });

    test("excludes archived by default", async () => {
      // Archive the existing change
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(0);
    });

    test("includes archived when requested", async () => {
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_list.execute(
        { includeArchived: true },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(1);
    });

    test("status: archived returns archived changes without needing includeArchived", async () => {
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_list.execute(
        { status: "archived" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(1);
      expect(parsed.changes[0].status).toBe("archived");
    });

    test("excludes closed changes by default", async () => {
      await store.changes.close("addFeature", {
        reason: "cancelled",
        approved_by_user: true,
        approval_evidence: "User cancelled proposal",
        approved_at: "2026-03-24T00:00:00Z",
      });

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(0);
    });

    test("includes closed changes when requested", async () => {
      await store.changes.close("addFeature", {
        reason: "cancelled",
        approved_by_user: true,
        approval_evidence: "User cancelled proposal",
        approved_at: "2026-03-24T00:00:00Z",
      });

      const result = await changeTools.adv_change_list.execute(
        { includeClosed: true },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(1);
      expect(parsed.changes[0].status).toBe("closed");
    });

    test("annotates fast-follow entries with parent_change_id", async () => {
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.fast_follow_of = {
        parent_change_id: "parentChange",
        linked_at: "2026-01-01T01:00:00Z",
      };
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(1);
      expect(parsed.changes[0].parent_change_id).toBe("parentChange");
    });

    test("omits parent_change_id when fast_follow_of not set", async () => {
      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(1);
      expect(parsed.changes[0].parent_change_id).toBeUndefined();
    });

    test("enriches entries with lastActivity, lastActivityAgeMinutes, and recencyBand", async () => {
      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(1);
      expect(parsed.changes[0]).toMatchObject({
        id: "addFeature",
        lastActivity: expect.any(String),
        lastActivityAgeMinutes: expect.any(Number),
        recencyBand: expect.stringMatching(/^(hot|warm|stale)$/),
      });
    });

    test("lastActivity reflects task activity newer than creation", async () => {
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.tasks[0].completed_at = "2026-01-22T00:00:00Z";
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes[0].lastActivity).toBe("2026-01-22T00:00:00Z");
    });

    test("sort: stalest returns oldest lastActivity first", async () => {
      // Create two changes with different timestamps
      const now = Date.now();
      const oldChange = await store.changes.create("Old Change");
      const newChange = await store.changes.create("New Change");

      const oldData = (await store.changes.get(oldChange.changeId)).data!;
      oldData.created_at = new Date(now - 86400000).toISOString(); // 1 day ago
      await store.changes.save(oldData);

      const newData = (await store.changes.get(newChange.changeId)).data!;
      newData.created_at = new Date(now - 3600000).toISOString(); // 1 hour ago
      await store.changes.save(newData);

      const result = await changeTools.adv_change_list.execute(
        { sort: "stalest" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(3); // addFeature + old + new
      const ids = parsed.changes.map((c: { id: string }) => c.id);
      expect(ids[0]).toBe("addFeature"); // oldest (created 2026-01-21)
      expect(ids[1]).toBe(oldChange.changeId);
      expect(ids[2]).toBe(newChange.changeId);
    });

    test("sort: recency returns most recent lastActivity first", async () => {
      const now = Date.now();
      const oldChange = await store.changes.create("Old Change 2");
      const newChange = await store.changes.create("New Change 2");

      const oldData = (await store.changes.get(oldChange.changeId)).data!;
      oldData.created_at = new Date(now - 86400000).toISOString();
      await store.changes.save(oldData);

      const newData = (await store.changes.get(newChange.changeId)).data!;
      newData.created_at = new Date(now - 3600000).toISOString();
      await store.changes.save(newData);

      const result = await changeTools.adv_change_list.execute(
        { sort: "recency" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(3);
      const ids = parsed.changes.map((c: { id: string }) => c.id);
      expect(ids[0]).toBe(newChange.changeId); // most recent
      expect(ids[1]).toBe(oldChange.changeId);
      expect(ids[2]).toBe("addFeature"); // oldest
    });

    test("excludeRecencyBands filters matching entries", async () => {
      const now = Date.now();
      const hotChange = await store.changes.create("Hot Change");
      const staleChange = await store.changes.create("Stale Change");

      const hotData = (await store.changes.get(hotChange.changeId)).data!;
      hotData.created_at = new Date(now - 30000).toISOString(); // 30 seconds ago
      await store.changes.save(hotData);

      const staleData = (await store.changes.get(staleChange.changeId)).data!;
      staleData.created_at = new Date(now - 86400000).toISOString(); // 1 day ago
      await store.changes.save(staleData);

      const result = await changeTools.adv_change_list.execute(
        { excludeRecencyBands: ["hot"] },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.changes).toHaveLength(2); // addFeature + stale (not hot)
      const bands = parsed.changes.map(
        (c: { recencyBand: string }) => c.recencyBand,
      );
      expect(bands).not.toContain("hot");
    });

    test("filter before pagination: excludeRecencyBands + limit", async () => {
      const now = Date.now();
      const hotChange = await store.changes.create("Hot Change 2");
      const staleChange = await store.changes.create("Stale Change 2");

      const hotData = (await store.changes.get(hotChange.changeId)).data!;
      hotData.created_at = new Date(now - 30000).toISOString();
      await store.changes.save(hotData);

      const staleData = (await store.changes.get(staleChange.changeId)).data!;
      staleData.created_at = new Date(now - 86400000).toISOString();
      await store.changes.save(staleData);

      const result = await changeTools.adv_change_list.execute(
        { excludeRecencyBands: ["hot"], limit: 1 },
        store,
      );
      const parsed = parseToolOutput(result);

      // Should return 1 non-hot entry, not 1 raw entry that might be hot
      expect(parsed.changes).toHaveLength(1);
      expect(parsed.changes[0].recencyBand).not.toBe("hot");
    });
  });

  describe("adv_change_close", () => {
    test("closes a change with approval evidence", async () => {
      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "addFeature",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "User approved cancellation in chat",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.change.status).toBe("closed");
      expect(parsed.change.closure.reason).toBe("cancelled");
    });

    test("requires supersededBy when reason is superseded", async () => {
      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "addFeature",
          reason: "superseded",
          approvedByUser: true,
          approvalEvidence: "User selected survivor change",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("supersededBy");
    });

    test("rejects closing archived changes", async () => {
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "addFeature",
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "User retired proposal",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("archived");
    });

    test("removes source directory after successful close", async () => {
      // Verify source dir exists before close
      const changeDir = join(store.paths.changes, "addFeature");
      await expect(access(changeDir)).resolves.toBeUndefined();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "addFeature",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "User approved",
        },
        store,
      );
      const parsed = parseToolOutput(result);
      expect(parsed.success).toBe(true);

      // Source dir should be gone
      await expect(access(changeDir)).rejects.toThrow();
    });
  });

  describe("adv_change_bulk_close", () => {
    test("closes multiple explicit changes", async () => {
      const c1 = await store.changes.create("Draft A");
      const c2 = await store.changes.create("Draft B");

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "explicit",
            changeIds: [c1.changeId, c2.changeId],
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "User approved bulk close",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.closed).toBe(2);
      expect(parsed.results).toHaveLength(2);
    });

    test("fail-all when any explicit target is protected", async () => {
      const draft = await store.changes.create("Draft C");

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "explicit",
            changeIds: [draft.changeId, "addFeature"], // addFeature is active
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "Test",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toMatch(/protected status/i);
    });

    test("rejects filter-based superseded", async () => {
      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "filter",
            filter: { status: "draft" },
          },
          reason: "superseded",
          approvedByUser: true,
          approvalEvidence: "Test",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("superseded");
    });

    test("rejects filter without status or staleness", async () => {
      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "filter",
            filter: { prefix: "draft" },
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "Test",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toMatch(/status filter or a staleness filter/i);
    });

    test("closes by filter with status", async () => {
      await store.changes.create("FilterDraft");

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "filter",
            filter: { status: "draft" },
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "Test",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.closed).toBeGreaterThanOrEqual(1);
    });

    test("removes source directories after successful bulk close", async () => {
      const c1 = await store.changes.create("Bulk A");
      const c2 = await store.changes.create("Bulk B");

      // Verify source dirs exist before close
      const dir1 = join(store.paths.changes, c1.changeId);
      const dir2 = join(store.paths.changes, c2.changeId);
      await expect(access(dir1)).resolves.toBeUndefined();
      await expect(access(dir2)).resolves.toBeUndefined();

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "explicit",
            changeIds: [c1.changeId, c2.changeId],
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "User approved bulk close",
        },
        store,
      );
      const parsed = parseToolOutput(result);
      expect(parsed.success).toBe(true);

      // Source dirs should be gone
      await expect(access(dir1)).rejects.toThrow();
      await expect(access(dir2)).rejects.toThrow();
    });

    test("D3: response includes per-id diskRemoved + diskFailed fields", async () => {
      const c1 = await store.changes.create("Bulk D3 A");
      const c2 = await store.changes.create("Bulk D3 B");

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "explicit",
            changeIds: [c1.changeId, c2.changeId],
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "User approved",
        },
        store,
      );
      const parsed = parseToolOutput(result);
      expect(parsed.success).toBe(true);
      // New per-id disk-result fields exposed by the unified helper.
      expect(parsed.diskRemoved).toEqual(
        expect.arrayContaining([c1.changeId, c2.changeId]),
      );
      expect(parsed.diskFailed).toEqual([]);
    });

    // Helper-level idempotency (rm with force:true on already-removed dirs)
    // is covered by sweepClosedChangesFromDisk tests in
    // src/storage/disk-sweep.test.ts. The bulk_close path is not reachable
    // when disk is pre-removed because closeBatch reads change.json from
    // disk first; the failure-mode is workflow-state close, not the disk
    // sweep that runs only on success.
  });

  describe("adv_change_show", () => {
    test("returns full change with tasks and deltas", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.id).toBe("addFeature");
      expect(parsed.title).toBe("Add New Feature");
      expect(parsed.tasks).toHaveLength(3);
      expect(parsed.deltas["test-capability"]).toHaveLength(1);
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "nonexistent" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });

    test("displays github_issues prominently in output", async () => {
      // Add github issues to the change
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.github_issues = [
        "https://github.com/anomalyco/test/issues/123",
        "https://github.com/anomalyco/test/issues/456",
      ];
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // github_issues should be present in the output
      expect(parsed.github_issues).toBeDefined();
      expect(parsed.github_issues).toHaveLength(2);
      expect(parsed.github_issues).toContain(
        "https://github.com/anomalyco/test/issues/123",
      );
      expect(parsed.github_issues).toContain(
        "https://github.com/anomalyco/test/issues/456",
      );
    });

    test("displays empty github_issues array when none linked", async () => {
      // addFeature has no github_issues by default
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // Should have github_issues field (empty or undefined is acceptable)
      // When displayed, it should be clear there are no linked issues
      expect(
        parsed.github_issues === undefined ||
          Array.isArray(parsed.github_issues),
      ).toBe(true);
    });

    test("includes context snapshot in output", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // adv_change_show provides structured JSON for direct LLM consumption
      // _contextSnapshot was removed — agents read JSON fields directly
      expect(parsed._contextSnapshot).toBeUndefined();
    });

    test("reuses gates from the loaded change without refetching store.gates.get", async () => {
      const gatesSpy = vi.spyOn(store.gates, "get");

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._contextSnapshot).toBeUndefined();
      expect(gatesSpy).not.toHaveBeenCalled();
    });

    test("context snapshot reflects actual task states and gate progress", async () => {
      // Advance task states: mark first task done, second in_progress
      await store.tasks.update("tk-task0001", "done", "Completed");
      await store.tasks.update("tk-task0002", "in_progress");

      await store.gates.complete("addFeature", "proposal", "test-agent");
      await store.gates.complete("addFeature", "discovery", "test-agent");

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // _contextSnapshot removed from adv_change_show — agents read JSON fields directly
      expect(parsed._contextSnapshot).toBeUndefined();

      // Verify structured data is still available in the JSON output
      expect(parsed.id).toBe("addFeature");
      expect(parsed.title).toBe("Add New Feature");
    });

    test("includes problemStatementPath when problem-statement.md exists", async () => {
      // Write a problem-statement.md to the change directory
      const changeDir = join(tempDir, ".adv/changes/addFeature");
      await writeFile(
        join(changeDir, "problem-statement.md"),
        "PROBLEM\n  The widget is broken.",
      );

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.problemStatementExists).toBe(true);
      expect(parsed.problemStatementPath).toBeDefined();
      expect(parsed.problemStatementPath).toContain("problem-statement.md");
    });

    test("omits problemStatementPath when problem-statement.md does not exist", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.problemStatementExists).toBe(false);
      expect(parsed.problemStatementPath).toBeUndefined();
    });

    test("surfaces cross_project_origin prominently in output", async () => {
      // Add cross_project_origin to the change
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.cross_project_origin = {
        source_project: "pokeedge",
        source_path: "/home/user/dev/pokeedge",
        source_change_id: "addApiEndpoint",
        linked_at: "2026-01-01T01:00:00Z",
      };
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // Should surface the origin with a warning note
      expect(parsed._crossProjectOrigin).toBeDefined();
      expect(parsed._crossProjectOrigin.note).toContain(
        "Cross-project follow-up",
      );
      expect(parsed._crossProjectOrigin.source_project).toBe("pokeedge");
      expect(parsed._crossProjectOrigin.source_change_id).toBe(
        "addApiEndpoint",
      );
    });

    test("surfaces fast_follow_of prominently in output", async () => {
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.fast_follow_of = {
        parent_change_id: "parentChange",
        linked_at: "2026-01-01T01:00:00Z",
      };
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._fastFollowOrigin).toBeDefined();
      expect(parsed._fastFollowOrigin.note).toContain("Fast-follow");
      expect(parsed._fastFollowOrigin.parent_change_id).toBe("parentChange");
      expect(parsed._fastFollowOrigin.linked_at).toBe("2026-01-01T01:00:00Z");
    });

    test("omits _crossProjectOrigin when no origin set", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._crossProjectOrigin).toBeUndefined();
    });

    test("surfaces _fastFollowOrigin when fast_follow_of set", async () => {
      // Add fast_follow_of to the change
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.fast_follow_of = {
        parent_change_id: "parentChange",
        linked_at: "2026-01-01T01:00:00Z",
      };
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._fastFollowOrigin).toBeDefined();
      expect(parsed._fastFollowOrigin.note).toContain("Fast-follow");
      expect(parsed._fastFollowOrigin.parent_change_id).toBe("parentChange");
      expect(parsed._fastFollowOrigin.linked_at).toBe("2026-01-01T01:00:00Z");
    });

    test("omits _fastFollowOrigin when no fast_follow_of set", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._fastFollowOrigin).toBeUndefined();
    });

    test("includes _reflection for archived changes", async () => {
      // Archive the change and add a reflection
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      // Write a reflection entry
      const { appendReflection } = await import("../storage/reflection");
      await appendReflection(tempDir, {
        id: "rf-test001",
        change_id: "addFeature",
        created_at: new Date().toISOString(),
        plane1: {
          efficiency: {
            task_count: 3,
            tasks_done: 3,
            tasks_cancelled: 0,
            retry_total: 0,
            retry_density: 0,
            elapsed_ms: 3600000,
            per_gate_ms: {},
            threshold_tier: "auto",
          },
          quality: { tdd_compliance: 1.0 },
          process: {
            gate_completion_rate: 1.0,
            tdd_intent_distribution: {},
            delegation_count: 0,
            drift_triggers: 0,
          },
          wisdom: {
            entries_captured: 0,
            entries_promoted: 0,
            wisdom_reuse_hits: 0,
          },
        },
        plane2: {
          friction_items: [],
          highlights: ["Test highlight"],
          improvement_suggestions: [],
        },
      });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._reflection).toBeDefined();
      expect(parsed._reflection.change_id).toBe("addFeature");
      expect(parsed._reflection.plane1.efficiency.task_count).toBe(3);
      expect(parsed._reflection.plane2.highlights).toContain("Test highlight");
    });

    test("omits _reflection for active changes", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._reflection).toBeUndefined();
    });
  });

  describe("adv_change_create", () => {
    test("creates new change with generated ID", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "Add user authentication" },
        store,
      );
      const parsed = parseToolOutput(result);

      // ID format: camelCase title
      expect(parsed.changeId).toBe("addUserAuthentication");
      expect(parsed.path).toContain("proposal.md");
    });

    test("emits _contextSnapshot on create", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "Create snapshot" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed._contextSnapshot).toBeDefined();
      expect(typeof parsed._contextSnapshot).toBe("string");
      expect(parsed._contextSnapshot).toContain("createSnapshot");
      expect(parsed._contextSnapshot).toMatch(/[╔╗╚╝║═]/);
    });

    test("creates change.json with draft status", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "New feature" },
        store,
      );
      const parsed = parseToolOutput(result);

      const changeResult = await store.changes.get(parsed.changeId);
      expect(changeResult.success).toBe(true);
      expect(changeResult.data).not.toBeNull();
      expect(changeResult.data!.status).toBe("draft");
      expect(changeResult.data!.tasks).toEqual([]);
      expect(changeResult.data!.deltas).toEqual({});
    });

    test("truncates long summaries in ID", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary:
            "This is a very long summary that should be truncated in the change ID",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      // ID should be truncated to 30 chars
      expect(parsed.changeId.length).toBeLessThanOrEqual(30);
    });

    test("persists optional proposal content on create", async () => {
      const proposal = "# Quick Contract\n\n## Intent\n\nUse adv tools only.";
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Create with proposal",
          proposal,
        },
        store,
      );
      const parsed = parseToolOutput(result);

      const content = await readFile(parsed.path, "utf-8");
      expect(content).toBe(proposal);
    });

    test("persists problem statement as separate artifact on create", async () => {
      const problemStatement = "PROBLEM\n  Auth tokens expire silently.";
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Create with problem statement",
          problemStatement,
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.problemStatementPath).toBeDefined();
      expect(parsed.problemStatementPath).toContain("problem-statement.md");
      const content = await readFile(parsed.problemStatementPath, "utf-8");
      expect(content).toBe(problemStatement);
    });

    test("omits problemStatementPath when not provided", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "No problem statement" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.problemStatementPath).toBeUndefined();
    });

    test("emits duplicate warning when creating change with colliding ID", async () => {
      // First create: should succeed without warning
      const result1 = await changeTools.adv_change_create.execute(
        { summary: "Fix login timeout" },
        store,
      );
      const parsed1 = parseToolOutput(result1);
      expect(parsed1.changeId).toBe("fixLoginTimeout");
      expect(parsed1._duplicateWarning).toBeUndefined();

      // Second create with same summary: should get incremented ID + warning
      const result2 = await changeTools.adv_change_create.execute(
        { summary: "Fix login timeout" },
        store,
      );
      const parsed2 = parseToolOutput(result2);
      expect(parsed2.changeId).toBe("fixLoginTimeout2");
      expect(parsed2._duplicateWarning).toBeDefined();
      expect(parsed2._duplicateWarning).toContain("fixLoginTimeout");
      expect(parsed2._duplicateWarning).toContain("already exists");
    });

    test("no duplicate warning when IDs are different", async () => {
      const result1 = await changeTools.adv_change_create.execute(
        { summary: "Add user auth" },
        store,
      );
      const parsed1 = parseToolOutput(result1);
      expect(parsed1._duplicateWarning).toBeUndefined();

      const result2 = await changeTools.adv_change_create.execute(
        { summary: "Fix rate limiting" },
        store,
      );
      const parsed2 = parseToolOutput(result2);
      expect(parsed2._duplicateWarning).toBeUndefined();
    });

    test("rejects leaked synthetic parity summaries for local create", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "task parity" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("Synthetic validation draft summary");
      expect(parsed.error).toContain("isolated temp/test storage");
      expect(parsed.changeId).toBeUndefined();
    });

    test("allows benign parity wording for legitimate drafts", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "Fix parity bug in auth" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toBeUndefined();
      expect(parsed.changeId).toBe("fixParityBugAuth");
    });
  });

  describe("adv_change_create — fast-follow parent_change_id", () => {
    test("creates change with fast_follow_of when parent_change_id valid", async () => {
      // Create a parent change first
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.changeId).toBe("childFollowUp");
      expect(parsed.fast_follow_of).toBeDefined();
      expect(parsed.fast_follow_of.parent_change_id).toBe(
        parentParsed.changeId,
      );
      expect(parsed.fast_follow_of.linked_at).toBeDefined();

      // Verify persisted
      const changeResult = await store.changes.get(parsed.changeId);
      expect(changeResult.success).toBe(true);
      expect(changeResult.data?.fast_follow_of?.parent_change_id).toBe(
        parentParsed.changeId,
      );
    });

    test("rejects mutual target_path + parent_change_id", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Should fail",
          target_path: "/some/path",
          parent_change_id: "someParent",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toMatch(/mutually exclusive/i);
    });

    test("rejects invalid parent_change_id with validParentIds hint", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Should fail",
          parent_change_id: "nonExistentParent",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toMatch(/Parent change not found/i);
      expect(parsed.validParentIds).toBeDefined();
      expect(Array.isArray(parsed.validParentIds)).toBe(true);
    });
  });

  describe("adv_change_create — cross-project", () => {
    test("creates change in target project with origin metadata", async () => {
      // Set up a target project directory
      const targetDir = await createTempDir();
      await createTestProject(targetDir);
      try {
        const result = await changeTools.adv_change_create.execute(
          {
            summary: "Add webhook handler",
            target_path: targetDir,
            source_project: "pokeedge",
            source_change_id: "addApiEndpoint",
          },
          store,
        );
        const parsed = parseToolOutput(result);

        // Change ID created in target
        expect(parsed.changeId).toBe("addWebhookHandler");
        expect(parsed.target_path).toBe(targetDir);

        // Origin metadata returned
        expect(parsed.cross_project_origin).toBeDefined();
        expect(parsed.cross_project_origin.source_project).toBe("pokeedge");
        expect(parsed.cross_project_origin.source_change_id).toBe(
          "addApiEndpoint",
        );
        expect(parsed.cross_project_origin.source_path).toBe(store.paths.root);
        expect(parsed.cross_project_origin.linked_at).toBeDefined();

        // Verify the change was persisted in the target project with origin
        const targetStore = await createLegacyStore(targetDir);
        try {
          const changeResult = await targetStore.changes.get(parsed.changeId);
          expect(changeResult.success).toBe(true);
          expect(changeResult.data?.cross_project_origin).toBeDefined();
          expect(changeResult.data?.cross_project_origin?.source_project).toBe(
            "pokeedge",
          );
        } finally {
          targetStore.close();
        }
      } finally {
        await cleanupTempDir(targetDir);
      }
    });

    test("P2.5: rejects target_path that is not a git repo", async () => {
      const targetDir = await createTempDir();
      try {
        // targetDir is a real directory but has no .git/ entry
        const result = await changeTools.adv_change_create.execute(
          {
            summary: "Should fail",
            target_path: targetDir,
          },
          store,
        );
        const parsed = parseToolOutput<{ error: string }>(result);
        expect(parsed.error).toMatch(/not a git repo|\.git/i);
      } finally {
        await cleanupTempDir(targetDir);
      }
    });

    test("P2.5: rejects target_path that does not exist", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Should fail",
          target_path: "/nonexistent/should/never/exist",
        },
        store,
      );
      const parsed = parseToolOutput<{ error: string }>(result);
      expect(parsed.error).toMatch(/not exist|ENOENT/i);
    });

    test("auto-detects source project name from store config", async () => {
      const targetDir = await createTempDir();
      await createTestProject(targetDir);
      try {
        const result = await changeTools.adv_change_create.execute(
          {
            summary: "Fix frontend bug",
            target_path: targetDir,
          },
          store,
        );
        const parsed = parseToolOutput(result);

        // Source project should be auto-detected from store config
        expect(parsed.cross_project_origin).toBeDefined();
        // The test project name comes from createTestProject
        expect(parsed.cross_project_origin.source_project).toBeDefined();
        expect(parsed.cross_project_origin.source_change_id).toBeUndefined();
      } finally {
        await cleanupTempDir(targetDir);
      }
    });

    test("includes origin section in proposal.md", async () => {
      const targetDir = await createTempDir();
      await createTestProject(targetDir);
      try {
        const result = await changeTools.adv_change_create.execute(
          {
            summary: "Add integration tests",
            proposal: "# My Proposal\n\n## Why\n\nNeed tests.",
            target_path: targetDir,
            source_project: "pokeedge",
            source_change_id: "refactorAuth",
          },
          store,
        );
        const parsed = parseToolOutput(result);

        // Read the proposal from the target project
        const targetStore = await createLegacyStore(targetDir);
        try {
          const changeDir = join(targetStore.paths.changes, parsed.changeId);
          const proposalContent = await readFile(
            join(changeDir, "proposal.md"),
            "utf-8",
          );

          // Should contain the cross-project origin section
          expect(proposalContent).toContain("## Cross-Project Origin");
          expect(proposalContent).toContain("pokeedge");
          expect(proposalContent).toContain("refactorAuth");
          // Original proposal content should also be present
          expect(proposalContent).toContain("# My Proposal");
        } finally {
          targetStore.close();
        }
      } finally {
        await cleanupTempDir(targetDir);
      }
    });

    test("returns error for nonexistent target path", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Broken target",
          target_path: "/nonexistent/path/that/does/not/exist",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("does not exist");
    });

    test("rejects leaked synthetic parity summaries for cross-project create", async () => {
      const targetDir = await createTempDir();
      await createTestProject(targetDir);

      try {
        const result = await changeTools.adv_change_create.execute(
          {
            summary: "[parity:legacy] change roundtrip",
            target_path: targetDir,
          },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.error).toContain("Synthetic validation draft summary");
        expect(parsed.error).toContain("isolated temp/test storage");
        expect(parsed.changeId).toBeUndefined();
      } finally {
        await cleanupTempDir(targetDir);
      }
    });

    test.each([
      "latencyLegacy1",
      "latencyLegacy96",
      "latency legacy7",
      "parityLegacyReentryParity",
      "parityTemporalTaskParity3",
      "cleanupParityHarnessLeak",
      "cleanupParityHarnessLeak2",
      "userIntuitComparisonProtocol2",
      "userIntuitComparisonProtocol",
    ] as const)("rejects synthetic summary '%s'", async (summary) => {
      const result = await changeTools.adv_change_create.execute(
        { summary },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("Synthetic validation draft summary");
      expect(parsed.changeId).toBeUndefined();
    });

    test("local create unchanged when target_path omitted", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "Local only change" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.changeId).toBe("localOnlyChange");
      expect(parsed.cross_project_origin).toBeUndefined();
      expect(parsed.target_path).toBeUndefined();

      // Verify change exists in local store
      const changeResult = await store.changes.get(parsed.changeId);
      expect(changeResult.success).toBe(true);
      expect(changeResult.data?.cross_project_origin).toBeUndefined();
    });

    test("creates same-project fast-follow with parent_change_id", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Fast follow cleanup",
          parent_change_id: "addFeature",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.changeId).toBe("fastFollowCleanup");
      expect(parsed.fast_follow_of).toMatchObject({
        parent_change_id: "addFeature",
      });
      expect(parsed.fast_follow_of.linked_at).toBeDefined();

      const changeResult = await store.changes.get(parsed.changeId);
      expect(changeResult.success).toBe(true);
      expect(changeResult.data?.fast_follow_of?.parent_change_id).toBe(
        "addFeature",
      );
    });

    test("rejects parent_change_id with target_path", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Invalid mixed followup",
          target_path: "/tmp/other-project",
          parent_change_id: "addFeature",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain(
        "target_path and parent_change_id are mutually exclusive",
      );
      expect(parsed.changeId).toBeUndefined();
    });

    test("rejects unknown parent_change_id with valid parent hint", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Unknown parent followup",
          parent_change_id: "missingParent",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toBe("Parent change not found: missingParent");
      expect(parsed.validParentIds).toContain("addFeature");
      expect(parsed.changeId).toBeUndefined();
    });

    test("rejects self-target with clear error when target_path equals current project root", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Self target change",
          target_path: tempDir,
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("Omit target_path");
      expect(parsed.changeId).toBeUndefined();

      // Verify no change was created in the local store
      const localChanges = await store.changes.list();
      const selfTargetChange = localChanges.changes.find(
        (c) => c.id === "selfTargetChange",
      );
      expect(selfTargetChange).toBeUndefined();
    });

    test("rejects self-target when target_path is symlink to current project root", async () => {
      const symlinkDir = join(tempDir, "symlink-to-self");
      await symlink(tempDir, symlinkDir);

      try {
        const result = await changeTools.adv_change_create.execute(
          {
            summary: "Symlink self target",
            target_path: symlinkDir,
          },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.error).toBeDefined();
        expect(parsed.error).toContain("Omit target_path");
        expect(parsed.changeId).toBeUndefined();
      } finally {
        // Cleanup symlink
        await cleanupTempDir(symlinkDir);
      }
    });

    test("cross-project create resolves externalRoot when target has git repo", async () => {
      const targetGitDir = await createTempDir();
      await createTestProject(targetGitDir);

      // Initialize git repo so getProjectId can resolve a project ID
      const { execFile } = await import("child_process");
      await new Promise<void>((resolve, reject) => {
        execFile("git", ["init"], { cwd: targetGitDir }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      await new Promise<void>((resolve, reject) => {
        execFile(
          "git",
          ["commit", "--allow-empty", "-m", "initial"],
          { cwd: targetGitDir },
          (err) => {
            if (err) reject(err);
            else resolve();
          },
        );
      });

      try {
        const result = await changeTools.adv_change_create.execute(
          {
            summary: "Cross project with git",
            target_path: targetGitDir,
          },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.changeId).toBe("crossProjectGit");
        expect(parsed.error).toBeUndefined();

        // Verify the change was written to external state, not .adv/changes/
        const targetProjectId = await getProjectId(targetGitDir);
        expect(targetProjectId).not.toBeNull();
        const externalRoot = getExternalRoot(targetProjectId!);
        const externalChangePath = join(
          externalRoot,
          "changes",
          parsed.changeId,
          "change.json",
        );
        const externalContent = await readFile(externalChangePath, "utf-8");
        const externalChange = JSON.parse(externalContent);
        expect(externalChange.id).toBe(parsed.changeId);

        // Verify it was NOT written to legacy in-repo path
        const legacyChangePath = join(
          targetGitDir,
          ".adv",
          "changes",
          parsed.changeId,
          "change.json",
        );
        await expect(readFile(legacyChangePath, "utf-8")).rejects.toThrow();
      } finally {
        await cleanupTempDir(targetGitDir);
      }
    });
  });

  describe("adv_change_update", () => {
    test("updates proposal.md and problem-statement.md for existing change", async () => {
      // First create a change
      const createResult = await changeTools.adv_change_create.execute(
        {
          summary: "Update test change",
          proposal: "# Original proposal",
          problemStatement: "Original problem statement",
        },
        store,
      );
      const created = parseToolOutput(createResult);

      // Now update it
      const updateResult = await changeTools.adv_change_update.execute(
        {
          changeId: created.changeId,
          proposal: "# Updated proposal content",
          problemStatement: "Updated problem statement content",
        },
        store,
      );
      const updated = parseToolOutput(updateResult);

      expect(updated.proposalPath).toContain("proposal.md");
      expect(updated.problemStatementPath).toContain("problem-statement.md");

      const proposalContent = await readFile(updated.proposalPath, "utf-8");
      expect(proposalContent).toBe("# Updated proposal content");

      const psContent = await readFile(updated.problemStatementPath, "utf-8");
      expect(psContent).toBe("Updated problem statement content");
    });

    test("returns error for nonexistent changeId", async () => {
      const result = await changeTools.adv_change_update.execute(
        {
          changeId: "nonExistentChange",
          proposal: "content",
          problemStatement: "content",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("nonExistentChange");
    });

    test("does not create a duplicate change directory", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "No dup via update" },
        store,
      );
      const created = parseToolOutput(createResult);

      await changeTools.adv_change_update.execute(
        {
          changeId: created.changeId,
          proposal: "# Refined proposal",
          problemStatement: "Refined problem",
        },
        store,
      );

      // Create again with same summary — should still get *2 suffix
      // (proving update didn't create a new dir)
      const createResult2 = await changeTools.adv_change_create.execute(
        { summary: "No dup via update" },
        store,
      );
      const created2 = parseToolOutput(createResult2);
      expect(created2.changeId).toBe(`${created.changeId}2`);
    });

    test("returns output without banner", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "Banner test update" },
        store,
      );
      const created = parseToolOutput(createResult);

      const result = await changeTools.adv_change_update.execute(
        {
          changeId: created.changeId,
          proposal: "# Updated",
          problemStatement: "Updated",
        },
        store,
      );

      // Output should contain the changeId and not have banner markers
      expect(result).toContain(created.changeId);
      expect(result).not.toContain("╔");
    });

    test("updates only proposal when problemStatement is omitted", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        {
          summary: "Partial update test",
          proposal: "# Original proposal",
          problemStatement: "Original problem",
        },
        store,
      );
      const created = parseToolOutput(createResult);

      const updateResult = await changeTools.adv_change_update.execute(
        {
          changeId: created.changeId,
          proposal: "# Updated proposal only",
        },
        store,
      );
      const updated = parseToolOutput(updateResult);

      expect(updated.proposalPath).toContain("proposal.md");
      expect(updated.problemStatementPath).toBeUndefined();

      const proposalContent = await readFile(updated.proposalPath, "utf-8");
      expect(proposalContent).toBe("# Updated proposal only");
    });

    test("returns error when both proposal and problemStatement are omitted", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "No params test" },
        store,
      );
      const created = parseToolOutput(createResult);

      const result = await changeTools.adv_change_update.execute(
        { changeId: created.changeId },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("At least one");
    });

    // P1.12 Scope C: relational validation of changeId.
    //
    // Context: during /adv-discover of completeTemporalOnlyMigration, the
    // agent accidentally called adv_change_update without a valid changeId.
    // The underlying store returned an opaque error, making it hard for
    // the agent to recover. The fix surfaces a structured error with an
    // explicit hint naming `adv_change_list` / `adv_change_show` as the
    // source-of-truth tools for valid changeIds.
    describe("changeId relational validation (P1.12 Scope C)", () => {
      test("rejects unknown changeId with helpful hint", async () => {
        const result = await changeTools.adv_change_update.execute(
          {
            changeId: "does-not-exist-xyz",
            proposal: "# Will not be written",
          },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.error).toBeDefined();
        expect(parsed.error).toContain("does-not-exist-xyz");
        expect(parsed.hint).toBeDefined();
        expect(parsed.hint).toMatch(/adv_change_list|adv_change_show/i);
      });

      test("at-least-one-field error includes a hint naming the fields", async () => {
        const createResult = await changeTools.adv_change_create.execute(
          { summary: "Hint test" },
          store,
        );
        const created = parseToolOutput(createResult);

        const result = await changeTools.adv_change_update.execute(
          { changeId: created.changeId },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.error).toContain("At least one");
        // Agent-facing hint should name the valid fields so the next call
        // can be constructed without a schema lookup
        expect(parsed.hint).toBeDefined();
        expect(parsed.hint).toMatch(/proposal/);
        expect(parsed.hint).toMatch(/design|agreement/);
      });
    });
  });

  // AC3 — cross-flag verification (target_path parity + truncation)
  describe("adv_change_show include flags — verification (AC3)", () => {
    test("include flags work with target_path (cross-project parity)", async () => {
      const targetDir = await createTempDir();
      await createTestProject(targetDir);
      // Initialize git so getProjectId resolves a project for target_path.
      const { execFile } = await import("child_process");
      const run = (args: string[]) =>
        new Promise<void>((resolve, reject) => {
          execFile("git", args, { cwd: targetDir }, (err) =>
            err ? reject(err) : resolve(),
          );
        });
      await run(["init"]);
      await run(["commit", "--allow-empty", "-m", "initial"]);

      try {
        const createResult = await changeTools.adv_change_create.execute(
          {
            summary: "Cross project target",
            target_path: targetDir,
          },
          store,
        );
        const created = parseToolOutput<{ changeId: string }>(createResult);
        expect(created.changeId).toBeDefined();

        // Read back via target_path with all include flags set.
        const result = await changeTools.adv_change_show.execute(
          {
            changeId: created.changeId,
            target_path: targetDir,
            include: { snapshot: true, ledger: true, readyTasks: true },
          },
          store,
        );
        const parsed = parseToolOutput(result);
        expect(parsed.id).toBe(created.changeId);
        expect(parsed._projectContext).toBeDefined();
        expect(parsed._contextSnapshot).toBeDefined();
        expect(parsed._readyTasks).toBeDefined();
        // _ledger is present (null when target has no in-progress task).
        expect("_ledger" in parsed).toBe(true);
      } finally {
        await cleanupTempDir(targetDir);
      }
    });

    test("formatToolOutput truncation envelope tolerates large include payloads", async () => {
      // Force a large payload by requesting all include flags. We don't
      // assert any particular truncation marker because the envelope
      // varies — but the call MUST NOT throw and the output MUST be
      // valid JSON the caller can re-parse.
      const result = await changeTools.adv_change_show.execute(
        {
          changeId: "addFeature",
          include: {
            snapshot: true,
            ledger: true,
            readyTasks: true,
            readyTasksLimit: 50,
          },
        },
        store,
      );
      // formatToolOutput emits banner + JSON; parseToolOutput should
      // recover the JSON without throwing.
      const parsed = parseToolOutput(result);
      expect(parsed.id).toBe("addFeature");
    });
  });

  // AC3 — adv_change_show include flags (snapshot/ledger/readyTasks)
  describe("adv_change_show include flags (AC3)", () => {
    test("default behavior: no include flags → no _contextSnapshot/_ledger/_readyTasks", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._contextSnapshot).toBeUndefined();
      expect(parsed._ledger).toBeUndefined();
      expect(parsed._readyTasks).toBeUndefined();
    });

    test("include.snapshot: true attaches _contextSnapshot at top-level (F1)", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature", include: { snapshot: true } },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._contextSnapshot).toBeDefined();
      expect(typeof parsed._contextSnapshot).toBe("string");
      // The rendered snapshot includes the change-id (truncated or full)
      expect(parsed._contextSnapshot).toContain("addFeature");
    });

    test("include.ledger: true attaches _ledger when an in-progress task exists", async () => {
      await store.tasks.update("tk-task0001", "in_progress");
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature", include: { ledger: true } },
        store,
      );
      const parsed = JSON.parse(result);
      // _ledger field is always present when include.ledger is set
      // (null when no in-progress task or no ledger recorded yet).
      expect(parsed._ledger !== undefined).toBe(true);
    });

    test("include.ledger: true attaches _ledger=null when no in-progress task exists", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature", include: { ledger: true } },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._ledger).toBeNull();
    });

    test("include.readyTasks: true attaches _readyTasks (top-10 default) and _readyTasksMeta", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature", include: { readyTasks: true } },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._readyTasks).toBeDefined();
      expect(Array.isArray(parsed._readyTasks)).toBe(true);
      expect(parsed._readyTasks.length).toBeLessThanOrEqual(10);
      expect(parsed._readyTasksMeta).toBeDefined();
      expect(parsed._readyTasksMeta.limit).toBe(10);
      expect(typeof parsed._readyTasksMeta.total).toBe("number");
    });

    test("include.readyTasksLimit overrides the default 10-task slice", async () => {
      const result = await changeTools.adv_change_show.execute(
        {
          changeId: "addFeature",
          include: { readyTasks: true, readyTasksLimit: 2 },
        },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._readyTasks.length).toBeLessThanOrEqual(2);
      expect(parsed._readyTasksMeta.limit).toBe(2);
    });

    test("include with all flags attaches all three sections", async () => {
      const result = await changeTools.adv_change_show.execute(
        {
          changeId: "addFeature",
          include: { snapshot: true, ledger: true, readyTasks: true },
        },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._contextSnapshot).toBeDefined();
      expect(parsed._ledger !== undefined).toBe(true);
      expect(parsed._readyTasks).toBeDefined();
      expect(parsed._readyTasksMeta).toBeDefined();
    });

    test("include.readyTasksLimit rejects out-of-range values via Zod", async () => {
      // Zod schema rejects min < 1 / max > 50. Tool layer doesn't enforce
      // (it's the SDK's job), but the schema definition is what we own.
      const schema = changeTools.adv_change_show.args.include;
      // The include schema is z.object({...}).optional() — drill in.
      const innerSchema = (schema as any)._def?.innerType ?? schema;
      const badLow = innerSchema.safeParse({
        readyTasks: true,
        readyTasksLimit: 0,
      });
      const badHigh = innerSchema.safeParse({
        readyTasks: true,
        readyTasksLimit: 51,
      });
      expect(badLow.success).toBe(false);
      expect(badHigh.success).toBe(false);

      const goodMin = innerSchema.safeParse({
        readyTasks: true,
        readyTasksLimit: 1,
      });
      const goodMax = innerSchema.safeParse({
        readyTasks: true,
        readyTasksLimit: 50,
      });
      expect(goodMin.success).toBe(true);
      expect(goodMax.success).toBe(true);
    });

    // GH #21: artifact content include flags (proposal/problemStatement/agreement/design)
    describe("artifact content include flags (GH #21)", () => {
      test("include.proposal: true returns _proposal with markdown content", async () => {
        const result = await changeTools.adv_change_show.execute(
          { changeId: "addFeature", include: { proposal: true } },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed._proposal).toBeDefined();
        expect(typeof parsed._proposal).toBe("string");
        expect(parsed._proposal.length).toBeGreaterThan(0);
      });

      test("include.problemStatement: true returns _problemStatement when file exists", async () => {
        const { writeFile } = await import("fs/promises");
        const { join } = await import("path");
        const changesDir = (store as any).paths.changes as string;
        await writeFile(
          join(changesDir, "addFeature", "problem-statement.md"),
          "# Problem Statement\n\nTest problem statement content.",
        );
        const result = await changeTools.adv_change_show.execute(
          { changeId: "addFeature", include: { problemStatement: true } },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed._problemStatement).toBeDefined();
        expect(parsed._problemStatement).toContain("Test problem statement");
      });

      test("include.problemStatement: true omits _problemStatement when file does not exist", async () => {
        const result = await changeTools.adv_change_show.execute(
          { changeId: "addFeature", include: { problemStatement: true } },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed._problemStatement).toBeUndefined();
      });

      test("include.agreement: true returns _agreement when file exists", async () => {
        const { writeFile } = await import("fs/promises");
        const { join } = await import("path");
        const changesDir = (store as any).paths.changes as string;
        await writeFile(
          join(changesDir, "addFeature", "agreement.md"),
          "# Agreement\n\nAgreed objectives.",
        );
        const result = await changeTools.adv_change_show.execute(
          { changeId: "addFeature", include: { agreement: true } },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed._agreement).toContain("Agreed objectives");
      });

      test("include.design: true returns _design when file exists", async () => {
        const { writeFile } = await import("fs/promises");
        const { join } = await import("path");
        const changesDir = (store as any).paths.changes as string;
        await writeFile(
          join(changesDir, "addFeature", "design.md"),
          "# Design\n\nImplementation plan.",
        );
        const result = await changeTools.adv_change_show.execute(
          { changeId: "addFeature", include: { design: true } },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed._design).toContain("Implementation plan");
      });

      test("no artifact flags → no _proposal/_problemStatement/_agreement/_design fields", async () => {
        const result = await changeTools.adv_change_show.execute(
          { changeId: "addFeature" },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed._proposal).toBeUndefined();
        expect(parsed._problemStatement).toBeUndefined();
        expect(parsed._agreement).toBeUndefined();
        expect(parsed._design).toBeUndefined();
      });
    });
  });

  describe("adv_change_show clarify integration", () => {
    test("includes clarifyFindings for change with ambiguity signals", async () => {
      // The sample change has a delta with add + no scenarios, and the sample
      // proposal has no Success Criteria or Scope section — should trigger findings
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.clarifyFindings).toBeDefined();
      expect(parsed.clarifyFindings.count).toBeGreaterThan(0);
      expect(parsed.clarifyFindings.findings).toBeInstanceOf(Array);
      // Should include CLARIFY_MISSING_SCENARIOS at minimum
      const codes = parsed.clarifyFindings.findings.map(
        (f: { code: string }) => f.code,
      );
      expect(codes).toContain("CLARIFY_MISSING_SCENARIOS");
    });

    test("omits clarifyFindings when clarify_enforcement is off", async () => {
      const config = store.config!;
      (config.features as Record<string, unknown>).clarify_enforcement = "off";

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.clarifyFindings).toBeUndefined();
    });
  });

  describe("adv_change_create clarify integration", () => {
    test("includes clarifyNeeded when summary has subjective language", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "Make it fast and simple" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.clarifyNeeded).toBeDefined();
      expect(parsed.clarifyNeeded.count).toBeGreaterThan(0);
      expect(parsed.clarifyNeeded.findings).toBeInstanceOf(Array);
      expect(parsed.clarifyNeeded.findings.length).toBe(
        parsed.clarifyNeeded.count,
      );
      // Each finding should have structured fields
      const finding = parsed.clarifyNeeded.findings[0];
      expect(finding.code).toBeDefined();
      expect(finding.severity).toBe("warning");
      expect(finding.message).toBeDefined();
      expect(finding.questionCategory).toBeDefined();
    });

    test("omits clarifyNeeded when summary is clean and concrete", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Add rate limiting",
          proposal:
            "# Add Rate Limiting\n\n## Scope\n\n- src/middleware/rate-limit.ts\n\n## Success Criteria\n\n- [ ] Rate limiter rejects >100 req/min per IP\n- [ ] Returns 429 with retry-after header\n\n## Error Handling\n\nOn failure, fallback to permissive mode with error logged.",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.clarifyNeeded).toBeUndefined();
    });

    test("respects clarify_enforcement off — omits findings", async () => {
      // Override config to set clarify_enforcement to "off"
      const config = store.config!;
      (config.features as Record<string, unknown>).clarify_enforcement = "off";

      const result = await changeTools.adv_change_create.execute(
        { summary: "Make it fast" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.clarifyNeeded).toBeUndefined();
    });
  });

  describe("adv_change_validate", () => {
    test("passes for valid change", async () => {
      const result = await changeTools.adv_change_validate.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.passed).toBe(true);
      expect(parsed.errors).toHaveLength(0);
    });

    test("warns when no tasks defined", async () => {
      // Create a change with no tasks
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "Empty change" },
        store,
      );
      const { changeId } = parseToolOutput(createResult);

      const result = await changeTools.adv_change_validate.execute(
        { changeId },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.passed).toBe(true); // Warnings don't fail by default
      expect(
        parsed.warnings.some((w: { code: string }) => w.code === "NO_TASKS"),
      ).toBe(true);
    });

    test("warns when no deltas defined", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "No deltas change" },
        store,
      );
      const { changeId } = parseToolOutput(createResult);

      const result = await changeTools.adv_change_validate.execute(
        { changeId },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(
        parsed.warnings.some((w: { code: string }) => w.code === "NO_DELTAS"),
      ).toBe(true);
    });

    test("surfaces proposal drift warnings through adv_change_validate", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        {
          summary: "Drift change",
          proposal:
            "# Drift Change\n\n## Authentication\n\nNeed auth system.\n",
        },
        store,
      );
      const { changeId } = parseToolOutput(createResult);

      const change = (await store.changes.get(changeId)).data!;
      change.tasks = [
        {
          id: "tk-drift01",
          title: "Capture agreed implementation task",
          type: "code",
          status: "pending",
          priority: 0,
          created_at: new Date().toISOString(),
          tdd_phase: "none",
        },
      ];
      await store.changes.save(change);

      const result = await changeTools.adv_change_validate.execute(
        { changeId },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(
        parsed.warnings.some(
          (w: { code: string }) => w.code === "PROPOSAL_TASK_DRIFT",
        ),
      ).toBe(true);
      expect(
        parsed.warnings.some((w: { code: string }) => w.code === "NO_TASKS"),
      ).toBe(false);
    });

    test("passes in strict mode when warnings are archive-safe only", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        {
          summary: "Archive-safe warnings",
          proposal:
            "# Drift Change\n\n## Authentication\n\nNeed auth system.\n",
        },
        store,
      );
      const { changeId } = parseToolOutput(createResult);

      const change = (await store.changes.get(changeId)).data!;
      change.tasks = [
        {
          id: "tk-archivesafe01",
          title: "Write release notes",
          type: "docs",
          status: "pending",
          priority: 0,
          created_at: new Date().toISOString(),
          tdd_phase: "none",
        },
      ];
      await store.changes.save(change);

      const result = await changeTools.adv_change_validate.execute(
        { changeId, strict: true },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.passed).toBe(true);
      expect(
        parsed.warnings.some((w: { code: string }) => w.code === "NO_DELTAS"),
      ).toBe(true);
      expect(
        parsed.warnings.some(
          (w: { code: string }) => w.code === "PROPOSAL_TASK_DRIFT",
        ),
      ).toBe(true);
      expect(
        parsed.warnings.some((w: { code: string }) => w.code === "NO_TASKS"),
      ).toBe(false);
    });

    test("fails in strict mode with non-archive-safe warnings", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "Empty change" },
        store,
      );
      const { changeId } = parseToolOutput(createResult);

      const change = (await store.changes.get(changeId)).data!;
      change.deltas = {
        "test-capability": [
          {
            id: "dl-addwarn01",
            operation: "add",
            requirement: {
              id: "rq-addwarn01",
              title: "Archive warning test requirement",
              body: "Requirement with missing scenarios warning.",
              priority: "must",
              scenarios: [],
            },
          },
        ],
      };
      await store.changes.save(change);

      const result = await changeTools.adv_change_validate.execute(
        { changeId, strict: true },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.passed).toBe(false);
      expect(
        parsed.warnings.some(
          (w: { code: string }) => w.code === "MISSING_SCENARIO",
        ),
      ).toBe(true);
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_validate.execute(
        { changeId: "nonexistent" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_change_archive", () => {
    // Default mock: validateChange returns passed with no errors.
    // Individual tests override as needed.
    let validateChangeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      const validator = await import("../validator");
      validateChangeSpy = vi
        .spyOn(validator, "validateChange")
        .mockResolvedValue({
          passed: true,
          errors: [],
          warnings: [],
          checkedAt: new Date().toISOString(),
          checksPerformed: [],
        });
    });

    afterEach(() => {
      validateChangeSpy?.mockRestore();
    });

    async function completeArchivePreflight(): Promise<void> {
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      const change = (await store.changes.get("addFeature")).data!;
      change.gates = {
        proposal: { status: "done", completed_at: new Date().toISOString() },
        discovery: { status: "done", completed_at: new Date().toISOString() },
        design: { status: "done", completed_at: new Date().toISOString() },
        planning: { status: "done", completed_at: new Date().toISOString() },
        execution: { status: "done", completed_at: new Date().toISOString() },
        acceptance: { status: "done", completed_at: new Date().toISOString() },
        release: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);
    }

    test("archives change with all tasks and gates completed", async () => {
      // Complete all tasks
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      // Complete all gates (required for archive)
      const change = (await store.changes.get("addFeature")).data!;
      change.gates = {
        proposal: { status: "done", completed_at: new Date().toISOString() },
        discovery: { status: "done", completed_at: new Date().toISOString() },
        design: { status: "done", completed_at: new Date().toISOString() },
        planning: { status: "done", completed_at: new Date().toISOString() },
        execution: { status: "done", completed_at: new Date().toISOString() },
        acceptance: { status: "done", completed_at: new Date().toISOString() },
        release: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(
        parsed.specsUpdated.map((s: { capability: string }) => s.capability),
      ).toContain("test-capability");
    });

    test("fully retires a change from active source and list state", async () => {
      await completeArchivePreflight();

      const sourceDir = join(tempDir, ".adv/changes/addFeature");
      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      await access(join(parsed.archivePath, "change.json"));
      await expect(access(sourceDir)).rejects.toThrow();

      const activeList = parseToolOutput(
        await changeTools.adv_change_list.execute({}, store),
      );
      expect(activeList.changes.map((c: { id: string }) => c.id)).not.toContain(
        "addFeature",
      );

      const archivedList = parseToolOutput(
        await changeTools.adv_change_list.execute(
          { status: "archived" },
          store,
        ),
      );
      expect(archivedList.changes).toHaveLength(1);
      expect(archivedList.changes[0]).toMatchObject({
        id: "addFeature",
        status: "archived",
      });
    });

    test("dry-run does not archive status or remove source dir", async () => {
      await completeArchivePreflight();

      const sourceDir = join(tempDir, ".adv/changes/addFeature");
      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature", dryRun: true },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      await access(sourceDir);

      const change = (await store.changes.get("addFeature")).data!;
      expect(change.status).toBe("active");
    });

    // rq-archiveWorktreePath01: in-repo bundle lands in worktree-aware location
    test("worktreePath routes in-repo bundle to passed path", async () => {
      await completeArchivePreflight();

      // Simulate a separate worktree directory.
      const worktreeDir = await createTempDir();
      try {
        const result = await changeTools.adv_change_archive.execute(
          { changeId: "addFeature", worktreePath: worktreeDir },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.success).toBe(true);
        // Primary archive (external) is unchanged in tests where store.paths.root === tempDir.
        // The IN-REPO bundle, however, MUST land under the passed worktreePath.
        const inRepoBundle = join(
          worktreeDir,
          ".adv",
          "archive",
          `2026-05-04-addFeature`,
        );
        await access(join(inRepoBundle, "change.json"));
      } finally {
        await cleanupTempDir(worktreeDir);
      }
    });

    test("worktreePath omitted: in-repo bundle defaults to store.paths.root", async () => {
      await completeArchivePreflight();

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      // Default path: in-repo bundle lands under tempDir (which equals
      // store.paths.root in this test setup) — backward-compatible behavior.
      const inRepoBundle = join(
        tempDir,
        ".adv",
        "archive",
        `2026-05-04-addFeature`,
      );
      await access(join(inRepoBundle, "change.json"));
    });

    test("copies problem statement artifact through adv_change_archive", async () => {
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      const change = (await store.changes.get("addFeature")).data!;
      change.gates = {
        proposal: { status: "done", completed_at: new Date().toISOString() },
        discovery: { status: "done", completed_at: new Date().toISOString() },
        design: { status: "done", completed_at: new Date().toISOString() },
        planning: { status: "done", completed_at: new Date().toISOString() },
        execution: { status: "done", completed_at: new Date().toISOString() },
        acceptance: { status: "done", completed_at: new Date().toISOString() },
        release: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);

      const changeDir = join(tempDir, ".adv/changes/addFeature");
      await writeFile(
        join(changeDir, "problem-statement.md"),
        "PROBLEM\n  The widget is broken.",
      );

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);

      const archivedProblemStatement = await readFile(
        join(parsed.archivePath, "problem-statement.md"),
        "utf-8",
      );
      expect(archivedProblemStatement).toBe("PROBLEM\n  The widget is broken.");
    });

    test("respects wisdom_accumulation feature flag during archive", async () => {
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      const change = (await store.changes.get("addFeature")).data!;
      change.wisdom = [
        {
          id: "ws-archive01",
          type: "convention",
          content: "do not auto-promote when feature flag is off",
          recorded_at: new Date().toISOString(),
        },
      ];
      change.gates = {
        proposal: { status: "done", completed_at: new Date().toISOString() },
        discovery: { status: "done", completed_at: new Date().toISOString() },
        design: { status: "done", completed_at: new Date().toISOString() },
        planning: { status: "done", completed_at: new Date().toISOString() },
        execution: { status: "done", completed_at: new Date().toISOString() },
        acceptance: { status: "done", completed_at: new Date().toISOString() },
        release: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);
      if (store.config?.features) {
        store.config.features.wisdom_accumulation = false;
      }

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      const projectWisdom = await listProjectWisdom(tempDir);
      expect(projectWisdom).toHaveLength(0);
    });

    test("fails when tasks are incomplete", async () => {
      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("incomplete tasks");
      expect(parsed.incompleteTasks).toHaveLength(3);
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_archive.execute(
        { changeId: "nonexistent" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });

    test("blocks archive when gates are incomplete", async () => {
      // Complete all tasks
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      // Don't complete any gates - they should block archive
      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("gate");
      expect(parsed.incompleteGates).toBeDefined();
      expect(parsed.incompleteGates.length).toBeGreaterThan(0);
    });

    test("F1: suggests adv_change_diagnose when disk gates are done but store sees incomplete (divergence)", async () => {
      // Complete all tasks
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      // Save complete gates to disk
      const change = (await store.changes.get("addFeature")).data!;
      change.gates = {
        proposal: { status: "done", completed_at: new Date().toISOString() },
        discovery: { status: "done", completed_at: new Date().toISOString() },
        design: { status: "done", completed_at: new Date().toISOString() },
        planning: { status: "done", completed_at: new Date().toISOString() },
        execution: { status: "done", completed_at: new Date().toISOString() },
        acceptance: { status: "done", completed_at: new Date().toISOString() },
        release: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);

      // Monkey-patch store.changes.get to simulate Temporal divergence:
      // return the same change but with pending gates.
      const originalGet = store.changes.get.bind(store.changes);
      store.changes.get = async (id: string) => {
        const result = await originalGet(id);
        if (result.success && result.data && id === "addFeature") {
          const staleChange = { ...result.data };
          staleChange.gates = {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          };
          return { success: true, data: staleChange };
        }
        return result;
      };

      try {
        const result = await changeTools.adv_change_archive.execute(
          { changeId: "addFeature" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.error).toContain("Cannot archive: incomplete gates");
        expect(parsed.hint).toContain("adv_change_diagnose");
        expect(parsed.hint).toContain("adv_workflow_repair");
        expect(parsed.hint).toContain("addFeature");
      } finally {
        store.changes.get = originalGet;
      }
    });

    // rq-archiveOrdering01.1: idempotent retry skips disk write when bundle
    // already exists. Simulates the recovery scenario where a previous
    // archive succeeded on disk but the status transition failed.
    test("idempotent retry: detects existing bundle and uses its path", async () => {
      await completeArchivePreflight();

      // First archive succeeds and writes bundle to a date-prefixed dir.
      const first = parseToolOutput(
        await changeTools.adv_change_archive.execute(
          { changeId: "addFeature" },
          store,
        ),
      );
      expect(first.success).toBe(true);
      const bundlePath = first.archivePath;
      await access(join(bundlePath, "change.json"));

      // findArchiveBundle locates the existing bundle by changeId.
      const { findArchiveBundle, archiveBundleExists } =
        await import("../archive");
      const archiveRoot = join(tempDir, ".adv/archive");
      const found = await findArchiveBundle(archiveRoot, "addFeature");
      expect(found).toBe(bundlePath);
      expect(await archiveBundleExists(archiveRoot, "addFeature")).toBe(true);
    });

    // rq-archiveOrdering01.2: archive error output surfaces full cause chain
    // when the post-disk status transition (store.changes.save) fails.
    test("surfaces full cause chain and search-attribute recovery when status transition fails", async () => {
      await completeArchivePreflight();

      // Monkey-patch store.changes.save to throw with a nested cause.
      const originalSave = store.changes.save.bind(store.changes);
      const innerCause = new Error(
        "workflow rejected: upsertSearchAttributes failed for AdvChangeId search attribute",
      );
      const outerError = new Error("WorkflowUpdateFailedError");
      (outerError as Error & { cause?: unknown }).cause = innerCause;
      store.changes.save = async () => {
        throw outerError;
      };

      try {
        const result = await changeTools.adv_change_archive.execute(
          { changeId: "addFeature" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.success).toBe(false);
        // Cause-chain text must include both outer and inner messages.
        expect(parsed.error).toContain("WorkflowUpdateFailedError");
        expect(parsed.error).toContain("upsertSearchAttributes failed");
        expect(parsed.error).toContain("AdvChangeId search attribute");
        // Bundle path is preserved so caller can retry idempotently.
        expect(parsed.archivePath).toBeTruthy();
        expect(parsed.retrySafe).toBe(true);
        expect(parsed.recoveryHint).toContain("adv_temporal_diagnose");
        expect(parsed.recoveryHint).toContain(
          "adv_temporal_register_search_attributes",
        );
        expect(parsed.recoveryHint).toContain("adv_temporal_worker_restart");
        expect(parsed.recoveryHint).toContain("worker process only");
        expect(parsed.recoveryHint).toContain("retry archive");
        expect(parsed.recoveryHint).toContain("Restart OpenCode");
        expect(parsed.recoveryHint).toContain("plugin/src/tools/*.ts");
      } finally {
        store.changes.save = originalSave;
      }
    });

    // rq-archiveValidate01: archive completeness validation
    describe("archive completeness validation", () => {
      test("validation errors block archive", async () => {
        await completeArchivePreflight();
        validateChangeSpy.mockResolvedValue({
          passed: false,
          errors: [
            {
              code: "MISSING_TDD_EVIDENCE",
              message: "Task tk-task0001 missing TDD evidence",
              severity: "error",
            },
          ],
          warnings: [],
          checkedAt: new Date().toISOString(),
          checksPerformed: ["checkTddCompliance"],
        });

        const result = await changeTools.adv_change_archive.execute(
          { changeId: "addFeature" },
          store,
        );
        const parsed = parseToolOutput(result);
        expect(parsed.error).toBeDefined();
        expect(parsed.error).toContain("validation");
        expect(parsed.validationErrors).toBeDefined();
        expect(parsed.validationErrors.length).toBeGreaterThan(0);
      });

      test("validation warnings pass through without blocking", async () => {
        await completeArchivePreflight();
        validateChangeSpy.mockResolvedValue({
          passed: true,
          errors: [],
          warnings: [
            {
              code: "MISSING_TDD_INTENT",
              message: "Task missing TDD intent",
              severity: "warning",
            },
          ],
          checkedAt: new Date().toISOString(),
          checksPerformed: ["checkTddCompliance"],
        });

        const result = await changeTools.adv_change_archive.execute(
          { changeId: "addFeature" },
          store,
        );
        const parsed = parseToolOutput(result);
        expect(parsed.success).toBe(true);
        expect(parsed.validationWarnings).toBeDefined();
        expect(parsed.validationWarnings.length).toBeGreaterThan(0);
      });

      test("idempotent retry still validates (does not skip)", async () => {
        await completeArchivePreflight();
        // First archive succeeds (default mock returns passed)
        const first = parseToolOutput(
          await changeTools.adv_change_archive.execute(
            { changeId: "addFeature" },
            store,
          ),
        );
        expect(first.success).toBe(true);

        // The archive moves source to archive. Re-create source with status=active
        // to simulate a failed status transition (bundle exists, but change still active)
        const archiveDir = first.archivePath;
        const sourceDir = join(tempDir, ".adv/changes/addFeature");
        await mkdir(sourceDir, { recursive: true });
        const archivedChange = JSON.parse(
          await readFile(join(archiveDir, "change.json"), "utf-8"),
        );
        archivedChange.status = "active";
        await writeFile(
          join(sourceDir, "change.json"),
          JSON.stringify(archivedChange, null, 2),
        );
        await writeFile(
          join(sourceDir, "proposal.md"),
          "# addFeature\n\nTest.\n",
        );
        await store.sync();

        // Override mock to return errors — should block even though bundle exists
        validateChangeSpy.mockResolvedValue({
          passed: false,
          errors: [
            {
              code: "MISSING_TDD_EVIDENCE",
              message: "Missing TDD",
              severity: "error",
            },
          ],
          warnings: [],
          checkedAt: new Date().toISOString(),
          checksPerformed: ["checkTddCompliance"],
        });

        const result = await changeTools.adv_change_archive.execute(
          { changeId: "addFeature" },
          store,
        );
        const parsed = parseToolOutput(result);
        // Should be blocked by validation, not proceed via idempotent retry
        expect(parsed.error).toBeDefined();
        expect(parsed.error).toContain("validation");
      });

      test("validation context failure blocks archive", async () => {
        await completeArchivePreflight();
        const originalList = store.specs.list.bind(store.specs);
        store.specs.list = async () => {
          throw new Error("spec list failed");
        };

        try {
          const result = await changeTools.adv_change_archive.execute(
            { changeId: "addFeature" },
            store,
          );
          const parsed = parseToolOutput(result);
          expect(parsed.success).toBe(false);
          expect(parsed.error).toContain("validation could not run");
          expect(parsed.validationErrors).toHaveLength(1);
          expect(parsed.validationErrors[0]).toMatchObject({
            code: "VALIDATION_CONTEXT_FAILED",
          });
          expect(parsed.validationErrors[0].message).toContain(
            "spec list failed",
          );
        } finally {
          store.specs.list = originalList;
        }
      });
    });

    // F12: canArchive ⇔ archive contract tests
    test("F12: happy path — all gates done in disk and store, canArchive true and dryRun archive succeeds", async () => {
      // Complete all tasks
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      // Complete all gates on disk
      const change = (await store.changes.get("addFeature")).data!;
      change.gates = {
        proposal: { status: "done", completed_at: new Date().toISOString() },
        discovery: { status: "done", completed_at: new Date().toISOString() },
        design: { status: "done", completed_at: new Date().toISOString() },
        planning: { status: "done", completed_at: new Date().toISOString() },
        execution: { status: "done", completed_at: new Date().toISOString() },
        acceptance: { status: "done", completed_at: new Date().toISOString() },
        release: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);

      // Gate status reports canArchive
      const gateResult = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const gateParsed = parseToolOutput(gateResult);
      expect(gateParsed.canArchive).toBe(true);
      expect(gateParsed.incomplete).toHaveLength(0);

      // Dry-run archive succeeds
      const archiveResult = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature", dryRun: true },
        store,
      );
      const archiveParsed = parseToolOutput(archiveResult);
      expect(archiveParsed.success).toBe(true);
      expect(archiveParsed.dryRun).toBe(true);
    });

    test("F12: divergence — disk gates done but store sees pending, archive fails with F1 hint", async () => {
      // Complete all tasks
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      // Save complete gates to disk
      const change = (await store.changes.get("addFeature")).data!;
      change.gates = {
        proposal: { status: "done", completed_at: new Date().toISOString() },
        discovery: { status: "done", completed_at: new Date().toISOString() },
        design: { status: "done", completed_at: new Date().toISOString() },
        planning: { status: "done", completed_at: new Date().toISOString() },
        execution: { status: "done", completed_at: new Date().toISOString() },
        acceptance: { status: "done", completed_at: new Date().toISOString() },
        release: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);

      // Monkey-patch store.changes.get to simulate Temporal divergence
      const originalGet = store.changes.get.bind(store.changes);
      store.changes.get = async (id: string) => {
        const result = await originalGet(id);
        if (result.success && result.data && id === "addFeature") {
          const staleChange = { ...result.data };
          staleChange.gates = {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          };
          return { success: true, data: staleChange };
        }
        return result;
      };

      try {
        const result = await changeTools.adv_change_archive.execute(
          { changeId: "addFeature" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.error).toContain("Cannot archive: incomplete gates");
        expect(parsed.hint).toContain("adv_change_diagnose");
        expect(parsed.hint).toContain("adv_workflow_repair");
        expect(parsed.hint).toContain("addFeature");
      } finally {
        store.changes.get = originalGet;
      }
    });
  });

  describe("adv_change_archive in-repo archive wiring", () => {
    test("creates in-repo archive bundle alongside external archive", async () => {
      // Complete all tasks with TDD evidence
      const change = (await store.changes.get("addFeature")).data!;
      for (const task of change.tasks) {
        task.tdd_evidence = {
          red: {
            test_file: "test.ts",
            command: "vitest run test.ts",
            exit_code: 1,
            recorded_at: new Date().toISOString(),
          },
          green: {
            test_file: "test.ts",
            command: "vitest run test.ts",
            exit_code: 0,
            recorded_at: new Date().toISOString(),
          },
        };
        task.status = "done";
      }
      await store.changes.save(change);

      // Complete all gates
      change.gates = {
        proposal: { status: "done", completed_at: new Date().toISOString() },
        discovery: { status: "done", completed_at: new Date().toISOString() },
        design: { status: "done", completed_at: new Date().toISOString() },
        planning: { status: "done", completed_at: new Date().toISOString() },
        execution: { status: "done", completed_at: new Date().toISOString() },
        acceptance: { status: "done", completed_at: new Date().toISOString() },
        release: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);
      expect(parsed.success).toBe(true);

      // Verify in-repo bundle was created
      const { readFile: readFs } = await import("fs/promises");
      const { join: joinPath } = await import("path");
      const inRepoArchiveDir = joinPath(store.paths.root, ".adv", "archive");

      // Find the bundle directory
      const { readdir: readdirFs } = await import("fs/promises");
      const entries = await readdirFs(inRepoArchiveDir);
      const bundleEntry = entries.find((e) => e.endsWith("-addFeature"));
      expect(bundleEntry).toBeDefined();

      const bundlePath = joinPath(inRepoArchiveDir, bundleEntry!);
      const changeJson = JSON.parse(
        await readFs(joinPath(bundlePath, "change.json"), "utf-8"),
      );
      expect(changeJson.id).toBe("addFeature");
      expect(changeJson.status).toBe("archived");
    });
  });

  describe("adv_change_update_issues", () => {
    test("adds issue URL to change without existing issues", async () => {
      const result = await changeTools.adv_change_update_issues.execute(
        {
          changeId: "addFeature",
          add: ["https://github.com/org/repo/issues/123"],
        },
        store,
      );
      const parsed = parseToolOutput(result);
      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/123",
      );
      expect(parsed.added).toContain("https://github.com/org/repo/issues/123");
    });

    test("adds and removes issues in one call", async () => {
      await changeTools.adv_change_update_issues.execute(
        {
          changeId: "addFeature",
          add: [
            "https://github.com/org/repo/issues/123",
            "https://github.com/org/repo/issues/456",
          ],
        },
        store,
      );

      const result = await changeTools.adv_change_update_issues.execute(
        {
          changeId: "addFeature",
          add: ["https://github.com/org/repo/issues/789"],
          remove: ["https://github.com/org/repo/issues/123"],
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toHaveLength(2);
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/456",
      );
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/789",
      );
      expect(parsed.removed).toContain(
        "https://github.com/org/repo/issues/123",
      );
    });

    test("reports duplicate add and missing remove as no-op buckets", async () => {
      await changeTools.adv_change_update_issues.execute(
        {
          changeId: "addFeature",
          add: ["https://github.com/org/repo/issues/123"],
        },
        store,
      );

      const result = await changeTools.adv_change_update_issues.execute(
        {
          changeId: "addFeature",
          add: ["https://github.com/org/repo/issues/123"],
          remove: ["https://github.com/org/repo/issues/999"],
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.alreadyLinked).toContain(
        "https://github.com/org/repo/issues/123",
      );
      expect(parsed.notLinked).toContain(
        "https://github.com/org/repo/issues/999",
      );
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_update_issues.execute(
        {
          changeId: "nonexistent",
          add: ["https://github.com/org/repo/issues/123"],
        },
        store,
      );
      const parsed = parseToolOutput(result);
      expect(parsed.error).toContain("not found");
    });

    test("returns error when both add and remove are empty", async () => {
      const result = await changeTools.adv_change_update_issues.execute(
        {
          changeId: "addFeature",
          add: [],
          remove: [],
        },
        store,
      );
      const parsed = parseToolOutput(result);
      expect(parsed.error).toContain(
        "At least one non-empty add/remove issue list is required",
      );
    });

    test("persists issue updates to JSON file", async () => {
      await changeTools.adv_change_update_issues.execute(
        {
          changeId: "addFeature",
          add: [
            "https://github.com/org/repo/issues/123",
            "https://github.com/org/repo/issues/456",
          ],
        },
        store,
      );
      await changeTools.adv_change_update_issues.execute(
        {
          changeId: "addFeature",
          remove: ["https://github.com/org/repo/issues/123"],
        },
        store,
      );

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.github_issues).toEqual([
        "https://github.com/org/repo/issues/456",
      ]);
    });
  });
});

// =============================================================================
// Clarify finding persistence (Leak #12, KD7)
// =============================================================================

describe("adv_change_show clarify finding persistence (Leak #12)", () => {
  let tempDir4: string;
  let store4: Store;

  beforeEach(async () => {
    tempDir4 = await createTempDir();
    await createTestProject(tempDir4);
    store4 = await createLegacyStore(tempDir4);
    await store4.init();
    await store4.sync();
  });

  afterEach(async () => {
    store4.close();
    await cleanupTempDir(tempDir4);
  });

  test("adv_change_show persists clarify findings as snapshots on the change (Leak #12)", async () => {
    // First call — findings are computed and should be persisted
    await changeTools.adv_change_show.execute(
      { changeId: "addFeature" },
      store4,
    );

    // Reload the change to verify findings were persisted
    const changeResult = await store4.changes.get("addFeature");
    const change = changeResult.data!;
    expect(change.clarify_findings).toBeDefined();
    expect(Array.isArray(change.clarify_findings)).toBe(true);
    expect(change.clarify_findings!.length).toBeGreaterThan(0);

    // Each persisted finding has required snapshot fields
    const finding = change.clarify_findings![0];
    expect(finding.code).toBeDefined();
    expect(finding.severity).toBeDefined();
    expect(finding.message).toBeDefined();
    expect(finding.recorded_at).toBeDefined();
  });

  test("clarify findings backwards compat — change without findings has no clarify_findings", async () => {
    // Change without any ambiguity signals — check that existing data without findings is fine
    const changeResult = await store4.changes.get("addFeature");
    const change = changeResult.data!;
    // Before first show call, clarify_findings should be absent (or empty)
    expect(
      change.clarify_findings == null || change.clarify_findings.length === 0,
    ).toBe(true);
  });
});

describe("adv_change_reenter", () => {
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

  test("successfully reopens from a completed gate and returns updated gates", async () => {
    // Complete gates through planning (proposal, discovery, design, planning)
    await store.gates.complete("addFeature", "proposal");
    await store.gates.complete("addFeature", "discovery");
    await store.gates.complete("addFeature", "design");
    await store.gates.complete("addFeature", "planning");

    const result = await changeTools.adv_change_reenter.execute(
      {
        changeId: "addFeature",
        fromGate: "discovery",
        reason: "New authentication requirement added",
      },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    // discovery and all downstream should be reset to pending
    expect(parsed.gates.discovery.status).toBe("pending");
    expect(parsed.gates.design.status).toBe("pending");
    expect(parsed.gates.planning.status).toBe("pending");
    // proposal should remain done
    expect(parsed.gates.proposal.status).toBe("done");
  });

  test("returns reentry_history in the response", async () => {
    await store.gates.complete("addFeature", "proposal");
    await store.gates.complete("addFeature", "discovery");

    const result = await changeTools.adv_change_reenter.execute(
      {
        changeId: "addFeature",
        fromGate: "discovery",
        reason: "Scope expanded to include OAuth",
        scopeDelta: "Added OAuth2 provider integration",
        approvedByUser: true,
        approvalEvidence: "User approved via question tool",
      },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.reentry).toBeDefined();
    expect(parsed.reentry.from_gate).toBe("discovery");
    expect(parsed.reentry.reason).toBe("Scope expanded to include OAuth");
    expect(parsed.reentry.scope_delta).toBe(
      "Added OAuth2 provider integration",
    );
    expect(parsed.reentry.approval_evidence).toBe(
      "User approved via question tool",
    );
    expect(parsed.reentry.reopened_at).toBeDefined();
    expect(parsed.reentry.gates_reset).toContain("discovery");
  });

  test("returns error for non-existent change", async () => {
    const result = await changeTools.adv_change_reenter.execute(
      {
        changeId: "nonexistent",
        fromGate: "discovery",
        reason: "Expanding scope",
        approvedByUser: true,
        approvalEvidence: "User approved via question tool",
      },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.error).toBeDefined();
    expect(parsed.error).toContain("nonexistent");
  });

  test("returns error when target gate is not completed", async () => {
    // proposal is pending by default — cannot reopen a pending gate
    const result = await changeTools.adv_change_reenter.execute(
      {
        changeId: "addFeature",
        fromGate: "proposal",
        reason: "Trying to reopen pending gate",
        approvedByUser: true,
        approvalEvidence: "User approved via question tool",
      },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.error).toBeDefined();
    expect(parsed.error).toContain("not completed");
  });

  test("includes scopeDelta in history when provided", async () => {
    await store.gates.complete("addFeature", "proposal");
    await store.gates.complete("addFeature", "discovery");
    await store.gates.complete("addFeature", "design");

    const result = await changeTools.adv_change_reenter.execute(
      {
        changeId: "addFeature",
        fromGate: "design",
        reason: "Architecture needs revision",
        scopeDelta: "Switching from REST to GraphQL",
        approvedByUser: true,
        approvalEvidence: "User approved via question tool",
      },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.reentry.scope_delta).toBe("Switching from REST to GraphQL");

    // Verify the history is persisted on the change
    const changeResult = await store.changes.get("addFeature");
    const change = changeResult.data!;
    expect(change.reentry_history).toBeDefined();
    expect(change.reentry_history!.length).toBe(1);
    expect(change.reentry_history![0].scope_delta).toBe(
      "Switching from REST to GraphQL",
    );
    expect(change.reentry_history![0].approval_evidence).toBe(
      "User approved via question tool",
    );
  });

  test("allows autonomous re-entry without approval fields", async () => {
    await store.gates.complete("addFeature", "proposal");
    await store.gates.complete("addFeature", "discovery");

    const result = await changeTools.adv_change_reenter.execute(
      {
        changeId: "addFeature",
        fromGate: "discovery",
        reason: "Scope expansion detected during execution",
      },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.reentry.approval_evidence).toBeUndefined();
  });

  test("treats blank approval evidence as absent", async () => {
    await store.gates.complete("addFeature", "proposal");
    await store.gates.complete("addFeature", "discovery");

    const result = await changeTools.adv_change_reenter.execute(
      {
        changeId: "addFeature",
        fromGate: "discovery",
        reason: "Scope expansion with blank optional audit note",
        approvalEvidence: "   ",
      },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.reentry.approval_evidence).toBeUndefined();
  });

  test("emits _contextSnapshot showing reset gate state", async () => {
    await store.gates.complete("addFeature", "proposal");
    await store.gates.complete("addFeature", "discovery");

    const result = await changeTools.adv_change_reenter.execute(
      {
        changeId: "addFeature",
        fromGate: "discovery",
        reason: "Scope expansion",
      },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed._contextSnapshot).toBeDefined();
    expect(typeof parsed._contextSnapshot).toBe("string");
    expect(parsed._contextSnapshot).toContain("addFeature");
    expect(parsed._contextSnapshot).toMatch(/[╔╗╚╝║═]/);
    // Should show proposal as done and discovery as pending
    expect(parsed._contextSnapshot).toMatch(/\[✓ proposal\]/);
    expect(parsed._contextSnapshot).toMatch(/\[○ discovery\]/);
  });
});
