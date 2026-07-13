/**
 * adv_store_cleanup — legacy Agenda cleanup tests.
 *
 * Maintenance-only cleanup for legacy Agenda data across discoverable local
 * ADV stores. Reuses store-consolidation primitives: walkStoreDirs, content
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
  storeCleanupTools,
  scanStoresForCleanup,
  buildCleanupPlan,
  executeCleanup,
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
  const out = await storeCleanupTools.adv_store_cleanup.execute(
    args as never,
    mockStore(root),
  );
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
      // Manifest written before delete.
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
      expect(parsed.outcome).toBe("applied");
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
