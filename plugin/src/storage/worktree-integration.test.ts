/**
 * Worktree State Sharing — Integration Test
 *
 * Simulates main + worktree sessions accessing the same change data
 * through a shared external state directory. Verifies:
 * 1. Both sessions resolve the same external paths for mutable state
 * 2. Changes written by one session are visible to the other
 * 3. Handoff write → read → clear cycle works end-to-end
 * 4. Migration populates external dir, then both sessions see the data
 * 5. Specs remain in-repo (not shared via external dir)
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { getProjectPaths, type ProjectPaths } from "./json";
import {
  writeHandoff,
  readHandoff,
  clearHandoff,
  type HandoffState,
} from "./handoff";
import { migrateToExternalState } from "./migrate";

describe("Worktree State Sharing", () => {
  let mainRepoDir: string;
  let worktreeDir: string;
  let externalDir: string;
  let mainPaths: ProjectPaths;
  let worktreePaths: ProjectPaths;

  beforeEach(async () => {
    mainRepoDir = await createTempDir();
    worktreeDir = await createTempDir();
    externalDir = await createTempDir();

    // Both sessions use the same externalRoot (keyed by project-id in production)
    mainPaths = getProjectPaths(mainRepoDir, undefined, {
      externalRoot: externalDir,
    });
    worktreePaths = getProjectPaths(worktreeDir, undefined, {
      externalRoot: externalDir,
    });
  });

  afterEach(async () => {
    await cleanupTempDir(mainRepoDir);
    await cleanupTempDir(worktreeDir);
    await cleanupTempDir(externalDir);
  });

  // ===========================================================================
  // Path Resolution
  // ===========================================================================

  describe("path resolution", () => {
    test("mutable paths resolve to same external directory for both sessions", () => {
      expect(mainPaths.changes).toBe(worktreePaths.changes);
      expect(mainPaths.archive).toBe(worktreePaths.archive);
      expect(mainPaths.db).toBe(worktreePaths.db);
      expect(mainPaths.wisdom).toBe(worktreePaths.wisdom);
      expect(mainPaths.agenda).toBe(worktreePaths.agenda);
      expect(mainPaths.handoff).toBe(worktreePaths.handoff);
      expect(mainPaths.external).toBe(worktreePaths.external);
    });

    test("spec paths remain repo-local (different per worktree)", () => {
      expect(mainPaths.specs).not.toBe(worktreePaths.specs);
      expect(mainPaths.specs).toContain(mainRepoDir);
      expect(worktreePaths.specs).toContain(worktreeDir);
    });

    test("root paths are different per worktree", () => {
      expect(mainPaths.root).toBe(mainRepoDir);
      expect(worktreePaths.root).toBe(worktreeDir);
    });
  });

  // ===========================================================================
  // Cross-Session Change Visibility
  // ===========================================================================

  describe("cross-session change visibility", () => {
    test("change written by main session is readable from worktree session", async () => {
      // Main session writes a change
      const changeDir = join(mainPaths.changes, "testChange");
      await mkdir(changeDir, { recursive: true });
      const changeData = {
        id: "testChange",
        title: "Test",
        status: "draft",
        tasks: [],
      };
      await writeFile(
        join(changeDir, "change.json"),
        JSON.stringify(changeData),
      );

      // Worktree session reads the same change
      const worktreeChangePath = join(
        worktreePaths.changes,
        "testChange/change.json",
      );
      expect(existsSync(worktreeChangePath)).toBe(true);
      const content = JSON.parse(await readFile(worktreeChangePath, "utf-8"));
      expect(content.id).toBe("testChange");
      expect(content.title).toBe("Test");
    });

    test("task update by worktree session is visible to main session", async () => {
      // Set up a change in shared external dir
      const changeDir = join(externalDir, "changes/myChange");
      await mkdir(changeDir, { recursive: true });
      const change = {
        id: "myChange",
        title: "Shared Change",
        tasks: [{ id: "tk-001", status: "pending" }],
      };
      await writeFile(join(changeDir, "change.json"), JSON.stringify(change));

      // Worktree session updates the task
      change.tasks[0].status = "done";
      await writeFile(join(changeDir, "change.json"), JSON.stringify(change));

      // Main session reads updated state
      const mainChangePath = join(mainPaths.changes, "myChange/change.json");
      const content = JSON.parse(await readFile(mainChangePath, "utf-8"));
      expect(content.tasks[0].status).toBe("done");
    });

    test("wisdom file is shared between sessions", async () => {
      // Main session appends wisdom
      await mkdir(externalDir, { recursive: true });
      const wisdomEntry = JSON.stringify({
        id: "ws-001",
        type: "pattern",
        content: "test wisdom",
      });
      await writeFile(mainPaths.wisdom, wisdomEntry + "\n");

      // Worktree session reads wisdom
      const content = await readFile(worktreePaths.wisdom, "utf-8");
      expect(content).toContain("test wisdom");
    });

    test("agenda file is shared between sessions", async () => {
      // Main session writes agenda
      await mkdir(externalDir, { recursive: true });
      const agendaEntry = JSON.stringify({
        id: "ag-001",
        title: "Do something",
        status: "pending",
      });
      await writeFile(mainPaths.agenda, agendaEntry + "\n");

      // Worktree session reads agenda
      const content = await readFile(worktreePaths.agenda, "utf-8");
      expect(content).toContain("Do something");
    });
  });

  // ===========================================================================
  // Handoff Protocol (End-to-End)
  // ===========================================================================

  describe("handoff protocol", () => {
    const sampleHandoff: HandoffState = {
      changeId: "addFeatureX",
      currentTaskId: "tk-abc123",
      gateStatus: { research: "done", prep: "done", implementation: "pending" },
      objective: "Add feature X with full TDD",
      createdAt: new Date().toISOString(),
      sourceBranch: "main",
      worktreeBranch: "change/addFeatureX",
    };

    test("main session writes handoff, worktree session reads and clears it", async () => {
      // Main session writes handoff
      await writeHandoff(mainPaths.handoff, sampleHandoff);
      expect(existsSync(mainPaths.handoff)).toBe(true);

      // Worktree session reads handoff (same path via shared external dir)
      const hydrated = await readHandoff(worktreePaths.handoff);
      expect(hydrated).not.toBeNull();
      expect(hydrated!.changeId).toBe("addFeatureX");
      expect(hydrated!.currentTaskId).toBe("tk-abc123");
      expect(hydrated!.gateStatus.research).toBe("done");
      expect(hydrated!.objective).toBe("Add feature X with full TDD");

      // Worktree session clears handoff after hydration
      await clearHandoff(worktreePaths.handoff);
      expect(existsSync(worktreePaths.handoff)).toBe(false);

      // Main session confirms handoff is gone
      const afterClear = await readHandoff(mainPaths.handoff);
      expect(afterClear).toBeNull();
    });

    test("reading handoff when none exists returns null (no crash)", async () => {
      const result = await readHandoff(worktreePaths.handoff);
      expect(result).toBeNull();
    });

    test("clearing handoff when none exists is a no-op", async () => {
      // Should not throw
      await clearHandoff(worktreePaths.handoff);
    });
  });

  // ===========================================================================
  // Migration + Cross-Session Access
  // ===========================================================================

  describe("migration then cross-session access", () => {
    test("after migration, worktree session can read data migrated from main repo", async () => {
      // Main repo has local .adv/ state
      const localChanges = join(mainRepoDir, ".adv/changes/legacyChange");
      await mkdir(localChanges, { recursive: true });
      await writeFile(
        join(localChanges, "change.json"),
        JSON.stringify({
          id: "legacyChange",
          title: "Legacy",
          status: "draft",
        }),
      );

      const localWisdom = join(mainRepoDir, ".adv/wisdom.jsonl");
      await mkdir(join(mainRepoDir, ".adv"), { recursive: true });
      await writeFile(
        localWisdom,
        '{"id":"ws-legacy","content":"old wisdom"}\n',
      );

      // Run migration from main repo to external dir
      const report = await migrateToExternalState(mainRepoDir, externalDir);
      expect(report.migrated).toContain("changes");
      expect(report.migrated).toContain("wisdom.jsonl");

      // Worktree session can read the migrated change
      const changePath = join(
        worktreePaths.changes,
        "legacyChange/change.json",
      );
      expect(existsSync(changePath)).toBe(true);
      const change = JSON.parse(await readFile(changePath, "utf-8"));
      expect(change.id).toBe("legacyChange");

      // Worktree session can read the migrated wisdom
      const wisdom = await readFile(worktreePaths.wisdom, "utf-8");
      expect(wisdom).toContain("old wisdom");
    });

    test("migration is idempotent — second run skips already-migrated items", async () => {
      // Set up local state
      const localChanges = join(mainRepoDir, ".adv/changes/change1");
      await mkdir(localChanges, { recursive: true });
      await writeFile(join(localChanges, "change.json"), '{"id":"change1"}');

      // First migration
      const report1 = await migrateToExternalState(mainRepoDir, externalDir);
      expect(report1.migrated).toContain("changes");

      // Second migration — should skip since external already has changes/
      const report2 = await migrateToExternalState(mainRepoDir, externalDir);
      expect(report2.skipped).toContain("changes");
      expect(report2.migrated).not.toContain("changes");
    });
  });
});
