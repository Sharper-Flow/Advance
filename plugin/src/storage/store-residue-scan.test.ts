import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { getProjectPaths } from "./json";
import { publishSummaryForChange } from "./change-summary-shard";
import { ChangeSchema } from "../types";
import { ResidueClassSchema, runStoreResidueScan } from "./store-residue-scan";

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
