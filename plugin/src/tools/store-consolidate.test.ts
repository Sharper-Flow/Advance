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
import { z } from "zod";
import {
  storeConsolidateTools,
  scanStoresForRepo,
  buildConsolidationPlan,
  executeConsolidation,
  ConsolidationReportSchema,
  ConsolidationLedgerRowSchema,
  CONSOLIDATION_LEDGER_FILENAME,
  type ConsolidationLedgerRow,
} from "./store-consolidate";
import type { Store } from "../storage/store";
import type {
  ChangeWorkflowInput,
  EpicWorkflowInput,
  EpicWorkflowState,
} from "../temporal/contracts";

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

  test("execute without approval refuses with typed approval_required error", async () => {
    const before = await snapshotTree(dataHomeRoot);
    const result = (await executeTool({
      action: "execute",
      source_project_id: boundarySha,
      target_project_id: trueRoot,
      data_home_root: dataHomeRoot,
    })) as { success: boolean; error: string; error_code: string };
    expect(result.success).toBe(false);
    expect(result.error_code).toBe("approval_required");
    const after = await snapshotTree(dataHomeRoot);
    expect(after).toEqual(before);
  });

  test("execute with approval but live source worker.lock refuses (zero mutations)", async () => {
    const before = await snapshotTree(dataHomeRoot);
    const result = (await executeTool({
      action: "execute",
      source_project_id: boundarySha,
      target_project_id: trueRoot,
      data_home_root: dataHomeRoot,
      approvedByUser: true,
      approvalEvidence: "test approval",
    })) as { success: boolean; error: string; error_code: string };
    expect(result.success).toBe(false);
    expect(result.error_code).toBe("worker_lock_live");
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
// execute
// =============================================================================

const EXEC_SOURCE = "b".repeat(40);
const EXEC_TARGET = "c".repeat(40);

interface ExecFixture {
  root: string;
  sourcePath: string;
  targetPath: string;
}

async function makeExecFixture(overrides?: {
  source?: StoreFixture;
  target?: StoreFixture;
}): Promise<ExecFixture> {
  const root = await mkdtemp(join(tmpdir(), "adv-consol-exec-"));
  const sourcePath = shardStorePath(root, shardHash, EXEC_SOURCE);
  const targetPath = legacyStorePath(root, EXEC_TARGET);
  await writeStoreDir(
    sourcePath,
    overrides?.source ?? {
      changes: [
        { id: "live-a", status: "active" },
        { id: "term-a", status: "archived" },
      ],
      archive: ["arch-a"],
      retiredEpics: ["epic-retired-a"],
      wisdomRows: ["w1", "w2"],
      agendaRows: ["a1"],
      reflectionRows: ["r1"],
    },
  );
  await writeStoreDir(
    targetPath,
    overrides?.target ?? {
      changes: [{ id: "target-existing", status: "active" }],
      wisdomRows: ["w1"],
    },
  );
  return { root, sourcePath, targetPath };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readLedgerRows(
  targetPath: string,
): Promise<ConsolidationLedgerRow[]> {
  const raw = await readFile(
    join(targetPath, CONSOLIDATION_LEDGER_FILENAME),
    "utf-8",
  ).catch(() => "");
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => ConsolidationLedgerRowSchema.parse(JSON.parse(l)));
}

const listSourceLiveEpics = async (projectId: string): Promise<string[]> =>
  projectId === EXEC_SOURCE ? ["epic-live-a"] : [];

describe("executeConsolidation", () => {
  test("approval gate: refuses without approvedByUser or blank evidence, zero mutations", async () => {
    const { root } = await makeExecFixture();
    try {
      const before = await snapshotTree(root);
      for (const args of [
        { approvedByUser: false, approvalEvidence: "x" },
        { approvedByUser: true, approvalEvidence: "   " },
        { approvedByUser: true, approvalEvidence: "" },
      ]) {
        await expect(
          executeConsolidation({
            sourceProjectId: EXEC_SOURCE,
            targetProjectId: EXEC_TARGET,
            dataHomeRoot: root,
            listLiveEpicIds: listSourceLiveEpics,
            ...args,
          }),
        ).rejects.toMatchObject({ code: "approval_required" });
      }
      expect(await snapshotTree(root)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses while a live worker.lock exists in the orphan store", async () => {
    const { root } = await makeExecFixture({
      source: {
        changes: [{ id: "live-a", status: "active" }],
        workerLock: { pid: process.pid },
      },
    });
    try {
      const before = await snapshotTree(root);
      await expect(
        executeConsolidation({
          sourceProjectId: EXEC_SOURCE,
          targetProjectId: EXEC_TARGET,
          dataHomeRoot: root,
          approvedByUser: true,
          approvalEvidence: "test approval",
          listLiveEpicIds: async () => [],
        }),
      ).rejects.toMatchObject({ code: "worker_lock_live" });
      expect(await snapshotTree(root)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("collisions from the plan abort execute before any mutation", async () => {
    const { root } = await makeExecFixture({
      target: {
        changes: [{ id: "live-a", status: "active" }],
        wisdomRows: ["w1"],
      },
    });
    try {
      const before = await snapshotTree(root);
      await expect(
        executeConsolidation({
          sourceProjectId: EXEC_SOURCE,
          targetProjectId: EXEC_TARGET,
          dataHomeRoot: root,
          approvedByUser: true,
          approvalEvidence: "test approval",
          listLiveEpicIds: listSourceLiveEpics,
        }),
      ).rejects.toMatchObject({ code: "collisions_present" });
      expect(await snapshotTree(root)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("terminal-first: every terminal import lands on disk before any live recreation", async () => {
    const { root, targetPath } = await makeExecFixture();
    try {
      let liveCalled = false;
      const report = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: async () => [],
        deps: {
          recreateLiveChange: async () => {
            liveCalled = true;
            // Terminal imports MUST already be visible in the target store.
            expect(
              await pathExists(
                join(targetPath, "archive", "2026-07-01-arch-a", "change.json"),
              ),
            ).toBe(true);
            expect(
              await pathExists(
                join(
                  targetPath,
                  "retired-epics",
                  "epic-retired-a",
                  "retired-projection.json",
                ),
              ),
            ).toBe(true);
            expect(
              await pathExists(
                join(targetPath, "changes", "term-a", "change.json"),
              ),
            ).toBe(true);
          },
        },
      });
      expect(liveCalled).toBe(true);
      expect(report.action).toBe("execute");
      expect(report.success).toBe(true);
      expect(report.zero_mutations).toBe(false);
      expect(
        report.outcomes?.every(
          (o) => o.status === "applied" || o.status === "skipped",
        ),
      ).toBe(true);
      // Ledger carries one row per terminal import + the live recreation.
      const rows = await readLedgerRows(targetPath);
      const byItem = Object.fromEntries(rows.map((r) => [r.item_id, r]));
      expect(byItem["term-a"]!.item_kind).toBe("change_terminal");
      expect(byItem["arch-a"]!.item_kind).toBe("archive_bundle");
      expect(byItem["epic-retired-a"]!.item_kind).toBe("epic_retired");
      expect(byItem["live-a"]!.item_kind).toBe("change_live");
      for (const row of rows) {
        expect(row.source_project_id).toBe(EXEC_SOURCE);
        expect(row.target_project_id).toBe(EXEC_TARGET);
        expect(row.plan_hash).toBe(report.plan_hash);
      }
      ConsolidationReportSchema.parse(report);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("live change recreation preserves tasks, gates, artifacts, epic_membership field-by-field", async () => {
    const { root, sourcePath, targetPath } = await makeExecFixture({
      source: { changes: [] },
    });
    try {
      const richChange = {
        id: "live-rich",
        title: "Rich live change",
        status: "active",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
        tasks: [
          {
            id: "tk-1",
            title: "First task",
            type: "code",
            status: "done",
            priority: 0,
            created_at: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "tk-2",
            title: "Second task",
            type: "code",
            status: "pending",
            priority: 1,
            created_at: "2026-07-01T00:00:00.000Z",
          },
        ],
        gates: {
          proposal: {
            status: "done",
            completed_at: "2026-07-01T01:00:00.000Z",
            completed_by: "user",
          },
        },
        artifacts: {
          proposal: {
            path: "changes/live-rich/proposal.md",
            content_hash: `sha256:${"a".repeat(64)}`,
            updated_at: "2026-07-01T00:00:00.000Z",
          },
        },
        documents: { proposal: "# Proposal\n\nRich body." },
        epic_membership: {
          epic_id: "epic-live-a",
          entry_id: "en-1",
          order: 0,
          title: "Rich live change",
          linked_at: "2026-07-01T00:00:00.000Z",
          epic_project_id: EXEC_SOURCE,
          repo_id: "repo-1",
          source: "link_existing",
        },
      };
      const richDir = join(sourcePath, "changes", "live-rich");
      await mkdir(richDir, { recursive: true });
      await writeFile(join(richDir, "change.json"), JSON.stringify(richChange));
      await writeFile(join(richDir, "proposal.md"), "# Proposal\n\nRich body.");

      let captured: ChangeWorkflowInput | null = null;
      const report = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: async () => [],
        deps: {
          recreateLiveChange: async (input) => {
            captured = input;
          },
        },
      });
      expect(report.success).toBe(true);
      expect(captured).not.toBeNull();
      const seed = captured!.seedState!;
      expect(captured!.projectId).toBe(EXEC_TARGET);
      expect(captured!.changeId).toBe("live-rich");
      expect(captured!.title).toBe("Rich live change");
      expect(captured!.projectionChangesDir).toBe(join(targetPath, "changes"));
      expect(seed.tasks).toEqual(richChange.tasks);
      expect(seed.gates?.proposal).toMatchObject({
        status: "done",
        completed_by: "user",
      });
      expect(seed.gates?.execution.status).toBe("pending");
      expect(seed.artifacts).toEqual(richChange.artifacts);
      expect(seed.documents).toEqual(richChange.documents);
      expect(seed.epic_membership).toEqual(richChange.epic_membership);
      // Disk projection + artifact files copied into the target store.
      expect(
        await pathExists(
          join(targetPath, "changes", "live-rich", "change.json"),
        ),
      ).toBe(true);
      expect(
        await pathExists(
          join(targetPath, "changes", "live-rich", "proposal.md"),
        ),
      ).toBe(true);
      const rows = await readLedgerRows(targetPath);
      expect(rows.map((r) => r.item_id)).toContain("live-rich");
      expect(rows.find((r) => r.item_id === "live-rich")!.item_kind).toBe(
        "change_live",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("live epic recreation carries the epic record via seedState", async () => {
    const { root, targetPath } = await makeExecFixture({
      source: { changes: [{ id: "term-a", status: "archived" }] },
    });
    try {
      const epicState = {
        projectId: EXEC_SOURCE,
        epicId: "epic-live-a",
        title: "Epic A",
        narrative: "Narrative",
        initializedAt: "2026-06-01T00:00:00.000Z",
        id: "epic-live-a",
        status: "active",
        epic: {
          id: "epic-live-a",
          title: "Epic A",
          narrative: "Narrative",
          entries: [
            {
              entry_id: "en-1",
              kind: "change",
              change_id: "live-rich",
              title: "Rich",
              order: 0,
            },
          ],
          progress: {
            status: "active",
            total_entries: 1,
            completed_entries: 0,
            active_entries: 1,
            next_entry_id: "en-1",
            updated_at: "2026-06-02T00:00:00.000Z",
          },
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-02T00:00:00.000Z",
          version: 3,
        },
        idempotencyLedger: {
          "promote|en-1": {
            processedAt: "2026-06-02T00:00:00.000Z",
            outcome: "ok",
          },
        },
        lastSignalAt: "2026-06-02T00:00:00.000Z",
      } as unknown as EpicWorkflowState;

      let capturedEpic: EpicWorkflowInput | null = null;
      const report = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: listSourceLiveEpics,
        deps: {
          queryLiveEpicState: async (projectId, epicId) => {
            expect(projectId).toBe(EXEC_SOURCE);
            expect(epicId).toBe("epic-live-a");
            return epicState;
          },
          recreateLiveEpic: async (input) => {
            capturedEpic = input;
          },
        },
      });
      expect(report.success).toBe(true);
      expect(capturedEpic).not.toBeNull();
      expect(capturedEpic!.projectId).toBe(EXEC_TARGET);
      expect(capturedEpic!.epicId).toBe("epic-live-a");
      expect(capturedEpic!.title).toBe("Epic A");
      expect(capturedEpic!.narrative).toBe("Narrative");
      expect(capturedEpic!.initializedAt).toBe("2026-06-01T00:00:00.000Z");
      expect(capturedEpic!.seedState?.epic).toEqual(epicState.epic);
      expect(capturedEpic!.seedState?.status).toBe("active");
      expect(capturedEpic!.seedState?.idempotencyLedger).toEqual(
        epicState.idempotencyLedger,
      );
      const rows = await readLedgerRows(targetPath);
      expect(rows.find((r) => r.item_id === "epic-live-a")!.item_kind).toBe(
        "epic_live",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("appends dedupe by content hash and ledger each appended row", async () => {
    const { root, targetPath } = await makeExecFixture({
      source: {
        changes: [{ id: "term-a", status: "archived" }],
        wisdomRows: ["w1", "w2"],
        agendaRows: ["a1"],
        reflectionRows: ["r1"],
      },
    });
    try {
      const report = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: async () => [],
      });
      expect(report.success).toBe(true);
      const wisdom = await readFile(join(targetPath, "wisdom.jsonl"), "utf-8");
      expect(wisdom).toContain('"w1"');
      expect(wisdom).toContain('"w2"');
      expect(wisdom.split("\n").filter((l) => l.trim())).toHaveLength(2);
      const agenda = await readFile(join(targetPath, "agenda.jsonl"), "utf-8");
      expect(agenda).toContain('"a1"');
      const reflections = await readFile(
        join(targetPath, "reflections.jsonl"),
        "utf-8",
      );
      expect(reflections).toContain('"r1"');
      const rows = await readLedgerRows(targetPath);
      expect(rows.filter((r) => r.item_kind === "wisdom_row")).toHaveLength(1);
      expect(rows.filter((r) => r.item_kind === "agenda_row")).toHaveLength(1);
      expect(rows.filter((r) => r.item_kind === "reflection_row")).toHaveLength(
        1,
      );
      for (const row of rows.filter((r) =>
        ["wisdom_row", "agenda_row", "reflection_row"].includes(r.item_kind),
      )) {
        expect(row.action).toBe("append_dedupe");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("second run after success is a reported no-op via the ledger", async () => {
    const { root, targetPath } = await makeExecFixture();
    try {
      let changeCalls = 0;
      let epicCalls = 0;
      const deps = {
        recreateLiveChange: async () => {
          changeCalls += 1;
        },
        recreateLiveEpic: async () => {
          epicCalls += 1;
        },
      };
      const first = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: async () => [],
        deps,
      });
      expect(first.success).toBe(true);
      expect(first.no_op).toBe(false);
      expect(changeCalls).toBe(1);
      const ledgerAfterFirst = await readLedgerRows(targetPath);

      const second = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: async () => [],
        deps,
      });
      expect(second.success).toBe(true);
      expect(second.no_op).toBe(true);
      expect(second.outcomes?.every((o) => o.status === "skipped")).toBe(true);
      expect(changeCalls).toBe(1);
      expect(epicCalls).toBe(0);
      expect(await readLedgerRows(targetPath)).toHaveLength(
        ledgerAfterFirst.length,
      );
      // No collisions reported on re-run even though items now exist in both.
      expect(second.collisions).toEqual([]);
      ConsolidationReportSchema.parse(second);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("interrupted run resumes: ledgered items are skipped, remainder applied", async () => {
    const { root, sourcePath, targetPath } = await makeExecFixture({
      source: {
        changes: [{ id: "term-a", status: "archived" }],
        archive: ["arch-a"],
      },
      target: { changes: [] },
    });
    try {
      // Simulate a crash AFTER arch-a was fully applied (projection +
      // ledger row) but BEFORE term-a: re-run must skip arch-a and apply
      // term-a only.
      const { cp } = await import("fs/promises");
      await mkdir(join(targetPath, "archive"), { recursive: true });
      await cp(
        join(sourcePath, "archive", "2026-07-01-arch-a"),
        join(targetPath, "archive", "2026-07-01-arch-a"),
        { recursive: true },
      );
      await writeFile(
        join(targetPath, CONSOLIDATION_LEDGER_FILENAME),
        JSON.stringify({
          schema_version: 1,
          source_project_id: EXEC_SOURCE,
          target_project_id: EXEC_TARGET,
          item_id: "arch-a",
          item_kind: "archive_bundle",
          action: "import_projection",
          content_hash: `sha256:${"0".repeat(64)}`,
          plan_hash: `sha256:${"1".repeat(64)}`,
          applied_at: "2026-07-10T00:00:00.000Z",
        }) + "\n",
      );

      const report = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: async () => [],
      });
      expect(report.success).toBe(true);
      expect(report.collisions).toEqual([]);
      const archOutcome = report.outcomes?.find((o) => o.item_id === "arch-a");
      expect(archOutcome?.status).toBe("skipped");
      const termOutcome = report.outcomes?.find((o) => o.item_id === "term-a");
      expect(termOutcome?.status).toBe("applied");
      const rows = await readLedgerRows(targetPath);
      expect(rows.map((r) => r.item_id).sort()).toEqual(["arch-a", "term-a"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("terminal import failure aborts before the live phase", async () => {
    const { root, targetPath } = await makeExecFixture();
    try {
      // A FILE (not dir) squatting on the terminal change's destination:
      // invisible to collision detection (dirs only) but un-copyable.
      await mkdir(join(targetPath, "changes"), { recursive: true });
      await writeFile(join(targetPath, "changes", "term-a"), "squatter");

      let liveCalled = false;
      const report = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: async () => [],
        deps: {
          recreateLiveChange: async () => {
            liveCalled = true;
          },
        },
      });
      expect(liveCalled).toBe(false);
      expect(report.success).toBe(false);
      const failed = report.outcomes?.filter((o) => o.status === "failed");
      expect(failed).toHaveLength(1);
      expect(failed![0]!.item_id).toBe("term-a");
      // Ordering abort: later terminal items were NOT imported.
      expect(
        await pathExists(join(targetPath, "archive", "2026-07-01-arch-a")),
      ).toBe(false);
      expect(
        await pathExists(join(targetPath, "retired-epics", "epic-retired-a")),
      ).toBe(false);
      // No ledger rows — nothing was durably applied.
      expect(await readLedgerRows(targetPath)).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("missing source epic workflow state fails that item without crashing the run", async () => {
    const { root } = await makeExecFixture({
      source: { changes: [{ id: "term-a", status: "archived" }] },
    });
    try {
      const report = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: listSourceLiveEpics,
        deps: {
          queryLiveEpicState: async () => null,
        },
      });
      expect(report.success).toBe(false);
      const epicOutcome = report.outcomes?.find(
        (o) => o.item_id === "epic-live-a",
      );
      expect(epicOutcome?.status).toBe("failed");
      expect(epicOutcome?.error).toMatch(/state/i);
      // Terminal items still applied (they precede the live phase).
      const termOutcome = report.outcomes?.find((o) => o.item_id === "term-a");
      expect(termOutcome?.status).toBe("applied");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("orphan source store is never deleted or truncated", async () => {
    const { root, sourcePath } = await makeExecFixture();
    try {
      const before = await snapshotTree(sourcePath);
      await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: async () => [],
        deps: { recreateLiveChange: async () => {} },
      });
      expect(await snapshotTree(sourcePath)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("tool-level execute succeeds end-to-end without Temporal when no live items exist", async () => {
    const { root, targetPath } = await makeExecFixture({
      source: {
        changes: [{ id: "term-a", status: "archived" }],
        archive: ["arch-a"],
        retiredEpics: ["epic-retired-a"],
        wisdomRows: ["w1"],
      },
      target: { changes: [] },
    });
    try {
      const result = (await executeTool({
        action: "execute",
        source_project_id: EXEC_SOURCE,
        target_project_id: EXEC_TARGET,
        data_home_root: root,
        approvedByUser: true,
        approvalEvidence: "operator approved in test",
      })) as { success: boolean; action: string; error?: string };
      expect(result.action).toBe("execute");
      expect(result.success).toBe(true);
      expect(
        await pathExists(join(targetPath, "changes", "term-a", "change.json")),
      ).toBe(true);
      expect(
        await pathExists(join(targetPath, "archive", "2026-07-01-arch-a")),
      ).toBe(true);
      expect(
        await pathExists(join(targetPath, "retired-epics", "epic-retired-a")),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
