/**
 * adv_store_consolidate — scan/dry_run tests (rq-storeConsolidation01).
 *
 * Read-only half of the orphan-store consolidation tool:
 *  - scan: enumerate candidate orphan external stores for the current repo
 *    across XDG shard layouts; flag dirs minted under shallow-boundary /
 *    unstable SHAs (structural git checks only).
 *  - dry_run: per-item plan (live vs terminal changes, archive bundles,
 *    Epics incl. retired-epics, wisdom/agenda/reflections rows), per-ID
 *    collision report, ledger-aware idempotency. Zero mutations.
 *
 * Fixtures use real git repos + temp data-home roots; real XDG stores are
 * never touched (data_home_root is injected).
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join, relative } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import {
  storeConsolidateTools,
  scanStoresForRepo,
  buildConsolidationPlan,
  ConsolidationReportSchema,
  ConsolidationLedgerRowSchema,
  CONSOLIDATION_LEDGER_FILENAME,
} from "./store-consolidate";
import type { Store } from "../storage/store";

const run = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}

// =============================================================================
// Fixtures
// =============================================================================

interface ChangeFixture {
  id: string;
  title?: string;
  status: "draft" | "pending" | "active" | "archived" | "closed";
}

interface StoreFixture {
  changes?: ChangeFixture[];
  /** change ids that get an archive bundle (date-prefixed dir) */
  archive?: string[];
  retiredEpics?: string[];
  wisdomRows?: string[];
  agendaRows?: string[];
  reflectionRows?: string[];
  workerLock?: { pid: number };
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
        title: change.title ?? change.id,
        status: change.status,
        created_at: "2026-07-01T00:00:00.000Z",
      }),
    );
  }
  for (const changeId of fixture.archive ?? []) {
    const dir = join(storeDir, "archive", `2026-07-01-${changeId}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "change.json"),
      JSON.stringify({
        id: changeId,
        title: changeId,
        status: "archived",
        created_at: "2026-06-01T00:00:00.000Z",
      }),
    );
  }
  for (const epicId of fixture.retiredEpics ?? []) {
    const dir = join(storeDir, "retired-epics", epicId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "retired-projection.json"),
      JSON.stringify({ id: epicId, title: epicId, status: "retired" }),
    );
  }
  const writeJsonl = async (name: string, rows: string[] | undefined) => {
    if (!rows || rows.length === 0) return;
    await writeFile(
      join(storeDir, name),
      rows.map((r) => JSON.stringify({ text: r })).join("\n") + "\n",
    );
  };
  await writeJsonl("wisdom.jsonl", fixture.wisdomRows);
  await writeJsonl("agenda.jsonl", fixture.agendaRows);
  await writeJsonl("reflections.jsonl", fixture.reflectionRows);
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

let base: string;
let repoDir: string;
let dataHomeRoot: string;
let trueRoot: string;
let boundarySha: string; // non-root commit — shallow-boundary class
const unrelatedSha = "f".repeat(40);
const shardHash = "a".repeat(40);

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "adv-store-consolidate-"));

  // Repo with 3 commits: c1 (root) <- c2 <- c3.
  repoDir = join(base, "repo");
  await run("git", ["init", "-b", "main", repoDir]);
  await git(repoDir, "config", "user.email", "t@t");
  await git(repoDir, "config", "user.name", "t");
  for (const n of [1, 2, 3]) {
    await writeFile(join(repoDir, `f${n}.txt`), `${n}\n`);
    await git(repoDir, "add", ".");
    await git(repoDir, "commit", "-m", `c${n}`);
  }
  trueRoot = (await git(repoDir, "rev-list", "--max-parents=0", "HEAD"))
    .split("\n")[0]!
    .trim();
  boundarySha = (await git(repoDir, "rev-parse", "HEAD")).trim();
  expect(boundarySha).not.toBe(trueRoot);

  dataHomeRoot = join(base, "xdg");

  // True store (legacy layout) — holds colliding + distinct items.
  await writeStoreDir(legacyStorePath(dataHomeRoot, trueRoot), {
    changes: [
      { id: "collide-1", status: "active" },
      { id: "target-only", status: "active" },
    ],
    archive: ["arch-collision"],
    retiredEpics: ["epic-collision"],
    wisdomRows: ["shared row", "target row"],
    agendaRows: ["target agenda"],
  });

  // Orphan store (shard layout) minted under the shallow-boundary SHA.
  await writeStoreDir(shardStorePath(dataHomeRoot, shardHash, boundarySha), {
    changes: [
      { id: "live-1", status: "active" },
      { id: "live-ledgered", status: "active" },
      { id: "term-1", status: "archived" },
      { id: "collide-1", status: "draft" },
    ],
    archive: ["arch-1", "arch-collision"],
    retiredEpics: ["epic-1", "epic-collision"],
    wisdomRows: ["shared row", "source row"],
    agendaRows: ["source agenda"],
    reflectionRows: ["source reflection"],
    workerLock: { pid: process.pid }, // live lock
  });

  // Unrelated store (sha not in this repo).
  await writeStoreDir(legacyStorePath(dataHomeRoot, unrelatedSha), {
    changes: [{ id: "other", status: "active" }],
  });

  // Malformed dir name.
  await mkdir(join(dataHomeRoot, "opencode/plugins/advance/not-a-sha"), {
    recursive: true,
  });

  // Pre-existing ledger row in the target store: live-ledgered already applied.
  await writeFile(
    join(
      legacyStorePath(dataHomeRoot, trueRoot),
      CONSOLIDATION_LEDGER_FILENAME,
    ),
    JSON.stringify({
      schema_version: 1,
      source_project_id: boundarySha,
      target_project_id: trueRoot,
      item_id: "live-ledgered",
      item_kind: "change_live",
      action: "recreate",
      content_hash: `sha256:${"0".repeat(64)}`,
      plan_hash: "sha256:" + "1".repeat(64),
      applied_at: "2026-07-10T00:00:00.000Z",
    }) + "\n",
  );
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
  const out = await storeConsolidateTools.adv_store_consolidate.execute(
    args as never,
    mockStore(root),
  );
  return JSON.parse(out);
}

// =============================================================================
// scan
// =============================================================================

describe("scanStoresForRepo", () => {
  test("enumerates stores across legacy and shard layouts", async () => {
    const result = await scanStoresForRepo({
      directory: repoDir,
      dataHomeRoot,
    });
    const walked = result.layouts_walked.map((l) => l.layout).sort();
    expect(walked).toEqual(["legacy", "shard"]);
    const ids = result.stores.map((s) => s.project_id);
    expect(ids).toContain(trueRoot);
    expect(ids).toContain(boundarySha);
    expect(ids).toContain(unrelatedSha);
  });

  test("classifies true store, orphan candidate, unrelated, malformed", async () => {
    const result = await scanStoresForRepo({
      directory: repoDir,
      dataHomeRoot,
    });
    const byId = Object.fromEntries(
      result.stores.map((s) => [s.project_id, s]),
    );
    expect(byId[trueRoot]!.relation).toBe("true_store");
    expect(byId[trueRoot]!.layout).toBe("legacy");

    const orphan = byId[boundarySha]!;
    expect(orphan.relation).toBe("orphan_candidate");
    expect(orphan.layout).toBe("shard");
    expect(orphan.shard).toBe(shardHash);
    expect(orphan.is_commit_in_repo).toBe(true);
    expect(orphan.is_root_commit).toBe(false);
    // Shallow-boundary class: a real commit that is not the true root.
    expect(orphan.unstable_identity_suspect).toBe(true);

    const unrelated = byId[unrelatedSha]!;
    expect(unrelated.relation).toBe("unrelated");
    expect(unrelated.is_commit_in_repo).toBe(false);
    expect(unrelated.unstable_identity_suspect).toBe(false);

    const malformed = byId["not-a-sha"]!;
    expect(malformed.relation).toBe("malformed");
    expect(malformed.is_commit_in_repo).toBeNull();
  });

  test("detects live worker.lock on a store", async () => {
    const result = await scanStoresForRepo({
      directory: repoDir,
      dataHomeRoot,
    });
    const orphan = result.stores.find((s) => s.project_id === boundarySha)!;
    expect(orphan.worker_lock.present).toBe(true);
    expect(orphan.worker_lock.live).toBe(true);
    expect(orphan.worker_lock.pid).toBe(process.pid);
    expect(result.warnings.join(" ")).toMatch(/worker\.lock/);
  });

  test("reports per-store content summary counts", async () => {
    const result = await scanStoresForRepo({
      directory: repoDir,
      dataHomeRoot,
    });
    const orphan = result.stores.find((s) => s.project_id === boundarySha)!;
    expect(orphan.summary).toMatchObject({
      changes: 4,
      archive_bundles: 2,
      retired_epics: 2,
      wisdom_rows: 2,
      agenda_rows: 1,
      reflections_rows: 1,
    });
  });

  test("identity unresolved (non-git dir) still enumerates without git checks", async () => {
    const nonGit = await mkdtemp(join(tmpdir(), "adv-nongit-"));
    try {
      const result = await scanStoresForRepo({
        directory: nonGit,
        dataHomeRoot,
      });
      expect(result.identity.kind).toBe("not_git");
      const orphan = result.stores.find((s) => s.project_id === boundarySha)!;
      expect(orphan.relation).toBe("identity_unresolved");
      expect(orphan.is_commit_in_repo).toBeNull();
    } finally {
      await rm(nonGit, { recursive: true, force: true });
    }
  });

  test("performs zero mutations", async () => {
    const before = await snapshotTree(dataHomeRoot);
    await scanStoresForRepo({ directory: repoDir, dataHomeRoot });
    await executeTool({ action: "scan", data_home_root: dataHomeRoot });
    const after = await snapshotTree(dataHomeRoot);
    expect(after).toEqual(before);
  });
});

// =============================================================================
// dry_run
// =============================================================================

describe("buildConsolidationPlan", () => {
  const listLiveEpicIds = async (projectId: string): Promise<string[]> => {
    if (projectId === boundarySha)
      return ["epic-live-1", "epic-collision-live"];
    if (projectId === trueRoot) return ["epic-collision-live"];
    return [];
  };

  test("partitions changes live vs terminal and lists archive bundles + retired epics", async () => {
    const plan = await buildConsolidationPlan({
      sourceProjectId: boundarySha,
      targetProjectId: trueRoot,
      dataHomeRoot,
      listLiveEpicIds,
    });
    const live = plan.changes.live.map((c) => c.id).sort();
    const terminal = plan.changes.terminal.map((c) => c.id).sort();
    expect(live).toEqual(["collide-1", "live-1", "live-ledgered"]);
    expect(terminal).toEqual(["term-1"]);
    expect(plan.changes.live.find((c) => c.id === "live-1")!.plan_action).toBe(
      "recreate",
    );
    expect(plan.changes.terminal[0]!.plan_action).toBe("import_projection");
    expect(plan.archive_bundles.map((a) => a.id).sort()).toEqual([
      "arch-1",
      "arch-collision",
    ]);
    expect(plan.epics.retired.map((e) => e.id).sort()).toEqual([
      "epic-1",
      "epic-collision",
    ]);
    expect(plan.epics.live.map((e) => e.id).sort()).toEqual([
      "epic-collision-live",
      "epic-live-1",
    ]);
    expect(plan.epics.live_source).toBe("temporal_visibility");
  });

  test("jsonl append counts: new vs duplicate by content hash", async () => {
    const plan = await buildConsolidationPlan({
      sourceProjectId: boundarySha,
      targetProjectId: trueRoot,
      dataHomeRoot,
      listLiveEpicIds,
    });
    expect(plan.appends.wisdom).toMatchObject({
      source_rows: 2,
      target_rows: 2,
      new_rows: 1,
      duplicate_rows: 1,
    });
    expect(plan.appends.agenda).toMatchObject({
      source_rows: 1,
      target_rows: 1,
      new_rows: 1,
      duplicate_rows: 0,
    });
    expect(plan.appends.reflections).toMatchObject({
      source_rows: 1,
      target_rows: 0,
      new_rows: 1,
      duplicate_rows: 0,
    });
  });

  test("per-ID collision report halts every ID present in both stores", async () => {
    const plan = await buildConsolidationPlan({
      sourceProjectId: boundarySha,
      targetProjectId: trueRoot,
      dataHomeRoot,
      listLiveEpicIds,
    });
    const ids = plan.collisions.map((c) => c.item_id).sort();
    expect(ids).toEqual([
      "arch-collision",
      "collide-1",
      "epic-collision",
      "epic-collision-live",
    ]);
    for (const collision of plan.collisions) {
      expect(collision.policy).toBe("halt");
      expect(collision.in_source.length).toBeGreaterThan(0);
      expect(collision.in_target.length).toBeGreaterThan(0);
    }
    // Colliding items are marked skip_collision in the plan — no newest-wins.
    const collided = plan.changes.live.find((c) => c.id === "collide-1")!;
    expect(collided.collision).toBe(true);
    expect(collided.plan_action).toBe("skip_collision");
  });

  test("ledger rows mark already-applied items as skip_ledgered (idempotency)", async () => {
    const plan = await buildConsolidationPlan({
      sourceProjectId: boundarySha,
      targetProjectId: trueRoot,
      dataHomeRoot,
      listLiveEpicIds,
    });
    expect(plan.ledger.exists).toBe(true);
    expect(plan.ledger.rows).toBe(1);
    expect(plan.ledger.applied_item_ids).toContain("live-ledgered");
    const ledgered = plan.changes.live.find((c) => c.id === "live-ledgered")!;
    expect(ledgered.ledgered).toBe(true);
    expect(ledgered.plan_action).toBe("skip_ledgered");
  });

  test("live-epic enumeration failure degrades to unavailable", async () => {
    const plan = await buildConsolidationPlan({
      sourceProjectId: boundarySha,
      targetProjectId: trueRoot,
      dataHomeRoot,
      listLiveEpicIds: async () => {
        throw new Error("temporal unreachable");
      },
    });
    expect(plan.epics.live_source).toBe("unavailable");
    expect(plan.epics.live).toEqual([]);
  });

  test("missing target store is allowed and reported", async () => {
    const freshRoot = await mkdtemp(join(tmpdir(), "adv-fresh-xdg-"));
    try {
      await writeStoreDir(shardStorePath(freshRoot, shardHash, boundarySha), {
        changes: [{ id: "only-source", status: "active" }],
      });
      const plan = await buildConsolidationPlan({
        sourceProjectId: boundarySha,
        targetProjectId: trueRoot,
        dataHomeRoot: freshRoot,
        listLiveEpicIds: async () => [],
      });
      expect(plan.target.exists).toBe(false);
      expect(plan.target.path).toBeNull();
      expect(plan.collisions).toEqual([]);
      expect(plan.ledger.exists).toBe(false);
      expect(plan.changes.live[0]!.plan_action).toBe("recreate");
    } finally {
      await rm(freshRoot, { recursive: true, force: true });
    }
  });

  test("missing source store refuses", async () => {
    await expect(
      buildConsolidationPlan({
        sourceProjectId: "1".repeat(40),
        targetProjectId: trueRoot,
        dataHomeRoot,
        listLiveEpicIds,
      }),
    ).rejects.toThrow(/source store not found/i);
  });

  test("plan validates against ConsolidationReportSchema and plan_hash is stable", async () => {
    const a = await buildConsolidationPlan({
      sourceProjectId: boundarySha,
      targetProjectId: trueRoot,
      dataHomeRoot,
      listLiveEpicIds,
    });
    const b = await buildConsolidationPlan({
      sourceProjectId: boundarySha,
      targetProjectId: trueRoot,
      dataHomeRoot,
      listLiveEpicIds,
    });
    const parsed = ConsolidationReportSchema.parse(a);
    expect(parsed.action).toBe("dry_run");
    expect(parsed.zero_mutations).toBe(true);
    expect(parsed.outcomes).toBeNull();
    expect(a.plan_hash).toBe(b.plan_hash);
    expect(a.plan_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("performs zero mutations (no ledger write, no new files)", async () => {
    const before = await snapshotTree(dataHomeRoot);
    await buildConsolidationPlan({
      sourceProjectId: boundarySha,
      targetProjectId: trueRoot,
      dataHomeRoot,
      listLiveEpicIds,
    });
    await executeTool({
      action: "dry_run",
      source_project_id: boundarySha,
      target_project_id: trueRoot,
      data_home_root: dataHomeRoot,
    });
    const after = await snapshotTree(dataHomeRoot);
    expect(after).toEqual(before);
  });
});

// =============================================================================
// tool-level behavior
// =============================================================================

describe("adv_store_consolidate tool", () => {
  test("dry_run via tool resolves target from repo identity by default", async () => {
    const result = (await executeTool({
      action: "dry_run",
      source_project_id: boundarySha,
      data_home_root: dataHomeRoot,
    })) as { target: { project_id: string }; action: string };
    expect(result.action).toBe("dry_run");
    expect(result.target.project_id).toBe(trueRoot);
  });

  test("refuses when source equals target", async () => {
    const result = (await executeTool({
      action: "dry_run",
      source_project_id: trueRoot,
      target_project_id: trueRoot,
      data_home_root: dataHomeRoot,
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/source.*target.*same|same store/i);
  });

  test("refuses non-hex source id structurally", async () => {
    const result = (await executeTool({
      action: "dry_run",
      source_project_id: "my-orphan",
      data_home_root: dataHomeRoot,
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/40-hex|hex/i);
  });

  test("dry_run without source_project_id is an error", async () => {
    const result = (await executeTool({
      action: "dry_run",
      data_home_root: dataHomeRoot,
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/source_project_id/);
  });

  test("shallow repo without explicit target refuses with unshallow guidance", async () => {
    // Shallow clone of the fixture repo: identity is unstable.
    const shallow = join(base, "shallow-clone");
    await run("git", ["clone", "--depth", "1", `file://${repoDir}`, shallow]);
    const result = (await executeTool(
      {
        action: "dry_run",
        source_project_id: boundarySha,
        data_home_root: dataHomeRoot,
      },
      shallow,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("git fetch --unshallow");
  });

  test("execute action is a non-mutating refusal in this build", async () => {
    const before = await snapshotTree(dataHomeRoot);
    const result = (await executeTool({
      action: "execute",
      source_project_id: boundarySha,
      target_project_id: trueRoot,
      data_home_root: dataHomeRoot,
      approvedByUser: true,
      approvalEvidence: "test",
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not implemented|not available/i);
    const after = await snapshotTree(dataHomeRoot);
    expect(after).toEqual(before);
  });

  test("scan via tool succeeds end-to-end", async () => {
    const result = (await executeTool({
      action: "scan",
      data_home_root: dataHomeRoot,
    })) as { action: string; stores: unknown[] };
    expect(result.action).toBe("scan");
    expect(result.stores.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// exported schemas (task 3 contract surface)
// =============================================================================

describe("exported schemas", () => {
  test("ConsolidationLedgerRowSchema accepts a well-formed row and rejects drift", () => {
    const row = {
      schema_version: 1,
      source_project_id: "a".repeat(40),
      target_project_id: "b".repeat(40),
      item_id: "someChange",
      item_kind: "change_live",
      action: "recreate",
      content_hash: `sha256:${"0".repeat(64)}`,
      plan_hash: `sha256:${"1".repeat(64)}`,
      applied_at: "2026-07-11T00:00:00.000Z",
    };
    expect(ConsolidationLedgerRowSchema.parse(row)).toMatchObject({
      item_id: "someChange",
    });
    expect(() =>
      ConsolidationLedgerRowSchema.parse({ ...row, schema_version: 2 }),
    ).toThrow(z.ZodError);
    expect(() =>
      ConsolidationLedgerRowSchema.parse({
        ...row,
        source_project_id: "not-hex",
      }),
    ).toThrow(z.ZodError);
    expect(() =>
      ConsolidationLedgerRowSchema.parse({
        ...row,
        content_hash: "md5:deadbeef",
      }),
    ).toThrow(z.ZodError);
  });

  test("ledger file on disk parses row-by-row with the exported schema", async () => {
    const ledgerPath = join(
      legacyStorePath(dataHomeRoot, trueRoot),
      CONSOLIDATION_LEDGER_FILENAME,
    );
    const lines = (await readFile(ledgerPath, "utf-8"))
      .split("\n")
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(1);
    const parsed = ConsolidationLedgerRowSchema.parse(JSON.parse(lines[0]!));
    expect(parsed.item_id).toBe("live-ledgered");
  });
});
