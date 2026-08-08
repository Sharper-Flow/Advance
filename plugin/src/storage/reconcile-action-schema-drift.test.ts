import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createTempDir,
  cleanupTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import { ChangeSchema } from "../types";
import { coordinateChangeMutation } from "../tools/change-mutation-coordinator";
import { getProjectPaths, type ProjectPaths } from "./json";
import type { ActionContext } from "./reconcile-action-types";

vi.mock("../utils/project-id", () => ({
  getProjectId: vi.fn(async () => "0000000000000000000000000000000000000001"),
}));

import {
  normalizeEnumMappingExecutor,
  quarantineRecordExecutor,
} from "./reconcile-action-schema-drift";

const CHANGE_ID = "retiredEnumFixture";

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function planRecord(sourcePath: string) {
  return {
    record_id: CHANGE_ID,
    source_path: sourcePath,
    class: "schema_drift_retired_enum" as const,
    evidence: ["retired evidence_kind"],
    actions: [
      {
        class: "schema_drift_retired_enum" as const,
        action: "normalize_enum_mapping" as const,
      },
      {
        class: "schema_drift_retired_enum" as const,
        action: "quarantine_record" as const,
      },
    ],
  };
}

async function seedChange(
  paths: ProjectPaths,
  change: Record<string, unknown>,
): Promise<{ sourcePath: string; before: string }> {
  const sourcePath = join(paths.changes, CHANGE_ID, "change.json");
  await mkdir(join(paths.changes, CHANGE_ID), { recursive: true });
  const before = JSON.stringify(change, null, 2);
  await writeFile(sourcePath, before, "utf8");
  return { sourcePath, before };
}

function makeContext(paths: ProjectPaths, sourcePath: string) {
  const beforeWrites: Array<{ id: string; bytes: Uint8Array | string }> = [];
  const auditEvents: unknown[] = [];
  const ctx: ActionContext = {
    storePaths: paths,
    locksHeld: [],
    runId: "reconcile-test-run",
    writeBeforeState: async (recordId, bytes) => {
      beforeWrites.push({ id: recordId, bytes });
      return join(paths.reconcileDir, "before", `${recordId}.bin`);
    },
    auditWriter: async (event) => {
      auditEvents.push(event);
    },
    coordinateChangeMutation: async (intent) => {
      const raw = JSON.parse(await readFile(sourcePath, "utf8"));
      const candidate = intent.mutateLatestProjection(raw as never);
      await writeFile(sourcePath, JSON.stringify(candidate, null, 2), "utf8");
      return {
        kind: "verified" as const,
        value: candidate as never,
        revision: 1,
        audit: {} as never,
      };
    },
    saveEpicOptimistic: async () => ({ status: "skipped" as const }),
  };
  return { ctx, beforeWrites, auditEvents };
}

describe("schema drift reconcile action executors", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  test.each(["build_worker", "replay_determinism"] as const)(
    "normalizes retired evidence_kind %s through the coordinated mutation path",
    async (retiredValue) => {
      const tempDir = await createTempDir("reconcile-schema-drift-");
      tempDirs.push(tempDir);
      const paths = getProjectPaths(
        tempDir,
        {},
        { externalRoot: join(tempDir, "state") },
      );
      const change = {
        ...ChangeSchema.parse({
          ...SAMPLE_CHANGE,
          id: CHANGE_ID,
          status: "draft",
        }),
        test_runs: {
          ["tk-test0001"]: [
            {
              runId: "run-1",
              exitCode: 0,
              classification: "pass",
              command: "test",
              durationMs: 1,
              evidence_kind: retiredValue,
              recordedAt: "2026-08-07T00:00:00Z",
            },
          ],
        },
      };
      const { sourcePath, before } = await seedChange(paths, change);
      const { ctx, beforeWrites } = makeContext(paths, sourcePath);
      const result = await normalizeEnumMappingExecutor(
        planRecord(sourcePath),
        {
          class: "schema_drift_retired_enum",
          action: "normalize_enum_mapping",
        },
        ctx,
      );

      expect(result.status).toBe("mutated");
      expect(beforeWrites).toHaveLength(1);
      expect(Buffer.from(beforeWrites[0].bytes).toString()).toBe(before);

      const afterBytes = await readFile(sourcePath);
      const after = JSON.parse(afterBytes.toString()) as typeof change;
      expect(after.test_runs?.["tk-test0001"]?.[0]?.evidence_kind).toBe(
        "other",
      );
      expect(ChangeSchema.safeParse(after).success).toBe(true);
      expect(Buffer.from(result.before_bytes ?? "").toString()).toBe(before);
      expect(result.after_bytes).toEqual(afterBytes);

      const audit = {
        before_hash: sha256(result.before_bytes ?? ""),
        after_hash: sha256(result.after_bytes ?? ""),
      };
      expect(audit.before_hash).toBe(sha256(before));
      expect(audit.after_hash).toBe(sha256(afterBytes));
      expect(result).toMatchObject(audit);
    },
  );

  test("normalizes an invalid retired-enum projection through the real commit coordinator", async () => {
    const tempDir = await createTempDir("reconcile-schema-drift-coordinator-");
    tempDirs.push(tempDir);
    const paths = getProjectPaths(
      tempDir,
      {},
      { externalRoot: join(tempDir, "state") },
    );
    const base = ChangeSchema.parse({
      ...SAMPLE_CHANGE,
      id: CHANGE_ID,
      status: "draft",
    });
    const raw = {
      ...base,
      test_runs: {
        ["tk-test0001"]: [
          {
            runId: "run-1",
            exitCode: 0,
            classification: "pass",
            command: "test",
            durationMs: 1,
            evidence_kind: "build_worker",
            recordedAt: "2026-08-07T00:00:00Z",
          },
        ],
      },
    };
    const { sourcePath } = await seedChange(paths, raw);
    const { ctx } = makeContext(paths, sourcePath);
    const coordinatedCtx: ActionContext = {
      ...ctx,
      coordinateChangeMutation: (intent) =>
        coordinateChangeMutation({
          authority: {
            reason: "schema drift regression",
            evidence: "reconcile-action-schema-drift.test.ts",
          },
          intent,
          changesDir: paths.changes,
        }),
    };

    const result = await normalizeEnumMappingExecutor(
      planRecord(sourcePath),
      {
        class: "schema_drift_retired_enum",
        action: "normalize_enum_mapping",
      },
      coordinatedCtx,
    );

    expect(result.status).toBe("mutated");
    expect(
      ChangeSchema.safeParse(JSON.parse(await readFile(sourcePath, "utf8")))
        .success,
    ).toBe(true);
  });

  test("quarantines an unmappable invalid record without synthesizing fields", async () => {
    const tempDir = await createTempDir("reconcile-schema-drift-quarantine-");
    tempDirs.push(tempDir);
    const paths = getProjectPaths(
      tempDir,
      {},
      { externalRoot: join(tempDir, "state") },
    );
    const invalid = {
      ...SAMPLE_CHANGE,
      id: CHANGE_ID,
      status: "not-a-current-status",
      unexpected_payload: { untouched: true },
    };
    const { sourcePath, before } = await seedChange(paths, invalid);
    const { ctx, beforeWrites } = makeContext(paths, sourcePath);

    const result = await quarantineRecordExecutor(
      planRecord(sourcePath),
      { class: "schema_drift_retired_enum", action: "quarantine_record" },
      ctx,
    );

    expect(result.status).toBe("mutated");
    expect(result).toMatchObject({
      documented_residual: true,
      residual_reason: "schema_error",
    });
    expect(result.residual).toContain("documented_residual: true");
    expect(result.residual).toContain("schema_error");
    expect(beforeWrites).toHaveLength(1);
    expect(Buffer.from(beforeWrites[0].bytes).toString()).toBe(before);
    await expect(readFile(sourcePath)).rejects.toMatchObject({
      code: "ENOENT",
    });

    const quarantineRoot = join(
      paths.external ?? paths.root,
      ".adv",
      "quarantine",
      "changes",
      CHANGE_ID,
    );
    const quarantineEntries = await readdir(quarantineRoot);
    expect(quarantineEntries).toHaveLength(1);
    const quarantined = await readFile(
      join(quarantineRoot, quarantineEntries[0], "change.json"),
      "utf8",
    );
    expect(quarantined).toBe(before);
    expect(JSON.parse(quarantined)).toEqual(invalid);
    expect(ChangeSchema.safeParse(JSON.parse(quarantined)).success).toBe(false);

    const auditPath = join(
      paths.external ?? paths.root,
      ".adv",
      "change-projection-quarantine-audit.jsonl",
    );
    const auditLines = (await readFile(auditPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(auditLines).toHaveLength(1);
    expect(auditLines[0]).toMatchObject({
      change_id: CHANGE_ID,
      action: "quarantine",
      reason: "schema_error",
      outcome: "success",
    });
  });

  test("does not synthesize or alter unrelated canonical fields", async () => {
    const tempDir = await createTempDir("reconcile-schema-drift-shape-");
    tempDirs.push(tempDir);
    const paths = getProjectPaths(
      tempDir,
      {},
      { externalRoot: join(tempDir, "state") },
    );
    const change = {
      ...ChangeSchema.parse({
        ...SAMPLE_CHANGE,
        id: CHANGE_ID,
        status: "draft",
      }),
      test_runs: {
        ["tk-test0001"]: [
          {
            runId: "run-1",
            exitCode: 1,
            classification: "fail",
            command: "test",
            durationMs: 5,
            evidence_kind: "build_worker",
            recordedAt: "2026-08-07T00:00:00Z",
          },
        ],
      },
    };
    const { sourcePath } = await seedChange(paths, change);
    const { ctx } = makeContext(paths, sourcePath);
    const result = await normalizeEnumMappingExecutor(
      planRecord(sourcePath),
      { class: "schema_drift_retired_enum", action: "normalize_enum_mapping" },
      ctx,
    );
    expect(result.status).toBe("mutated");

    const after = JSON.parse(
      await readFile(sourcePath, "utf8"),
    ) as typeof change;
    expect({ ...after, test_runs: undefined }).toEqual({
      ...change,
      test_runs: undefined,
    });
    expect(after.test_runs?.["tk-test0001"]?.[0]).toEqual({
      ...change.test_runs["tk-test0001"][0],
      evidence_kind: "other",
    });
  });
});
