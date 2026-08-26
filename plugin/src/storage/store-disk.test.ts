import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createDiskStore, loadClosedChanges } from "./store-disk";
import { getProjectPaths, listChangeDirs } from "./json";
import { readArtifact } from "../tools/change/artifacts";
import { createInRepoArchive } from "../archive/archive";
import type { Change } from "../types";

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

test("fresh store creates and lists an empty closed directory", async () => {
  const dir = await makeTempProject();
  await createDiskStore(dir);

  const paths = getProjectPaths(dir);

  await expect(listChangeDirs(paths.closed)).resolves.toEqual([]);
  await expect(loadClosedChanges(paths.closed)).resolves.toEqual([]);
});

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

  test("creates artifacts only in change.documents, not active markdown files", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const proposal = "# Projection proposal";
    const agreement = "# Projection agreement";
    const created = await store.changes.create("Projection Change", {
      artifacts: { proposal, agreement },
    });

    const activeDir = join(dir, ".adv/changes", created.changeId);
    expect(await readdir(activeDir)).toEqual(["change.json"]);
    const projection = JSON.parse(
      await readFile(join(activeDir, "change.json"), "utf-8"),
    );
    expect(projection.documents).toMatchObject({ proposal, agreement });

    await expect(
      readArtifact(store, created.changeId, "proposal"),
    ).resolves.toEqual({
      content: proposal,
      source: "active_projection",
    });
    await expect(
      readArtifact(store, created.changeId, "agreement"),
    ).resolves.toEqual({
      content: agreement,
      source: "active_projection",
    });
  });

  test("keeps legacy active markdown readable and archivable with empty projection", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const changeId = "legacy-artifacts";
    const activeDir = join(dir, ".adv/changes", changeId);
    const proposal = "# Legacy proposal";
    await mkdir(activeDir, { recursive: true });
    const legacyChange = {
      id: changeId,
      title: "Legacy artifacts",
      status: "active",
      created_at: new Date().toISOString(),
      tasks: [],
      deltas: {},
      documents: {},
    } as Change;
    await writeFile(
      join(activeDir, "change.json"),
      JSON.stringify(legacyChange),
    );
    await writeFile(join(activeDir, "proposal.md"), proposal);

    await expect(readArtifact(store, changeId, "proposal")).resolves.toEqual({
      content: proposal,
      source: "disk",
    });

    const archivePath = await createInRepoArchive(
      legacyChange,
      join(dir, ".adv/archive"),
      activeDir,
      undefined,
      "2026-05-08T00:00:00.000Z",
    );
    await expect(
      readFile(join(archivePath, "proposal.md"), "utf-8"),
    ).resolves.toBe(proposal);
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
    // Enum narrowed to reachable states — legacy open keys are gone entirely.
    expect(status.changes.byStatus).not.toHaveProperty("active");
    expect(status.changes.byStatus).not.toHaveProperty("pending");
    const counts = Object.values(status.changes.byStatus);
    expect(counts.every(Number.isFinite)).toBe(true);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(2);
  });

  test("status options source-rank before bounded hydration and mark projection reads", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const older = await store.changes.create("Older Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });
    const newer = await store.changes.create("Newer Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });

    for (const [changeId, createdAt] of [
      [older.changeId, "2026-01-01T00:00:00.000Z"],
      [newer.changeId, "2026-01-02T00:00:00.000Z"],
    ] as const) {
      const path = join(dir, ".adv/changes", changeId, "change.json");
      const raw = JSON.parse(await readFile(path, "utf-8"));
      raw.created_at = createdAt;
      await writeFile(path, JSON.stringify(raw, null, 2));
    }

    const projectionState = { loaded: false };
    const status = await store.status({ recentLimit: 1, projectionState });

    expect(projectionState.loaded).toBe(true);
    expect(status.changes.recent).toHaveLength(1);
    expect(status.changes.recent[0]?.id).toBe(newer.changeId);
    expect(status.hydrationStats?.boundedOmitted).toBe(1);
  });
});

describe("store-disk — bundle-dominant terminal self-heal (rq-terminalProjectionTruth01)", () => {
  // Helper: write a minimal archive bundle for a change id under <dir>/.adv/archive/.
  async function writeArchiveBundle(
    dir: string,
    changeId: string,
    overrides: Partial<import("../types").Change> = {},
  ): Promise<void> {
    const archiveEntry = join(dir, ".adv/archive", `2026-07-13-${changeId}`);
    await mkdir(archiveEntry, { recursive: true });
    const now = new Date().toISOString();
    const change: import("../types").Change = {
      id: changeId,
      title: `Archived ${changeId}`,
      status: "archived",
      lifecycleState: "archived",
      created_at: now,
      tasks: [],
      gates: {},
      deltas: {},
      wisdom: [],
      subagent_reports: [],
      ...overrides,
    } as import("../types").Change;
    await writeFile(join(archiveEntry, "change.json"), JSON.stringify(change));
  }

  test("changes.get self-heals to archived when no active record exists but bundle is present", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    await writeArchiveBundle(dir, "wedgeNoActive");

    const result = await store.changes.get("wedgeNoActive");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("wedgeNoActive");
    expect(result.data?.status).toBe("archived");
  });

  test("changes.get forces archived when active record exists with stale status but bundle is present", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    // Create an active record (status defaults to draft/pending via create).
    const created = await store.changes.create("Wedge Stale Active", {
      capability: "test-capability",
      artifacts: { proposal: "# P\n" },
    });
    // Write a bundle for the SAME id — simulates terminal-signal loss after
    // bundle write (active record still present, status never flipped).
    await writeArchiveBundle(dir, created.changeId);

    const result = await store.changes.get(created.changeId);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe(created.changeId);
    expect(result.data?.status).toBe("archived");
  });

  test("changes.get still returns 'Change not found' when neither active record nor bundle exists", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);

    const result = await store.changes.get("trulyMissing");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Change not found");
  });
});

describe("store-disk — closed change read surfaces", () => {
  async function writeClosedBundle(
    dir: string,
    changeId: string,
    overrides: Partial<Change> = {},
  ): Promise<void> {
    const closedDir = join(dir, ".adv/closed", changeId);
    await mkdir(closedDir, { recursive: true });
    const change: Change = {
      id: changeId,
      title: `Closed ${changeId}`,
      status: "closed",
      lifecycleState: "closed",
      created_at: "2026-07-13T00:00:00.000Z",
      tasks: [],
      gates: {},
      deltas: {},
      wisdom: [],
      subagent_reports: [],
      closure: {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "User approved closure.",
        approved_at: "2026-08-26T00:00:00.000Z",
      },
      ...overrides,
    } as Change;
    await writeFile(join(closedDir, "change.json"), JSON.stringify(change));
  }

  test("changes.list includes a closed bundle when includeClosed is true", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    await writeClosedBundle(dir, "closedOnly");

    const result = await store.changes.list({ includeClosed: true });

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "closedOnly", status: "closed" }),
      ]),
    );
  });

  test("changes.get returns closure metadata from a closed bundle", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    await writeClosedBundle(dir, "closedOnly");

    const result = await store.changes.get("closedOnly");

    expect(result.success).toBe(true);
    expect(result.data?.closure).toEqual({
      reason: "not_planned",
      approved_by_user: true,
      approval_evidence: "User approved closure.",
      approved_at: "2026-08-26T00:00:00.000Z",
    });
  });

  test("active records take precedence over closed bundles in list and get", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const active = await store.changes.create("Active record", {});
    await writeClosedBundle(dir, active.changeId, {
      title: "Closed copy",
      closure: {
        reason: "cancelled",
        approved_by_user: true,
        approval_evidence: "Closed copy approval.",
        approved_at: "2026-08-26T00:00:00.000Z",
      },
    });

    const listed = await store.changes.list({ includeClosed: true });
    const listedMatch = listed.changes.filter((c) => c.id === active.changeId);
    const loaded = await store.changes.get(active.changeId);

    expect(listedMatch).toHaveLength(1);
    expect(listedMatch[0]?.title).toBe("Active record");
    expect(listedMatch[0]?.status).toBe("draft");
    expect(loaded.success).toBe(true);
    expect(loaded.data?.title).toBe("Active record");
    expect(loaded.data?.closure).toBeUndefined();
  });

  test("default changes.list excludes closed bundles", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    await writeClosedBundle(dir, "closedOnly");

    const result = await store.changes.list();

    expect(result.changes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "closedOnly" })]),
    );
  });
});

describe("store-disk — init does not run artifact-metadata migration", () => {
  // rq-storeReconcileUnboundedProof01.3: store initialization must not scan
  // projections or write the artifact-metadata completion marker. Convergence
  // is owned by the reconciler (reconcile-action-artifact-metadata), not init.
  test("init() leaves legacy temporal artifact sources untouched and writes no marker", async () => {
    const dir = await makeTempProject();
    // Seed a legacy projection with a temporal artifact source that the
    // removed storage-owned migration would have rewritten + marked complete.
    const changesDir = join(dir, ".adv", "changes");
    await mkdir(join(changesDir, "legacy-change"), { recursive: true });
    await writeFile(
      join(changesDir, "legacy-change", "change.json"),
      JSON.stringify({
        id: "legacy-change",
        title: "legacy-change",
        status: "draft",
        created_at: "2026-01-01T00:00:00.000Z",
        tasks: [],
        deltas: {},
        documents: { proposal: "legacy artifact content" },
        artifacts: {
          proposal: {
            path: "/legacy/legacy-change/proposal.md",
            updatedAt: "2026-01-01T00:00:00.000Z",
            source: "temporal",
            readable: true,
          },
        },
      }),
    );

    const store = await createDiskStore(dir);
    await store.init();

    // init() must not write the artifact-metadata completion marker.
    await expect(
      readFile(
        join(dir, ".adv", "artifact-metadata-migration-complete.json"),
        "utf-8",
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    // And the legacy artifact source must remain unchanged.
    const after = JSON.parse(
      await readFile(join(changesDir, "legacy-change", "change.json"), "utf-8"),
    );
    expect(after.artifacts.proposal.source).toBe("temporal");
  });
});

describe("store-disk — Epic membership write guard (rq-epicMembershipConvergence01)", () => {
  const EPIC = "someEpic";
  const OTHER_EPIC = "otherEpic";
  const T0 = "2026-07-01T00:00:00.000Z";
  const T1 = "2026-07-02T00:00:00.000Z";

  function membership(
    epicId: string,
    entryId: string,
    linkedAt: string,
  ): NonNullable<Change["epic_membership"]> {
    return {
      epic_id: epicId,
      entry_id: entryId,
      order: 0,
      title: "Linked",
      linked_at: linkedAt,
    };
  }

  async function seed(linkedAt: string = T0): Promise<{
    store: Awaited<ReturnType<typeof createDiskStore>>;
    id: string;
  }> {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const created = await store.changes.create("Guarded Change", {});
    await store.changes.setEpicMembership(created.changeId, {
      membership: membership(EPIC, "entry-1", linkedAt),
    });
    return { store, id: created.changeId };
  }

  test("an absent projection is not a conflict", async () => {
    // Fresh links and move-after-clear both arrive with an expectation but no
    // current projection. Refusing here would break them.
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const created = await store.changes.create("Fresh Link", {});

    const written = await store.changes.setEpicMembership(created.changeId, {
      membership: membership(EPIC, "entry-1", T0),
      expectedCurrent: { epic_id: EPIC, entry_id: "entry-1" },
      setAt: T0,
    });

    expect(written?.epic_membership?.entry_id).toBe("entry-1");
  });

  test("a mismatched expectation is refused and preserves the projection", async () => {
    const { store, id } = await seed();

    await expect(
      store.changes.setEpicMembership(id, {
        membership: membership(OTHER_EPIC, "entry-9", T1),
        expectedCurrent: { epic_id: OTHER_EPIC, entry_id: "entry-9" },
        setAt: T1,
      }),
    ).rejects.toMatchObject({ code: "epic_membership_conflict" });

    const after = await store.changes.get(id);
    expect(after.data?.epic_membership).toMatchObject({
      epic_id: EPIC,
      entry_id: "entry-1",
    });
  });

  test("a matching expectation writes", async () => {
    const { store, id } = await seed();

    const written = await store.changes.setEpicMembership(id, {
      membership: membership(EPIC, "entry-1", T1),
      expectedCurrent: { epic_id: EPIC, entry_id: "entry-1" },
      setAt: T1,
    });

    expect(written?.epic_membership?.linked_at).toBe(T1);
  });

  test("an equal setAt writes so idempotent convergence is not starved", async () => {
    const { store, id } = await seed(T0);

    const written = await store.changes.setEpicMembership(id, {
      membership: membership(EPIC, "entry-1", T0),
      setAt: T0,
    });

    expect(written?.epic_membership?.linked_at).toBe(T0);
  });

  test("a strictly older setAt is refused as a stale write", async () => {
    const { store, id } = await seed(T1);

    await expect(
      store.changes.setEpicMembership(id, {
        membership: membership(EPIC, "entry-1", T0),
        setAt: T0,
      }),
    ).rejects.toMatchObject({ code: "epic_membership_stale_write" });

    const after = await store.changes.get(id);
    expect(after.data?.epic_membership?.linked_at).toBe(T1);
  });

  test("no expectation overwrites unconditionally, which convergence relies on", async () => {
    const { store, id } = await seed();

    const written = await store.changes.setEpicMembership(id, {
      membership: membership(OTHER_EPIC, "entry-9", T1),
    });

    expect(written?.epic_membership).toMatchObject({
      epic_id: OTHER_EPIC,
      entry_id: "entry-9",
    });
  });

  test("clearEpicMembership refuses a mismatch with a typed conflict", async () => {
    const { store, id } = await seed();

    await expect(
      store.changes.clearEpicMembership(id, {
        expected: { epic_id: OTHER_EPIC, entry_id: "entry-9" },
      }),
    ).rejects.toMatchObject({ code: "epic_membership_conflict" });

    const after = await store.changes.get(id);
    expect(after.data?.epic_membership).toBeDefined();
  });

  test("clearEpicMembership removes a matching projection", async () => {
    const { store, id } = await seed();

    await store.changes.clearEpicMembership(id, {
      expected: { epic_id: EPIC, entry_id: "entry-1" },
    });

    const after = await store.changes.get(id);
    expect(after.data?.epic_membership).toBeUndefined();
  });
});
