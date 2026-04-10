/**
 * Change Tools Tests
 *
 * TDD tests for change management tools
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { changeTools } from "./change";
import { createStore, type Store } from "../storage/store";
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
    store = await createStore(tempDir);
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
    });

    test("fails in strict mode with warnings", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "Empty change" },
        store,
      );
      const { changeId } = parseToolOutput(createResult);

      const result = await changeTools.adv_change_validate.execute(
        { changeId, strict: true },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.passed).toBe(false);
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

  describe("adv_change_add_issue", () => {
    test("adds issue URL to change without existing issues", async () => {
      const result = await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/123",
      );
    });

    test("adds issue URL to change with existing issues", async () => {
      // Add first issue
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Add second issue
      const result = await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/456",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toHaveLength(2);
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/123",
      );
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/456",
      );
    });

    test("prevents duplicate issue URLs", async () => {
      // Add issue
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Try to add same issue again
      const result = await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toHaveLength(1);
      expect(parsed.message).toContain("already linked");
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_add_issue.execute(
        {
          changeId: "nonexistent",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });

    // Note: URL validation is handled by Zod schema in safeExecute wrapper (index.ts),
    // not by the raw execute function. Invalid URLs are rejected at the MCP tool level.

    test("persists issue to JSON file", async () => {
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Verify persisted by reloading
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/123",
      );
    });
  });

  describe("adv_change_remove_issue", () => {
    test("removes issue URL from change", async () => {
      // Add issue first
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Remove it
      const result = await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).not.toContain(
        "https://github.com/org/repo/issues/123",
      );
    });

    test("removes only specified issue, keeps others", async () => {
      // Add two issues
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/456",
        },
        store,
      );

      // Remove one
      const result = await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toHaveLength(1);
      expect(parsed.github_issues).not.toContain(
        "https://github.com/org/repo/issues/123",
      );
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/456",
      );
    });

    test("handles removing non-existent issue gracefully", async () => {
      const result = await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/999",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain("not linked");
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "nonexistent",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });

    test("persists removal to JSON file", async () => {
      // Add issue
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Remove issue
      await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Verify persisted by reloading
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.github_issues || []).not.toContain(
        "https://github.com/org/repo/issues/123",
      );
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
    store4 = await createStore(tempDir4);
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
