/**
 * adv_store_consolidate — execute-phase Temporal bundle lifecycle tests
 * (rq-storeConsolidation01; reviewer follow-up on tk-36ce494039f7).
 *
 * These tests exercise the DEFAULT (non-injected) execute path with the
 * Temporal client bundle module-mocked, proving:
 *  1. exactly one client bundle is created per execute run — the lazy
 *     singleton is shared by live-change recreation AND the live-Epic
 *     query/recreation path;
 *  2. `connection.close()` is awaited exactly once and
 *     `executeConsolidation` does not resolve until the close promise has
 *     settled (a fire-and-forget close would let the report resolve while
 *     the connection is still closing);
 *  3. a live Epic whose default state query exceeds the host-side bound
 *     produces a typed failed outcome with NO Epic recreation and NO ledger
 *     row — and the bundle is still created once and closed exactly once.
 *
 * Fixtures use temp data-home roots; real XDG stores are never touched.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  executeConsolidation,
  CONSOLIDATION_LEDGER_FILENAME,
  ConsolidationLedgerRowSchema,
  type ConsolidationLedgerRow,
} from "./store-consolidate";
import { buildEpicWorkflowId } from "../temporal/client";
import {
  ensureChangeWorkflowStarted,
  ensureEpicWorkflowStarted,
} from "../temporal/workflow-start";
import type { EpicWorkflowState } from "../temporal/contracts";

const createBundleMock = vi.hoisted(() => vi.fn());

vi.mock("../temporal/operations", async () => {
  const actual = await vi.importActual<typeof import("../temporal/operations")>(
    "../temporal/operations",
  );
  return {
    ...actual,
    TemporalOperationsOwner: class extends actual.TemporalOperationsOwner {
      static async fromEnv(
        projectId: string,
        _env?: NodeJS.ProcessEnv,
      ): Promise<actual.TemporalOperationsOwner> {
        return new actual.TemporalOperationsOwner(
          await createBundleMock(),
          projectId,
        );
      }
    },
  };
});

vi.mock("../temporal/workflow-start", () => ({
  ensureChangeWorkflowStarted: vi.fn(async () => undefined),
  ensureEpicWorkflowStarted: vi.fn(async () => undefined),
}));

const ensureChangeStartedMock = vi.mocked(ensureChangeWorkflowStarted);
const ensureEpicStartedMock = vi.mocked(ensureEpicWorkflowStarted);

// =============================================================================
// Fixtures
// =============================================================================

const EXEC_SOURCE = "b".repeat(40);
const EXEC_TARGET = "c".repeat(40);
const SHARD = "a".repeat(40);

function shardStorePath(dataHomeRoot: string, projectId: string): string {
  return join(
    dataHomeRoot,
    "opencode-projects",
    SHARD,
    "opencode/plugins/advance",
    projectId,
  );
}

function legacyStorePath(dataHomeRoot: string, projectId: string): string {
  return join(dataHomeRoot, "opencode/plugins/advance", projectId);
}

async function writeChangeDir(
  storeDir: string,
  change: { id: string; status: string },
): Promise<void> {
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

interface LifecycleFixture {
  root: string;
  sourcePath: string;
  targetPath: string;
}

async function makeLifecycleFixture(
  sourceChanges: {
    id: string;
    status: string;
  }[],
): Promise<LifecycleFixture> {
  const root = await mkdtemp(join(tmpdir(), "adv-consol-lifecycle-"));
  const sourcePath = shardStorePath(root, EXEC_SOURCE);
  const targetPath = legacyStorePath(root, EXEC_TARGET);
  for (const change of sourceChanges) {
    await writeChangeDir(sourcePath, change);
  }
  // Pre-existing target store content (no ID collisions with the source).
  await writeChangeDir(targetPath, { id: "target-existing", status: "active" });
  return { root, sourcePath, targetPath };
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

function makeEpicState(): EpicWorkflowState {
  return {
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
      entries: [],
      progress: {
        status: "active",
        total_entries: 0,
        completed_entries: 0,
        active_entries: 0,
        next_entry_id: null,
        updated_at: "2026-06-02T00:00:00.000Z",
      },
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-02T00:00:00.000Z",
      version: 1,
    },
    idempotencyLedger: {},
    lastSignalAt: "2026-06-02T00:00:00.000Z",
  } as unknown as EpicWorkflowState;
}

function makeBundle(opts: {
  query: () => Promise<unknown>;
  close: () => Promise<void>;
}) {
  const getHandle = vi.fn(() => ({ query: vi.fn(opts.query) }));
  return {
    address: "mock:7233",
    namespace: "mock",
    connection: {
      withDeadline: vi.fn(
        async (_deadline: number, fn: () => Promise<unknown>) => fn(),
      ),
      withAbortSignal: vi.fn(
        async (_signal: AbortSignal, fn: () => Promise<unknown>) => fn(),
      ),
      close: vi.fn(opts.close),
    },
    client: { workflow: { getHandle, start: vi.fn() } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Tests
// =============================================================================

describe("executeConsolidation — Temporal bundle lifecycle (default path)", () => {
  test("one bundle is created and connection.close is awaited exactly once before the report resolves", async () => {
    const { root, targetPath } = await makeLifecycleFixture([
      { id: "live-a", status: "active" },
    ]);
    try {
      // Deferred close: the test controls when the async close settles, so
      // the report's resolution ordering relative to it is observable.
      let resolveClose!: () => void;
      const closeGate = new Promise<void>((resolve) => {
        resolveClose = resolve;
      });
      let closeSettled = false;
      const bundle = makeBundle({
        query: async () => makeEpicState(),
        close: async () => {
          await closeGate;
          closeSettled = true;
        },
      });
      createBundleMock.mockResolvedValue(bundle as never);

      const execPromise = executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: listSourceLiveEpics,
      });

      // The finally block must close both owners. In this test both owners
      // receive the same mocked bundle, so the shared connection close is
      // awaited twice.
      await vi.waitFor(() =>
        expect(bundle.connection.close).toHaveBeenCalledTimes(2),
      );

      // While the close is still pending the report promise must NOT have
      // resolved — proving the close is awaited, not fire-and-forget.
      let execResolved = false;
      void execPromise.then(() => {
        execResolved = true;
      });
      await new Promise((r) => setTimeout(r, 25));
      expect(execResolved).toBe(false);

      resolveClose();
      const report = await execPromise;
      expect(closeSettled).toBe(true);

      // Two bundles are created: one bound to the source project for the live
      // Epic query, and one bound to the target project for live recreation.
      // Because the test uses a single mocked bundle object, the shared close
      // is awaited twice.
      expect(createBundleMock).toHaveBeenCalledTimes(2);
      expect(bundle.connection.close).toHaveBeenCalledTimes(2);
      expect(ensureChangeStartedMock).toHaveBeenCalledTimes(1);
      expect(ensureEpicStartedMock).toHaveBeenCalledTimes(1);
      expect(bundle.client.workflow.getHandle).toHaveBeenCalledWith(
        buildEpicWorkflowId(EXEC_SOURCE, "epic-live-a"),
      );
      expect(report.success).toBe(true);

      const rows = await readLedgerRows(targetPath);
      expect(rows.find((r) => r.item_id === "live-a")?.item_kind).toBe(
        "change_live",
      );
      expect(rows.find((r) => r.item_id === "epic-live-a")?.item_kind).toBe(
        "epic_live",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a timed-out default Epic query produces no recreation and no ledger row, with the bundle still created once and closed once", async () => {
    const { root, targetPath } = await makeLifecycleFixture([
      { id: "term-a", status: "archived" },
    ]);
    try {
      // Hung query: simulates a Temporal WorkflowHandle.query that never
      // answers within the host-side bound.
      const bundle = makeBundle({
        query: () => new Promise(() => {}),
        close: async () => undefined,
      });
      createBundleMock.mockResolvedValue(bundle as never);

      const report = await executeConsolidation({
        sourceProjectId: EXEC_SOURCE,
        targetProjectId: EXEC_TARGET,
        dataHomeRoot: root,
        approvedByUser: true,
        approvalEvidence: "test approval",
        listLiveEpicIds: listSourceLiveEpics,
        // Only the bound is injected — query + recreation stay on the
        // DEFAULT Temporal-bundle path under test.
        deps: { epicQueryTimeoutMs: 5 },
      });

      expect(report.success).toBe(false);
      const epicOutcome = report.outcomes?.find(
        (o) => o.item_id === "epic-live-a",
      );
      expect(epicOutcome?.status).toBe("failed");
      expect(epicOutcome?.error).toMatch(/timed out/i);

      // No recreation was attempted for the timed-out Epic.
      expect(ensureEpicStartedMock).not.toHaveBeenCalled();
      expect(ensureChangeStartedMock).not.toHaveBeenCalled();

      // Ledger-after-success: no row for the timed-out Epic; the terminal
      // import (phase 1, before the live phase) is still recorded.
      const rows = await readLedgerRows(targetPath);
      expect(rows.find((r) => r.item_id === "epic-live-a")).toBeUndefined();
      expect(rows.find((r) => r.item_id === "term-a")?.item_kind).toBe(
        "change_terminal",
      );

      // Lifecycle: one bundle, used by the default query path, closed once.
      expect(createBundleMock).toHaveBeenCalledTimes(1);
      expect(bundle.client.workflow.getHandle).toHaveBeenCalledWith(
        buildEpicWorkflowId(EXEC_SOURCE, "epic-live-a"),
      );
      expect(bundle.connection.close).toHaveBeenCalledTimes(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 3000);
});
