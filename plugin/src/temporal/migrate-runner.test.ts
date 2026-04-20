import { beforeEach, describe, expect, it, vi } from "vitest";

const migrationMocks = vi.hoisted(() => ({
  migrateProjectState: vi.fn(async () => ({ query: vi.fn(), executeUpdate: vi.fn() })),
  reImportChangeState: vi.fn(async () => ({ query: vi.fn(), executeUpdate: vi.fn() })),
}));

vi.mock("./migration", () => ({
  migrateProjectState: migrationMocks.migrateProjectState,
  reImportChangeState: migrationMocks.reImportChangeState,
}));

vi.mock("../storage/agenda", () => ({
  loadAgenda: vi.fn(async () => ({ items: [] })),
}));

vi.mock("../storage/project-wisdom", () => ({
  listProjectWisdom: vi.fn(async () => []),
}));

vi.mock("../storage/json", () => ({
  loadAllChanges: vi.fn(async () => new Map()),
}));

import { loadMigrationProjectInput, migrateSingleProjectActivity, runMigrationSweep } from "./migrate-runner";

describe("temporal migrate runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loadMigrationProjectInput loads agenda, wisdom, and changes from a project path", async () => {
    const result = await loadMigrationProjectInput('/tmp/proj1');
    expect(result.projectId).toBe('proj1');
    expect(Array.isArray(result.agenda)).toBe(true);
    expect(Array.isArray(result.projectWisdom)).toBe(true);
    expect(Array.isArray(result.changes)).toBe(true);
  });

  it("migrateSingleProjectActivity loads project state, migrates project ledger, then re-imports every change", async () => {
    const client = { workflow: {} } as any;
    const result = await migrateSingleProjectActivity({
      client,
      projectPath: '/tmp/proj1',
      loadProject: async () => ({
        projectId: 'proj1',
        initializedAt: '2026-04-20T00:00:00.000Z',
        agenda: [],
        projectWisdom: [],
        migrationLedger: [],
        changes: [
          { id: 'chg1', title: 'one', status: 'draft', created_at: '2026-04-20T00:00:00.000Z', tasks: [], deltas: {}, gates: {}, wisdom: [] },
          { id: 'chg2', title: 'two', status: 'draft', created_at: '2026-04-20T00:00:00.000Z', tasks: [], deltas: {}, gates: {}, wisdom: [] },
        ],
      }),
    });

    expect(migrationMocks.migrateProjectState).toHaveBeenCalledTimes(1);
    expect(migrationMocks.migrateProjectState).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ projectId: 'proj1' }),
      expect.objectContaining({ key: 'project-import', source: 'external_state' }),
    );
    expect(migrationMocks.reImportChangeState).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ projectId: 'proj1', migratedChanges: 2, status: 'done' });
  });

  it("runMigrationSweep starts migrateAllProjectsWorkflow on the control-project task queue and falls back to getHandle when already started", async () => {
    const handle = { query: vi.fn(), executeUpdate: vi.fn() };
    const start = vi.fn(async () => { throw new Error('Workflow execution already started'); });
    const getHandle = vi.fn(() => handle);

    const result = await runMigrationSweep(
      { workflow: { start, getHandle } } as any,
      { controlProjectId: 'control-proj', runId: 'cutover-1', projectPaths: ['/tmp/p1', '/tmp/p2'] },
    );

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ workflowId: 'adv/migration/control-proj/cutover-1', taskQueue: 'advance-control-proj' }),
    );
    expect(getHandle).toHaveBeenCalledWith('adv/migration/control-proj/cutover-1');
    expect(result).toBe(handle);
  });
});
