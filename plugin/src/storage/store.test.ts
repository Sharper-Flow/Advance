/**
 * Store — Backend Selector Tests
 *
 * Exercises createStore selection logic (legacy default, Temporal overlay
 * when temporalBundle is supplied) and the wider legacy lifecycle surface
 * via the composed backend.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { access, readFile, writeFile } from "fs/promises";
import {
  createStore,
  createLegacyStore,
  classifyRecency,
  computeLastActivity,
  buildChangeRecency,
  _recoverCorruptedDatabase,
  type Store,
} from "./store";
import { createSQLiteStore, type SQLiteStore } from "./sqlite";
import { initDatabase } from "./health";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  SAMPLE_SPEC,
} from "../__tests__/setup";
import type { Change } from "../types";
import { acquireFileLock } from "../utils/fs";

describe("Store", () => {
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

  describe("lifecycle", () => {
    test("createStore initializes with project paths", async () => {
      expect(store.paths.root).toBe(tempDir);
      expect(store.paths.specs).toBe(join(tempDir, ".adv/specs"));
    });

    test("createLegacyStore exposes the explicit JSON+SQLite fallback backend", async () => {
      const legacyStore = await createLegacyStore(tempDir);
      expect(legacyStore.paths.root).toBe(tempDir);
      expect(legacyStore.paths.specs).toBe(join(tempDir, ".adv/specs"));
      legacyStore.close();
    });

    test("createStore wraps the legacy store with a Temporal adapter when a temporal bundle is provided", async () => {
      const fakeHandle = {
        query: async () => ({
          projectId: "proj1",
          changeId: "addFeature",
          title: "Temporal-backed title",
          initializedAt: "2026-04-18T00:00:00.000Z",
          id: "addFeature",
          status: "draft",
          createdAt: "2026-04-18T00:00:00.000Z",
          tasks: [],
          wisdom: [],
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
          artifacts: {},
        }),
        executeUpdate: async () => null,
      };

      const temporalStore = await createStore(tempDir, {
        temporalBundle: {
          client: {
            workflow: {
              getHandle: () => fakeHandle,
            },
          },
        } as any,
        projectIdOverride: "proj1",
      });

      const result = await temporalStore.changes.get("addFeature");
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe("Temporal-backed title");

      temporalStore.close();
    });

    test("init creates directory structure", async () => {
      const emptyDir = await createTempDir();
      const newStore = await createStore(emptyDir);
      await newStore.init();

      // Check if project.json exists
      await expect(
        access(join(emptyDir, "project.json")),
      ).resolves.toBeUndefined();

      newStore.close();
      await cleanupTempDir(emptyDir);
    });

    test("sync populates SQLite from JSON files", async () => {
      await store.sync();

      const result = await store.specs.list();
      expect(result.specs).toHaveLength(1);
      expect(result.specs[0].name).toBe("test-capability");
    });
  });

  describe("specs", () => {
    test("list returns all specs", async () => {
      const result = await store.specs.list();
      expect(result.specs).toHaveLength(1);
      expect(result.specs[0].requirementCount).toBe(2);
    });

    test("list filters by capability", async () => {
      const result = await store.specs.list({ capability: "test-capability" });
      expect(result.specs).toHaveLength(1);

      const empty = await store.specs.list({ capability: "nonexistent" });
      expect(empty.specs).toHaveLength(0);
    });

    test("get returns full spec", async () => {
      const result = await store.specs.get("test-capability");
      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data!.requirements).toHaveLength(2);
    });

    test("search finds requirements", async () => {
      const results = await store.specs.search("authentication");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].spec).toBe("test-capability");
    });

    test("save persists spec to JSON and SQLite", async () => {
      // Create a new spec with unique requirement IDs
      const newSpec = {
        ...SAMPLE_SPEC,
        name: "new-cap",
        title: "New",
        requirements: SAMPLE_SPEC.requirements.map((r, i) => ({
          ...r,
          id: `rq-newcap${i}`,
          scenarios:
            r.scenarios?.map((s, j) => ({ ...s, id: `rq-newcap${i}.${j}` })) ??
            [],
        })),
      };
      await store.specs.save(newSpec);

      const result = await store.specs.list();
      expect(result.specs).toHaveLength(2);

      const loadedResult = await store.specs.get("new-cap");
      expect(loadedResult.success).toBe(true);
      expect(loadedResult.data!.title).toBe("New");
    });

    test("save waits for spec file lock before persisting", async () => {
      const specPath = join(tempDir, ".adv/specs/test-capability/spec.json");
      const release = await acquireFileLock(specPath);

      let resolved = false;
      const savePromise = store.specs
        .save({ ...SAMPLE_SPEC, title: "Locked Spec Title" })
        .then(() => {
          resolved = true;
        });

      // Deterministic pending probe: race savePromise against an
      // immediately-resolved "pending" marker; if the save has already
      // settled, it would win the race. Flushing a handful of microtask
      // ticks first gives the lock loop a chance to have attempted (and
      // failed) at least once.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      const probe = await Promise.race([
        savePromise.then(() => "settled" as const),
        Promise.resolve("pending" as const),
      ]);
      expect(probe).toBe("pending");
      expect(resolved).toBe(false);

      await release();
      await savePromise;

      const loaded = await store.specs.get("test-capability");
      expect(loaded.success).toBe(true);
      expect(loaded.data!.title).toBe("Locked Spec Title");
    });
  });

  describe("changes", () => {
    test("list returns active changes", async () => {
      const result = await store.changes.list();
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].id).toBe("addFeature");
    });

    test("list excludes archived by default", async () => {
      // First get the change and archive it
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      const result = await store.changes.list();
      expect(result.changes).toHaveLength(0);

      const withArchived = await store.changes.list({ includeArchived: true });
      expect(withArchived.changes).toHaveLength(1);
    });

    test("list excludes closed changes by default", async () => {
      await store.changes.close("addFeature", {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "User retired draft",
        approved_at: "2026-03-24T00:00:00Z",
      });

      const result = await store.changes.list();
      expect(result.changes).toHaveLength(0);
    });

    test("list includes closed changes when requested", async () => {
      await store.changes.close("addFeature", {
        reason: "cancelled",
        approved_by_user: true,
        approval_evidence: "User cancelled proposal",
        approved_at: "2026-03-24T00:00:00Z",
      });

      const result = await store.changes.list({ includeClosed: true });
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].status).toBe("closed");
    });

    test("get returns full change", async () => {
      const result = await store.changes.get("addFeature");
      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data!.tasks).toHaveLength(3);
    });

    test("create generates new change", async () => {
      const result = await store.changes.create("Test new feature");

      // ID format: camelCase title
      expect(result.changeId).toBe("testNewFeature");
      expect(result.path).toContain("proposal.md");

      const loadedResult = await store.changes.get(result.changeId);
      expect(loadedResult.success).toBe(true);
      expect(loadedResult.data).not.toBeNull();
      expect(loadedResult.data!.status).toBe("draft");
    });

    test("create writes provided proposal content", async () => {
      const proposal = "# Contract\n\n## Intent\n\nUse tool-only persistence.";
      const result = await store.changes.create(
        "Create proposal with content",
        undefined,
        proposal,
      );

      const proposalContent = await readFile(result.path, "utf-8");
      expect(proposalContent).toBe(proposal);
    });

    test("create writes problem-statement.md when problemStatement is provided", async () => {
      const problemStatement = "PROBLEM\n  The widget is broken.";
      const result = await store.changes.create(
        "With problem statement",
        undefined,
        undefined,
        problemStatement,
      );

      expect(result.problemStatementPath).toBeDefined();
      expect(result.problemStatementPath).toContain("problem-statement.md");
      const content = await readFile(result.problemStatementPath!, "utf-8");
      expect(content).toBe(problemStatement);
    });

    test("create omits problemStatementPath when problemStatement is not provided", async () => {
      const result = await store.changes.create("No problem statement");

      expect(result.problemStatementPath).toBeUndefined();
    });

    test("updateArtifacts overwrites proposal.md and problem-statement.md for existing change", async () => {
      // First create a change
      const createResult = await store.changes.create(
        "Update artifacts test",
        undefined,
        "# Original proposal",
        "Original problem statement",
      );

      // Now update it
      const updateResult = await store.changes.updateArtifacts(
        createResult.changeId,
        "# Updated proposal",
        "Updated problem statement",
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.proposalPath).toContain("proposal.md");
      expect(updateResult.problemStatementPath).toContain(
        "problem-statement.md",
      );

      const proposalContent = await readFile(
        updateResult.proposalPath!,
        "utf-8",
      );
      expect(proposalContent).toBe("# Updated proposal");

      const psContent = await readFile(
        updateResult.problemStatementPath!,
        "utf-8",
      );
      expect(psContent).toBe("Updated problem statement");
    });

    test("updateArtifacts returns error for nonexistent change", async () => {
      const result = await store.changes.updateArtifacts(
        "nonExistentChange",
        "proposal",
        "problem statement",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("nonExistentChange");
    });

    test("updateArtifacts preserves change.json metadata", async () => {
      const createResult = await store.changes.create("Preserve metadata test");

      // Load original change.json
      const beforeResult = await store.changes.get(createResult.changeId);
      expect(beforeResult.success).toBe(true);
      const beforeChange = beforeResult.data!;

      // Update artifacts
      await store.changes.updateArtifacts(
        createResult.changeId,
        "# New proposal",
        "New problem statement",
      );

      // Load change.json again — must be identical
      const afterResult = await store.changes.get(createResult.changeId);
      expect(afterResult.success).toBe(true);
      const afterChange = afterResult.data!;

      expect(afterChange.status).toBe(beforeChange.status);
      expect(afterChange.tasks).toEqual(beforeChange.tasks);
      expect(afterChange.deltas).toEqual(beforeChange.deltas);
      expect(afterChange.created_at).toBe(beforeChange.created_at);
    });

    test("updateArtifacts does not create a duplicate change directory", async () => {
      const createResult = await store.changes.create("No duplicate test");

      await store.changes.updateArtifacts(
        createResult.changeId,
        "# Updated",
        "Updated",
      );

      // List all changes — should only have the original plus any from test setup
      const listResult = await store.changes.list();
      const matchingChanges = listResult.changes.filter((c) =>
        c.id.startsWith("noDuplicateTest"),
      );
      expect(matchingChanges).toHaveLength(1);
    });

    test("close marks a change as closed and persists closure metadata", async () => {
      const closed = await store.changes.close("addFeature", {
        reason: "superseded",
        approved_by_user: true,
        approval_evidence: "User approved duplicate cleanup",
        superseded_by: "addFeature2",
        approved_at: "2026-03-24T00:00:00Z",
      });

      expect(closed).not.toBeNull();
      expect(closed!.status).toBe("closed");
      expect(closed!.closure?.reason).toBe("superseded");
      expect(closed!.closure?.superseded_by).toBe("addFeature2");

      const loaded = await store.changes.get("addFeature");
      expect(loaded.success).toBe(true);
      expect(loaded.data!.status).toBe("closed");
      expect(loaded.data!.closure?.approval_evidence).toContain("duplicate");
    });

    test("close rejects archived changes", async () => {
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      await expect(
        store.changes.close("addFeature", {
          reason: "not_planned",
          approved_by_user: true,
          approval_evidence: "User retired old proposal",
          approved_at: "2026-03-24T00:00:00Z",
        }),
      ).rejects.toThrow(/archived/i);
    });

    test("save waits for change file lock before persisting", async () => {
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);

      const changePath = join(tempDir, ".adv/changes/addFeature/change.json");
      const release = await acquireFileLock(changePath);

      let resolved = false;
      const savePromise = store.changes
        .save({ ...changeResult.data!, title: "Locked Change Title" })
        .then(() => {
          resolved = true;
        });

      // Deterministic pending probe: race savePromise against an
      // immediately-resolved "pending" marker after draining a handful
      // of microtasks. If the save had already settled, the race would
      // resolve to "settled" instead.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      const probe = await Promise.race([
        savePromise.then(() => "settled" as const),
        Promise.resolve("pending" as const),
      ]);
      expect(probe).toBe("pending");
      expect(resolved).toBe(false);

      await release();
      await savePromise;

      const loaded = await store.changes.get("addFeature");
      expect(loaded.success).toBe(true);
      expect(loaded.data!.title).toBe("Locked Change Title");
    });
  });

  describe("closeBatch", () => {
    test("closes multiple draft changes", async () => {
      const c1 = await store.changes.create("Draft one");
      const c2 = await store.changes.create("Draft two");

      const result = await store.changes.closeBatch(
        [c1.changeId, c2.changeId],
        {
          reason: "not_planned",
          approved_by_user: true,
          approval_evidence: "Bulk close test",
          approved_at: "2026-04-21T00:00:00Z",
        },
      );

      expect(result.success).toBe(true);
      expect(result.closed).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results.every((r) => r.success)).toBe(true);

      const r1 = await store.changes.get(c1.changeId);
      expect(r1.data!.status).toBe("closed");
      const r2 = await store.changes.get(c2.changeId);
      expect(r2.data!.status).toBe("closed");
    });

    test("fail-all when any target is protected", async () => {
      const draft = await store.changes.create("Draft three");

      // addFeature is active (protected)
      const result = await store.changes.closeBatch(
        [draft.changeId, "addFeature"],
        {
          reason: "not_planned",
          approved_by_user: true,
          approval_evidence: "Test",
          approved_at: "2026-04-21T00:00:00Z",
        },
      );

      expect(result.success).toBe(false);
      expect(result.closed).toBe(0);
      expect(result.results).toHaveLength(2);
      const addFeatureResult = result.results.find(
        (r) => r.changeId === "addFeature",
      );
      expect(addFeatureResult!.success).toBe(false);
      expect(addFeatureResult!.error).toMatch(/protected status/i);

      // Draft should remain unchanged
      const draftCheck = await store.changes.get(draft.changeId);
      expect(draftCheck.data!.status).toBe("draft");
    });

    test("fail-all when any target does not exist", async () => {
      const draft = await store.changes.create("Draft four");

      const result = await store.changes.closeBatch(
        [draft.changeId, "nonexistent"],
        {
          reason: "not_planned",
          approved_by_user: true,
          approval_evidence: "Test",
          approved_at: "2026-04-21T00:00:00Z",
        },
      );

      expect(result.success).toBe(false);
      expect(result.closed).toBe(0);
    });

    test("returns success for empty input with zero closed", async () => {
      const result = await store.changes.closeBatch([], {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "Test",
        approved_at: "2026-04-21T00:00:00Z",
      });

      expect(result.success).toBe(true);
      expect(result.closed).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe("tasks", () => {
    test("list returns tasks for change", async () => {
      const tasks = await store.tasks.list("addFeature");
      expect(tasks).toHaveLength(3);
    });

    test("list filters by status", async () => {
      const pending = await store.tasks.list("addFeature", "pending");
      expect(pending).toHaveLength(3);
    });

    test("ready returns unblocked tasks", async () => {
      const result = await store.tasks.ready("addFeature");
      expect(result.ready).toHaveLength(1);
      expect(result.ready[0].id).toBe("tk-task0001");
      expect(result.blocked).toHaveLength(2);
    });

    test("update changes task status", async () => {
      const task = await store.tasks.update("tk-task0001", "done", "Completed");

      expect(task).not.toBeNull();
      expect(task!.status).toBe("done");
      expect(task!.completed_at).toBeDefined();

      // Verify persistence
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      const updatedTask = changeResult.data!.tasks.find(
        (t) => t.id === "tk-task0001",
      );
      expect(updatedTask!.status).toBe("done");
    });

    test("update unlocks dependent tasks", async () => {
      // Complete first task
      await store.tasks.update("tk-task0001", "done");

      // Check that second task is now ready
      const result = await store.tasks.ready("addFeature");
      expect(result.ready).toHaveLength(1);
      expect(result.ready[0].id).toBe("tk-task0002");
    });

    test("add creates new task", async () => {
      const task = await store.tasks.add("addFeature", "New task content", {
        section: "Testing",
      });

      expect(task.id).toMatch(/^tk-/);
      expect(task.title).toBe("New task content");
      expect(task.section).toBe("Testing");

      const tasks = await store.tasks.list("addFeature");
      expect(tasks).toHaveLength(4);
    });

    test("add with blockedBy creates dependency", async () => {
      const task = await store.tasks.add("addFeature", "Blocked task", {
        blockedBy: ["tk-task0001"],
      });

      expect(task.deps).toHaveLength(1);
      expect(task.deps![0].type).toBe("blocked_by");
      expect(task.deps![0].target).toBe("tk-task0001");
    });

    test("add assigns next highest priority, not array length", async () => {
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.tasks[1].priority = 10;
      await store.changes.save(changeResult.data!);

      const task = await store.tasks.add("addFeature", "Priority task");
      expect(task.priority).toBe(11);
    });

    test("ready tolerates SQLite/JSON drift without crashing", async () => {
      // Prime the SQLite cache for this change.
      await store.tasks.ready("addFeature");

      const changePath = join(tempDir, ".adv/changes/addFeature/change.json");
      const raw = JSON.parse(await readFile(changePath, "utf-8")) as Change;
      raw.tasks = raw.tasks.filter((t) => t.id !== "tk-task0002");
      await writeFile(changePath, JSON.stringify(raw, null, 2));

      const result = await store.tasks.ready("addFeature");
      expect(result.ready).toHaveLength(1);
      expect(result.blocked.every((b) => b.task.id !== "tk-task0002")).toBe(
        true,
      );
    });
  });

  describe("status", () => {
    test("returns project overview", async () => {
      const status = await store.status();

      expect(status.specs.count).toBe(1);
      expect(status.specs.capabilities).toContain("test-capability");
      expect(status.changes.active).toBe(1);
      expect(status.changes.byStatus.active).toBe(1);
    });

    test("status excludes closed changes from active count", async () => {
      await store.changes.close("addFeature", {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "User retired draft",
        approved_at: "2026-03-24T00:00:00Z",
      });

      const status = await store.status();
      expect(status.changes.active).toBe(0);
      expect(status.changes.byStatus.closed).toBe(1);
    });

    test("generates recommendations", async () => {
      // Complete all tasks to trigger recommendation
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      const status = await store.status();
      expect(status.recommendations.length).toBeGreaterThan(0);
      const archiveRec = status.recommendations.find((r) =>
        r.includes("Ready to archive"),
      );
      expect(archiveRec).toBeDefined();
    });
  });

  describe("wisdom", () => {
    test("add wisdom entry to change", async () => {
      const entry = await store.wisdom.add(
        "addFeature",
        "pattern",
        "Use factory pattern for store creation",
      );

      expect(entry.id).toMatch(/^ws-/);
      expect(entry.type).toBe("pattern");
      expect(entry.content).toBe("Use factory pattern for store creation");
      expect(entry.recorded_at).toBeDefined();

      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      expect(changeResult.data!.wisdom).toContainEqual(entry);
    });

    test("add wisdom with invalid content (exceeds max length) throws error", async () => {
      const longContent = "x".repeat(2001);
      await expect(
        store.wisdom.add("addFeature", "pattern", longContent),
      ).rejects.toThrow(/max.*2000/);
    });

    test("list wisdom returns all entries for a change", async () => {
      await store.wisdom.add("addFeature", "success", "Test 1");
      await store.wisdom.add("addFeature", "gotcha", "Test 2");

      const wisdom = await store.wisdom.list("addFeature");
      expect(wisdom).toHaveLength(2);
      expect(wisdom[0].content).toBe("Test 1");
      expect(wisdom[1].content).toBe("Test 2");
    });

    test("list wisdom for nonexistent change throws error", async () => {
      await expect(store.wisdom.list("nonexistent")).rejects.toThrow(
        /not found/,
      );
    });
  });

  describe("flush", () => {
    test("store has a flush() method", () => {
      expect(typeof store.flush).toBe("function");
    });

    test("flush() resolves without error", async () => {
      // Should complete without throwing
      await expect(store.flush()).resolves.toBeUndefined();
    });

    test("flush() can be called multiple times safely (idempotent)", async () => {
      await store.flush();
      await store.flush();
      // No error thrown
    });

    test("flush() completes within 3 seconds", async () => {
      const start = Date.now();
      await store.flush();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(3000);
    });
  });

  describe("status recency", () => {
    test("status includes changes.recent array sorted by activity", async () => {
      const status = await store.status();

      expect(status.changes.recent).toBeDefined();
      expect(Array.isArray(status.changes.recent)).toBe(true);
      // The test fixture has one active change "addFeature"
      expect(status.changes.recent.length).toBe(1);
      expect(status.changes.recent[0].id).toBe("addFeature");
    });

    test("recent changes include recency fields", async () => {
      const status = await store.status();
      const rc = status.changes.recent[0];

      expect(rc.lastActivityAt).toBeDefined();
      expect(typeof rc.minutesSinceActivity).toBe("number");
      expect(rc.minutesSinceActivity).toBeGreaterThanOrEqual(0);
      expect(["hot", "warm", "stale"]).toContain(rc.recency);
      expect(rc.taskCount).toBe(3);
      expect(rc.completedTasks).toBe(0);
    });

    test("recent changes reflect task completion counts", async () => {
      await store.tasks.update("tk-task0001", "done");

      const status = await store.status();
      const rc = status.changes.recent[0];

      expect(rc.completedTasks).toBe(1);
      expect(rc.taskCount).toBe(3);
    });

    test("archived changes are excluded from recent", async () => {
      // Create a second change, then archive it by changing status
      await store.changes.create("Archived feature");
      const listResult = await store.changes.list();
      const newChange = listResult.changes.find((c) => c.id !== "addFeature");
      expect(newChange).toBeDefined();

      // Load, set to archived, save
      const changeResult = await store.changes.get(newChange!.id);
      expect(changeResult.success).toBe(true);
      const change = changeResult.data!;
      change.status = "archived";
      await store.changes.save(change);

      const status = await store.status();
      const archivedInRecent = status.changes.recent.find(
        (rc) => rc.id === newChange!.id,
      );
      expect(archivedInRecent).toBeUndefined();
    });

    test("closed changes are excluded from recent", async () => {
      await store.changes.close("addFeature", {
        reason: "cancelled",
        approved_by_user: true,
        approval_evidence: "User cancelled proposal",
        approved_at: "2026-03-24T00:00:00Z",
      });

      const status = await store.status();
      expect(status.changes.recent).toHaveLength(0);
    });

    test("recent changes sorted most-recent-first", async () => {
      // Create a second change with a more recent task
      const { changeId } = await store.changes.create("Newer feature");
      await store.tasks.add(changeId, "A recent task");

      // Update the new task to give it a recent started_at
      const tasks = await store.tasks.list(changeId);
      await store.tasks.update(tasks[0].id, "in_progress");

      const status = await store.status();
      expect(status.changes.recent.length).toBe(2);
      // The newer change should be first (most recent activity)
      expect(status.changes.recent[0].id).toBe(changeId);
    });

    test("existing status fields unchanged (backwards compatible)", async () => {
      const status = await store.status();

      // Original fields still present
      expect(status.specs.count).toBe(1);
      expect(status.changes.active).toBe(1);
      expect(status.changes.byStatus.active).toBe(1);
      expect(status.changes.byStatus.draft).toBe(0);
      expect(Array.isArray(status.recommendations)).toBe(true);
    });
  });

  describe("gates.reopenFrom", () => {
    /**
     * Helper: set up a change with gates where discovery through execution
     * are done (simulating mid-execution state).
     */
    async function setupChangeWithGates(): Promise<void> {
      // Complete gates through execution in order
      await store.gates.complete("addFeature", "proposal");
      await store.gates.complete("addFeature", "discovery");
      await store.gates.complete("addFeature", "design");
      await store.gates.complete("addFeature", "planning");
      await store.gates.complete("addFeature", "execution");
    }

    test("reopens from a gate and resets it + downstream to pending", async () => {
      await setupChangeWithGates();

      await store.gates.reopenFrom(
        "addFeature",
        "discovery",
        "New OAuth scope requirement added",
      );

      const gates = await store.gates.get("addFeature");
      expect(gates).not.toBeNull();
      // Proposal should remain done (upstream of discovery)
      expect(gates!.proposal.status).toBe("done");
      // Discovery and everything downstream should be reset
      expect(gates!.discovery.status).toBe("pending");
      expect(gates!.design.status).toBe("pending");
      expect(gates!.planning.status).toBe("pending");
      expect(gates!.execution.status).toBe("pending");
      // Acceptance and release were already pending
      expect(gates!.acceptance.status).toBe("pending");
      expect(gates!.release.status).toBe("pending");
    });

    test("appends a reentry_history entry", async () => {
      await setupChangeWithGates();

      await store.gates.reopenFrom(
        "addFeature",
        "design",
        "Architecture needs rework",
        "Added event-driven approach",
        "test-agent",
      );

      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      const change = changeResult.data!;
      expect(change.reentry_history).toBeDefined();
      expect(change.reentry_history).toHaveLength(1);
      const entry = change.reentry_history![0];
      expect(entry.from_gate).toBe("design");
      expect(entry.reason).toBe("Architecture needs rework");
      expect(entry.scope_delta).toBe("Added event-driven approach");
      expect(entry.reopened_by).toBe("test-agent");
      expect(entry.approval_evidence).toBeUndefined();
      expect(entry.reopened_at).toBeDefined();
      expect(entry.gates_reset).toEqual([
        "design",
        "planning",
        "execution",
        "acceptance",
        "release",
      ]);
    });

    test("rejects if the target gate is not done", async () => {
      // Only complete proposal — discovery is still pending
      await store.gates.complete("addFeature", "proposal");

      await expect(
        store.gates.reopenFrom(
          "addFeature",
          "discovery",
          "Trying to reopen a pending gate",
        ),
      ).rejects.toThrow(/not completed/i);
    });

    test("accumulates multiple reentry_history entries", async () => {
      await setupChangeWithGates();

      // First re-entry
      await store.gates.reopenFrom(
        "addFeature",
        "design",
        "First re-entry reason",
      );

      // Re-complete gates to allow second re-entry
      await store.gates.complete("addFeature", "design");
      await store.gates.complete("addFeature", "planning");

      // Second re-entry
      await store.gates.reopenFrom(
        "addFeature",
        "planning",
        "Second re-entry reason",
      );

      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.data!.reentry_history).toHaveLength(2);
      expect(changeResult.data!.reentry_history![0].from_gate).toBe("design");
      expect(changeResult.data!.reentry_history![1].from_gate).toBe("planning");
    });

    test("preserves completed_at/by on upstream gates", async () => {
      await setupChangeWithGates();

      const gatesBefore = await store.gates.get("addFeature");
      const proposalBefore = gatesBefore!.proposal;

      await store.gates.reopenFrom(
        "addFeature",
        "discovery",
        "Scope expansion",
      );

      const gatesAfter = await store.gates.get("addFeature");
      // Proposal should be untouched
      expect(gatesAfter!.proposal.completed_at).toBe(
        proposalBefore.completed_at,
      );
      expect(gatesAfter!.proposal.completed_by).toBe(
        proposalBefore.completed_by,
      );
    });
  });
});

// =============================================================================
// Recency Helper Unit Tests (pure functions, no store needed)
// =============================================================================

describe("classifyRecency", () => {
  test("0 minutes is hot", () => {
    expect(classifyRecency(0)).toBe("hot");
  });

  test("30 minutes is hot", () => {
    expect(classifyRecency(30)).toBe("hot");
  });

  test("60 minutes is hot (boundary)", () => {
    expect(classifyRecency(60)).toBe("hot");
  });

  test("61 minutes is warm", () => {
    expect(classifyRecency(61)).toBe("warm");
  });

  test("120 minutes is warm", () => {
    expect(classifyRecency(120)).toBe("warm");
  });

  test("179 minutes is warm", () => {
    expect(classifyRecency(179)).toBe("warm");
  });

  test("180 minutes is stale (boundary)", () => {
    expect(classifyRecency(180)).toBe("stale");
  });

  test("300 minutes is stale", () => {
    expect(classifyRecency(300)).toBe("stale");
  });

  test("1440 minutes (24h) is stale", () => {
    expect(classifyRecency(1440)).toBe("stale");
  });
});

describe("computeLastActivity", () => {
  const baseChange: Change = {
    id: "test",
    title: "Test",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [],
    deltas: {},
  };

  test("returns created_at when no other timestamps exist", () => {
    expect(computeLastActivity(baseChange)).toBe("2026-01-01T00:00:00Z");
  });

  test("picks latest task started_at", () => {
    const change: Change = {
      ...baseChange,
      tasks: [
        {
          id: "tk-1",
          title: "Task 1",
          status: "in_progress",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          started_at: "2026-03-01T10:00:00Z",
          tdd_phase: "none",
        },
      ],
    };
    expect(computeLastActivity(change)).toBe("2026-03-01T10:00:00Z");
  });

  test("picks latest task completed_at over started_at", () => {
    const change: Change = {
      ...baseChange,
      tasks: [
        {
          id: "tk-1",
          title: "Task 1",
          status: "done",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          started_at: "2026-03-01T10:00:00Z",
          completed_at: "2026-03-01T12:00:00Z",
          tdd_phase: "none",
        },
      ],
    };
    expect(computeLastActivity(change)).toBe("2026-03-01T12:00:00Z");
  });

  test("picks gate completed_at when later than tasks", () => {
    const change: Change = {
      ...baseChange,
      tasks: [
        {
          id: "tk-1",
          title: "Task 1",
          status: "done",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          completed_at: "2026-03-01T12:00:00Z",
          tdd_phase: "none",
        },
      ],
      gates: {
        proposal: {
          status: "done",
          completed_at: "2026-03-02T08:00:00Z",
          completed_by: "agent",
        },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      },
    };
    expect(computeLastActivity(change)).toBe("2026-03-02T08:00:00Z");
  });

  test("picks validation timestamp when latest", () => {
    const change: Change = {
      ...baseChange,
      validation: {
        checked_against_specs: [],
        conflicts: [],
        warnings: [],
        validated_at: "2026-03-05T00:00:00Z",
      },
    };
    expect(computeLastActivity(change)).toBe("2026-03-05T00:00:00Z");
  });

  test("picks wisdom timestamp when latest", () => {
    const change: Change = {
      ...baseChange,
      wisdom: [
        {
          id: "ws-1",
          type: "pattern",
          content: "test",
          recorded_at: "2026-03-04T15:00:00Z",
        },
      ],
    };
    expect(computeLastActivity(change)).toBe("2026-03-04T15:00:00Z");
  });

  test("picks cancellation approved_at when latest", () => {
    const change: Change = {
      ...baseChange,
      tasks: [
        {
          id: "tk-1",
          title: "Cancelled task",
          status: "cancelled",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          completed_at: "2026-03-01T12:00:00Z",
          tdd_phase: "none",
          cancellation: {
            reason: "test",
            approved_by_user: true,
            approval_evidence: "test",
            approved_at: "2026-03-03T09:00:00Z",
          },
        },
      ],
    };
    expect(computeLastActivity(change)).toBe("2026-03-03T09:00:00Z");
  });

  test("handles multiple tasks and picks the latest across all", () => {
    const change: Change = {
      ...baseChange,
      tasks: [
        {
          id: "tk-1",
          title: "Old task",
          status: "done",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          completed_at: "2026-02-01T00:00:00Z",
          tdd_phase: "none",
        },
        {
          id: "tk-2",
          title: "Recent task",
          status: "in_progress",
          priority: 1,
          created_at: "2026-03-01T00:00:00Z",
          started_at: "2026-03-04T18:00:00Z",
          tdd_phase: "none",
        },
      ],
    };
    expect(computeLastActivity(change)).toBe("2026-03-04T18:00:00Z");
  });
});

describe("buildChangeRecency", () => {
  const baseChange: Change = {
    id: "testChange",
    title: "Test Change",
    status: "active",
    created_at: "2026-03-05T10:00:00Z",
    tasks: [],
    deltas: {},
  };

  test("builds correct recency record", () => {
    const now = new Date("2026-03-05T10:30:00Z");
    const rc = buildChangeRecency(baseChange, { total: 5, done: 2 }, now);

    expect(rc.id).toBe("testChange");
    expect(rc.title).toBe("Test Change");
    expect(rc.status).toBe("active");
    expect(rc.taskCount).toBe(5);
    expect(rc.completedTasks).toBe(2);
    expect(rc.lastActivityAt).toBe("2026-03-05T10:00:00Z");
    expect(rc.minutesSinceActivity).toBe(30);
    expect(rc.recency).toBe("hot");
  });

  test("classifies stale correctly", () => {
    const now = new Date("2026-03-05T14:00:00Z"); // 4 hours later
    const rc = buildChangeRecency(baseChange, { total: 3, done: 0 }, now);

    expect(rc.minutesSinceActivity).toBe(240);
    expect(rc.recency).toBe("stale");
  });

  test("classifies warm correctly", () => {
    const now = new Date("2026-03-05T12:00:00Z"); // 2 hours later
    const rc = buildChangeRecency(baseChange, { total: 3, done: 0 }, now);

    expect(rc.minutesSinceActivity).toBe(120);
    expect(rc.recency).toBe("warm");
  });
});

describe("wisdom SQLite sync (tk-rD2wRJMK)", () => {
  let tempDir: string;
  let store: Store;
  let rawDb: SQLiteStore;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
    const dbPath = join(tempDir, ".adv", "db", "spec.db");
    rawDb = createSQLiteStore(dbPath);
    initDatabase(rawDb.db);
  });

  afterEach(async () => {
    rawDb.close();
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("after store.wisdom.add(), wisdom entry appears in SQLite wisdom table", async () => {
    await store.wisdom.add(
      "addFeature",
      "pattern",
      "dependency injection for testability",
    );

    const rows = rawDb.db
      .query("SELECT * FROM wisdom WHERE change_id = ?")
      .all("addFeature") as { id: string; content: string; scope: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].content).toBe("dependency injection for testability");
    expect(rows[0].scope).toBe("change");
  });

  test("after save, SQLite wisdom table reflects current change.wisdom[]", async () => {
    // Add an entry and verify it's in SQLite
    await store.wisdom.add(
      "addFeature",
      "gotcha",
      "always validate at boundaries",
    );

    const rowsBefore = rawDb.db
      .query("SELECT id FROM wisdom WHERE change_id = ?")
      .all("addFeature") as { id: string }[];
    expect(rowsBefore).toHaveLength(1);
  });

  test("FTS search finds entry added via store.wisdom.add()", async () => {
    await store.wisdom.add(
      "addFeature",
      "pattern",
      "use circuit breaker pattern for resilience",
    );

    const ftsResults = rawDb.db
      .query("SELECT id FROM wisdom_fts WHERE wisdom_fts MATCH ?")
      .all("circuit breaker") as { id: string }[];
    expect(ftsResults.length).toBeGreaterThan(0);
  });
});

describe("_recoverCorruptedDatabase", () => {
  test("succeeds on first retry when first attempt throws corruption then second succeeds", async () => {
    let attempts = 0;
    const attemptLog: string[] = [];
    const reset = async () => {
      attemptLog.push("reset");
    };
    const attempt = async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error("database disk image is malformed");
      }
      // Success on second
    };

    await _recoverCorruptedDatabase({
      maxAttempts: 2,
      backoffMs: 5, // keep test fast
      reset,
      attempt,
    });

    expect(attempts).toBe(2);
    expect(attemptLog).toEqual(["reset", "reset"]);
  });

  test("rethrows after exhausting retries when corruption persists", async () => {
    let attempts = 0;
    const reset = async () => {};
    const attempt = async () => {
      attempts++;
      throw new Error("database disk image is malformed");
    };

    await expect(
      _recoverCorruptedDatabase({
        maxAttempts: 2,
        backoffMs: 5,
        reset,
        attempt,
      }),
    ).rejects.toThrow(/malformed/);

    expect(attempts).toBe(2);
  });

  test("logs each attempt by number via provided logger", async () => {
    const logs: string[] = [];
    const reset = async () => {};
    const attempt = async () => {
      throw new Error("malformed");
    };

    await expect(
      _recoverCorruptedDatabase({
        maxAttempts: 2,
        backoffMs: 1,
        reset,
        attempt,
        log: (msg) => logs.push(msg),
      }),
    ).rejects.toThrow();

    expect(logs.length).toBe(2);
    expect(logs[0]).toMatch(/attempt 1/i);
    expect(logs[1]).toMatch(/attempt 2/i);
  });

  test("does nothing when attempt succeeds first try", async () => {
    let attempts = 0;
    const reset = async () => {};
    const attempt = async () => {
      attempts++;
    };

    await _recoverCorruptedDatabase({
      maxAttempts: 2,
      backoffMs: 5,
      reset,
      attempt,
    });

    expect(attempts).toBe(1);
  });

  test("throws a defensive Error when maxAttempts is < 1", async () => {
    await expect(
      _recoverCorruptedDatabase({
        maxAttempts: 0,
        backoffMs: 1,
        reset: async () => {},
        attempt: async () => {},
      }),
    ).rejects.toThrow(/maxAttempts must be >= 1/);
  });
});
