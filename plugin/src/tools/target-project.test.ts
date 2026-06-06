import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const SOURCE_PROJECT_ID = "c".repeat(40);
const TARGET_PROJECT_ID = "a".repeat(40);

const mocks = vi.hoisted(() => {
  const diskStore = {
    init: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const temporalStore = {
    init: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const temporalBundle = {
    client: { workflow: { getHandle: vi.fn() } },
    connection: { workflowService: { describeTaskQueue: vi.fn() } },
    namespace: "default",
  };

  return {
    diskStore,
    temporalStore,
    temporalBundle,
    createLegacyStore: vi.fn(async () => diskStore as any),
    createStore: vi.fn(async () => temporalStore as any),
    ensureProjectTemporalQueue: vi.fn(async () => {}),
    getRegisteredTemporalWorkerQueues: vi.fn(() => [] as string[]),
    getTemporalWorkerAliveness: vi.fn(() => false),
    getTemporalWorkerDiagnostics: vi.fn(() => [] as any[]),
    getTemporalWorkerRole: vi.fn(() => "client" as const),
    getProjectId: vi.fn(async () => "a".repeat(40)),
    getService: vi.fn(() => temporalBundle as any),
    loadProjectConfig: vi.fn(async () => null),
    probeTaskQueuePollers: vi.fn(async () => ({
      status: "unavailable" as const,
      lastAccessMs: null,
      error: "mock unavailable",
    })),
  };
});

vi.mock("../storage/store", () => ({
  createLegacyStore: mocks.createLegacyStore,
  createStore: mocks.createStore,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

vi.mock("../storage/json", () => ({
  loadProjectConfig: mocks.loadProjectConfig,
}));

vi.mock("../plugin-init", () => ({
  ensureProjectTemporalQueue: mocks.ensureProjectTemporalQueue,
  getRegisteredTemporalWorkerQueues: mocks.getRegisteredTemporalWorkerQueues,
  getTemporalWorkerAliveness: mocks.getTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics: mocks.getTemporalWorkerDiagnostics,
  getTemporalWorkerRole: mocks.getTemporalWorkerRole,
}));

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../temporal/queue-serviceability", async () => {
  const actual =
    await vi.importActual<typeof import("../temporal/queue-serviceability")>(
      "../temporal/queue-serviceability",
    );
  return {
    ...actual,
    probeTaskQueuePollers: mocks.probeTaskQueuePollers,
  };
});

import {
  resolveTargetProject,
  targetPathSchema,
  withTargetPathStore,
} from "./target-project";

describe("target project resolver", () => {
  const originalXdgDataHome = process.env.XDG_DATA_HOME;
  let root: string;
  let currentProjectPath: string;
  let targetPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    root = await mkdtemp(join(tmpdir(), "adv-target-project-"));
    currentProjectPath = join(root, "source");
    targetPath = join(root, "target");
    await mkdir(join(currentProjectPath, ".git"), { recursive: true });
    await mkdir(join(targetPath, ".git"), { recursive: true });
    mocks.getProjectId.mockImplementation(async (path: string) =>
      path === currentProjectPath ? SOURCE_PROJECT_ID : TARGET_PROJECT_ID,
    );
    process.env.XDG_DATA_HOME = join(
      root,
      "opencode-projects",
      SOURCE_PROJECT_ID,
    );
  });

  afterEach(async () => {
    if (originalXdgDataHome !== undefined)
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    else delete process.env.XDG_DATA_HOME;
    await rm(root, { recursive: true, force: true });
  });

  test("rejects a missing target_path", async () => {
    await expect(
      resolveTargetProject({
        currentProjectPath,
        target_path: join(root, "missing"),
      }),
    ).rejects.toThrow(/target_path does not exist/);
  });

  test("rejects a non-git target_path", async () => {
    const nonGit = join(root, "non-git");
    await mkdir(nonGit, { recursive: true });

    await expect(
      resolveTargetProject({ currentProjectPath, target_path: nonGit }),
    ).rejects.toThrow(/not a git repo/);
  });

  test("resolves a valid untrusted git target", async () => {
    const context = await resolveTargetProject({
      currentProjectPath,
      target_path: targetPath,
    });

    expect(context).toMatchObject({
      root: targetPath,
      projectId: TARGET_PROJECT_ID,
      trusted: false,
      trustSource: "explicit",
      externalRoot: join(
        root,
        "opencode-projects",
        TARGET_PROJECT_ID,
        "opencode/plugins/advance",
        TARGET_PROJECT_ID,
      ),
    });
  });

  test("treats omitted target_path as current project", async () => {
    const context = await resolveTargetProject({ currentProjectPath });

    expect(context).toMatchObject({
      root: currentProjectPath,
      projectId: SOURCE_PROJECT_ID,
      trusted: true,
      trustSource: "current_project",
      stateMode: "current",
    });
  });

  test("marks configured related repositories as trusted", async () => {
    mocks.loadProjectConfig.mockResolvedValueOnce({
      name: "source",
      related_repos: [{ id: "target", path: targetPath }],
    });

    const context = await resolveTargetProject({
      currentProjectPath,
      target_path: targetPath,
    });

    expect(context.trusted).toBe(true);
    expect(context.trustSource).toBe("related_repos");
  });

  test("requires explicit confirmation before untrusted target mutation", async () => {
    await expect(
      resolveTargetProject({
        currentProjectPath,
        target_path: targetPath,
        mutation: true,
      }),
    ).rejects.toThrow(/target_confirmed/);
  });
});

describe("withTargetPathStore", () => {
  const originalXdgDataHome = process.env.XDG_DATA_HOME;
  let root: string;
  let currentProjectPath: string;
  let targetPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    root = await mkdtemp(join(tmpdir(), "adv-target-store-"));
    currentProjectPath = join(root, "source");
    targetPath = join(root, "target");
    await mkdir(join(currentProjectPath, ".git"), { recursive: true });
    await mkdir(join(targetPath, ".git"), { recursive: true });
    mocks.getProjectId.mockResolvedValue(TARGET_PROJECT_ID);
    mocks.ensureProjectTemporalQueue.mockResolvedValue(undefined);
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([]);
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
    mocks.getTemporalWorkerRole.mockReturnValue("client");
    mocks.probeTaskQueuePollers.mockResolvedValue({
      status: "unavailable",
      lastAccessMs: null,
      error: "mock unavailable",
    });
    process.env.XDG_DATA_HOME = join(
      root,
      "opencode-projects",
      SOURCE_PROJECT_ID,
    );
  });

  afterEach(async () => {
    if (originalXdgDataHome !== undefined)
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    else delete process.env.XDG_DATA_HOME;
    await rm(root, { recursive: true, force: true });
  });

  test("opens snapshot-ok targets as disk snapshots without Temporal", async () => {
    const result = await withTargetPathStore(
      {
        currentProjectPath,
        target_path: targetPath,
        stateRequirement: "snapshot-ok",
      },
      async ({ context, store }) => ({ context, store }),
    );

    expect(result.context.stateMode).toBe("disk-snapshot");
    expect(result.store).toBe(mocks.diskStore);
    expect(mocks.createLegacyStore).toHaveBeenCalledWith(targetPath, {
      externalRoot: join(
        root,
        "opencode-projects",
        TARGET_PROJECT_ID,
        "opencode/plugins/advance",
        TARGET_PROJECT_ID,
      ),
    });
    expect(mocks.createStore).not.toHaveBeenCalled();
    expect(mocks.ensureProjectTemporalQueue).not.toHaveBeenCalled();
    expect(mocks.diskStore.init).not.toHaveBeenCalled();
    expect(mocks.diskStore.close).toHaveBeenCalled();
  });

  test("opens scaffold targets as initialized disk stores", async () => {
    const result = await withTargetPathStore(
      {
        currentProjectPath,
        target_path: targetPath,
        stateRequirement: "scaffold",
        target_confirmed: true,
        confirmationEvidence: "user approved target scaffold",
      },
      async ({ context }) => context,
    );

    expect(result.stateMode).toBe("scaffold");
    expect(mocks.createLegacyStore).toHaveBeenCalled();
    expect(mocks.diskStore.init).toHaveBeenCalled();
  });

  test("opens temporal-required targets through target queue and Temporal store", async () => {
    const result = await withTargetPathStore(
      {
        currentProjectPath,
        target_path: targetPath,
        stateRequirement: "temporal-required",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
      },
      async ({ context, store }) => ({ context, store }),
    );

    expect(result.context.stateMode).toBe("temporal");
    expect(result.store).toBe(mocks.temporalStore);
    expect(mocks.ensureProjectTemporalQueue).toHaveBeenCalledWith(
      TARGET_PROJECT_ID,
    );
    expect(mocks.createStore).toHaveBeenCalledWith(targetPath, {
      externalRoot: join(
        root,
        "opencode-projects",
        TARGET_PROJECT_ID,
        "opencode/plugins/advance",
        TARGET_PROJECT_ID,
      ),
      projectIdOverride: TARGET_PROJECT_ID,
      temporalBundle: mocks.temporalBundle,
    });
    expect(mocks.temporalStore.init).toHaveBeenCalled();
    expect(mocks.temporalStore.close).toHaveBeenCalled();
  });

  test("opens temporal-required targets when a client-only process sees a fresh server poller", async () => {
    mocks.ensureProjectTemporalQueue.mockRejectedValueOnce(
      new Error("no local worker"),
    );
    mocks.probeTaskQueuePollers.mockResolvedValueOnce({
      status: "fresh",
      lastAccessMs: 12_000,
    });

    const result = await withTargetPathStore(
      {
        currentProjectPath,
        target_path: targetPath,
        stateRequirement: "temporal-required",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
      },
      async ({ context, store }) => ({ context, store }),
    );

    expect(result.context.stateMode).toBe("temporal");
    expect(result.store).toBe(mocks.temporalStore);
    expect(mocks.probeTaskQueuePollers).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "default",
        taskQueue: `advance-${TARGET_PROJECT_ID}`,
        freshPollerMs: 60_000,
      }),
    );
    expect(mocks.createStore).toHaveBeenCalled();
  });

  test("fails closed before opening a temporal store when target queue readiness is unproven", async () => {
    mocks.ensureProjectTemporalQueue.mockRejectedValueOnce(
      new Error("no local worker"),
    );
    mocks.probeTaskQueuePollers.mockResolvedValueOnce({
      status: "none",
      lastAccessMs: null,
    });

    await expect(
      withTargetPathStore(
        {
          currentProjectPath,
          target_path: targetPath,
          stateRequirement: "temporal-required",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        async () => null,
      ),
    ).rejects.toThrow(
      /Target project Temporal queue is not serviceable.*server_poller_absent.*open or restart/s,
    );
    expect(mocks.createStore).not.toHaveBeenCalled();
  });

  test("opens temporal-required dry-run targets as Temporal stores without mutation confirmation", async () => {
    const result = await withTargetPathStore(
      {
        currentProjectPath,
        target_path: targetPath,
        stateRequirement: "temporal-required",
        mutation: false,
      },
      async ({ context, store }) => ({ context, store }),
    );

    expect(result.context.stateMode).toBe("temporal");
    expect(result.store).toBe(mocks.temporalStore);
    expect(mocks.ensureProjectTemporalQueue).toHaveBeenCalledWith(
      TARGET_PROJECT_ID,
    );
    expect(mocks.createStore).toHaveBeenCalledWith(targetPath, {
      externalRoot: join(
        root,
        "opencode-projects",
        TARGET_PROJECT_ID,
        "opencode/plugins/advance",
        TARGET_PROJECT_ID,
      ),
      projectIdOverride: TARGET_PROJECT_ID,
      temporalBundle: mocks.temporalBundle,
    });
  });

  test("fails closed when temporal-required store has no Temporal service", async () => {
    mocks.getService.mockReturnValueOnce(null);

    await expect(
      withTargetPathStore(
        {
          currentProjectPath,
          target_path: targetPath,
          stateRequirement: "temporal-required",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        async () => null,
      ),
    ).rejects.toThrow(/Temporal service layer/);
  });
});

describe("targetPathSchema", () => {
  test("defines the shared target_path argument family", () => {
    const parsed = targetPathSchema.parse({
      target_path: "/repo/target",
      target_confirmed: true,
      confirmationEvidence: "user approved target mutation",
    });

    expect(parsed).toEqual({
      target_path: "/repo/target",
      target_confirmed: true,
      confirmationEvidence: "user approved target mutation",
    });
  });
});
