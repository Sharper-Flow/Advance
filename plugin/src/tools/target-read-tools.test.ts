import { describe, expect, test, vi, beforeEach } from "vitest";

const targetContext = {
  root: "/target/project",
  projectId: "a".repeat(40),
  externalRoot: "/state/target",
  trusted: false,
  trustSource: "explicit" as const,
  stateMode: "disk-snapshot" as const,
};

const targetChange = {
  id: "targetChange",
  title: "Target Change",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  tasks: [
    {
      id: "tk-target",
      title: "Target task",
      status: "pending",
      priority: 0,
      deps: [],
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  deltas: {},
};

const mocks = vi.hoisted(() => {
  const targetStore = {
    paths: {
      root: "/target/project",
      changes: "/target/project/.adv/changes",
      external: "/state/target",
      projectMetadata: "/state/target/project-metadata.jsonl",
    },
    config: { features: { clarify_enforcement: "off" } },
    changes: {
      list: vi.fn(async () => ({
        changes: [
          {
            id: "targetChange",
            title: "Target Change",
            status: "active",
            taskCount: 1,
            completedTasks: 0,
            lastActivityAt: "2026-01-01T00:00:00Z",
          },
        ],
      })),
      get: vi.fn(async () => ({ success: true, data: targetChange })),
    },
    tasks: {
      show: vi.fn(async () => ({
        task: targetChange.tasks[0],
        changeId: "targetChange",
      })),
      getRun: vi.fn(async () => null),
      list: vi.fn(async () => targetChange.tasks),
      ready: vi.fn(async () => ({ ready: targetChange.tasks, blocked: [] })),
    },
    gates: { get: vi.fn(async () => null) },
    specs: { list: vi.fn(async () => ({ specs: [] })) },
    status: vi.fn(async () => ({
      specs: { count: 0 },
      changes: {
        byStatus: { active: 1, archived: 0 },
        recent: [
          {
            id: "targetChange",
            title: "Target Change",
            minutesSinceActivity: 0,
            recency: "hot",
            taskCount: 1,
            completedTasks: 0,
          },
        ],
      },
      recommendations: [],
    })),
  };

  return {
    targetStore,
    withTargetPathStore: vi.fn(async (_input, fn) =>
      fn({ context: targetContext, store: targetStore as any }),
    ),
    withOptionalTargetPathStore: vi.fn(
      async ({ store: _store, target_path }, fn) => {
        if (!target_path) return fn(_store);
        return fn(targetStore as any, {
          root: targetContext.root,
          projectId: targetContext.projectId,
          trusted: targetContext.trusted,
          trustSource: targetContext.trustSource,
          stateMode: targetContext.stateMode,
          warning:
            "Read-only untrusted target_path snapshot. Mutations require explicit target confirmation.",
        });
      },
    ),
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
    withOptionalTargetPathStore: mocks.withOptionalTargetPathStore,
  };
});

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: vi.fn(async () => ({
    server_alive: true,
    worker_alive: true,
    worker_process_alive: true,
    registered_queues: [],
    last_op_at: null,
    last_error: null,
    fallback_counts: {},
    stale_queues: [],
    reconnect_count: 0,
  })),
}));

vi.mock("../storage/json", async () => {
  const actual =
    await vi.importActual<typeof import("../storage/json")>("../storage/json");
  return {
    ...actual,
    loadProjectConfigWithDiagnostics: vi.fn(async () => ({
      success: true,
      data: { features: {} },
    })),
    loadProposalWithFallback: vi.fn(async () => ({
      content: "# Target Change",
    })),
  };
});

vi.mock("../storage/project-metadata", () => ({
  readProjectMetadata: vi.fn(async () => []),
}));

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: vi.fn(async () => null),
}));

import { parseToolOutput } from "../__tests__/setup";
import { changeTools } from "./change";
import { taskTools } from "./task";
import { gateTools } from "./gate";
import { statusTools } from "./status";

describe("target_path read/status tools", () => {
  const sourceStore = { paths: { root: "/source/project" } } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("adv_change_list reads target project snapshot", async () => {
    const output = await changeTools.adv_change_list.execute(
      { target_path: "/target/project" } as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.withOptionalTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target/project",
      }),
      expect.any(Function),
    );
    expect(parsed.changes[0].id).toBe("targetChange");
    expect(parsed._projectContext).toMatchObject({
      root: "/target/project",
      stateMode: "disk-snapshot",
      trusted: false,
    });
  });

  test("adv_change_show reads target project snapshot", async () => {
    const output = await changeTools.adv_change_show.execute(
      { changeId: "targetChange", target_path: "/target/project" } as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.id).toBe("targetChange");
    expect(parsed._projectContext.stateMode).toBe("disk-snapshot");
  });

  test("task read tools read target project snapshot", async () => {
    for (const [tool, args] of [
      [taskTools.adv_task_show, { taskId: "tk-target" }],
      [taskTools.adv_task_run_status, { taskId: "tk-target" }],
      [taskTools.adv_task_list, { changeId: "targetChange" }],
      [taskTools.adv_task_ready, { changeId: "targetChange" }],
    ] as const) {
      const output = await tool.execute(
        { ...args, target_path: "/target/project" } as any,
        sourceStore,
      );
      const parsed = parseToolOutput(output);

      expect(parsed._projectContext.stateMode).toBe("disk-snapshot");
    }
  });

  test("adv_gate_status reads target project snapshot", async () => {
    const output = await gateTools.adv_gate_status.execute(
      { changeId: "targetChange", target_path: "/target/project" } as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.changeId).toBe("targetChange");
    expect(parsed._projectContext.stateMode).toBe("disk-snapshot");
  });

  test("adv_status reads target project snapshot", async () => {
    const output = await statusTools.adv_status.execute(
      { target_path: "/target/project" } as any,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.changes.byStatus.active).toBe(1);
    expect(parsed._projectContext.stateMode).toBe("disk-snapshot");
  });
});
