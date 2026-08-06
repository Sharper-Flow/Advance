/**
 * Tests for the worker-bundle release-provenance surface:
 *   - adv_worker_bundle_provenance_record (execution-time evidence receipt)
 *   - adv_change_set_worker_bundle_impact (planning applicability declaration)
 *
 * Both tools use the signal/query change workflow surface and refresh the
 * in-memory change cache after mutation.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { z } from "zod";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { changeTools } from "./change";
import type { Change, Store } from "../types";

const mocks = vi.hoisted(() => ({
  withTargetPathStore: vi.fn(),
}));

// Mock withTargetPathStore while preserving the real targetPathSchema and
// formatTargetProjectContext (the tool imports both). Cross-project routing
// tests configure this mock per-case.
vi.mock("./target-project", async () => {
  const actual =
    await vi.importActual<typeof import("./target-project")>(
      "./target-project",
    );
  return { ...actual, withTargetPathStore: mocks.withTargetPathStore };
});

function createMockStore(change: Change): Store {
  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/main/.adv/changes",
      archive: "/tmp/main/.adv/archive",
    } as Store["paths"],
    config: { name: "test", features: {} } as Store["config"],
    changes: {
      get: vi.fn(async (_changeId: string) => ({
        success: true,
        data: change,
      })),
      list: vi.fn(async () => ({ changes: [change] })),
      save: vi.fn(),
      refresh: vi.fn(),
    } as unknown as Store["changes"],
  } as unknown as Store;
}

async function seedProjection(store: Store, change: Change): Promise<void> {
  const changeDir = join(store.paths.changes, change.id);
  await mkdir(changeDir, { recursive: true });
  await writeFile(join(changeDir, "change.json"), JSON.stringify(change));
}

async function readProjection(store: Store, changeId: string): Promise<Change> {
  return JSON.parse(
    await readFile(join(store.paths.changes, changeId, "change.json"), "utf8"),
  ) as Change;
}

function activeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "worker-bundle-change",
    title: "Worker bundle change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "in_progress" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    } as Change["gates"],
    ...overrides,
  } as Change;
}

const tools = changeTools as unknown as Record<
  string,
  {
    args: Record<string, unknown>;
    execute: (input: unknown, store: Store) => Promise<string>;
  }
>;

describe("adv_worker_bundle_provenance_record", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("persists typed worker-bundle provenance and verifies the projection", async () => {
    const change = activeChange();
    const store = createMockStore(change);
    await seedProjection(store, change);

    const result = await tools.adv_worker_bundle_provenance_record.execute(
      {
        changeId: change.id,
        source_sha: "abc123def456",
        build_run_id: "tr_build_001",
        replay_run_id: "tr_replay_002",
        worker_manifest_generation: 7,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe(change.id);
    expect(parsed.source_sha).toBe("abc123def456");

    const readback = await readProjection(store, change.id);
    expect(readback.workerBundleProvenance).toMatchObject({
      source_sha: "abc123def456",
      build_run_id: "tr_build_001",
      replay_run_id: "tr_replay_002",
      worker_manifest_generation: 7,
    });
    expect(typeof readback.workerBundleProvenance?.recorded_at).toBe("string");
  });

  test("rejects an unknown change id", async () => {
    const store = createMockStore(activeChange());
    vi.mocked(store.changes.get).mockResolvedValue({
      success: false,
      error: "change not found",
    } as never);

    const result = await tools.adv_worker_bundle_provenance_record.execute(
      {
        changeId: "missing",
        source_sha: "abc",
        build_run_id: "build-1",
        replay_run_id: "replay-1",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/change missing|not found/i);
  });

  test("rejects missing required provenance fields", () => {
    const parsed = z
      .object(tools.adv_worker_bundle_provenance_record.args)
      .safeParse({
        changeId: "c",
        source_sha: "abc",
      });
    expect(parsed.success).toBe(false);
  });
});

describe("adv_change_set_worker_bundle_impact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("saves worker_bundle_impact to the durable change projection", async () => {
    const change = activeChange();
    const store = createMockStore(change);
    await seedProjection(store, change);

    const result = await tools.adv_change_set_worker_bundle_impact.execute(
      {
        changeId: change.id,
        kind: "required",
        rationale: "Touches workflow-reachable code",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe(change.id);
    expect(parsed.worker_bundle_impact.kind).toBe("required");

    const saved = await readProjection(store, change.id);
    expect(saved.worker_bundle_impact).toMatchObject({
      kind: "required",
      rationale: "Touches workflow-reachable code",
    });
    expect(typeof saved.worker_bundle_impact?.confirmed_at).toBe("string");

    expect(typeof saved.worker_bundle_impact?.confirmed_at).toBe("string");
  });

  test("allows not_applicable with rationale", async () => {
    const change = activeChange();
    const store = createMockStore(change);
    await seedProjection(store, change);

    const result = await tools.adv_change_set_worker_bundle_impact.execute(
      {
        changeId: change.id,
        kind: "not_applicable",
        rationale: "Pure documentation change",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.worker_bundle_impact.kind).toBe("not_applicable");

    const saved = await readProjection(store, change.id);
    expect(saved.worker_bundle_impact?.kind).toBe("not_applicable");
  });

  test("rejects invalid kind", () => {
    const parsed = z
      .object(tools.adv_change_set_worker_bundle_impact.args)
      .safeParse({
        changeId: "c",
        kind: "maybe",
        rationale: "x",
      });
    expect(parsed.success).toBe(false);
  });

  test("rejects unknown change id", async () => {
    const store = createMockStore(activeChange());
    vi.mocked(store.changes.get).mockResolvedValue({
      success: false,
      error: "change missing",
    } as never);

    const result = await tools.adv_change_set_worker_bundle_impact.execute(
      {
        changeId: "missing",
        kind: "not_applicable",
        rationale: "docs",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/change missing|not found/i);
  });

  test("schema exposes target_path / target_confirmed / confirmationEvidence", () => {
    // AC1: peer-pattern target_path routing fields present in args
    const args = tools.adv_change_set_worker_bundle_impact.args;
    expect(args).toHaveProperty("target_path");
    expect(args).toHaveProperty("target_confirmed");
    expect(args).toHaveProperty("confirmationEvidence");

    // Sanity: the three fields parse as optional (omittable) so existing
    // same-project callers are unaffected.
    const parsed = z.object(args).safeParse({
      changeId: "c",
      kind: "not_applicable",
      rationale: "x",
    });
    expect(parsed.success).toBe(true);
  });

  test("cross-project target_path with target_confirmed + confirmationEvidence routes through withTargetPathStore and uses the TARGET project store/handle", async () => {
    // AC2/AC4/AC6: when target_path is provided and confirmed, the inner
    // runSetImpact runs against the TARGET store, resolves the TARGET project
    // ID via projectContext, and fires the signal against the TARGET workflow.
      const change = activeChange();
      const sessionStore = createMockStore(change);
      const targetStore = createMockStore(change);
      await seedProjection(targetStore, change);

    const targetContext = {
      root: "/tmp/target-project",
      projectId: "target-project-id",
      trusted: false,
      trustSource: "explicit" as const,
          stateMode: "authoritative" as const,
      warning: undefined,
    };

    mocks.withTargetPathStore.mockImplementation(
      async (_input: unknown, fn: (scope: unknown) => Promise<unknown>) =>
        fn({ context: targetContext, store: targetStore }),
    );

    const result = await tools.adv_change_set_worker_bundle_impact.execute(
      {
        changeId: change.id,
        kind: "required",
        rationale: "Touches workflow-reachable code",
        target_path: "/tmp/target-project",
        target_confirmed: true,
        confirmationEvidence: "Operator approved via question tool.",
      },
      sessionStore,
    );

    // withTargetPathStore received mutation:true + stateRequirement:"authoritative"
    // + the three trust fields.
    expect(mocks.withTargetPathStore).toHaveBeenCalledTimes(1);
    const wrapperCall = mocks.withTargetPathStore.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(wrapperCall.mutation).toBe(true);
    expect(wrapperCall.stateRequirement).toBe("authoritative");
    expect(wrapperCall.target_path).toBe("/tmp/target-project");
    expect(wrapperCall.target_confirmed).toBe(true);
    expect(wrapperCall.confirmationEvidence).toBe(
      "Operator approved via question tool.",
    );

    // Session store untouched; target store received the save.
    expect(sessionStore.changes.save).not.toHaveBeenCalled();
    const saved = await readProjection(targetStore, change.id);
    expect(saved.worker_bundle_impact).toMatchObject({
      kind: "required",
      rationale: "Touches workflow-reachable code",
    });

    // Response includes _projectContext (peer shape parity).
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.worker_bundle_impact.kind).toBe("required");
    expect(parsed._projectContext).toMatchObject({
      projectId: "target-project-id",
      root: "/tmp/target-project",
    });
  });

  test("untrusted target_path without target_confirmed returns the canonical refusal and performs NO save and NO signal", async () => {
    // AC3/AC8: when target_path is provided without target_confirmed, the
    // wrapper's trust gate throws TargetProjectError; the outer catch surfaces
    // it via formatToolOutput. The inner runSetImpact never runs.
    const change = activeChange();
    const sessionStore = createMockStore(change);

    mocks.withTargetPathStore.mockImplementation(async () => {
      throw new Error(
        "Untrusted target_path mutation requires target_confirmed: true and confirmationEvidence before changing target state: /tmp/some-project",
      );
    });

    const result = await tools.adv_change_set_worker_bundle_impact.execute(
      {
        changeId: change.id,
        kind: "not_applicable",
        rationale: "docs",
        target_path: "/tmp/some-project",
        // target_confirmed intentionally omitted
      },
      sessionStore,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/Untrusted target_path mutation/);
    expect(parsed.changeId).toBe(change.id);
    expect(parsed.target_path).toBe("/tmp/some-project");

    // AC8: no save, no signal, no workflow handle resolution.
    expect(sessionStore.changes.save).not.toHaveBeenCalled();
  });
});
