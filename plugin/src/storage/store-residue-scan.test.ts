import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { getProjectPaths } from "./json";
import { publishSummaryForChange } from "./change-summary-shard";
import { ChangeSchema, EpicSchema, type Epic } from "../types";
import { ResidueClassSchema, runStoreResidueScan } from "./store-residue-scan";
import { saveActiveEpicProjection } from "./epic-projection";

const now = "2026-08-07T00:00:00.000Z";

function change(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    status: "draft",
    created_at: now,
    tasks: [],
    deltas: {},
    worktree_auto_managed: false,
    ...extra,
  };
}

function epic(id: string, entries: Epic["entries"] = []): Epic {
  return EpicSchema.parse({
    id,
    title: id,
    narrative: "",
    entries,
    progress: {
      status: "active",
      total_entries: entries.length,
      completed_entries: 0,
      active_entries: entries.length,
      next_entry_id: entries[0]?.entry_id ?? null,
      updated_at: now,
    },
    created_at: now,
    updated_at: now,
    version: 0,
  });
}

async function fixture(
  extra: Record<string, unknown> = {},
  options: {
    legacy?: Record<string, unknown>;
    noise?: boolean;
    quarantine?: boolean;
    summary?: "missing" | "healthy";
  } = {},
) {
  const root = await createTempDir();
  const paths = getProjectPaths(root);
  const id = "fixture-change";
  await mkdir(join(paths.changes, id), { recursive: true });
  await writeFile(
    join(paths.changes, id, "change.json"),
    JSON.stringify(change(id, extra)),
  );
  if (
    options.summary !== "missing" &&
    !Object.keys(extra).some((key) => key === "test_runs")
  ) {
    await publishSummaryForChange(
      { changesDir: paths.changes, summariesDir: paths.summariesDir },
      ChangeSchema.parse(change(id, extra)),
      "fixture-operation",
    );
  }
  if (options.legacy) {
    await writeFile(
      join(paths.changes, `${id}.json`),
      JSON.stringify({ state: options.legacy }),
    );
  }
  if (options.noise) {
    await writeFile(join(paths.changes, "stray.tmp"), "noise");
    await mkdir(paths.reconcileDir, { recursive: true });
    await writeFile(
      join(paths.reconcileDir, "plan.json"),
      "reconcile artifact",
    );
  }
  if (options.quarantine) {
    await mkdir(join(paths.quarantineChanges, "bad-change"), {
      recursive: true,
    });
    await writeFile(
      join(paths.quarantineChanges, "bad-change", "change.json"),
      "{}",
    );
  }
  return { root, paths, id };
}

async function scanOne(
  extra: Record<string, unknown> = {},
  options: Parameters<typeof fixture>[1] = {},
) {
  const data = await fixture(extra, options);
  try {
    return await runStoreResidueScan({ directory: data.root });
  } finally {
    await cleanupTempDir(data.root);
  }
}

describe("runStoreResidueScan", () => {
  test.each([
    [
      "schema_drift_retired_enum",
      { test_runs: { task: [{ evidence_kind: "build_worker" }] } },
      { summary: "missing" },
    ],
    ["summary_pointer_missing", {}, { summary: "missing" }],
    [
      "legacy_divergent_behind",
      { projection_revision: 4 },
      { legacy: { projection_revision: 3 } },
    ],
    [
      "legacy_newer_than_canonical",
      { projection_revision: 4 },
      { legacy: { projection_revision: 5 } },
    ],
    [
      "unmigrated_artifact_metadata",
      { artifacts: { proposal: { source: "temporal" } } },
    ],
    ["unmigrated_worktree_marker", { worktree_auto_managed: undefined }],
    [
      "epic_owner_missing",
      {
        epic_membership: {
          epic_id: "missing-epic",
          entry_id: "entry",
          order: 0,
          title: "Entry",
          linked_at: now,
        },
      },
    ],
    [
      "store_artifact_missing",
      {
        artifacts: {
          proposal: { source: "disk", path: "missing/proposal.md" },
        },
      },
    ],
  ] as const)("classifies %s", async (expected, extra, options = {}) => {
    const scan = await scanOne(extra, options);
    const record = scan.records.find(
      (item) => item.record_id === "fixture-change",
    );
    expect(record?.class).toBe(expected);
    expect(ResidueClassSchema.safeParse(record?.class).success).toBe(true);
  });

  test("classifies every record once, retaining secondary matches", async () => {
    const data = await fixture(
      {
        projection_revision: 2,
        test_runs: { task: [{ evidence_kind: "replay_determinism" }] },
      },
      { legacy: { projection_revision: 0 }, noise: true },
    );
    try {
      const scan = await runStoreResidueScan({ directory: data.root });
      const record = scan.records.find((item) => item.record_id === data.id);
      expect(record?.class).toBe("schema_drift_retired_enum");
      expect(record?.also_matches).toContain("summary_pointer_missing");
      expect(record?.also_matches).toContain("legacy_divergent_behind");
      expect(scan.counters.schema_drift_retired_enum).toBe(1);
      expect(scan.counters.summary_pointer_missing).toBe(0);
      expect(
        scan.records.filter((item) => item.record_id === data.id),
      ).toHaveLength(1);
      expect(
        scan.records.some((item) => item.class === "unknown_store_noise"),
      ).toBe(true);
      expect(
        scan.records.some((item) => item.record_id.includes("plan.json")),
      ).toBe(false);
    } finally {
      await cleanupTempDir(data.root);
    }
  });

  test("fail-closed corrupt records are quarantined", async () => {
    const root = await createTempDir();
    try {
      const paths = getProjectPaths(root);
      await mkdir(join(paths.changes, "corrupt"), { recursive: true });
      await writeFile(
        join(paths.changes, "corrupt", "change.json"),
        "{not-json",
      );
      const scan = await runStoreResidueScan({ directory: root });
      expect(
        scan.records.find((item) => item.record_id === "corrupt")?.class,
      ).toBe("quarantined_record");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("healthy records are not residue", async () => {
    const scan = await scanOne();
    expect(
      scan.records.find((item) => item.record_id === "fixture-change")?.class,
    ).toBe("healthy");
  });

  test("classifies a foreign Epic owner without reconstructing locally", async () => {
    const data = await fixture({
      epic_membership: {
        epic_id: "remote-epic",
        entry_id: "remote-entry",
        order: 0,
        title: "Remote entry",
        linked_at: now,
        epic_project_id: "remote-project",
      },
    });
    try {
      const scan = await runStoreResidueScan({
        directory: data.root,
        localProjectId: "local-project",
      });
      expect(
        scan.records.find((item) => item.record_id === data.id),
      ).toMatchObject({ class: "epic_owner_foreign" });
    } finally {
      await cleanupTempDir(data.root);
    }
  });

  test("classifies an active Epic with no matching entry", async () => {
    const data = await fixture({
      epic_membership: {
        epic_id: "entryless-epic",
        entry_id: "missing-entry",
        order: 0,
        title: "Missing entry",
        linked_at: now,
      },
    });
    try {
      await saveActiveEpicProjection(
        data.paths.activeEpics,
        epic("entryless-epic"),
      );
      const scan = await runStoreResidueScan({ directory: data.root });
      expect(
        scan.records.find((item) => item.record_id === data.id),
      ).toMatchObject({ class: "epic_entry_missing" });
    } finally {
      await cleanupTempDir(data.root);
    }
  });

  test("does not classify an active Epic with a matching entry", async () => {
    const data = await fixture({
      epic_membership: {
        epic_id: "linked-epic",
        entry_id: "linked-entry",
        order: 0,
        title: "Linked entry",
        linked_at: now,
      },
    });
    try {
      await saveActiveEpicProjection(
        data.paths.activeEpics,
        epic("linked-epic", [
          {
            kind: "change",
            entry_id: "linked-entry",
            order: 0,
            change_id: data.id,
            title: "Linked entry",
            linked_at: now,
            membership_status: "linked",
          },
        ]),
      );
      const scan = await runStoreResidueScan({ directory: data.root });
      expect(
        scan.records.find((item) => item.record_id === data.id),
      ).toMatchObject({ class: "healthy" });
    } finally {
      await cleanupTempDir(data.root);
    }
  });

  test("reconcile run artifacts are fully excluded from unknown noise", async () => {
    const root = await createTempDir("adv-reconcile-noise-");
    try {
      const paths = getProjectPaths(root);
      await mkdir(join(paths.reconcileDir, "runs", "run-1", "receipts"), {
        recursive: true,
      });
      await writeFile(
        join(paths.reconcileDir, "runs", "run-1", "receipts", "change-a.json"),
        "{}",
      );
      const scan = await runStoreResidueScan({ directory: root });
      expect(
        scan.records.filter((item) => item.class === "unknown_store_noise"),
      ).toHaveLength(0);
    } finally {
      await cleanupTempDir(root);
    }
  });
});
