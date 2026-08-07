/** Host-cap and corpus-pressure tests for disk-backed adv_status. */

process.env.ADV_TOOL_MAX_CHARS = "1000000";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
import { createDiskStore } from "../storage/store-disk";
import type { Store } from "../storage/store";
import { statusTools } from "./status";

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: vi.fn(async () => ({
    total: 0,
    stale: [],
    records: [],
    warnings: [],
  })),
}));
vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: vi.fn(async () => ({
    schema_version: 1,
    scan_duration_ms: 0,
    scope: "project",
    project_id: "unknown",
    summary: {
      projects_scanned: 0,
      bare_repos_scanned: 0,
      critical: 0,
      warnings: 0,
      info: 0,
    },
    findings: [],
  })),
}));
vi.mock("../utils/plugin-runtime-info", () => ({
  getPluginRuntimeInfo: vi.fn(async () => ({ loaded_module_path: "test" })),
}));
vi.mock("./session/index", () => ({
  listPeerSessions: vi.fn(async () => ({ sessions: [] })),
}));
vi.mock("../utils/tool-lane-projection", () => ({
  getLaneProjections: vi.fn(async () => ({})),
  resetLaneProjectionsCache: vi.fn(),
}));
vi.mock("../utils/opencode-session-debt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/opencode-session-debt")>()),
  scanOpenCodeSessionDebt: vi.fn(async () => ({ available: false })),
}));

const VIEWS = ["summary", "health", "changes", "hygiene"] as const;
const DELAY_MS = 600;

function makeChange(id: string, status: "draft" | "archived", index: number) {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return {
    id,
    title: `${status} ${id}`,
    status,
    created_at: timestamp,
    lastSignalAt: timestamp,
    tasks: [],
    deltas: {},
    gates: {},
    wisdom: [],
  };
}

async function delayedStore(root: string): Promise<Store> {
  const store = await createDiskStore(root);
  const status = store.status.bind(store);
  store.status = async (options) => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    return status(options);
  };
  return store;
}

describe("adv_status host cap", () => {
  let tempDir: string;
  let store: Store | undefined;

  beforeEach(async () => {
    tempDir = await createTempDir("adv-status-host-cap-");
    await createTestProject(tempDir, { withChanges: true, withSpecs: true });
  });

  afterEach(async () => {
    store?.close();
    await cleanupTempDir(tempDir);
  });

  test.each(VIEWS)(
    "%s returns complete or typed degraded data within the host cap",
    async (view) => {
      store = await delayedStore(tempDir);
      const startedAt = Date.now();
      const parsed = parseToolOutput(
        await statusTools.adv_status.execute(
          { view, forceRefresh: true },
          store,
        ),
      );

      expect(Date.now() - startedAt).toBeLessThan(10_100);
      expect(parsed.errorClass).not.toBe("ToolExecutionTimeout");
    },
    20_000,
  );
});

describe("adv_status corpus pressure", () => {
  let tempDir: string;
  let store: Store | undefined;

  beforeEach(async () => {
    tempDir = await createTempDir("adv-status-corpus-");
    await createTestProject(tempDir, { withChanges: false, withSpecs: true });
    store = await createDiskStore(tempDir);
  });

  afterEach(async () => {
    store?.close();
    await cleanupTempDir(tempDir);
  });

  test("routine active-status views do not parse archived bundles", async () => {
    const archive = store!.paths.archive;
    for (let i = 0; i < 20; i++) {
      await mkdir(join(archive, `archived-${i}`), { recursive: true });
      await writeFile(
        join(archive, `archived-${i}`, "change.json"),
        JSON.stringify(makeChange(`archived-${i}`, "archived", i)),
      );
    }
    const active = await store!.status({ recentLimit: 10 });
    expect(
      active.changes.recent.every((item) => !item.id.startsWith("archived-")),
    ).toBe(true);
  });

  test("source-ranked health reads stay bounded to the candidate limit", async () => {
    for (let i = 0; i < 36; i++) {
      await store!.changes.save(makeChange(`active-${i}`, "draft", i) as never);
    }
    const result = await store!.status({ recentLimit: 10, sourceRanked: true });
    expect(result.changes.recent).toHaveLength(10);
    expect(result.hydrationStats?.boundedOmitted).toBeGreaterThanOrEqual(26);
  });
});
