import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { writeFile } from "fs/promises";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { createDiskStore } from "./store-disk";
import type { Epic, RetiredEpicProjection } from "../types";

describe("disk Epic persistence", () => {
  let projectDir: string;
  let externalDir: string;
  let store: Awaited<ReturnType<typeof createDiskStore>>;

  beforeEach(async () => {
    projectDir = await createTempDir("epics-disk-project-");
    externalDir = await createTempDir("epics-disk-state-");
    store = await createDiskStore(projectDir, { externalRoot: externalDir });
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
    await cleanupTempDir(externalDir);
  });

  test("creates and reads a real projection, and supports every active mutation", async () => {
    const created = await store.epics.create("epic-a", "Epic A", "Narrative");
    expect(created).toMatchObject({
      id: "epic-a",
      title: "Epic A",
      narrative: "Narrative",
      entries: [],
      version: 0,
    });
    expect(await store.epics.get("epic-a")).toMatchObject({
      success: true,
      data: { id: "epic-a", version: 0 },
    });

    const updated = await store.epics.update("epic-a", {
      title: "Updated A",
      expectedVersion: 0,
    });
    expect(updated.version).toBe(1);
    const scoped = await store.epics.updateScope("epic-a", {
      epicScope: {
        kind: "repo",
        owner_project_id: "project-a",
        repos: [],
      },
      expectedVersion: 1,
      auditEvidence: "scope review",
    });
    expect(scoped.version).toBe(2);

    const shell = await store.epics.addShell("epic-a", {
      entryId: "shell-1",
      title: "Shell",
      successHint: "Promote me",
    });
    expect(shell.kind).toBe("shell");
    expect(
      (await store.epics.promoteShell("epic-a", "shell-1", "change-1", "agent"))
        .changeId,
    ).toBe("change-1");

    const linked = await store.epics.linkChange("epic-a", {
      entryId: "entry-2",
      changeId: "change-2",
      title: "Second change",
    });
    expect(linked.membership_status).toBe("projection_pending");
    const retargeted = await store.epics.retargetChange("epic-a", {
      entryId: "entry-2",
      fromChangeId: "change-2",
      toChangeId: "change-3",
      retargetEvidence: "replacement",
    });
    expect(retargeted.change_id).toBe("change-3");
    expect(
      (
        await store.epics.setEntryMembershipStatus("epic-a", {
          entryId: "entry-2",
          membershipStatus: "linked",
          evidence: "projection confirmed",
        })
      ).membership_status,
    ).toBe("linked");

    const reordered = await store.epics
      .reorder("epic-a", ["entry-2", "shell-1"], 6)
      .catch((error) => error);
    expect(reordered.code).toBe("stale_version");
    const current = await store.epics.get("epic-a");
    if (!current.success || !current.data) throw new Error("Epic missing");
    const reorderedEpic = await store.epics.reorder(
      "epic-a",
      ["entry-2", "shell-1"],
      current.data.version,
    );
    expect(reorderedEpic.entries.map((entry) => entry.entry_id)).toEqual([
      "entry-2",
      "shell-1",
    ]);
    await store.epics.unlinkChange("epic-a", "entry-2", "remove duplicate");

    const merged = await store.epics.markMerged("epic-a", {
      mergedInto: {
        epic_id: "survivor",
        merged_at: new Date().toISOString(),
        merged_by: "agent",
        evidence: "consolidation",
        moved_entry_count: 1,
      },
      expectedVersion: reorderedEpic.version + 1,
    });
    expect(merged.progress.status).toBe("merged");
  });

  test("rejects missing, corrupt, and stale projections", async () => {
    await expect(
      store.epics.update("missing", { title: "nope", expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: "epic_not_found" });

    await store.epics.create("corrupt", "Corrupt", "fixture");
    await writeFile(
      join(store.paths.activeEpics, "corrupt", "active-projection.json"),
      "{not-json",
    );
    const corrupt = await store.epics.get("corrupt");
    expect(corrupt.success).toBe(false);

    await store.epics.create("concurrent", "Concurrent", "fixture");
    await store.epics.update("concurrent", {
      title: "winner",
      expectedVersion: 0,
    });
    await expect(
      store.epics.update("concurrent", {
        title: "stale",
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ code: "stale_version" });
  });

  test("retires completed Epics and reads the retired projection", async () => {
    await store.epics.create("retire-me", "Retire", "fixture");
    await store.epics.linkChange("retire-me", {
      entryId: "entry-1",
      changeId: "change-1",
      title: "Terminal change",
    });
    const linked = await store.epics.get("retire-me");
    if (!linked.success || !linked.data) throw new Error("Epic missing");
    await store.epics.setEntryTerminalSummary("retire-me", {
      entryId: "entry-1",
      status: "closed",
      completedAt: new Date().toISOString(),
    });
    const complete = await store.epics.get("retire-me");
    if (!complete.success || !complete.data) throw new Error("Epic missing");
    const prepared = await store.epics.retire("retire-me", {
      expectedVersion: complete.data.version,
      evidence: "retirement review",
      retiredBy: "agent",
      dryRun: true,
    });
    expect(prepared.projection_status).toBe("prepared");
    const retired = await store.epics.retire("retire-me", {
      expectedVersion: complete.data.version,
      evidence: "retirement review",
      retiredBy: "agent",
    });
    expect(retired.projection_status).toBe("retired");
    expect(await store.epics.getRetiredProjection("retire-me")).toMatchObject({
      success: true,
      data: {
        projection_status: "retired",
        source_version: complete.data.version,
      },
    });
    expect(await store.epics.get("retire-me")).toMatchObject({
      success: true,
      source: "retired_projection",
    });
  });

  test("repairIndex reports the authoritative disk projection without fabricating an index", async () => {
    await store.epics.create("indexed", "Indexed", "fixture");
    const result = await store.epics.repairIndex({ evidence: "disk audit" });
    expect(result).toMatchObject({
      total: 1,
      backfilled: 0,
      refreshed: 0,
      skipped: 1,
      unreachable: 0,
      epics: [{ epic_id: "indexed", action: "skipped" }],
    });
  });

  test("accepts a validated retired projection through the existing save path", async () => {
    const epic = await store.epics.create("saved-retired", "Saved", "fixture");
    const projection: RetiredEpicProjection = {
      epic_snapshot: {
        ...epic,
        progress: { ...epic.progress, status: "completed" },
      } as Epic,
      retired_at: new Date().toISOString(),
      retired_by: "agent",
      evidence: "fixture",
      source_workflow_id: "disk:saved-retired",
      source_version: epic.version,
      projection_status: "prepared",
    };
    await store.epics.saveRetiredProjection("saved-retired", projection);
    expect(
      await store.epics.getRetiredProjection("saved-retired"),
    ).toMatchObject({
      success: true,
      data: { source_workflow_id: "disk:saved-retired" },
    });
  });
});
