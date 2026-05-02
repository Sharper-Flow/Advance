/**
 * adv_archive_purge tests (rq-archivePurge01)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdir, writeFile, access } from "fs/promises";

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  terminate: vi.fn(async () => {}),
  executeUpdate: vi.fn(async () => undefined),
  appendDebugLog: vi.fn(),
  getHandle: vi.fn(),
}));

// Mock the temporal service layer so the tool can reach a stub client
// without needing a running Temporal server.
vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../utils/debug-log", async () => {
  const actual =
    await vi.importActual<typeof import("../utils/debug-log")>(
      "../utils/debug-log",
    );
  return {
    ...actual,
    appendDebugLog: mocks.appendDebugLog,
  };
});

import { archivePurgeTools } from "./archive-purge";
import type { Store } from "../storage/store";
import type { Change } from "../types";

// =============================================================================
// Test helpers
// =============================================================================

interface StubStoreOptions {
  change?: Change | null;
  externalDir: string;
  archiveDir: string;
  changesDir?: string;
}

function makeStubStore(opts: StubStoreOptions): Store {
  return {
    paths: {
      root: "/tmp/repo",
      specs: "/tmp/repo/.adv/specs",
      docs: "/tmp/repo/docs/specs",
      config: "/tmp/repo/project.json",
      changes: opts.changesDir ?? join(opts.externalDir, "changes"),
      archive: opts.archiveDir,
      db: join(opts.externalDir, "db"),
      wisdom: join(opts.externalDir, "wisdom.jsonl"),
      agenda: join(opts.externalDir, "agenda.jsonl"),
      projectMetadata: join(opts.externalDir, "project-metadata.json"),
      external: opts.externalDir,
    },
    config: null,
    init: async () => {},
    sync: async () => {},
    close: () => {},
    flush: async () => {},
    changes: {
      get: vi.fn(async (changeId: string) => {
        if (opts.change && opts.change.id === changeId) {
          return { success: true, data: opts.change };
        }
        return { success: true, data: null };
      }),
    } as unknown as Store["changes"],
    specs: {} as Store["specs"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
  } as unknown as Store;
}

function makeArchivedChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: id,
    status: "archived",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [],
    deltas: {},
    validation: {
      checked_against_specs: [],
      conflicts: [],
      warnings: [],
      validated_at: "2026-01-01T00:00:00Z",
    },
  } as unknown as Change;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("adv_archive_purge", () => {
  let externalDir: string;
  let archiveDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    externalDir = `/tmp/adv-purge-test-${Math.random().toString(36).slice(2)}`;
    archiveDir = join(externalDir, "archive");
    await mkdir(archiveDir, { recursive: true });

    // Default Temporal client stub: getHandle returns a handle with mock
    // terminate + executeUpdate. Tests can override per-case.
    mocks.getHandle.mockImplementation(() => ({
      terminate: mocks.terminate,
      executeUpdate: mocks.executeUpdate,
    }));
    mocks.getService.mockReturnValue({
      address: "127.0.0.1:7233",
      namespace: "default",
      client: {
        workflow: {
          getHandle: mocks.getHandle,
        },
      },
    });
  });

  afterEach(async () => {
    await import("fs/promises").then((m) =>
      m.rm(externalDir, { recursive: true, force: true }),
    );
  });

  it("workflow-only purge by default: terminates + signals + preserves disk bundle", async () => {
    const id = "archivedFeature";
    // Create disk archive bundle so the audit-trail invariant is satisfied.
    const bundleDir = join(archiveDir, id);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "change.json"), `{"id":"${id}"}`);
    await writeFile(join(bundleDir, "proposal.md"), "# Test");

    const store = makeStubStore({
      change: makeArchivedChange(id),
      externalDir,
      archiveDir,
    });

    const result = await archivePurgeTools.adv_archive_purge.execute(
      { changeId: id },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.purged).toBe(id);
    expect(parsed.terminated).toBe(true);
    expect(parsed.diskRemoved).toBe(false);

    // Terminate-then-update ordering: terminate called before executeUpdate.
    expect(mocks.terminate).toHaveBeenCalledWith("adv_archive_purge");
    expect(mocks.executeUpdate).toHaveBeenCalledWith(
      "adv.project.purgeChangeSummary",
      { args: [{ changeId: id }] },
    );
    const terminateOrder = mocks.terminate.mock.invocationCallOrder[0];
    const updateOrder = mocks.executeUpdate.mock.invocationCallOrder[0];
    expect(terminateOrder).toBeLessThan(updateOrder);

    // Disk bundle preserved.
    expect(await fileExists(join(bundleDir, "change.json"))).toBe(true);
  });

  it("includeDiskBundle:true also removes disk bundle", async () => {
    const id = "archivedFeatureDisk";
    const bundleDir = join(archiveDir, id);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "change.json"), `{"id":"${id}"}`);

    const store = makeStubStore({
      change: makeArchivedChange(id),
      externalDir,
      archiveDir,
    });

    const result = await archivePurgeTools.adv_archive_purge.execute(
      { changeId: id, includeDiskBundle: true },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.diskRemoved).toBe(true);
    expect(await fileExists(bundleDir)).toBe(false);
  });

  it("refuses non-archived change", async () => {
    const id = "activeChange";
    const change = makeArchivedChange(id);
    (change as { status: string }).status = "active";

    const store = makeStubStore({
      change,
      externalDir,
      archiveDir,
    });

    const result = await archivePurgeTools.adv_archive_purge.execute(
      { changeId: id },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBeUndefined();
    expect(parsed.errorClass).toBe("InvalidChangeStatus");
    expect(parsed.error).toMatch(/non-archived/i);
    expect(mocks.terminate).not.toHaveBeenCalled();
    expect(mocks.executeUpdate).not.toHaveBeenCalled();
  });

  it("refuses unknown changeId", async () => {
    const store = makeStubStore({
      change: null,
      externalDir,
      archiveDir,
    });

    const result = await archivePurgeTools.adv_archive_purge.execute(
      { changeId: "doesNotExist" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.errorClass).toBe("ChangeNotFound");
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  it("refuses when neither workflow state nor disk bundle would survive", async () => {
    // Archived change with NO disk bundle, includeDiskBundle defaulted to false.
    // Audit history would be wiped without explicit opt-in → refuse.
    const id = "archivedNoBundle";
    const store = makeStubStore({
      change: makeArchivedChange(id),
      externalDir,
      archiveDir,
    });

    const result = await archivePurgeTools.adv_archive_purge.execute(
      { changeId: id },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.errorClass).toBe("AuditBundleMissing");
    expect(parsed.error).toMatch(/audit/i);
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  it("StslNotInitialized is surfaced cleanly", async () => {
    mocks.getService.mockReturnValueOnce(null);
    const id = "archivedFeatureNoStsl";
    const bundleDir = join(archiveDir, id);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "change.json"), `{"id":"${id}"}`);

    const store = makeStubStore({
      change: makeArchivedChange(id),
      externalDir,
      archiveDir,
    });

    const result = await archivePurgeTools.adv_archive_purge.execute(
      { changeId: id },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.errorClass).toBe("StslNotInitialized");
  });

  it("benign 'workflow not found' on terminate is treated as success", async () => {
    mocks.terminate.mockImplementationOnce(async () => {
      throw new Error("workflow execution not found");
    });

    const id = "alreadyGone";
    const bundleDir = join(archiveDir, id);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "change.json"), `{"id":"${id}"}`);

    const store = makeStubStore({
      change: makeArchivedChange(id),
      externalDir,
      archiveDir,
    });

    const result = await archivePurgeTools.adv_archive_purge.execute(
      { changeId: id },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.terminated).toBe(false); // workflow was already gone
    expect(mocks.executeUpdate).toHaveBeenCalled(); // proceeded with registry purge
  });

  it("non-benign terminate failure surfaces as TerminateFailed", async () => {
    mocks.terminate.mockImplementationOnce(async () => {
      throw new Error("connection refused");
    });

    const id = "connFail";
    const bundleDir = join(archiveDir, id);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "change.json"), `{"id":"${id}"}`);

    const store = makeStubStore({
      change: makeArchivedChange(id),
      externalDir,
      archiveDir,
    });

    const result = await archivePurgeTools.adv_archive_purge.execute(
      { changeId: id },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.errorClass).toBe("TerminateFailed");
    expect(parsed.error).toMatch(/connection refused/);
    expect(mocks.executeUpdate).not.toHaveBeenCalled();
  });

  it("PurgeUpdateFailed reports terminated:true when terminate succeeded but update failed", async () => {
    mocks.executeUpdate.mockImplementationOnce(async () => {
      throw new Error("workflow update timeout");
    });

    const id = "updateFail";
    const bundleDir = join(archiveDir, id);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "change.json"), `{"id":"${id}"}`);

    const store = makeStubStore({
      change: makeArchivedChange(id),
      externalDir,
      archiveDir,
    });

    const result = await archivePurgeTools.adv_archive_purge.execute(
      { changeId: id },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.errorClass).toBe("PurgeUpdateFailed");
    expect(parsed.terminated).toBe(true);
  });
});
