/** Gate lifecycle tests against the disk projection authority. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanupTempDir,
  createTempDir,
  createTempGitWorktree,
} from "../__tests__/setup";
import { gateTools, validateGateBoundary } from "./gate";
import type { Change, Gates, Store, Task } from "../types";
import {
  loadChange,
  PROJECTION_DOCUMENT_BYTE_LIMIT,
} from "../storage/change-projection-reader";

const done = { status: "done" } as const;
const pending = { status: "pending" } as const;

function gates(overrides: Partial<Gates> = {}): Gates {
  return {
    proposal: { ...done },
    discovery: { ...done },
    design: { ...done },
    planning: { ...done },
    execution: { ...done },
    acceptance: { ...pending },
    release: { ...pending },
    ...overrides,
  } as Gates;
}

function change(overrides: Partial<Change> = {}): Change {
  return {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: gates(),
    ...overrides,
  } as Change;
}

function storeFor(root: string, current: Change): Store {
  return {
    paths: {
      root,
      changes: root,
      archive: join(root, "archive"),
    } as Store["paths"],
    config: null,
    changes: {
      get: async () => ({ success: true, data: current }),
      list: async () => ({ changes: [] }),
    },
    tasks: {},
    specs: {},
    wisdom: {},
    gates: {},
  } as unknown as Store;
}

async function seed(root: string, current: Change): Promise<void> {
  const dir = join(root, current.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "change.json"), JSON.stringify(current));
  await writeFile(
    join(root, `${current.id}.json`),
    JSON.stringify({
      schemaVersion: 2,
      projectId: "0".repeat(40),
      changeId: current.id,
      projectedAt: current.created_at,
      state: current,
    }),
  );
}

async function readProjection(root: string): Promise<Change> {
  return JSON.parse(
    await readFile(join(root, "test-change", "change.json"), "utf8"),
  ) as Change;
}

describe("gate tools — disk projection lifecycle", () => {
  let cleanupWorktree: (() => Promise<void>) | undefined;
  let restoreCwd: (() => void) | undefined;

  beforeEach(async () => {
    const fixture = await createTempGitWorktree("adv-gate-");
    cleanupWorktree = fixture.cleanup;
    // Gate mutations must execute from an isolated linked worktree, never the
    // checkout root used to run the test process.
    const cwdSpy = vi
      .spyOn(process, "cwd")
      .mockReturnValue(fixture.worktreePath);
    restoreCwd = () => cwdSpy.mockRestore();
  });

  afterEach(async () => {
    restoreCwd?.();
    restoreCwd = undefined;
    await cleanupWorktree?.();
    cleanupWorktree = undefined;
  });

  test("adv_gate_status returns persisted gates and explicit unavailable workflow fields", async () => {
    const root = await createTempDir("adv-gate-");
    try {
      const current = change();
      await seed(root, current);
      const parsed = JSON.parse(
        await gateTools.adv_gate_status.execute(
          { changeId: current.id },
          storeFor(root, current),
        ),
      );
      expect(parsed.gates).toEqual(current.gates);
      expect(parsed.nextGate).toBe("acceptance");
      expect(parsed.canArchive).toBe(false);
      expect(parsed._unavailable).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scope: "gateCriteria",
            status: "unavailable",
          }),
          expect.objectContaining({
            scope: "acceptanceCriteriaProjection",
            status: "unavailable",
          }),
        ]),
      );
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("gate completion refuses a skipped gate", async () => {
    const root = await createTempDir("adv-gate-");
    try {
      const current = change({
        gates: gates({ planning: { ...pending }, execution: { ...pending } }),
      });
      await seed(root, current);
      const parsed = JSON.parse(
        await gateTools.adv_gate_complete.execute(
          { changeId: current.id, gateId: "execution" },
          storeFor(root, current),
        ),
      );
      expect(parsed.error).toContain("prior gate");
      expect(parsed.blockedBy).toContain("planning");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("planning completion remains human-approved", async () => {
    const root = await createTempDir("adv-gate-");
    try {
      const current = change({
        gates: gates({
          planning: { ...pending },
          execution: { ...pending },
          acceptance: { ...pending },
        }),
      });
      await seed(root, current);
      const parsed = JSON.parse(
        await gateTools.adv_gate_complete.execute(
          { changeId: current.id, gateId: "planning" },
          storeFor(root, current),
        ),
      );
      expect(parsed.error).toContain("userApproved");
      expect(parsed.userApproved).toBe(false);
      expect(parsed.requiredUserApproval).toBe(true);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("gate completion commits done status and audit evidence to disk", async () => {
    const root = await createTempDir("adv-gate-");
    try {
      const current = change();
      await seed(root, current);
      const parsed = JSON.parse(
        await gateTools.adv_gate_complete.execute(
          {
            changeId: current.id,
            gateId: "acceptance",
            notes: "Acceptance verified.",
          },
          storeFor(root, current),
        ),
      );
      expect(parsed.success).toBe(true);
      expect(parsed.gateId).toBe("acceptance");
      const readback = await readProjection(root);
      expect(readback.gates.acceptance.status).toBe("done");
      expect(readback.gates.acceptance.approval_evidence).toContain(
        "Acceptance verified.",
      );
      expect(readback.projection_revision).toBe(1);
      expect(readback.projection_commits?.[0].authority_kind).toBe("mutation");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("execution completion refuses incomplete tasks", async () => {
    const root = await createTempDir("adv-gate-");
    try {
      const task = {
        id: "tk-open",
        title: "Open task",
        status: "in_progress",
        priority: 1,
        created_at: "2026-01-01T00:00:00Z",
      } as Task;
      const current = change({
        tasks: [task],
        gates: gates({ execution: { ...pending }, acceptance: { ...pending } }),
      });
      await seed(root, current);
      const parsed = JSON.parse(
        await gateTools.adv_gate_complete.execute(
          { changeId: current.id, gateId: "execution" },
          storeFor(root, current),
        ),
      );
      expect(parsed.error).toContain("task(s) not done");
      expect(parsed.incompleteTasks).toEqual([
        expect.objectContaining({ id: "tk-open", status: "in_progress" }),
      ]);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("execution completion uses loaded durable tasks when projection envelope is absent", async () => {
    const root = await createTempDir("adv-gate-");
    try {
      const task = {
        id: "tk-open",
        title: "Open task",
        status: "pending",
        priority: 1,
        created_at: "2026-01-01T00:00:00Z",
      } as Task;
      const current = change({
        tasks: [task],
        gates: gates({ execution: { ...pending }, acceptance: { ...pending } }),
      });
      const dir = join(root, current.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "change.json"), JSON.stringify(current));

      const parsed = JSON.parse(
        await gateTools.adv_gate_complete.execute(
          { changeId: current.id, gateId: "execution" },
          storeFor(root, current),
        ),
      );
      expect(parsed.error).toContain("task(s) not done");
      expect(parsed.incompleteTasks).toEqual([
        expect.objectContaining({ id: "tk-open", status: "pending" }),
      ]);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test.each([
    ["malformed JSON", "{not-json"],
    ["schema-invalid JSON", JSON.stringify({ invalid: true })],
  ])(
    "gate completion refuses %s instead of using stale in-memory gates",
    async (_label, projection) => {
      const root = await createTempDir("adv-gate-projection-failure-");
      try {
        const current = change();
        await seed(root, current);
        await writeFile(join(root, current.id, "change.json"), projection);

        const parsed = JSON.parse(
          await gateTools.adv_gate_complete.execute(
            { changeId: current.id, gateId: "acceptance" },
            storeFor(root, current),
          ),
        );

        expect(parsed.success).not.toBe(true);
        expect(parsed.code).toBe("CHANGE_PROJECTION_LOAD_FAILED");
        expect(parsed.projectionFailureType).toBe(
          projection === "{not-json" ? "corrupt" : "schema_error",
        );
      } finally {
        await cleanupTempDir(root);
      }
    },
  );

  test("gate completion refuses an oversized projection instead of using stale gates", async () => {
    const root = await createTempDir("adv-gate-projection-failure-");
    try {
      const current = change();
      await seed(root, current);
      await writeFile(
        join(root, current.id, "change.json"),
        "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
      );

      const parsed = JSON.parse(
        await gateTools.adv_gate_complete.execute(
          { changeId: current.id, gateId: "acceptance" },
          storeFor(root, current),
        ),
      );

      expect(parsed.success).not.toBe(true);
      expect(parsed.code).toBe("CHANGE_PROJECTION_LOAD_FAILED");
      expect(parsed.projectionFailureType).toBe("oversized");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("not_found remains a successful absent load, distinct from corrupt", async () => {
    const root = await createTempDir("adv-gate-projection-failure-");
    try {
      const result = await loadChange(root, "missing-change");
      expect(result).toEqual({ success: true, data: null });

      const corruptDir = join(root, "corrupt-change");
      await mkdir(corruptDir, { recursive: true });
      await writeFile(join(corruptDir, "change.json"), "{not-json");
      const corrupt = await loadChange(root, "corrupt-change");
      expect(corrupt.success).toBe(false);
      expect(corrupt.type).toBe("corrupt");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("boundary validation warns unauthorized actors and accepts user actors", () => {
    expect(validateGateBoundary("acceptance", "agent")).toBeUndefined();
    expect(validateGateBoundary("acceptance", "user:operator")).toBeUndefined();
  });
});
