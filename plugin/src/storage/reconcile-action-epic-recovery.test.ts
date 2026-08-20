import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import { ChangeSchema, EpicSchema, type Change, type Epic } from "../types";
import { getProjectPaths, type ProjectPaths } from "./json";
import { createEpicDiskOps } from "./epics-disk";
import { loadActiveEpicProjection } from "./epic-projection";
import type { ActionContext } from "./reconcile-action-types";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";
import {
  clearDanglingMembershipExecutor,
  backfillEpicEntryFromFragmentExecutor,
  formallyLostReportExecutor,
  reconstructFromChildFragmentsExecutor,
  verifyEpicReconstructionConvergence,
} from "./reconcile-action-epic-recovery";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

function makeChange(
  id: string,
  epicId: string,
  entryId: string,
  order: number,
  title: string,
  linkedAt: string,
  epicProjectId?: string,
): Change {
  return ChangeSchema.parse({
    ...SAMPLE_CHANGE,
    id,
    title: `Child ${id}`,
    status: "draft",
    epic_membership: {
      epic_id: epicId,
      entry_id: entryId,
      order,
      title,
      linked_at: linkedAt,
      ...(epicProjectId ? { epic_project_id: epicProjectId } : {}),
    },
  });
}

async function seedChange(
  paths: ProjectPaths,
  change: Change,
): Promise<string> {
  const sourcePath = join(paths.changes, change.id, "change.json");
  await mkdir(join(paths.changes, change.id), { recursive: true });
  await writeFile(sourcePath, JSON.stringify(change, null, 2), "utf8");
  return sourcePath;
}

function record(
  childId: string,
  sourcePath: string,
  action: ReconcileAction["action"],
  className: ReconcilePlanRecord["class"] = "epic_owner_missing",
): ReconcilePlanRecord {
  return {
    record_id: childId,
    source_path: sourcePath,
    class: className,
    evidence: ["missing Epic owner"],
    actions: [{ class: className as "epic_owner_missing", action }],
  };
}

async function fixture() {
  const root = await createTempDir("reconcile-action-epic-");
  roots.push(root);
  const paths = getProjectPaths(
    root,
    {},
    { externalRoot: join(root, "state") },
  );
  const before: Array<{ id: string; bytes: Uint8Array | string }> = [];
  const audits: unknown[] = [];
  const ctx: ActionContext = {
    storePaths: paths,
    localProjectId: "fixture-project",
    locksHeld: [],
    runId: "reconcile-epic-test",
    writeBeforeState: async (recordId, bytes) => {
      before.push({ id: recordId, bytes });
      return join(paths.reconcileDir, `${recordId}.before`);
    },
    auditWriter: async (event) => {
      audits.push(event);
      return undefined;
    },
    coordinateChangeMutation: async (intent) => {
      const sourcePath = join(paths.changes, intent.changeId, "change.json");
      const latest = ChangeSchema.parse(
        JSON.parse(await readFile(sourcePath, "utf8")),
      );
      const value = intent.mutateLatestProjection(latest);
      await writeFile(sourcePath, JSON.stringify(value, null, 2), "utf8");
      return {
        kind: "verified" as const,
        value,
        revision: (value.projection_revision ?? 0) + 1,
        audit: {} as never,
      };
    },
    saveEpicOptimistic: vi.fn(async (_epicId, epic) => {
      const { saveActiveEpicProjection } = await import("./epic-projection");
      await saveActiveEpicProjection(paths.activeEpics, epic);
      return { status: "saved" as const, epic };
    }),
    linkEpicChange: vi.fn(async (epicId, input) =>
      createEpicDiskOps({
        activeEpicsDir: paths.activeEpics,
        retiredEpicsDir: paths.retiredEpics,
      }).linkChange(epicId, input),
    ),
  };
  return { paths, ctx, before, audits };
}

describe("Epic recovery reconcile action executors", () => {
  test("backfills a missing entry from a surviving fragment", async () => {
    const { paths, ctx } = await fixture();
    const child = makeChange(
      "child-one",
      "existingEpic",
      "entry-one",
      4,
      "First child",
      "2026-08-07T00:00:00.000Z",
    );
    const sourcePath = await seedChange(paths, child);
    await mkdir(paths.activeEpics, { recursive: true });
    await mkdir(paths.retiredEpics, { recursive: true });
    await createEpicDiskOps({
      activeEpicsDir: paths.activeEpics!,
      retiredEpicsDir: paths.retiredEpics!,
    }).create("existingEpic", "Existing Epic", "");

    const result = await backfillEpicEntryFromFragmentExecutor(
      record(
        child.id,
        sourcePath,
        "backfill_epic_entry_from_fragment",
        "epic_entry_missing",
      ),
      {
        class: "epic_entry_missing",
        action: "backfill_epic_entry_from_fragment",
      },
      ctx,
    );

    expect(result.status).toBe("mutated");
    const owner = JSON.parse(
      await readFile(
        join(paths.activeEpics, "existingEpic", "active-projection.json"),
        "utf8",
      ),
    ) as Epic;
    expect(owner.entries).toEqual([
      expect.objectContaining({
        entry_id: "entry-one",
        order: 4,
        title: "First child",
        linked_at: "2026-08-07T00:00:00.000Z",
        change_id: "child-one",
      }),
    ]);
    expect(ctx.saveEpicOptimistic).not.toHaveBeenCalled();
    expect(ctx.linkEpicChange).toHaveBeenCalledOnce();
  });

  test("skips an entry id that already exists without duplicating it", async () => {
    const { paths, ctx } = await fixture();
    const child = makeChange(
      "child-one",
      "existingEpic",
      "entry-one",
      4,
      "First child",
      "2026-08-07T00:00:00.000Z",
    );
    const sourcePath = await seedChange(paths, child);
    await mkdir(paths.activeEpics, { recursive: true });
    await mkdir(paths.retiredEpics, { recursive: true });
    const ops = createEpicDiskOps({
      activeEpicsDir: paths.activeEpics,
      retiredEpicsDir: paths.retiredEpics,
    });
    await ops.create("existingEpic", "Existing Epic", "");
    await ops.linkChange("existingEpic", {
      entryId: "entry-one",
      changeId: "different-child",
      title: "Existing entry",
    });

    const result = await backfillEpicEntryFromFragmentExecutor(
      record(
        child.id,
        sourcePath,
        "backfill_epic_entry_from_fragment",
        "epic_entry_missing",
      ),
      {
        class: "epic_entry_missing",
        action: "backfill_epic_entry_from_fragment",
      },
      ctx,
    );

    expect(result).toMatchObject({ status: "skipped" });
    const owner = await loadActiveEpicProjection(
      paths.activeEpics,
      "existingEpic",
    );
    expect(owner).toMatchObject({
      success: true,
      data: { entries: [{ entry_id: "entry-one" }] },
    });
  });

  test("refuses a change id already linked under another entry", async () => {
    const { paths, ctx } = await fixture();
    const child = makeChange(
      "child-one",
      "existingEpic",
      "new-entry",
      4,
      "First child",
      "2026-08-07T00:00:00.000Z",
    );
    const sourcePath = await seedChange(paths, child);
    await mkdir(paths.activeEpics, { recursive: true });
    await mkdir(paths.retiredEpics, { recursive: true });
    const ops = createEpicDiskOps({
      activeEpicsDir: paths.activeEpics,
      retiredEpicsDir: paths.retiredEpics,
    });
    await ops.create("existingEpic", "Existing Epic", "");
    await ops.linkChange("existingEpic", {
      entryId: "old-entry",
      changeId: child.id,
      title: "Existing child",
    });

    const result = await backfillEpicEntryFromFragmentExecutor(
      record(
        child.id,
        sourcePath,
        "backfill_epic_entry_from_fragment",
        "epic_entry_missing",
      ),
      {
        class: "epic_entry_missing",
        action: "backfill_epic_entry_from_fragment",
      },
      ctx,
    );

    expect(result).toMatchObject({
      status: "failed",
      error_class: "entry_already_exists",
    });
  });

  test("refuses a retired owner without calling the locked writer", async () => {
    const { paths, ctx } = await fixture();
    const child = makeChange(
      "child-one",
      "retiredEpic",
      "entry-one",
      4,
      "First child",
      "2026-08-07T00:00:00.000Z",
    );
    const sourcePath = await seedChange(paths, child);
    await mkdir(paths.activeEpics, { recursive: true });
    await mkdir(paths.retiredEpics, { recursive: true });
    const ops = createEpicDiskOps({
      activeEpicsDir: paths.activeEpics,
      retiredEpicsDir: paths.retiredEpics,
    });
    await ops.create("retiredEpic", "Retired Epic", "");
    const owner = await loadActiveEpicProjection(
      paths.activeEpics,
      "retiredEpic",
    );
    if (!owner.success || !owner.data) throw new Error("Epic missing");
    await ops
      .retire("retiredEpic", {
        expectedVersion: owner.data.version,
        evidence: "fixture retirement",
        retiredBy: "fixture",
      })
      .catch(async () => {
        const entry = await ops.linkChange("retiredEpic", {
          entryId: "terminal-entry",
          changeId: "terminal-child",
          title: "Terminal",
          terminalSummary: {
            status: "closed",
            completedAt: "2026-08-07T00:00:00.000Z",
          },
        });
        const complete = await loadActiveEpicProjection(
          paths.activeEpics,
          "retiredEpic",
        );
        if (!complete.success || !complete.data)
          throw new Error("Epic missing");
        expect(entry.entry_id).toBe("terminal-entry");
        await ops.retire("retiredEpic", {
          expectedVersion: complete.data.version,
          evidence: "fixture retirement",
          retiredBy: "fixture",
        });
      });

    const result = await backfillEpicEntryFromFragmentExecutor(
      record(
        child.id,
        sourcePath,
        "backfill_epic_entry_from_fragment",
        "epic_entry_missing",
      ),
      {
        class: "epic_entry_missing",
        action: "backfill_epic_entry_from_fragment",
      },
      ctx,
    );
    expect(result).toMatchObject({
      status: "failed",
      error_class: "owner_not_active",
    });
    expect(ctx.linkEpicChange).not.toHaveBeenCalled();
  });

  test("refuses conflicting surviving fragments without writing", async () => {
    const { paths, ctx } = await fixture();
    const first = makeChange(
      "child-one",
      "existingEpic",
      "entry-one",
      4,
      "First",
      "2026-08-07T00:00:00.000Z",
    );
    const second = makeChange(
      "child-two",
      "existingEpic",
      "entry-one",
      4,
      "Different",
      "2026-08-07T00:00:00.000Z",
    );
    const sourcePath = await seedChange(paths, first);
    await seedChange(paths, second);
    await mkdir(paths.activeEpics, { recursive: true });
    await mkdir(paths.retiredEpics, { recursive: true });
    const ops = createEpicDiskOps({
      activeEpicsDir: paths.activeEpics,
      retiredEpicsDir: paths.retiredEpics,
    });
    await ops.create("existingEpic", "Existing Epic", "");

    const result = await backfillEpicEntryFromFragmentExecutor(
      record(
        first.id,
        sourcePath,
        "backfill_epic_entry_from_fragment",
        "epic_entry_missing",
      ),
      {
        class: "epic_entry_missing",
        action: "backfill_epic_entry_from_fragment",
      },
      ctx,
    );
    expect(result).toMatchObject({
      status: "failed",
      error_class: "fragment_refused",
    });
    expect(
      (await loadActiveEpicProjection(paths.activeEpics, "existingEpic")).data
        ?.entries,
    ).toEqual([]);
  });

  test("writes terminal summary and refuses terminal evidence without a timestamp", async () => {
    const { paths, ctx } = await fixture();
    const terminal = ChangeSchema.parse({
      ...makeChange(
        "terminal-child",
        "existingEpic",
        "terminal-entry",
        1,
        "Terminal",
        "2026-08-07T00:00:00.000Z",
      ),
      status: "closed",
      closed_at: "2026-08-08T00:00:00.000Z",
    });
    const sourcePath = await seedChange(paths, terminal);
    await mkdir(paths.activeEpics, { recursive: true });
    await mkdir(paths.retiredEpics, { recursive: true });
    const ops = createEpicDiskOps({
      activeEpicsDir: paths.activeEpics,
      retiredEpicsDir: paths.retiredEpics,
    });
    await ops.create("existingEpic", "Existing Epic", "");
    const result = await backfillEpicEntryFromFragmentExecutor(
      record(
        terminal.id,
        sourcePath,
        "backfill_epic_entry_from_fragment",
        "epic_entry_missing",
      ),
      {
        class: "epic_entry_missing",
        action: "backfill_epic_entry_from_fragment",
      },
      ctx,
    );
    expect(result.status).toBe("mutated");
    expect(
      (await loadActiveEpicProjection(paths.activeEpics, "existingEpic")).data
        ?.entries[0],
    ).toMatchObject({
      membership_status: "terminal",
      terminal_summary: {
        status: "closed",
        completed_at: "2026-08-08T00:00:00.000Z",
      },
    });

    const incomplete = ChangeSchema.parse({
      ...makeChange(
        "incomplete-child",
        "otherEpic",
        "entry-two",
        2,
        "Incomplete",
        "2026-08-07T00:00:00.000Z",
      ),
      status: "closed",
      archived_at: undefined,
      closed_at: undefined,
      updated_at: undefined,
    });
    const incompletePath = await seedChange(paths, incomplete);
    await ops.create("otherEpic", "Other Epic", "");
    const refused = await backfillEpicEntryFromFragmentExecutor(
      record(
        incomplete.id,
        incompletePath,
        "backfill_epic_entry_from_fragment",
        "epic_entry_missing",
      ),
      {
        class: "epic_entry_missing",
        action: "backfill_epic_entry_from_fragment",
      },
      ctx,
    );
    expect(refused).toMatchObject({
      status: "failed",
      error_class: "fragment_refused",
    });
  });

  test("reconstructs an owner from child fragments and passes the convergence gate", async () => {
    const { paths, ctx } = await fixture();
    const first = makeChange(
      "child-one",
      "lostEpic",
      "entry-one",
      4,
      "First child",
      "2026-08-07T00:00:00.000Z",
      "fixture-project",
    );
    const second = makeChange(
      "child-two",
      "lostEpic",
      "entry-two",
      9,
      "Second child",
      "2026-08-07T01:00:00.000Z",
    );
    const sourcePath = await seedChange(paths, first);
    await seedChange(paths, second);

    const result = await reconstructFromChildFragmentsExecutor(
      record(first.id, sourcePath, "reconstruct_from_child_fragments"),
      {
        class: "epic_owner_missing",
        action: "reconstruct_from_child_fragments",
      },
      ctx,
    );

    expect(result.status).toBe("mutated");
    expect(result.evidence).toMatchObject({
      reconstructed: true,
      converged: true,
      fragment_count: 2,
    });
    const owner = JSON.parse(
      await readFile(
        join(paths.activeEpics, "lostEpic", "active-projection.json"),
        "utf8",
      ),
    ) as Epic & {
      reconstruction: {
        reconstructed: true;
        source: string;
        run_id: string;
        gap_flags: string[];
      };
    };
    expect(EpicSchema.safeParse(owner).success).toBe(true);
    expect(owner.entries).toEqual([
      expect.objectContaining({
        entry_id: "entry-one",
        order: 4,
        title: "First child",
        linked_at: "2026-08-07T00:00:00.000Z",
        change_id: "child-one",
        change_ref: {
          change_id: "child-one",
          project_id: "fixture-project",
        },
        linked_by: "store-reconcile-recovery",
        link_evidence: "reconstructed from child_epic_membership_fragments",
      }),
      expect.objectContaining({
        entry_id: "entry-two",
        order: 9,
        title: "Second child",
        linked_at: "2026-08-07T01:00:00.000Z",
        change_id: "child-two",
      }),
    ]);
    expect(owner.reconstruction).toMatchObject({
      reconstructed: true,
      source: "child_epic_membership_fragments",
      run_id: "reconcile-epic-test",
    });
    expect(owner.reconstruction.gap_flags).toEqual(
      expect.arrayContaining(["narrative", "metadata"]),
    );
    expect(ctx.saveEpicOptimistic).toBeDefined();
  });

  test("refuses a reconstruction when a child does not converge", async () => {
    const { paths } = await fixture();
    const owner = {
      id: "lostEpic",
      title: "lostEpic",
      narrative: "",
      entries: [
        {
          kind: "change",
          entry_id: "entry-one",
          order: 4,
          change_id: "child-one",
          title: "First child",
          linked_at: "2026-08-07T00:00:00.000Z",
          membership_status: "linked",
        },
      ],
      progress: {
        status: "active",
        total_entries: 1,
        completed_entries: 0,
        active_entries: 1,
        next_entry_id: "entry-one",
        updated_at: "2026-08-07T00:00:00.000Z",
      },
      created_at: "2026-08-07T00:00:00.000Z",
      updated_at: "2026-08-07T00:00:00.000Z",
      version: 0,
    } satisfies Epic;
    const child = makeChange(
      "child-one",
      "anotherEpic",
      "entry-one",
      4,
      "First child",
      "2026-08-07T00:00:00.000Z",
    );
    const convergence = verifyEpicReconstructionConvergence(owner, [child]);
    expect(convergence).toMatchObject({ ok: false });
    expect(convergence.failures[0]).toContain("child-one");
    expect(paths.activeEpics).toContain("state");
  });

  test("excludes foreign-project fragments from owner reconstruction", async () => {
    const { paths, ctx } = await fixture();
    const local = makeChange(
      "local-child",
      "lostEpic",
      "local-entry",
      1,
      "Local child",
      "2026-08-07T00:00:00.000Z",
      "fixture-project",
    );
    const foreign = makeChange(
      "foreign-child",
      "lostEpic",
      "foreign-entry",
      2,
      "Foreign child",
      "2026-08-07T01:00:00.000Z",
      "remote-project",
    );
    const sourcePath = await seedChange(paths, local);
    await seedChange(paths, foreign);

    const result = await reconstructFromChildFragmentsExecutor(
      record(local.id, sourcePath, "reconstruct_from_child_fragments"),
      {
        class: "epic_owner_missing",
        action: "reconstruct_from_child_fragments",
      },
      ctx,
    );

    expect(result.status).toBe("mutated");
    const owner = JSON.parse(
      await readFile(
        join(paths.activeEpics, "lostEpic", "active-projection.json"),
        "utf8",
      ),
    ) as Epic;
    expect(owner.entries).toHaveLength(1);
    expect(owner.entries[0]).toMatchObject({
      entry_id: "local-entry",
      change_id: "local-child",
    });
  });

  test("formal-loss action reports bounded loss without creating an Epic", async () => {
    const { paths, ctx, audits } = await fixture();
    const sourcePath = await seedChange(
      paths,
      ChangeSchema.parse({
        ...SAMPLE_CHANGE,
        id: "orphan-child",
        status: "draft",
      }),
    );
    const result = await formallyLostReportExecutor(
      record("lostEpic", sourcePath, "formally_lost_report"),
      { class: "epic_owner_missing", action: "formally_lost_report" },
      ctx,
    );

    expect(result.status).toBe("skipped");
    expect(result.residual).toMatch(/^formally_lost:/);
    expect(result.residual?.length).toBeLessThanOrEqual(1024);
    expect(audits).toHaveLength(1);
    await expect(
      readFile(join(paths.activeEpics, "lostEpic", "active-projection.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("clears only a dangling membership and preserves a mismatched child", async () => {
    const { paths, ctx, before } = await fixture();
    const child = makeChange(
      "orphan-child",
      "lostEpic",
      "entry-one",
      4,
      "First child",
      "2026-08-07T00:00:00.000Z",
    );
    const sourcePath = await seedChange(paths, child);
    await seedChange(
      paths,
      makeChange(
        "conflicting-child",
        "lostEpic",
        "entry-one",
        4,
        "Conflicting title",
        "2026-08-07T00:00:00.000Z",
      ),
    );
    const result = await clearDanglingMembershipExecutor(
      record(child.id, sourcePath, "clear_dangling_membership"),
      { class: "epic_owner_missing", action: "clear_dangling_membership" },
      ctx,
    );

    expect(result.status).toBe("mutated");
    expect(before).toHaveLength(1);
    expect(
      ChangeSchema.parse(JSON.parse(await readFile(sourcePath, "utf8")))
        .epic_membership,
    ).toBeUndefined();
  });

  test("refuses malformed executor context instead of mutating", async () => {
    const { paths, ctx } = await fixture();
    const sourcePath = await seedChange(
      paths,
      makeChange(
        "child-one",
        "lostEpic",
        "entry-one",
        4,
        "First child",
        "2026-08-07T00:00:00.000Z",
      ),
    );
    const result = await reconstructFromChildFragmentsExecutor(
      record("child-one", sourcePath, "formally_lost_report"),
      { class: "epic_owner_missing", action: "formally_lost_report" },
      ctx,
    );
    expect(result).toMatchObject({
      status: "failed",
      error_class: "invalid_executor_context",
    });
  });
});
