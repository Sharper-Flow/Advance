/** Disk-backed diagnostics and the safe session-pointer repair contract. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { doctorHandler, setDoctorPointerRepairProvider } from "./doctor";
import type { Store } from "../storage/store";
import { ChangeSchema } from "../types";
import { SAMPLE_CHANGE } from "../__tests__/setup";

const mockGetWorktreeCensus = vi.hoisted(() => vi.fn());
const mockScanSnapshotHealth = vi.hoisted(() => vi.fn());
const targetStoreRef = vi.hoisted(() => ({ current: null as Store | null }));
const mockWithTargetPathStore = vi.hoisted(() =>
  vi.fn(
    async (
      input: {
        store: Store;
        target_path: string;
        mutation?: boolean;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      fn: (scope: { store: Store; context: unknown }) => Promise<string>,
    ) => {
      if (
        input.mutation &&
        (!input.target_confirmed || !input.confirmationEvidence?.trim())
      ) {
        throw new Error(
          "Untrusted target_path mutation requires target_confirmed: true and confirmationEvidence",
        );
      }
      const targetStore = targetStoreRef.current ?? input.store;
      return fn({
        store: targetStore,
        context: {
          root: targetStore.paths.root,
          projectId: "target-project",
          externalRoot: targetStore.paths.external,
          trusted: Boolean(input.target_confirmed),
          trustSource: "explicit",
          stateMode: "disk-snapshot",
        },
      });
    },
  ),
);

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: mockGetWorktreeCensus,
}));

vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: mockScanSnapshotHealth,
}));

vi.mock("./target-project", () => ({
  formatTargetProjectContext: (context: Record<string, unknown>) => context,
  withTargetPathStore: mockWithTargetPathStore,
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
    targetStoreRef.current = null;
    mockWithTargetPathStore.mockClear();
    setDoctorPointerRepairProvider(null);
  });

  afterEach(async () => {
    setDoctorPointerRepairProvider(null);
    targetStoreRef.current = null;
    await rm(root, { recursive: true, force: true });
  });

  test("healthy disk state returns verified predicates without fixes", async () => {
    const store = makeStore(root);
    const parsed = JSON.parse(await doctorHandler({}, store));

    expect(parsed.success).toBe(true);
    expect(parsed.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ class: "healthy" })]),
    );
    expect(parsed.fixes_applied).toEqual([]);
    expect(parsed.fixes_refused).toEqual([]);
    expect(parsed.verification.projection_scan.status).toBe("complete");
    expect(store.status).toHaveBeenCalledTimes(1);
    expect(store.changes.list).toHaveBeenCalledTimes(1);
    expect(parsed.verification).toMatchObject({
      healthy: true,
      projection_readable: true,
      snapshot_integrity: true,
      session_pointer_sane: true,
      worktree_census_reachable: true,
    });
  });

  test("returns partial projection evidence instead of claiming a full scan", async () => {
    for (let index = 0; index < 65; index++) {
      const directory = join(root, "changes", `change-${index}`);
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "change.json"),
        JSON.stringify({ ...SAMPLE_CHANGE, id: `change-${index}` }),
      );
    }

    const parsed = JSON.parse(await doctorHandler({}, makeStore(root)));

    expect(parsed.success).toBe(false);
    expect(parsed.verification.canonical_projection_consistent).toBe(false);
    const scan = parsed.verification.projection_scan;
    expect(["partial", "budget_exceeded"]).toContain(scan.status);
    expect(scan.scanned).toBeLessThanOrEqual(64);
    expect(scan.scanned + scan.omitted).toBe(65);
  });

  test("projection failures are reported as unhealthy rather than hidden", async () => {
    const store = makeStore(root);
    (store.status as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("projection unreadable"),
    );
    const parsed = JSON.parse(await doctorHandler({}, store));

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

  test("malformed canonical change is reported as an unhealthy divergence", async () => {
    const changeId = "malformed-canonical-change";
    await mkdir(join(root, "changes", changeId), { recursive: true });
    await writeFile(
      join(root, "changes", changeId, "change.json"),
      "{ malformed json",
    );

    const parsed = JSON.parse(await doctorHandler({}, makeStore(root)));

    expect(parsed.success).toBe(false);
    expect(parsed.verification.healthy).toBe(false);
    expect(parsed.verification.canonical_projection_consistent).toBe(false);
    expect(parsed.verification.projection_scan).toMatchObject({
      status: "complete",
      scanned: 1,
      omitted: 0,
      divergence_count: 1,
    });
    expect(parsed.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "unhealthy",
          finding: "canonical_projection_divergence",
          detail: expect.stringContaining("corrupt"),
        }),
      ]),
    );
  });

  test("schema-invalid canonical change is reported as an unhealthy divergence", async () => {
    const changeId = "schema-invalid-canonical-change";
    await mkdir(join(root, "changes", changeId), { recursive: true });
    await writeFile(
      join(root, "changes", changeId, "change.json"),
      JSON.stringify({ id: changeId }),
    );

    const parsed = JSON.parse(await doctorHandler({}, makeStore(root)));

    expect(parsed.success).toBe(false);
    expect(parsed.verification.healthy).toBe(false);
    expect(parsed.verification.canonical_projection_consistent).toBe(false);
    expect(parsed.verification.projection_scan.divergence_count).toBe(1);
    expect(parsed.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "unhealthy",
          finding: "canonical_projection_divergence",
          detail: expect.stringContaining("schema_error"),
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

    const parsed = JSON.parse(await doctorHandler({}, makeStore(root)));
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

    const parsed = JSON.parse(await doctorHandler({}, makeStore(root)));
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

    const parsed = JSON.parse(await doctorHandler({}, makeStore(root)));

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

    const parsed = JSON.parse(await doctorHandler({}, makeStore(root)));

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

    const parsed = JSON.parse(await doctorHandler({}, store));

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

  test("rejects an untrusted target_path without confirmation", async () => {
    await expect(
      doctorHandler({ target_path: "/target/project" }, makeStore(root)),
    ).rejects.toThrow(/target_confirmed.*confirmationEvidence/i);
    expect(mockWithTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target/project",
        mutation: true,
        stateRequirement: "snapshot-ok",
      }),
      expect.any(Function),
    );
  });

  test("confirmed target_path routes diagnostics to the target store", async () => {
    const currentStore = makeStore(root);
    const targetStore = makeStore(join(root, "target"));
    targetStoreRef.current = targetStore;

    const parsed = JSON.parse(
      await doctorHandler(
        {
          target_path: "/target/project",
          target_confirmed: true,
          confirmationEvidence: "user approved target doctor",
        },
        currentStore,
      ),
    );

    expect(mockWithTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target/project",
        mutation: true,
        stateRequirement: "snapshot-ok",
        target_confirmed: true,
        confirmationEvidence: "user approved target doctor",
      }),
      expect.any(Function),
    );
    expect(targetStore.status).toHaveBeenCalled();
    expect(currentStore.status).not.toHaveBeenCalled();
    expect(parsed._projectContext).toEqual(
      expect.objectContaining({ root: targetStore.paths.root }),
    );
  });

  test("foreign target diagnostics do not probe or clear the current-session pointer", async () => {
    const provider = {
      getActivePointer: vi.fn(() => "phantom-change"),
      clearActivePointer: vi.fn(),
    };
    setDoctorPointerRepairProvider(provider);
    targetStoreRef.current = makeStore(join(root, "foreign-target"));

    const parsed = JSON.parse(
      await doctorHandler(
        {
          target_path: "/foreign/project",
          target_confirmed: true,
          confirmationEvidence: "user approved foreign target doctor",
        },
        makeStore(root),
      ),
    );

    expect(provider.getActivePointer).not.toHaveBeenCalled();
    expect(provider.clearActivePointer).not.toHaveBeenCalled();
    expect(parsed.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "informational",
          finding: "session_pointer_out_of_scope",
        }),
      ]),
    );
    expect(parsed.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ class: "phantom_pointer" }),
      ]),
    );
    expect(parsed.verification.session_pointer_sane).toBe(true);
  });
});
