/**
 * Change Tools Tests
 *
 * TDD tests for change management tools
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, symlink, access } from "fs/promises";
import { join } from "path";
import { getProjectId, getExternalRoot } from "../utils/project-id";
import { changeTools } from "./change";
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

      // Should include a _contextSnapshot string field
      expect(parsed._contextSnapshot).toBeDefined();
      expect(typeof parsed._contextSnapshot).toBe("string");
      // Snapshot should contain the change ID and title
      expect(parsed._contextSnapshot).toContain("addFeature");
      expect(parsed._contextSnapshot).toContain("Add New Feature");
      // Should contain gate progress
      expect(parsed._contextSnapshot).toMatch(/Gates:/);
      // Should contain task counts
      expect(parsed._contextSnapshot).toMatch(/Tasks:/);
      // Should contain success criteria count
      expect(parsed._contextSnapshot).toMatch(/Success:/);
      // Should contain workdir
      expect(parsed._contextSnapshot).toMatch(/Workdir:/);
      // Should use box-drawing characters
      expect(parsed._contextSnapshot).toMatch(/[╔╗╚╝║═]/);
    });

    test("reuses gates from the loaded change without refetching store.gates.get", async () => {
      const gatesSpy = vi.spyOn(store.gates, "get");

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._contextSnapshot).toBeDefined();
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
      const snapshot = parsed._contextSnapshot as string;

      // Task counts should reflect 1 done, 1 active, 1 pending
      expect(snapshot).toContain("1 done");
      expect(snapshot).toContain("1 active");
      expect(snapshot).toContain("1 pending");

      expect(snapshot).toMatch(/\[✓ proposal\]/);
      expect(snapshot).toMatch(/\[✓ discovery\]/);
      expect(snapshot).toMatch(/\[○ design\]/);

      // Current task should show the in_progress task
      expect(snapshot).toContain("tk-task0002");
      expect(snapshot).toContain("Write tests");
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

    test("wraps output with banner", async () => {
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

      // Banner should contain the tool name and target
      expect(result).toContain("adv_change_update");
      expect(result).toContain(created.changeId);
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
