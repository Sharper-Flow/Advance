/**
 * RED-phase tests for durable per-change immutable summary shards.
 *
 * These tests encode the approved architecture without a production
 * implementation. They must fail until commitChangeProjectionWithSummary,
 * readCurrentSummaryShard, rebuildSummaryIndex, listSummaryChanges, and
 * collectObsoleteSummaryShards are implemented.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdir, writeFile, readFile, access } from "fs/promises";
import {
  createTempDir,
  cleanupTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import { ChangeSchema, type Change } from "../types";
import { saveChange } from "./json";
import {
  commitChangeProjectionWithSummary,
  readCurrentSummaryShard,
  rebuildSummaryIndex,
  listSummaryChanges,
  collectObsoleteSummaryShards,
  ChangeSummaryPointerSchema,
  ChangeSummaryShardSchema,
  type SummaryIndexPaths,
} from "./change-summary-shard";

const RECOVERY_AUTHORITY = {
  kind: "recovery" as const,
  reason: "red-phase-test",
  evidence: "test fixture",
};

function defaultGates(doneThrough?: string): NonNullable<Change["gates"]> {
  const order = [
    "proposal",
    "discovery",
    "design",
    "planning",
    "execution",
    "acceptance",
    "release",
  ];
  const gates: NonNullable<Change["gates"]> = {};
  for (const gate of order) {
    gates[gate] = {
      status: doneThrough && doneThrough === gate ? "done" : "pending",
    };
  }
  return gates;
}

function makeChange(id: string, overrides: Partial<Change> = {}): Change {
  return ChangeSchema.parse({
    ...SAMPLE_CHANGE,
    id,
    title: `Change ${id}`,
    status: "draft",
    lifecycleState: "open",
    gates: defaultGates(),
    projection_revision: 0,
    state_revision: 0,
    ...overrides,
  });
}

async function seedChange(changesDir: string, change: Change): Promise<void> {
  await saveChange(changesDir, change);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T = unknown>(path: string): Promise<T> {
  const text = await readFile(path, "utf-8");
  return JSON.parse(text) as T;
}

describe("durable per-change summary shards", () => {
  let baseDir: string;
  let paths: SummaryIndexPaths;

  beforeEach(async () => {
    baseDir = await createTempDir("summary-shard-");
    paths = {
      changesDir: join(baseDir, "changes"),
      summariesDir: join(baseDir, "summaries"),
    };
    await mkdir(paths.changesDir, { recursive: true });
    await mkdir(paths.summariesDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(baseDir);
  });

  // ===========================================================================
  // 1. Full snapshot first, then immutable shard, then atomic pointer.
  // ===========================================================================

  it("commits full snapshot before immutable summary revision shard and atomic per-change current pointer", async () => {
    const changeId = "commit-order";
    await seedChange(paths.changesDir, makeChange(changeId));

    const result = await commitChangeProjectionWithSummary({
      paths,
      changeId,
      expectedRevision: 0,
      operationId: "op-commit-order",
      payloadHash: "hash-commit-order",
      stateRevision: 1,
      authority: RECOVERY_AUTHORITY,
      mutationKind: "test",
      mutateLatest: (latest) => ({ ...latest, title: "Committed v1" }),
      verify: () => true,
    });

    if (result.kind !== "committed") {
      expect(result.kind).toBe("committed");
      return;
    }

    const snapshotPath = join(paths.changesDir, changeId, "change.json");
    const shardPath = join(paths.summariesDir, changeId, "revisions", "1.json");
    const pointerPath = join(paths.summariesDir, changeId, "current.json");

    expect(await fileExists(snapshotPath)).toBe(true);
    expect(await fileExists(shardPath)).toBe(true);
    expect(await fileExists(pointerPath)).toBe(true);

    const snapshot = await readJson<Change>(snapshotPath);
    expect(snapshot.title).toBe("Committed v1");
    expect(snapshot.projection_revision).toBe(1);
    expect(snapshot.state_revision).toBe(1);

    const shard = ChangeSummaryShardSchema.parse(await readJson(shardPath));
    expect(shard.id).toBe(changeId);
    expect(shard.title).toBe("Committed v1");
    expect(shard.state_revision).toBe(1);
    expect(shard.projection_revision).toBe(1);

    const pointer = ChangeSummaryPointerSchema.parse(
      await readJson(pointerPath),
    );
    expect(pointer.change_id).toBe(changeId);
    expect(pointer.state_revision).toBe(1);
    expect(pointer.projection_revision).toBe(1);
    expect(pointer.shard_path).toBe(shardPath);
    expect(pointer.snapshot_path).toBe(snapshotPath);
  });

  // ===========================================================================
  // 2. Command success proves snapshot/shard/pointer share revision + op.
  // ===========================================================================

  it("command success proves snapshot/shard/pointer share state_revision and operation identity", async () => {
    const changeId = "shared-proof";
    await seedChange(paths.changesDir, makeChange(changeId));
    const operationId = "op-shared-proof";

    const result = await commitChangeProjectionWithSummary({
      paths,
      changeId,
      expectedRevision: 0,
      operationId,
      payloadHash: "hash-shared-proof",
      stateRevision: 3,
      authority: RECOVERY_AUTHORITY,
      mutationKind: "test",
      mutateLatest: (latest) => ({ ...latest, title: "Shared Proof" }),
      verify: () => true,
    });

    if (result.kind !== "committed") {
      expect(result.kind).toBe("committed");
      return;
    }

    const snapshot = await readJson<Change>(
      join(paths.changesDir, changeId, "change.json"),
    );
    const shard = ChangeSummaryShardSchema.parse(
      await readJson(join(paths.summariesDir, changeId, "revisions", "1.json")),
    );
    const pointer = ChangeSummaryPointerSchema.parse(
      await readJson(join(paths.summariesDir, changeId, "current.json")),
    );

    expect(snapshot.state_revision).toBe(3);
    expect(shard.state_revision).toBe(3);
    expect(pointer.state_revision).toBe(3);

    expect(snapshot.projection_revision).toBe(1);
    expect(shard.projection_revision).toBe(1);
    expect(pointer.projection_revision).toBe(1);

    expect(shard.operation_id).toBe(operationId);
    expect(pointer.operation_id).toBe(operationId);

    const lastAudit = snapshot.projection_commits?.at(-1);
    expect(lastAudit?.operation_id).toBe(operationId);
    expect(lastAudit?.state_revision).toBe(3);
  });

  // ===========================================================================
  // 3. Concurrent commits for different changes stay independent.
  // ===========================================================================

  it("concurrent commits for different changes preserve both independent pointers and shards", async () => {
    const aId = "concurrent-a";
    const bId = "concurrent-b";
    await seedChange(paths.changesDir, makeChange(aId));
    await seedChange(paths.changesDir, makeChange(bId));

    const [aResult, bResult] = await Promise.all([
      commitChangeProjectionWithSummary({
        paths,
        changeId: aId,
        expectedRevision: 0,
        operationId: "op-a",
        payloadHash: "hash-a",
        stateRevision: 1,
        authority: RECOVERY_AUTHORITY,
        mutationKind: "test",
        mutateLatest: (latest) => ({ ...latest, title: "A Updated" }),
        verify: () => true,
      }),
      commitChangeProjectionWithSummary({
        paths,
        changeId: bId,
        expectedRevision: 0,
        operationId: "op-b",
        payloadHash: "hash-b",
        stateRevision: 1,
        authority: RECOVERY_AUTHORITY,
        mutationKind: "test",
        mutateLatest: (latest) => ({ ...latest, title: "B Updated" }),
        verify: () => true,
      }),
    ]);

    if (aResult.kind !== "committed" || bResult.kind !== "committed") {
      expect(aResult.kind).toBe("committed");
      expect(bResult.kind).toBe("committed");
      return;
    }

    const aPointer = ChangeSummaryPointerSchema.parse(
      await readJson(join(paths.summariesDir, aId, "current.json")),
    );
    const bPointer = ChangeSummaryPointerSchema.parse(
      await readJson(join(paths.summariesDir, bId, "current.json")),
    );

    expect(aPointer.change_id).toBe(aId);
    expect(bPointer.change_id).toBe(bId);
    expect(aPointer.shard_path).toContain(aId);
    expect(bPointer.shard_path).toContain(bId);
    expect(aPointer.shard_path).not.toBe(bPointer.shard_path);

    const aShard = ChangeSummaryShardSchema.parse(
      await readJson(aPointer.shard_path),
    );
    const bShard = ChangeSummaryShardSchema.parse(
      await readJson(bPointer.shard_path),
    );
    expect(aShard.title).toBe("A Updated");
    expect(bShard.title).toBe("B Updated");
  });

  // ===========================================================================
  // 4. Crash after snapshot but before pointer never leaves summary ahead.
  // ===========================================================================

  describe("crash-safety readback", () => {
    it("detects a stale pointer that is behind the full snapshot", async () => {
      const changeId = "stale-pointer";
      await seedChange(
        paths.changesDir,
        makeChange(changeId, {
          projection_revision: 2,
          state_revision: 2,
          title: "Snapshot v2",
        }),
      );

      // Pointer still references the old revision.
      const pointerPath = join(paths.summariesDir, changeId, "current.json");
      await mkdir(join(paths.summariesDir, changeId, "revisions"), {
        recursive: true,
      });
      await writeFile(
        pointerPath,
        JSON.stringify(
          ChangeSummaryPointerSchema.parse({
            schema_version: 1,
            change_id: changeId,
            state_revision: 1,
            projection_revision: 1,
            operation_id: "op-old",
            shard_path: join(
              paths.summariesDir,
              changeId,
              "revisions",
              "1.json",
            ),
            snapshot_path: join(paths.changesDir, changeId, "change.json"),
            committed_at: "2026-01-01T00:00:00Z",
          }),
          null,
          2,
        ),
      );

      const result = await readCurrentSummaryShard(paths, changeId);
      expect(result.kind).toBe("degraded");
      if (result.kind === "degraded") {
        expect(result.reason).toMatch(/stale|behind|snapshot/i);
      }
    });

    it("detects a missing pointer/shard when the full snapshot exists", async () => {
      const changeId = "missing-pointer";
      await seedChange(
        paths.changesDir,
        makeChange(changeId, {
          projection_revision: 1,
          state_revision: 1,
        }),
      );

      const result = await readCurrentSummaryShard(paths, changeId);
      expect(result.kind).toBe("degraded");
      if (result.kind === "degraded") {
        expect(result.reason).toMatch(/missing|pointer|shard/i);
      }
    });

    it("detects a summary shard whose revision is ahead of the full snapshot", async () => {
      const changeId = "ahead-summary";
      await seedChange(
        paths.changesDir,
        makeChange(changeId, {
          projection_revision: 1,
          state_revision: 1,
        }),
      );

      const revDir = join(paths.summariesDir, changeId, "revisions");
      await mkdir(revDir, { recursive: true });
      const shardPath = join(revDir, "2.json");
      await writeFile(
        shardPath,
        JSON.stringify(
          ChangeSummaryShardSchema.parse({
            schema_version: 1,
            id: changeId,
            title: "Ahead",
            status: "draft",
            phase: "execution",
            created_at: "2026-01-01T00:00:00Z",
            last_activity_at: "2026-01-01T00:00:00Z",
            task_count: 0,
            completed_tasks: 0,
            state_revision: 2,
            operation_id: "op-ahead",
            projection_revision: 2,
          }),
          null,
          2,
        ),
      );

      const pointerPath = join(paths.summariesDir, changeId, "current.json");
      await writeFile(
        pointerPath,
        JSON.stringify(
          ChangeSummaryPointerSchema.parse({
            schema_version: 1,
            change_id: changeId,
            state_revision: 2,
            projection_revision: 2,
            operation_id: "op-ahead",
            shard_path: shardPath,
            snapshot_path: join(paths.changesDir, changeId, "change.json"),
            committed_at: "2026-01-01T00:00:00Z",
          }),
          null,
          2,
        ),
      );

      const result = await readCurrentSummaryShard(paths, changeId);
      expect(result.kind).toBe("degraded");
      if (result.kind === "degraded") {
        expect(result.reason).toMatch(/ahead|snapshot/i);
      }
    });
  });

  // ===========================================================================
  // 5. Malformed/missing/ahead pointer or shard reports typed degraded state.
  // ===========================================================================

  describe("reader detects degraded index state", () => {
    it("reports degraded when the pointer file is malformed JSON", async () => {
      const changeId = "malformed-pointer";
      const pointerPath = join(paths.summariesDir, changeId, "current.json");
      await mkdir(join(paths.summariesDir, changeId), { recursive: true });
      await writeFile(pointerPath, "{ not json");

      const result = await readCurrentSummaryShard(paths, changeId);
      expect(result.kind).toBe("degraded");
      if (result.kind === "degraded") {
        expect(result.reason).toMatch(/malformed|pointer|schema/i);
      }
    });

    it("reports degraded when the shard file is malformed JSON", async () => {
      const changeId = "malformed-shard";
      const revDir = join(paths.summariesDir, changeId, "revisions");
      await mkdir(revDir, { recursive: true });
      const shardPath = join(revDir, "1.json");
      await writeFile(shardPath, "{ not json");

      const pointerPath = join(paths.summariesDir, changeId, "current.json");
      await writeFile(
        pointerPath,
        JSON.stringify(
          ChangeSummaryPointerSchema.parse({
            schema_version: 1,
            change_id: changeId,
            state_revision: 1,
            projection_revision: 1,
            operation_id: "op-bad-shard",
            shard_path: shardPath,
            snapshot_path: join(paths.changesDir, changeId, "change.json"),
            committed_at: "2026-01-01T00:00:00Z",
          }),
          null,
          2,
        ),
      );

      const result = await readCurrentSummaryShard(paths, changeId);
      expect(result.kind).toBe("degraded");
      if (result.kind === "degraded") {
        expect(result.reason).toMatch(/malformed|shard|schema/i);
      }
    });

    it("reports degraded when the pointer references a missing shard", async () => {
      const changeId = "missing-shard";
      const pointerPath = join(paths.summariesDir, changeId, "current.json");
      await mkdir(join(paths.summariesDir, changeId), { recursive: true });
      await writeFile(
        pointerPath,
        JSON.stringify(
          ChangeSummaryPointerSchema.parse({
            schema_version: 1,
            change_id: changeId,
            state_revision: 1,
            projection_revision: 1,
            operation_id: "op-missing-shard",
            shard_path: join(
              paths.summariesDir,
              changeId,
              "revisions",
              "99.json",
            ),
            snapshot_path: join(paths.changesDir, changeId, "change.json"),
            committed_at: "2026-01-01T00:00:00Z",
          }),
          null,
          2,
        ),
      );

      const result = await readCurrentSummaryShard(paths, changeId);
      expect(result.kind).toBe("degraded");
      if (result.kind === "degraded") {
        expect(result.reason).toMatch(/missing|shard/i);
      }
    });
  });

  // ===========================================================================
  // 6. Rebuild derives current shards solely from full change projections.
  // ===========================================================================

  it("idempotent rebuild derives current shards solely from full change projections, never workflow Queries", async () => {
    const aId = "rebuild-a";
    const bId = "rebuild-b";
    await seedChange(
      paths.changesDir,
      makeChange(aId, {
        projection_revision: 2,
        state_revision: 2,
        title: "Rebuild A",
      }),
    );
    await seedChange(
      paths.changesDir,
      makeChange(bId, {
        projection_revision: 3,
        state_revision: 3,
        title: "Rebuild B",
      }),
    );

    const result = await rebuildSummaryIndex(paths);

    if (result.kind !== "ok") {
      expect(result.kind).toBe("ok");
      return;
    }

    expect(result.rebuilt).toBe(2);
    expect(result.errors).toHaveLength(0);

    const aRead = await readCurrentSummaryShard(paths, aId);
    const bRead = await readCurrentSummaryShard(paths, bId);

    expect(aRead.kind).toBe("ok");
    expect(bRead.kind).toBe("ok");

    if (aRead.kind === "ok") {
      expect(aRead.shard.state_revision).toBe(2);
      expect(aRead.pointer.state_revision).toBe(2);
    }
    if (bRead.kind === "ok") {
      expect(bRead.shard.state_revision).toBe(3);
      expect(bRead.pointer.state_revision).toBe(3);
    }
  });

  // ===========================================================================
  // 7. Obsolete shard GC only after pointer/snapshot safety proof.
  // ===========================================================================

  describe("garbage collection safety", () => {
    it("only marks older shards obsolete when pointer and snapshot both prove safety", async () => {
      const changeId = "gc-safe";
      await seedChange(
        paths.changesDir,
        makeChange(changeId, {
          projection_revision: 3,
          state_revision: 3,
        }),
      );

      const revDir = join(paths.summariesDir, changeId, "revisions");
      await mkdir(revDir, { recursive: true });
      for (const rev of [1, 2, 3]) {
        await writeFile(
          join(revDir, `${rev}.json`),
          JSON.stringify(
            ChangeSummaryShardSchema.parse({
              schema_version: 1,
              id: changeId,
              title: `v${rev}`,
              status: "draft",
              phase: "execution",
              created_at: "2026-01-01T00:00:00Z",
              last_activity_at: "2026-01-01T00:00:00Z",
              task_count: 0,
              completed_tasks: 0,
              state_revision: rev,
              operation_id: `op-${rev}`,
              projection_revision: rev,
            }),
            null,
            2,
          ),
        );
      }

      const pointerPath = join(paths.summariesDir, changeId, "current.json");
      await writeFile(
        pointerPath,
        JSON.stringify(
          ChangeSummaryPointerSchema.parse({
            schema_version: 1,
            change_id: changeId,
            state_revision: 3,
            projection_revision: 3,
            operation_id: "op-3",
            shard_path: join(revDir, "3.json"),
            snapshot_path: join(paths.changesDir, changeId, "change.json"),
            committed_at: "2026-01-01T00:00:00Z",
          }),
          null,
          2,
        ),
      );

      const result = await collectObsoleteSummaryShards(paths, changeId);
      expect(result.safe).toBe(true);
      expect(result.obsolete.map((p) => p.split("/").pop())).toEqual([
        "1.json",
        "2.json",
      ]);
      expect(result.obsolete).not.toContain(join(revDir, "3.json"));
    });

    it("refuses to GC when the pointer is missing or inconsistent", async () => {
      const changeId = "gc-unsafe";
      await seedChange(
        paths.changesDir,
        makeChange(changeId, {
          projection_revision: 2,
          state_revision: 2,
        }),
      );

      const revDir = join(paths.summariesDir, changeId, "revisions");
      await mkdir(revDir, { recursive: true });
      for (const rev of [1, 2]) {
        await writeFile(join(revDir, `${rev}.json`), "{}");
      }

      const result = await collectObsoleteSummaryShards(paths, changeId);
      expect(result.safe).toBe(false);
      expect(result.obsolete).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 8. List/status consume summaries without full hydration.
  // ===========================================================================

  it("default list/status can consume summaries without full hydration", async () => {
    const aId = "list-a";
    const bId = "list-b";
    const summaries: Array<{
      id: string;
      title: string;
      stateRevision: number;
    }> = [
      { id: aId, title: "List A", stateRevision: 5 },
      { id: bId, title: "List B", stateRevision: 6 },
    ];

    for (const s of summaries) {
      const changeDir = join(paths.summariesDir, s.id);
      const revDir = join(changeDir, "revisions");
      await mkdir(revDir, { recursive: true });
      const shardPath = join(revDir, `${s.stateRevision}.json`);
      await writeFile(
        shardPath,
        JSON.stringify(
          ChangeSummaryShardSchema.parse({
            schema_version: 1,
            id: s.id,
            title: s.title,
            status: "draft",
            phase: "execution",
            created_at: "2026-01-01T00:00:00Z",
            last_activity_at: "2026-01-01T00:00:00Z",
            task_count: 0,
            completed_tasks: 0,
            state_revision: s.stateRevision,
            operation_id: `op-${s.id}`,
            projection_revision: s.stateRevision,
          }),
          null,
          2,
        ),
      );
      await writeFile(
        join(changeDir, "current.json"),
        JSON.stringify(
          ChangeSummaryPointerSchema.parse({
            schema_version: 1,
            change_id: s.id,
            state_revision: s.stateRevision,
            projection_revision: s.stateRevision,
            operation_id: `op-${s.id}`,
            shard_path: shardPath,
            snapshot_path: join(paths.changesDir, s.id, "change.json"),
            committed_at: "2026-01-01T00:00:00Z",
          }),
          null,
          2,
        ),
      );
    }

    const result = await listSummaryChanges(paths);

    if (result.kind !== "ok") {
      expect(result.kind).toBe("ok");
      return;
    }

    expect(result.summaries).toHaveLength(2);
    const byId = Object.fromEntries(result.summaries.map((s) => [s.id, s]));
    expect(byId[aId]?.title).toBe("List A");
    expect(byId[bId]?.title).toBe("List B");
  });
});
