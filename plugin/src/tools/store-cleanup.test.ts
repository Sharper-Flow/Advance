/**
 * adv_store_cleanup — legacy Agenda cleanup tests.
 *
 * Maintenance-only cleanup for legacy Agenda data across discoverable local
 * ADV stores. Reuses shared store-discovery primitives: walkStoreDirs, content
 * hashing, live-lock refusal, ledger-based idempotency, and
 * manifest-before-delete.
 *
 * Fixtures use real git repos + temp data-home roots; real XDG stores are
 * never touched (data_home_root is injected).
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readdir,
  readFile,
  stat,
} from "fs/promises";
import { tmpdir } from "os";
import { join, relative } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  storeCleanupHandler,
  scanStoresForCleanup,
  buildCleanupPlan,
  executeCleanup,
  paginateCleanupPlan,
  StoreCleanupPlanSchema,
  StoreCleanupManifestRowSchema,
  AGENDA_CLEANUP_MANIFEST_FILENAME,
} from "./store-cleanup";
import type { Store } from "../storage/store";

const run = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}

// =============================================================================
// Fixtures
// =============================================================================

interface StoreFixture {
  changes?: { id: string; status: string }[];
  agendaRows?: string[];
  wisdomRows?: string[];
  workerLock?: { pid: number };
  consolidationLedger?: { item_kind: string; item_id: string }[];
  cleanupManifest?: { outcome: string; project_id: string }[];
}

async function writeStoreDir(
  storeDir: string,
  fixture: StoreFixture,
): Promise<void> {
  await mkdir(storeDir, { recursive: true });
  for (const change of fixture.changes ?? []) {
    const dir = join(storeDir, "changes", change.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "change.json"),
      JSON.stringify({
        id: change.id,
        title: change.id,
        status: change.status,
        created_at: "2026-07-01T00:00:00.000Z",
      }),
    );
  }
  const writeJsonl = async (name: string, rows: string[] | undefined) => {
    if (!rows || rows.length === 0) return;
    await writeFile(
      join(storeDir, name),
      rows.map((r) => JSON.stringify({ text: r })).join("\n") + "\n",
    );
  };
  await writeJsonl("agenda.jsonl", fixture.agendaRows);
  await writeJsonl("wisdom.jsonl", fixture.wisdomRows);
  if (fixture.workerLock) {
    await writeFile(
      join(storeDir, "worker.lock"),
      JSON.stringify({
        pid: fixture.workerLock.pid,
        worker_id: "test-worker",
        acquired_at: "2026-07-11T00:00:00.000Z",
        schema_version: 2,
        last_heartbeat: new Date().toISOString(),
      }),
    );
  }
  if (fixture.consolidationLedger) {
    const rows = fixture.consolidationLedger.map((r) =>
      JSON.stringify({
        schema_version: 1,
        source_project_id: "a".repeat(40),
        target_project_id: "b".repeat(40),
        item_id: r.item_id,
        item_kind: r.item_kind,
        action: "append_dedupe",
        content_hash: `sha256:${"0".repeat(64)}`,
        plan_hash: `sha256:${"1".repeat(64)}`,
        applied_at: "2026-07-10T00:00:00.000Z",
      }),
    );
    await writeFile(
      join(storeDir, "consolidation-ledger.jsonl"),
      rows.join("\n") + "\n",
    );
  }
  if (fixture.cleanupManifest) {
    const rows = fixture.cleanupManifest.map((r) =>
      JSON.stringify({
        schema_version: 1,
        project_id: r.project_id,
        agenda_path: join(storeDir, "agenda.jsonl"),
        source_hash: `sha256:${"2".repeat(64)}`,
        source_rows: 1,
        outcome: r.outcome,
        reason: "test",
        timestamp: "2026-07-10T00:00:00.000Z",
      }),
    );
    await writeFile(
      join(storeDir, AGENDA_CLEANUP_MANIFEST_FILENAME),
      rows.join("\n") + "\n",
    );
  }
}

function legacyStorePath(dataHomeRoot: string, projectId: string): string {
  return join(dataHomeRoot, "opencode/plugins/advance", projectId);
}

function shardStorePath(
  dataHomeRoot: string,
  shard: string,
  projectId: string,
): string {
  return join(
    dataHomeRoot,
    "opencode-projects",
    shard,
    "opencode/plugins/advance",
    projectId,
  );
}

/** Sorted list of relative file paths — mutation detector. */
async function snapshotTree(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: import("fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(relative(root, full));
    }
  };
  await walk(root);
  return out.sort();
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

let base: string;
let repoDir: string;
let dataHomeRoot: string;
let pagingRoot: string;
let trueRoot: string;
const storeA = "a".repeat(40);
const storeB = "b".repeat(40);
const storeC = "c".repeat(40);
const shardHash = "d".repeat(40);

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "adv-store-cleanup-"));
  repoDir = join(base, "repo");
  await run("git", ["init", "-b", "main", repoDir]);
  await git(repoDir, "config", "user.email", "t@t");
  await git(repoDir, "config", "user.name", "t");
  await writeFile(join(repoDir, "f.txt"), "x\n");
  await git(repoDir, "add", ".");
  await git(repoDir, "commit", "-m", "c1");
  trueRoot = (await git(repoDir, "rev-list", "--max-parents=0", "HEAD"))
    .split("\n")[0]!
    .trim();

  dataHomeRoot = join(base, "xdg");

  // Store A: has agenda, safe to clean.
  await writeStoreDir(legacyStorePath(dataHomeRoot, storeA), {
    changes: [{ id: "change-a", status: "active" }],
    agendaRows: ["agenda row 1", "agenda row 2"],
    wisdomRows: ["wisdom row"],
  });

  // Store B: has agenda, but live worker.lock → unsafe.
  await writeStoreDir(shardStorePath(dataHomeRoot, shardHash, storeB), {
    changes: [{ id: "change-b", status: "active" }],
    agendaRows: ["agenda row"],
    workerLock: { pid: process.pid },
  });

  // Store C: has agenda, consolidation ledger with agenda_row → unsafe.
  await writeStoreDir(legacyStorePath(dataHomeRoot, storeC), {
    changes: [{ id: "change-c", status: "active" }],
    agendaRows: ["agenda row"],
    consolidationLedger: [{ item_kind: "agenda_row", item_id: "hash1" }],
  });

  // True store: no agenda.
  await writeStoreDir(legacyStorePath(dataHomeRoot, trueRoot), {
    changes: [{ id: "change-true", status: "active" }],
    wisdomRows: ["wisdom row"],
  });

  // Dedicated fixture for summary/pagination tests. The execute tests above
  // mutate dataHomeRoot, so review-render tests get their own root that
  // stays stable regardless of test order.
  pagingRoot = join(base, "xdg-paging");
  await writeStoreDir(legacyStorePath(pagingRoot, storeA), {
    changes: [{ id: "change-a", status: "active" }],
    agendaRows: ["agenda row 1", "agenda row 2"],
    wisdomRows: ["wisdom row"],
  });
  await writeStoreDir(shardStorePath(pagingRoot, shardHash, storeB), {
    changes: [{ id: "change-b", status: "active" }],
    agendaRows: ["agenda row"],
    workerLock: { pid: process.pid },
  });
  await writeStoreDir(legacyStorePath(pagingRoot, storeC), {
    changes: [{ id: "change-c", status: "active" }],
    agendaRows: ["agenda row"],
    consolidationLedger: [{ item_kind: "agenda_row", item_id: "hash1" }],
  });
  await writeStoreDir(legacyStorePath(pagingRoot, trueRoot), {
    changes: [{ id: "change-true", status: "active" }],
    wisdomRows: ["wisdom row"],
  });
}, 60_000);

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

function mockStore(root: string): Store {
  return { paths: { root } } as unknown as Store;
}

async function executeTool(
  args: Record<string, unknown>,
  root: string = repoDir,
): Promise<unknown> {
  const out = await storeCleanupHandler(args as never, mockStore(root));
  return JSON.parse(out);
}

// =============================================================================
// scan
// =============================================================================

describe("scanStoresForCleanup", () => {
  test("enumerates stores across legacy and shard layouts", async () => {
    const result = await scanStoresForCleanup({ dataHomeRoot });
    const ids = result.stores.map((s) => s.project_id);
    expect(ids).toContain(storeA);
    expect(ids).toContain(storeB);
    expect(ids).toContain(storeC);
    expect(ids).toContain(trueRoot);
  });

  test("classifies stores by agenda presence and safety", async () => {
    const result = await scanStoresForCleanup({ dataHomeRoot });
    const byId = Object.fromEntries(
      result.stores.map((s) => [s.project_id, s]),
    );
    expect(byId[storeA]!.classification).toBe("has_agenda");
    expect(byId[storeB]!.classification).toBe("unsafe");
    expect(byId[storeC]!.classification).toBe("unsafe");
    expect(byId[trueRoot]!.classification).toBe("no_agenda");
  });

  test("reports per-store agenda summary and safety state", async () => {
    const result = await scanStoresForCleanup({ dataHomeRoot });
    const byId = Object.fromEntries(
      result.stores.map((s) => [s.project_id, s]),
    );
    expect(byId[storeA]!.agenda.rows).toBe(2);
    expect(byId[storeA]!.agenda.content_hash).toMatch(/^sha256:/);
    expect(byId[storeB]!.worker_lock.live).toBe(true);
    expect(byId[storeC]!.consolidation_ledger.exists).toBe(true);
    expect(byId[storeC]!.consolidation_ledger.agenda_rows).toBe(1);
  });

  test("performs zero mutations", async () => {
    const before = await snapshotTree(dataHomeRoot);
    await scanStoresForCleanup({ dataHomeRoot });
    await executeTool({ action: "scan", data_home_root: dataHomeRoot });
    const after = await snapshotTree(dataHomeRoot);
    expect(after).toEqual(before);
  });
});

// =============================================================================
// dry_run
// =============================================================================

describe("buildCleanupPlan", () => {
  test("marks safe stores for delete and unsafe stores for retain", async () => {
    const plan = await buildCleanupPlan({ dataHomeRoot });
    const byId = Object.fromEntries(plan.stores.map((s) => [s.project_id, s]));
    expect(byId[storeA]!.outcome).toBe("delete");
    expect(byId[storeB]!.outcome).toBe("retain");
    expect(byId[storeC]!.outcome).toBe("retain");
    expect(byId[trueRoot]!.outcome).toBe("skip");
  });

  test("plan validates against schema and plan_hash is stable", async () => {
    const a = await buildCleanupPlan({ dataHomeRoot });
    const b = await buildCleanupPlan({ dataHomeRoot });
    const parsed = StoreCleanupPlanSchema.parse(a);
    expect(parsed.action).toBe("dry_run");
    expect(parsed.zero_mutations).toBe(true);
    expect(a.plan_hash).toBe(b.plan_hash);
    expect(a.plan_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("performs zero mutations", async () => {
    const before = await snapshotTree(dataHomeRoot);
    await buildCleanupPlan({ dataHomeRoot });
    await executeTool({ action: "dry_run", data_home_root: dataHomeRoot });
    const after = await snapshotTree(dataHomeRoot);
    expect(after).toEqual(before);
  });
});

// =============================================================================
// execute
// =============================================================================

describe("executeCleanup", () => {
  test("refuses without approval", async () => {
    const before = await snapshotTree(dataHomeRoot);
    await expect(
      executeCleanup({
        dataHomeRoot,
        approvedByUser: false,
        approvalEvidence: "x",
        dry_run_plan_hash: "sha256:" + "0".repeat(64),
      }),
    ).rejects.toThrow(/approval/i);
    expect(await snapshotTree(dataHomeRoot)).toEqual(before);
  });

  test("refuses when dry_run_plan_hash does not match", async () => {
    const before = await snapshotTree(dataHomeRoot);
    await expect(
      executeCleanup({
        dataHomeRoot,
        approvedByUser: true,
        approvalEvidence: "test approval",
        dry_run_plan_hash: "sha256:" + "f".repeat(64),
      }),
    ).rejects.toThrow(/plan.*hash|mismatch/i);
    expect(await snapshotTree(dataHomeRoot)).toEqual(before);
  });

  test("deletes agenda from safe stores, retains unsafe stores, writes manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-cleanup-exec-"));
    try {
      await writeStoreDir(legacyStorePath(root, storeA), {
        changes: [{ id: "change-a", status: "active" }],
        agendaRows: ["row1", "row2"],
      });
      await writeStoreDir(shardStorePath(root, shardHash, storeB), {
        changes: [{ id: "change-b", status: "active" }],
        agendaRows: ["row1"],
        workerLock: { pid: process.pid },
      });

      const plan = await buildCleanupPlan({ dataHomeRoot: root });
      const report = await executeCleanup({
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "operator approved",
        dry_run_plan_hash: plan.plan_hash,
      });

      expect(report.success).toBe(true);
      const byId = Object.fromEntries(
        report.stores.map((s) => [s.project_id, s]),
      );
      expect(byId[storeA]!.outcome).toBe("applied");
      expect(byId[storeB]!.outcome).toBe("retained");

      // Agenda deleted from safe store.
      expect(
        await pathExists(join(legacyStorePath(root, storeA), "agenda.jsonl")),
      ).toBe(false);
      // The pre-delete manifest row and terminal outcome are both persisted.
      expect(
        await pathExists(
          join(legacyStorePath(root, storeA), AGENDA_CLEANUP_MANIFEST_FILENAME),
        ),
      ).toBe(true);
      // Unsafe store retained.
      expect(
        await pathExists(
          join(shardStorePath(root, shardHash, storeB), "agenda.jsonl"),
        ),
      ).toBe(true);
      expect(
        await pathExists(
          join(
            shardStorePath(root, shardHash, storeB),
            AGENDA_CLEANUP_MANIFEST_FILENAME,
          ),
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("second run after success is a no-op via manifest idempotency", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-cleanup-idem-"));
    try {
      await writeStoreDir(legacyStorePath(root, storeA), {
        changes: [{ id: "change-a", status: "active" }],
        agendaRows: ["row1"],
      });

      const plan1 = await buildCleanupPlan({ dataHomeRoot: root });
      const first = await executeCleanup({
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "first",
        dry_run_plan_hash: plan1.plan_hash,
      });
      expect(first.success).toBe(true);
      expect(first.no_op).toBe(false);

      const plan2 = await buildCleanupPlan({ dataHomeRoot: root });
      const second = await executeCleanup({
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "second",
        dry_run_plan_hash: plan2.plan_hash,
      });
      expect(second.success).toBe(true);
      expect(second.no_op).toBe(true);
      expect(second.stores.every((s) => s.outcome === "skipped")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("manifest row validates against schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-cleanup-manifest-"));
    try {
      await writeStoreDir(legacyStorePath(root, storeA), {
        changes: [{ id: "change-a", status: "active" }],
        agendaRows: ["row1"],
      });
      const plan = await buildCleanupPlan({ dataHomeRoot: root });
      await executeCleanup({
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test",
        dry_run_plan_hash: plan.plan_hash,
      });
      const manifestPath = join(
        legacyStorePath(root, storeA),
        AGENDA_CLEANUP_MANIFEST_FILENAME,
      );
      const lines = (await readFile(manifestPath, "utf-8"))
        .split("\n")
        .filter((l) => l.trim().length > 0);
      expect(lines.length).toBeGreaterThan(0);
      const parsed = StoreCleanupManifestRowSchema.parse(JSON.parse(lines[0]!));
      expect(parsed.project_id).toBe(storeA);
      expect(parsed.outcome).toBe("prepared");
      const terminal = StoreCleanupManifestRowSchema.parse(
        JSON.parse(lines[lines.length - 1]!),
      );
      expect(terminal.outcome).toBe("applied");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// tool-level behavior
// =============================================================================

describe("adv_store_cleanup tool", () => {
  test("scan via tool succeeds end-to-end", async () => {
    const result = (await executeTool({
      action: "scan",
      data_home_root: dataHomeRoot,
    })) as { action: string; stores: unknown[] };
    expect(result.action).toBe("scan");
    expect(result.stores.length).toBeGreaterThan(0);
  });

  test("dry_run via tool succeeds end-to-end", async () => {
    const result = (await executeTool({
      action: "dry_run",
      data_home_root: dataHomeRoot,
    })) as { action: string; plan_hash: string };
    expect(result.action).toBe("dry_run");
    expect(result.plan_hash).toMatch(/^sha256:/);
  });

  test("execute via tool requires matching dry_run_plan_hash", async () => {
    const dryRun = (await executeTool({
      action: "dry_run",
      data_home_root: dataHomeRoot,
    })) as { plan_hash: string };
    const result = (await executeTool({
      action: "execute",
      data_home_root: dataHomeRoot,
      approvedByUser: true,
      approvalEvidence: "test",
      dry_run_plan_hash: dryRun.plan_hash,
    })) as { action: string; success: boolean };
    expect(result.action).toBe("execute");
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// manifest outcome accuracy (AC7)
// =============================================================================

describe("manifest outcome accuracy", () => {
  test("failed delete writes failed manifest row, not applied", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-cleanup-delete-fail-"));
    try {
      const storePath = legacyStorePath(root, storeA);
      await writeStoreDir(storePath, {
        changes: [{ id: "change-a", status: "active" }],
        agendaRows: ["row1"],
      });

      const plan = await buildCleanupPlan({ dataHomeRoot: root });
      const report = await executeCleanup({
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test",
        dry_run_plan_hash: plan.plan_hash,
        deps: {
          deleteFile: async () => {
            throw new Error("simulated delete failure");
          },
        },
      });

      expect(report.success).toBe(false);
      const storeOutcome = report.stores.find((s) => s.project_id === storeA);
      expect(storeOutcome?.outcome).toBe("failed");

      const manifestPath = join(storePath, AGENDA_CLEANUP_MANIFEST_FILENAME);
      const manifestContent = await readFile(manifestPath, "utf-8");
      const rows = manifestContent
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l));
      expect(rows.length).toBeGreaterThan(0);
      const lastRow = rows[rows.length - 1];
      expect(lastRow.outcome).toBe("failed");
      expect(lastRow.outcome).not.toBe("applied");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("persists a manifest row before invoking destructive deletion", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-cleanup-manifest-first-"));
    try {
      const storePath = legacyStorePath(root, storeA);
      await writeStoreDir(storePath, {
        changes: [{ id: "change-a", status: "active" }],
        agendaRows: ["row1"],
      });
      const plan = await buildCleanupPlan({ dataHomeRoot: root });
      let manifestWasPresent = false;
      await executeCleanup({
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test",
        dry_run_plan_hash: plan.plan_hash,
        deps: {
          deleteFile: async (agendaPath) => {
            const manifest = await readFile(
              join(storePath, AGENDA_CLEANUP_MANIFEST_FILENAME),
              "utf-8",
            );
            manifestWasPresent = manifest.includes('"outcome":"prepared"');
            await rm(agendaPath);
          },
        },
      });
      expect(manifestWasPresent).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("manifest schema allows failed outcome", () => {
    const row = {
      schema_version: 1,
      project_id: "a".repeat(40),
      agenda_path: "/tmp/agenda.jsonl",
      source_hash: `sha256:${"0".repeat(64)}`,
      source_rows: 1,
      outcome: "failed",
      reason: "delete_failed",
      timestamp: "2026-07-10T00:00:00.000Z",
    };
    expect(() => StoreCleanupManifestRowSchema.parse(row)).not.toThrow();
  });
});

// =============================================================================
// plan summary + pagination (AC9, DDC3, rq-storeCleanupCoupling01.4)
// =============================================================================

describe("plan summary and pagination", () => {
  test("summary reports bounded aggregate counts over the full plan", async () => {
    const plan = await buildCleanupPlan({ dataHomeRoot: pagingRoot });
    expect(plan.summary).toEqual({
      total_stores: 4,
      delete_count: 1,
      skip_count: 1,
      retain_count: 2,
      total_rows: 4,
      delete_rows: 2,
    });
    // Full (unpaged) render always reports has_more: false.
    expect(plan.has_more).toBe(false);
    expect(StoreCleanupPlanSchema.parse(plan).summary.total_stores).toBe(4);
  });

  test("paginateCleanupPlan slices stores with has_more and preserves plan_hash", async () => {
    const full = await buildCleanupPlan({ dataHomeRoot: pagingRoot });

    const first = paginateCleanupPlan(full, { offset: 0, limit: 2 });
    expect(first.stores).toEqual(full.stores.slice(0, 2));
    expect(first.has_more).toBe(true);
    expect(first.plan_hash).toBe(full.plan_hash);
    expect(first.summary).toEqual(full.summary);

    const rest = paginateCleanupPlan(full, { offset: 2, limit: 2 });
    expect(rest.stores).toEqual(full.stores.slice(2));
    expect(rest.has_more).toBe(false);
    expect(rest.plan_hash).toBe(full.plan_hash);

    const beyond = paginateCleanupPlan(full, { offset: 99, limit: 2 });
    expect(beyond.stores).toEqual([]);
    expect(beyond.has_more).toBe(false);
    expect(beyond.plan_hash).toBe(full.plan_hash);
  });

  test("paged, filtered, and full renders share one plan_hash (DDC3 determinism)", async () => {
    const full = await buildCleanupPlan({ dataHomeRoot: pagingRoot });
    const renders = [
      paginateCleanupPlan(full, { limit: 1 }),
      paginateCleanupPlan(full, { offset: 1, limit: 2 }),
      paginateCleanupPlan(full, { outcome: "delete" }),
      paginateCleanupPlan(full, { outcome: "retain", limit: 1 }),
      paginateCleanupPlan(full, {}),
    ];
    for (const render of renders) {
      expect(render.plan_hash).toBe(full.plan_hash);
      expect(render.summary).toEqual(full.summary);
    }
  });

  test("outcome filter narrows review data to delete-only stores", async () => {
    const full = await buildCleanupPlan({ dataHomeRoot: pagingRoot });

    const deletes = paginateCleanupPlan(full, { outcome: "delete" });
    expect(deletes.stores.map((s) => s.project_id)).toEqual([storeA]);
    expect(deletes.has_more).toBe(false);
    expect(deletes.plan_hash).toBe(full.plan_hash);

    const retainedPage = paginateCleanupPlan(full, {
      outcome: "retain",
      limit: 1,
    });
    expect(retainedPage.stores).toHaveLength(1);
    expect(retainedPage.stores[0]!.outcome).toBe("retain");
    expect(retainedPage.has_more).toBe(true);
  });
});

// =============================================================================
// dry_run paging at the tool boundary (AC9)
// =============================================================================

describe("adv_store_cleanup dry_run paging", () => {
  test("dry_run applies a bounded default page and exposes summary + has_more", async () => {
    const result = (await executeTool({
      action: "dry_run",
      data_home_root: pagingRoot,
    })) as {
      summary: { total_stores: number };
      has_more: boolean;
      plan_hash: string;
      stores: unknown[];
    };
    expect(result.summary.total_stores).toBe(4);
    expect(result.stores.length).toBe(4); // 4 < default page size
    expect(result.has_more).toBe(false);
    expect(result.plan_hash).toMatch(/^sha256:/);
  });

  test("dry_run honors limit/offset with stable plan_hash across pages", async () => {
    const page1 = (await executeTool({
      action: "dry_run",
      data_home_root: pagingRoot,
      limit: 2,
    })) as {
      stores: unknown[];
      has_more: boolean;
      plan_hash: string;
      summary: unknown;
    };
    const page2 = (await executeTool({
      action: "dry_run",
      data_home_root: pagingRoot,
      offset: 2,
      limit: 2,
    })) as {
      stores: unknown[];
      has_more: boolean;
      plan_hash: string;
      summary: unknown;
    };
    expect(page1.stores).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page2.stores).toHaveLength(2);
    expect(page2.has_more).toBe(false);
    expect(page1.plan_hash).toBe(page2.plan_hash);
    expect(page1.summary).toEqual(page2.summary);
  });

  test("dry_run outcome=delete returns delete-only review data", async () => {
    const result = (await executeTool({
      action: "dry_run",
      data_home_root: pagingRoot,
      outcome: "delete",
    })) as {
      stores: { project_id: string }[];
      has_more: boolean;
    };
    expect(result.stores).toHaveLength(1);
    expect(result.stores[0]!.project_id).toBe(storeA);
    expect(result.has_more).toBe(false);
  });

  test("execute accepts a plan_hash from a paged dry_run and applies the full plan", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-cleanup-paged-exec-"));
    try {
      await writeStoreDir(legacyStorePath(root, storeA), {
        changes: [{ id: "change-a", status: "active" }],
        agendaRows: ["row1"],
      });
      await writeStoreDir(legacyStorePath(root, storeC), {
        changes: [{ id: "change-c", status: "active" }],
        agendaRows: ["row1", "row2"],
      });

      // Operator reviews a single-page render; the hash still covers both
      // stores, including the paginated-out one.
      const paged = (await executeTool({
        action: "dry_run",
        data_home_root: root,
        limit: 1,
      })) as { stores: unknown[]; has_more: boolean; plan_hash: string };
      expect(paged.stores).toHaveLength(1);
      expect(paged.has_more).toBe(true);

      const report = (await executeTool({
        action: "execute",
        data_home_root: root,
        approvedByUser: true,
        approvalEvidence: "paged approval",
        dry_run_plan_hash: paged.plan_hash,
      })) as { success: boolean; stores: unknown[] };
      expect(report.success).toBe(true);
      // The full plan executed: the paginated-out store was processed too.
      expect(report.stores).toHaveLength(2);
      expect(
        await pathExists(join(legacyStorePath(root, storeC), "agenda.jsonl")),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
