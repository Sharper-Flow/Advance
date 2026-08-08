import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { getProjectPaths } from "./json";
import {
  advanceLegacyToCanonicalExecutor,
  reportOnlyExecutor,
} from "./reconcile-action-legacy-envelope";
import type { ActionContext } from "./reconcile-action-types";
import type { ReconcilePlanRecord } from "./reconcile-plan";

const changeId = "legacy-envelope-change";

function canonical(
  revision: number,
  stateRevision = revision,
  taskCount = revision,
) {
  return {
    id: changeId,
    title: "Canonical change",
    status: "draft",
    created_at: "2026-08-07T00:00:00.000Z",
    projection_revision: revision,
    state_revision: stateRevision,
    tasks: Array.from({ length: taskCount }, (_, index) => ({
      id: `tk-${index}`,
    })),
    deltas: {},
  };
}

function record(
  action: "advance_legacy_to_canonical" | "report_only",
): ReconcilePlanRecord {
  return {
    record_id: changeId,
    source_path: "fixture",
    class:
      action === "advance_legacy_to_canonical"
        ? "legacy_divergent_behind"
        : "legacy_newer_than_canonical",
    evidence: ["fixture"],
    actions: [
      {
        class:
          action === "advance_legacy_to_canonical"
            ? "legacy_divergent_behind"
            : "legacy_newer_than_canonical",
        action,
      },
    ],
  } as ReconcilePlanRecord;
}

async function fixture() {
  const root = await createTempDir("adv-legacy-envelope-");
  const paths = getProjectPaths(root);
  const canonicalPath = join(paths.changes, changeId, "change.json");
  const legacyPath = join(paths.changes, `${changeId}.json`);
  await mkdir(join(paths.changes, changeId), { recursive: true });
  const beforeCalls: Array<{ recordId: string; bytes: Uint8Array | string }> =
    [];
  const ctx: ActionContext = {
    storePaths: paths,
    locksHeld: [],
    runId: "run-legacy-envelope",
    writeBeforeState: vi.fn(async (recordId, bytes) => {
      beforeCalls.push({ recordId, bytes });
      const path = join(
        paths.reconcileDir,
        "runs",
        "run-legacy-envelope",
        "before",
        recordId,
      );
      await mkdir(
        join(paths.reconcileDir, "runs", "run-legacy-envelope", "before"),
        { recursive: true },
      );
      await writeFile(path, bytes);
      return path;
    }),
    auditWriter: vi.fn(async () => undefined),
    coordinateChangeMutation: vi.fn(async () => ({
      status: "coordinated" as const,
    })),
    saveEpicOptimistic: vi.fn(async () => ({ status: "skipped" as const })),
  };
  return {
    paths,
    canonicalPath,
    legacyPath,
    ctx,
    beforeCalls,
    cleanup: () => cleanupTempDir(root),
  };
}

describe("legacy envelope reconcile executors", () => {
  test("advances a wrapped envelope to canonical content and preserves canonical bytes", async () => {
    const data = await fixture();
    try {
      const canonicalBytes = Buffer.from(JSON.stringify(canonical(7, 4, 3)));
      const legacyBytes = Buffer.from(
        JSON.stringify({
          state: { projection_revision: 2, state_revision: 1, tasks: [] },
        }),
      );
      await writeFile(data.canonicalPath, canonicalBytes);
      await writeFile(data.legacyPath, legacyBytes);

      const outcome = await advanceLegacyToCanonicalExecutor(
        record("advance_legacy_to_canonical"),
        {
          class: "legacy_divergent_behind",
          action: "advance_legacy_to_canonical",
        },
        data.ctx,
      );

      expect(outcome.status).toBe("mutated");
      expect(outcome.before_bytes).toEqual(legacyBytes);
      expect(outcome.after_bytes).toEqual(await readFile(data.legacyPath));
      expect(data.beforeCalls).toHaveLength(1);
      expect(data.beforeCalls[0]?.recordId).toBe(`${changeId}.legacy.json`);
      expect(await readFile(data.canonicalPath)).toEqual(canonicalBytes);
      expect(JSON.parse(await readFile(data.legacyPath, "utf8"))).toEqual({
        state: canonical(7, 4, 3),
      });
    } finally {
      await data.cleanup();
    }
  });

  test("reports newer envelopes without changing either file", async () => {
    const data = await fixture();
    try {
      const canonicalBytes = Buffer.from(JSON.stringify(canonical(4, 4, 2)));
      const legacyBytes = Buffer.from(
        JSON.stringify({
          projection_revision: 5,
          state_revision: 5,
          tasks: Array.from({ length: 3 }, (_, index) => ({
            id: `old-${index}`,
          })),
        }),
      );
      await writeFile(data.canonicalPath, canonicalBytes);
      await writeFile(data.legacyPath, legacyBytes);
      const beforeCanonicalStat = await stat(data.canonicalPath);
      const beforeLegacyStat = await stat(data.legacyPath);

      const outcome = await reportOnlyExecutor(
        record("report_only"),
        { class: "legacy_newer_than_canonical", action: "report_only" },
        data.ctx,
      );

      expect(outcome.status).toBe("skipped");
      expect((outcome as { report_only?: boolean }).report_only).toBe(true);
      expect(data.beforeCalls).toHaveLength(0);
      expect(await readFile(data.canonicalPath)).toEqual(canonicalBytes);
      expect(await readFile(data.legacyPath)).toEqual(legacyBytes);
      expect((await stat(data.canonicalPath)).mtimeNs).toBe(
        beforeCanonicalStat.mtimeNs,
      );
      expect((await stat(data.legacyPath)).mtimeNs).toBe(
        beforeLegacyStat.mtimeNs,
      );
    } finally {
      await data.cleanup();
    }
  });

  test.each([
    [1, 0, 0],
    [4, 2, 3],
    [12, 9, 7],
    [100, 100, 100],
  ])(
    "never advances counters beyond canonical revision (%i/%i/%i)",
    async (projectionRevision, stateRevision, taskCount) => {
      const data = await fixture();
      try {
        const next = canonical(projectionRevision, stateRevision, taskCount);
        await writeFile(data.canonicalPath, JSON.stringify(next));
        await writeFile(
          data.legacyPath,
          JSON.stringify({
            state: { projection_revision: 0, state_revision: 0, tasks: [] },
          }),
        );
        const outcome = await advanceLegacyToCanonicalExecutor(
          record("advance_legacy_to_canonical"),
          {
            class: "legacy_divergent_behind",
            action: "advance_legacy_to_canonical",
          },
          data.ctx,
        );
        expect(outcome.status).toBe("mutated");
        const state = JSON.parse(await readFile(data.legacyPath, "utf8")).state;
        expect(state.projection_revision).toBe(next.projection_revision);
        expect(state.state_revision).toBe(next.state_revision);
        expect(state.tasks).toHaveLength(next.tasks.length);
        expect(state.projection_revision).toBeLessThanOrEqual(
          projectionRevision,
        );
        expect(state.state_revision).toBeLessThanOrEqual(projectionRevision);
        expect(state.tasks.length).toBeLessThanOrEqual(projectionRevision);
      } finally {
        await data.cleanup();
      }
    },
  );

  test("preserves a bare legacy envelope shape", async () => {
    const data = await fixture();
    try {
      const next = canonical(3, 2, 1);
      await writeFile(data.canonicalPath, JSON.stringify(next));
      await writeFile(
        data.legacyPath,
        JSON.stringify({
          projection_revision: 0,
          state_revision: 0,
          tasks: [],
        }),
      );
      await advanceLegacyToCanonicalExecutor(
        record("advance_legacy_to_canonical"),
        {
          class: "legacy_divergent_behind",
          action: "advance_legacy_to_canonical",
        },
        data.ctx,
      );
      const output = JSON.parse(await readFile(data.legacyPath, "utf8"));
      expect(output).toEqual(next);
      expect(output.state).toBeUndefined();
    } finally {
      await data.cleanup();
    }
  });
});
