/** Disk-backed diagnostics and the safe session-pointer repair contract. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { doctorTools, setDoctorPointerRepairProvider } from "./doctor";
import type { Store } from "../storage/store";
import { ChangeSchema } from "../types";
import { SAMPLE_CHANGE } from "../__tests__/setup";

const mockGetWorktreeCensus = vi.hoisted(() => vi.fn());
const mockScanSnapshotHealth = vi.hoisted(() => vi.fn());

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: mockGetWorktreeCensus,
}));

vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: mockScanSnapshotHealth,
}));

function makeStore(root: string, overrides: Partial<Store> = {}): Store {
  const changes = join(root, "changes");
  return {
    paths: {
      root,
      changes,
      archive: join(root, "archive"),
      specs: join(root, "specs"),
      external: join(root, "external", "project-id"),
    },
    status: vi.fn(async () => ({})),
    specs: { list: vi.fn(async () => ({ specs: [] })) },
    changes: {
      list: vi.fn(async () => ({ changes: [] })),
      get: vi.fn(async () => ({ success: true, data: {} })),
    },
    ...overrides,
  } as unknown as Store;
}

function setHealthyProbes(): void {
  mockGetWorktreeCensus.mockResolvedValue({
    total: 0,
    stale: [],
    records: [],
    warnings: [],
  });
  mockScanSnapshotHealth.mockResolvedValue({
    summary: { critical: 0 },
  });
}

describe("adv_doctor disk diagnostics", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "adv-doctor-test-"));
    setHealthyProbes();
    setDoctorPointerRepairProvider(null);
  });

  afterEach(async () => {
    setDoctorPointerRepairProvider(null);
    await rm(root, { recursive: true, force: true });
  });

  test("description identifies diagnosis, safe repair, and verification", () => {
    expect(doctorTools.adv_doctor.description).toMatch(/diagnos/i);
    expect(doctorTools.adv_doctor.description).toMatch(/safe .*repair/i);
    expect(doctorTools.adv_doctor.description).toMatch(/reports/i);
  });

  test("healthy disk state returns verified predicates without fixes", async () => {
    const parsed = JSON.parse(
      await doctorTools.adv_doctor.execute({}, makeStore(root)),
    );

    expect(parsed.success).toBe(true);
    expect(parsed.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ class: "healthy" })]),
    );
    expect(parsed.fixes_applied).toEqual([]);
    expect(parsed.fixes_refused).toEqual([]);
    expect(parsed.verification).toMatchObject({
      healthy: true,
      projection_readable: true,
      snapshot_integrity: true,
      session_pointer_sane: true,
      worktree_census_reachable: true,
    });
  });

  test("projection failures are reported as unhealthy rather than hidden", async () => {
    const store = makeStore(root);
    (store.status as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("projection unreadable"),
    );
    const parsed = JSON.parse(await doctorTools.adv_doctor.execute({}, store));

    expect(parsed.success).toBe(false);
    expect(parsed.verification.projection_readable).toBe(false);
    expect(parsed.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "unhealthy",
          finding: "projectionReadable",
        }),
      ]),
    );
  });

  test("canonical revision/task count ahead of legacy state is unhealthy", async () => {
    const changeId = "promotePptPricesCanonical";
    const canonical = ChangeSchema.parse({
      ...SAMPLE_CHANGE,
      id: changeId,
      status: "draft",
      lifecycleState: "open",
      projection_revision: 21,
      state_revision: 21,
      tasks: Array.from({ length: 12 }, (_, i) => ({
        id: `tk-${i}`,
        title: `Task ${i}`,
        type: "code",
        status: "pending",
        priority: i,
        created_at: "2026-07-23T10:00:00.000Z",
      })),
    });
    await mkdir(join(root, "changes", changeId), { recursive: true });
    await writeFile(
      join(root, "changes", changeId, "change.json"),
      JSON.stringify(canonical),
    );
    await writeFile(
      join(root, "changes", `${changeId}.json`),
      JSON.stringify({
        state: { tasks: [], projection_revision: 0, state_revision: 0 },
      }),
    );

    const parsed = JSON.parse(
      await doctorTools.adv_doctor.execute({}, makeStore(root)),
    );
    expect(parsed.success).toBe(false);
    expect(parsed.verification.healthy).toBe(false);
    expect(parsed.verification.canonical_projection_consistent).toBe(false);
    expect(parsed.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          finding: "canonical_projection_divergence",
        }),
      ]),
    );
  });

  test("reclaims a retired worker.lock only when its PID is dead", async () => {
    const lockDir = join(root, "external", "project-id");
    await mkdir(lockDir, { recursive: true });
    const lockPath = join(lockDir, "worker.lock");
    await writeFile(lockPath, JSON.stringify({ pid: 999999999 }));

    const parsed = JSON.parse(
      await doctorTools.adv_doctor.execute({}, makeStore(root)),
    );
    expect(parsed.fixes_applied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "remove_dead_worker_lock" }),
      ]),
    );
    await expect(
      import("fs/promises").then((m) => m.access(lockPath)),
    ).rejects.toThrow();
  });

  test("confirmed-absent active pointer is cleared and verified", async () => {
    let activePointer: string | null = "phantom-change";
    const provider = {
      getActivePointer: vi.fn(() => activePointer),
      clearActivePointer: vi.fn(() => {
        activePointer = null;
      }),
    };
    setDoctorPointerRepairProvider(provider);

    const parsed = JSON.parse(
      await doctorTools.adv_doctor.execute({}, makeStore(root)),
    );

    expect(provider.clearActivePointer).toHaveBeenCalledTimes(1);
    expect(parsed.fixes_applied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "phantom_pointer",
          action: "clear_session_pointer",
          outcome: "applied",
        }),
      ]),
    );
    expect(parsed.verification.session_pointer_sane).toBe(true);
  });

  test("a readable active pointer is preserved", async () => {
    const pointer = "valid-change";
    await mkdir(join(root, "changes", pointer), { recursive: true });
    await writeFile(join(root, "changes", pointer, "change.json"), "{}");
    const provider = {
      getActivePointer: vi.fn(() => pointer),
      clearActivePointer: vi.fn(),
    };
    setDoctorPointerRepairProvider(provider);

    const parsed = JSON.parse(
      await doctorTools.adv_doctor.execute({}, makeStore(root)),
    );

    expect(provider.clearActivePointer).not.toHaveBeenCalled();
    expect(parsed.fixes_applied).toEqual([]);
    expect(parsed.fixes_refused).toEqual([]);
    expect(parsed.verification.session_pointer_sane).toBe(true);
  });

  test("an unreadable active pointer is refused instead of cleared", async () => {
    const pointer = "ambiguous-change";
    await mkdir(join(root, "changes", pointer), { recursive: true });
    await writeFile(join(root, "changes", pointer, "change.json"), "{}");
    const provider = {
      getActivePointer: vi.fn(() => pointer),
      clearActivePointer: vi.fn(),
    };
    const store = makeStore(root);
    (store.changes.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "read failed",
    });
    setDoctorPointerRepairProvider(provider);

    const parsed = JSON.parse(await doctorTools.adv_doctor.execute({}, store));

    expect(provider.clearActivePointer).not.toHaveBeenCalled();
    expect(parsed.success).toBe(false);
    expect(parsed.fixes_refused).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "phantom_pointer",
          outcome: "approval_required",
        }),
      ]),
    );
  });

  test("doctor args expose no unsafe approval bypass", () => {
    expect(doctorTools.adv_doctor.args).not.toHaveProperty("approvedByUser");
    expect(doctorTools.adv_doctor.args).not.toHaveProperty(
      "approvedLockReclaim",
    );
  });
});
