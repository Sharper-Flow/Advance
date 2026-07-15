import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, access, readdir } from "fs/promises";
import { join } from "path";
import { changeTools } from "./change";
import type { Change } from "../types";
import type { Store } from "../storage/store";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  getProjectId: vi.fn(),
  getChangeHandle: vi.fn(),
  terminate: vi.fn(),
}));

const PURGE_EVIDENCE = "Operator approved purge of archived change";

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

vi.mock("./_adapters", async () => {
  const actual =
    await vi.importActual<typeof import("./_adapters")>("./_adapters");
  return {
    ...actual,
    getChangeHandle: mocks.getChangeHandle,
  };
});

function archivedChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "purgedChange",
    title: "Purged change",
    status: "archived",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    ...overrides,
  } as Change;
}

function createMockStore(
  change: Change | null,
  paths: { archive: string; changes: string },
): Store {
  return {
    paths: {
      root: "/tmp/main",
      changes: paths.changes,
      archive: paths.archive,
    } as Store["paths"],
    config: { name: "test", features: {} } as Store["config"],
    changes: {
      get: vi.fn(async (changeId: string) => ({
        success: true,
        data: change && change.id === changeId ? change : null,
      })),
      refresh: vi.fn(async () => undefined),
    } as unknown as Store["changes"],
  } as unknown as Store;
}

async function seedArchiveBundle(
  archiveDir: string,
  changeId: string,
): Promise<string> {
  const bundleDir = join(archiveDir, `2026-01-01-${changeId}`);
  await mkdir(bundleDir, { recursive: true });
  await writeFile(
    join(bundleDir, "change.json"),
    JSON.stringify(archivedChange({ id: changeId })),
  );
  return bundleDir;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("adv_archive_purge", () => {
  let tempDir: string;
  let archiveDir: string;
  let changesDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await createTempDir();
    archiveDir = join(tempDir, "archive");
    changesDir = join(tempDir, "changes");
    await mkdir(archiveDir, { recursive: true });
    await mkdir(changesDir, { recursive: true });
    mocks.getService.mockReturnValue({ client: { workflow: {} } });
    mocks.getProjectId.mockResolvedValue("test-project-id");
    mocks.getChangeHandle.mockReturnValue({
      terminate: mocks.terminate,
      signal: vi.fn(),
      query: vi.fn(),
    });
    mocks.terminate.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("refuses unknown changeId with structured error and no mutations", async () => {
    const store = createMockStore(null, {
      archive: archiveDir,
      changes: changesDir,
    });

    const result = await changeTools.adv_archive_purge.execute(
      {
        changeId: "ghost",
        approvedByUser: true,
        approvalEvidence: PURGE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not found/i);
    expect(mocks.getChangeHandle).not.toHaveBeenCalled();
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test.each(["draft", "closed"] as const)(
    "refuses non-archived (%s) change with structured error and no mutations",
    async (status) => {
      const store = createMockStore(archivedChange({ status }), {
        archive: archiveDir,
        changes: changesDir,
      });

      const result = await changeTools.adv_archive_purge.execute(
        {
          changeId: "purgedChange",
          approvedByUser: true,
          approvalEvidence: PURGE_EVIDENCE,
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toMatch(/archived/i);
      expect(parsed.currentStatus).toBe(status);
      expect(mocks.terminate).not.toHaveBeenCalled();
    },
  );

  test("rejects blank approvalEvidence before any mutation", async () => {
    const store = createMockStore(archivedChange(), {
      archive: archiveDir,
      changes: changesDir,
    });

    const result = await changeTools.adv_archive_purge.execute(
      {
        changeId: "purgedChange",
        approvedByUser: true,
        approvalEvidence: "   ",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/approvalEvidence/);
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("rejects approvedByUser !== true before any mutation", async () => {
    const store = createMockStore(archivedChange(), {
      archive: archiveDir,
      changes: changesDir,
    });

    const result = await changeTools.adv_archive_purge.execute(
      {
        changeId: "purgedChange",
        approvedByUser: false as unknown as true,
        approvalEvidence: PURGE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/approvedByUser/);
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  test("default purge terminates workflow and preserves disk bundle", async () => {
    const change = archivedChange();
    const store = createMockStore(change, {
      archive: archiveDir,
      changes: changesDir,
    });
    const bundleDir = await seedArchiveBundle(archiveDir, change.id);

    const result = await changeTools.adv_archive_purge.execute(
      {
        changeId: change.id,
        approvedByUser: true,
        approvalEvidence: PURGE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe(change.id);
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.bundleRemoved).toBe(false);
    expect(parsed.archivedPath).toBe(bundleDir);
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
    expect(typeof mocks.terminate.mock.calls[0][0]).toBe("string");
    // rq-archivePurge01.1: disk bundle preserved — adv_change_show keeps
    // returning content from the on-disk projection.
    expect(await pathExists(join(bundleDir, "change.json"))).toBe(true);
    expect(store.changes.refresh).toHaveBeenCalledWith(change.id);
  });

  test("includeDiskBundle:true terminates and recursively removes bundle + disk projection", async () => {
    const change = archivedChange();
    const store = createMockStore(change, {
      archive: archiveDir,
      changes: changesDir,
    });
    const bundleDir = await seedArchiveBundle(archiveDir, change.id);
    // Legacy dir snapshot + flat workflow projection file.
    const legacyDir = join(changesDir, change.id);
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, "change.json"), JSON.stringify(change));
    const flatProjection = join(changesDir, `${change.id}.json`);
    await writeFile(flatProjection, JSON.stringify({ schemaVersion: 2 }));

    const result = await changeTools.adv_archive_purge.execute(
      {
        changeId: change.id,
        includeDiskBundle: true,
        approvedByUser: true,
        approvalEvidence: PURGE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.bundleRemoved).toBe(true);
    expect(parsed.archivedPath).toBe(bundleDir);
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
    // rq-archivePurge01.2: archive/<id>/ recursively removed; subsequent
    // adv_change_show hits the not-found path (no bundle, no disk
    // projection, no live workflow, nothing to re-seed from).
    expect(await pathExists(bundleDir)).toBe(false);
    expect(await pathExists(legacyDir)).toBe(false);
    expect(await pathExists(flatProjection)).toBe(false);
    expect(await readdir(archiveDir)).toEqual([]);
  });

  test("treats WorkflowNotFoundError from terminate as idempotent success", async () => {
    const change = archivedChange();
    const store = createMockStore(change, {
      archive: archiveDir,
      changes: changesDir,
    });
    const bundleDir = await seedArchiveBundle(archiveDir, change.id);
    const notFound = new Error("workflow not found");
    notFound.name = "WorkflowNotFoundError";
    mocks.terminate.mockRejectedValue(notFound);

    const result = await changeTools.adv_archive_purge.execute(
      {
        changeId: change.id,
        approvedByUser: true,
        approvalEvidence: PURGE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.workflowTerminated).toBe(true);
    expect(parsed.alreadyTerminated).toBe(true);
    expect(await pathExists(join(bundleDir, "change.json"))).toBe(true);
  });

  test("returns structured error when Temporal service is unavailable", async () => {
    const change = archivedChange();
    const store = createMockStore(change, {
      archive: archiveDir,
      changes: changesDir,
    });
    const bundleDir = await seedArchiveBundle(archiveDir, change.id);
    mocks.getService.mockReturnValue(null);

    const result = await changeTools.adv_archive_purge.execute(
      {
        changeId: change.id,
        approvedByUser: true,
        approvalEvidence: PURGE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/Temporal/i);
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(await pathExists(join(bundleDir, "change.json"))).toBe(true);
  });

  test("returns structured error when terminate fails with a non-not-found error", async () => {
    const change = archivedChange();
    const store = createMockStore(change, {
      archive: archiveDir,
      changes: changesDir,
    });
    const bundleDir = await seedArchiveBundle(archiveDir, change.id);
    mocks.terminate.mockRejectedValue(new Error("connection refused"));

    const result = await changeTools.adv_archive_purge.execute(
      {
        changeId: change.id,
        includeDiskBundle: true,
        approvedByUser: true,
        approvalEvidence: PURGE_EVIDENCE,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.workflowTerminated).toBe(false);
    expect(parsed.error).toMatch(/connection refused/);
    // Bundle preserved on terminate failure — no partial purge.
    expect(await pathExists(join(bundleDir, "change.json"))).toBe(true);
  });
});
