import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createDiskStore } from "./store-disk";

async function makeTempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adv-store-disk-"));
  await writeFile(
    join(dir, "project.json"),
    JSON.stringify({
      name: "store-disk-test",
      version: "0.1.0",
      specs_dir: ".adv/specs",
      changes_dir: ".adv/changes",
      archive_dir: ".adv/archive",
      docs_dir: "docs/specs",
      db_dir: ".adv/db",
    }),
  );
  return dir;
}

function makeEpic(): import("../types").Epic {
  const now = new Date().toISOString();
  return {
    id: "retiredEpic",
    title: "Retired Epic",
    narrative: "Narrative.",
    entries: [],
    progress: {
      status: "completed",
      total_entries: 0,
      completed_entries: 0,
      active_entries: 0,
      next_entry_id: null,
      updated_at: now,
    },
    created_at: now,
    updated_at: now,
    version: 3,
  };
}

describe("store-disk — bounded warnings + monotonic IDs", () => {
  let originalAdvDebug: string | undefined;

  beforeEach(() => {
    originalAdvDebug = process.env.ADV_DEBUG;
    process.env.ADV_DEBUG = "1";
  });

  afterEach(() => {
    process.env.ADV_DEBUG = originalAdvDebug;
    vi.restoreAllMocks();
  });

  test("wisdom.search warns on unreadable project wisdom and returns change wisdom", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const created = await store.changes.create("Test Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });
    await store.wisdom.add(
      created.changeId,
      "pattern",
      "change-local wisdom",
      undefined,
      {},
    );

    // Replace the wisdom JSONL file with a directory to force a read failure.
    await mkdir(join(dir, ".adv/wisdom.jsonl"), { recursive: true });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await store.wisdom.search("wisdom");

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]!.content).toBe("change-local wisdom");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Project wisdom read failed"),
    );
  });

  test("wisdom.listAll warns on unreadable project wisdom and returns change wisdom", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const created = await store.changes.create("Test Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });
    await store.wisdom.add(
      created.changeId,
      "pattern",
      "change-local wisdom",
      undefined,
      {},
    );

    await mkdir(join(dir, ".adv/wisdom.jsonl"), { recursive: true });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await store.wisdom.listAll();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]!.content).toBe("change-local wisdom");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Project wisdom read failed"),
    );
  });

  test("tasks.add uses monotonic tk-{ts}-{seq} IDs", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const created = await store.changes.create("Test Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });

    const t1 = await store.tasks.add(created.changeId, "First task", {});
    const t2 = await store.tasks.add(created.changeId, "Second task", {});

    expect(t1.id).toMatch(/^tk-\d+-\d+$/);
    expect(t2.id).toMatch(/^tk-\d+-\d+$/);

    const [, ts1, seq1] = t1.id.split("-");
    const [, ts2, seq2] = t2.id.split("-");
    if (ts1 === ts2) {
      expect(Number(seq2)).toBeGreaterThan(Number(seq1));
    } else {
      expect(Number(ts2)).toBeGreaterThanOrEqual(Number(ts1));
    }
  });

  test("epics.get returns retired projection from disk", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const epic = makeEpic();
    const projection = {
      epic_snapshot: epic,
      retired_at: "2026-07-08T00:00:00.000Z",
      retired_by: "agent",
      evidence: "User approved retirement.",
      source_workflow_id: "adv/epic/project-id/retiredEpic",
      source_version: 3,
      projection_status: "retired" as const,
    };

    await store.epics.saveRetiredProjection("retiredEpic", projection);
    const result = await store.epics.get("retiredEpic");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("retiredEpic");
    expect(result.data?.title).toBe("Retired Epic");
    expect(result.source).toBe("retired_projection");
  });

  test("epics.get returns null when no retired projection exists", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const result = await store.epics.get("nonExistentEpic");
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  test("status() normalizes legacy on-disk status and keeps byStatus counts finite", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    await store.changes.create("First Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });
    const second = await store.changes.create("Second Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });

    // Poison one on-disk record with a legacy stored status. No code path
    // writes "active" anymore; the load-path normalizer maps it to "draft"
    // so status views never see the legacy value.
    const poisonedPath = join(
      dir,
      ".adv/changes",
      second.changeId,
      "change.json",
    );
    const raw = JSON.parse(await readFile(poisonedPath, "utf-8"));
    raw.status = "active";
    await writeFile(poisonedPath, JSON.stringify(raw, null, 2));

    const status = await store.status();

    expect(status.changes.byStatus.draft).toBe(2);
    expect(status.changes.byStatus.active).toBe(0);
    const counts = Object.values(status.changes.byStatus);
    expect(counts.every(Number.isFinite)).toBe(true);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(2);
  });
});
