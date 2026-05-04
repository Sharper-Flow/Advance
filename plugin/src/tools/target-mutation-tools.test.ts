import { describe, expect, test, vi, beforeEach } from "vitest";

const targetContext = {
  root: "/target/project",
  projectId: "a".repeat(40),
  externalRoot: "/state/target",
  trusted: false,
  trustSource: "explicit" as const,
  stateMode: "temporal" as const,
};

const targetTask = {
  id: "tk-target",
  title: "Target task",
  status: "pending",
  priority: 0,
  deps: [],
  created_at: "2026-01-01T00:00:00Z",
};

const targetChange = {
  id: "targetChange",
  title: "Target Change",
  status: "draft",
  created_at: "2026-01-01T00:00:00Z",
  tasks: [targetTask],
  deltas: {},
  gates: {
    proposal: { status: "done" },
    discovery: { status: "pending" },
    design: { status: "pending" },
    planning: { status: "pending" },
    execution: { status: "pending" },
    acceptance: { status: "pending" },
    release: { status: "pending" },
  },
};

const mocks = vi.hoisted(() => {
  const targetStore = {
    paths: {
      root: "/target/project",
      changes: "/target/project/.adv/changes",
      archive: "/target/project/.adv/archive",
      external: "/state/target",
    },
    config: { features: { clarify_enforcement: "off" } },
    changes: {
      get: vi.fn(async () => ({ success: true, data: targetChange })),
      save: vi.fn(async () => ({ success: true })),
      updateArtifacts: vi.fn(async () => ({
        success: true,
        proposalPath: "/target/project/.adv/changes/targetChange/proposal.md",
        problemStatementPath:
          "/target/project/.adv/changes/targetChange/problem-statement.md",
        agreementPath: "/target/project/.adv/changes/targetChange/agreement.md",
        designPath: "/target/project/.adv/changes/targetChange/design.md",
      })),
    },
    tasks: {
      show: vi.fn(async () => ({ task: targetTask, changeId: "targetChange" })),
      get: vi.fn(async () => targetTask),
      update: vi.fn(async (_taskId, status) => ({ ...targetTask, status })),
      recordEvidence: vi.fn(async (_taskId, phase, evidence) => ({
        task: {
          ...targetTask,
          tdd_phase: phase,
          tdd_evidence: { [phase]: evidence },
        },
        duplicate: false,
        corrected: false,
      })),
      setPhase: vi.fn(async (_taskId, phase) => ({
        ...targetTask,
        tdd_phase: phase,
      })),
      getRun: vi.fn(async () => null),
      recordRunEvent: vi.fn(async () => null),
    },
    gates: {
      get: vi.fn(async () => targetChange.gates),
      complete: vi.fn(async () => ({
        ...targetChange.gates,
        discovery: { status: "done" },
      })),
    },
  };

  return {
    targetStore,
    withTargetPathStore: vi.fn(async (input, fn) => {
      if (!input.target_confirmed || !input.confirmationEvidence) {
        throw new Error("target_confirmed and confirmationEvidence required");
      }
      return fn({ context: targetContext, store: targetStore as any });
    }),
  };
});

vi.mock("./target-project", async () => {
  const actual =
    await vi.importActual<typeof import("./target-project")>(
      "./target-project",
    );
  return {
    ...actual,
    withTargetPathStore: mocks.withTargetPathStore,
  };
});

vi.mock("../storage/json", async () => {
  const actual =
    await vi.importActual<typeof import("../storage/json")>("../storage/json");
  return {
    ...actual,
    loadProposalWithFallback: vi.fn(async () => ({
      content: "# Target Change",
    })),
    fileExists: vi.fn(async () => false),
  };
});

vi.mock("fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("fs/promises")>("fs/promises");
  return {
    ...actual,
    readdir: vi.fn(async () => []),
    readFile: vi.fn(async () => ""),
    rm: vi.fn(async () => undefined),
  };
});

vi.mock("../temporal/service", async () => {
  const actual = await vi.importActual<typeof import("../temporal/service")>(
    "../temporal/service",
  );
  return {
    ...actual,
    getService: vi.fn(() => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: { close: vi.fn(async () => {}) },
      client: {},
    })),
    getStslStats: vi.fn(() => ({
      getServiceCalls: 1,
      newConnections: 1,
      reuseRate: 1,
      reconnectCount: 0,
      reconnectFailureCount: 0,
    })),
    reinitStsl: vi.fn(async () => {}),
  };
});

vi.mock("../temporal/orphan-sweep", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/orphan-sweep")
  >("../temporal/orphan-sweep");
  return {
    ...actual,
    sweepProject: vi.fn(async () => ({
      orphans: ["chg1"],
      reseeded: [],
    })),
  };
});

vi.mock("../temporal/activities", async () => {
  const actual = await vi.importActual<typeof import("../temporal/activities")>(
    "../temporal/activities",
  );
  return {
    ...actual,
    repairChangeActivity: vi.fn(async () => ({
      ok: true,
      projectId: "proj123",
      changeId: "chg123",
      message: "Repaired",
    })),
  };
});

import { parseToolOutput } from "../__tests__/setup";
import { changeTools } from "./change";
import { taskTools } from "./task";
import { gateTools } from "./gate";
import { testTools } from "./test";
import { archiveSweepTools } from "./archive-sweep";
import { temporalOpsTools } from "./temporal-ops";

describe("target_path mutation tools", () => {
  const sourceStore = { paths: { root: "/source/project" } } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const targetArgs = {
    target_path: "/target/project",
    target_confirmed: true,
    confirmationEvidence: "user approved target mutation",
  };

  test("rejects untrusted target mutation without confirmation", async () => {
    await expect(
      changeTools.adv_change_update.execute(
        {
          changeId: "targetChange",
          proposal: "# Updated",
          target_path: "/target/project",
        } as any,
        sourceStore,
      ),
    ).rejects.toThrow(/target_confirmed/);
  });

  test("adv_change_update mutates target project through temporal-required store", async () => {
    const output = await changeTools.adv_change_update.execute(
      { changeId: "targetChange", proposal: "# Updated", ...targetArgs } as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target/project",
        stateRequirement: "temporal-required",
      }),
      expect.any(Function),
    );
    expect(mocks.targetStore.changes.updateArtifacts).toHaveBeenCalledWith(
      "targetChange",
      "# Updated",
      undefined,
      undefined,
      undefined,
    );
    expect(parsed._projectContext.stateMode).toBe("temporal");
  });

  test("task mutation tools mutate target project through temporal-required store", async () => {
    const calls = [
      taskTools.adv_task_update.execute(
        { taskId: "tk-target", status: "in_progress", ...targetArgs } as any,
        sourceStore,
      ),
      taskTools.adv_task_evidence.execute(
        {
          taskId: "tk-target",
          phase: "green",
          testFile: "target.test.ts",
          command: "pnpm test target",
          output: "pass",
          exitCode: 0,
          ...targetArgs,
        } as any,
        sourceStore,
      ),
      taskTools.adv_task_tdd.execute(
        {
          taskId: "tk-target",
          action: "set",
          phase: "green",
          ...targetArgs,
        } as any,
        sourceStore,
      ),
    ];

    for (const call of calls) {
      const parsed = parseToolOutput(await call);
      expect(parsed._projectContext.stateMode).toBe("temporal");
    }
    expect(mocks.targetStore.tasks.update).toHaveBeenCalled();
    expect(mocks.targetStore.tasks.recordEvidence).toHaveBeenCalled();
    expect(mocks.targetStore.tasks.setPhase).toHaveBeenCalled();
  });

  test("adv_gate_complete mutates target project through temporal-required store", async () => {
    const output = await gateTools.adv_gate_complete.execute(
      {
        changeId: "targetChange",
        gateId: "discovery",
        completedBy: "agent",
        ...targetArgs,
      } as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.targetStore.gates.complete).toHaveBeenCalledWith(
      "targetChange",
      "discovery",
      undefined,
    );
    expect(parsed._projectContext.stateMode).toBe("temporal");
  });

  test("adv_run_test records target task evidence through temporal-required store", async () => {
    const output = await testTools.adv_run_test.execute(
      {
        taskId: "tk-target",
        phase: "green",
        command: 'node -e "process.exit(0)"',
        workdir: process.cwd(),
        ...targetArgs,
      } as any,
      sourceStore,
      "/source/project",
      { timeoutMs: 5_000, maxBuffer: 1024 * 1024 },
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed._projectContext.stateMode).toBe("temporal");
    expect(mocks.targetStore.tasks.recordEvidence).toHaveBeenCalled();
  });

  test("[F4] adv_archive_sweep_orphans mutates target project through temporal-required store", async () => {
    const output = await archiveSweepTools.adv_archive_sweep_orphans.execute(
      { dryRun: true, ...targetArgs } as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target/project",
        stateRequirement: "temporal-required",
      }),
      expect.any(Function),
    );
    expect(parsed._projectContext.stateMode).toBe("temporal");
  });

  test("adv_temporal_reconnect mutates target project through temporal-required store", async () => {
    const output = await temporalOpsTools.adv_temporal_reconnect.execute(
      targetArgs as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target/project",
        stateRequirement: "temporal-required",
      }),
      expect.any(Function),
    );
    expect(parsed._projectContext.stateMode).toBe("temporal");
  });

  test("adv_orphan_sweep mutates target project through temporal-required store", async () => {
    const output = await temporalOpsTools.adv_orphan_sweep.execute(
      { dryRun: true, ...targetArgs } as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target/project",
        stateRequirement: "temporal-required",
      }),
      expect.any(Function),
    );
    expect(parsed._projectContext.stateMode).toBe("temporal");
  });

  test("adv_workflow_repair mutates target project through temporal-required store", async () => {
    const output = await temporalOpsTools.adv_workflow_repair.execute(
      {
        changeId: "chg123",
        approvalEvidence: "User approved via question tool",
        ...targetArgs,
      } as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target/project",
        stateRequirement: "temporal-required",
      }),
      expect.any(Function),
    );
    expect(parsed._projectContext.stateMode).toBe("temporal");
  });
});
