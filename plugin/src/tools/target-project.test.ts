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
    restartCurrentProjectTemporalWorker: vi.fn(async () => {}),
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
  restartCurrentProjectTemporalWorker:
    mocks.restartCurrentProjectTemporalWorker,
}));

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../temporal/queue-serviceability", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/queue-serviceability")
  >("../temporal/queue-serviceability");
  return {
    ...actual,
    probeTaskQueuePollers: mocks.probeTaskQueuePollers,
  };
});

import {
  ensureTargetMutationQueueReady,
  formatTargetProjectContext,
  resolveTargetProject,
  TargetProjectError,
  targetPathSchema,
  withOptionalTargetPathStore,
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
    // Simulate realistic post-registration state: a resolved registration
    // means the worker diagnostics immediately show the queue as live
    // (register-ack semantics), matching production worker behavior.
    mocks.ensureProjectTemporalQueue.mockImplementation(async () => {
      const queue = `advance-${TARGET_PROJECT_ID}`;
      mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([queue]);
      mocks.getTemporalWorkerDiagnostics.mockReturnValue([
        {
          kind: "in_process" as const,
          queues: [queue],
          failedQueues: [] as string[],
          alive: true,
        },
      ]);
      mocks.getTemporalWorkerAliveness.mockReturnValue(true);
      mocks.getTemporalWorkerRole.mockReturnValue("host");
    });
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
    expect(mocks.getService).not.toHaveBeenCalled();
    expect(mocks.restartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
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
    // Local registration was attempted before the server probe, and the
    // server probe completed before any target store was created.
    const registerOrder =
      mocks.ensureProjectTemporalQueue.mock.invocationCallOrder[0]!;
    const probeOrder = mocks.probeTaskQueuePollers.mock.invocationCallOrder[0]!;
    const createOrder = mocks.createStore.mock.invocationCallOrder[0]!;
    expect(registerOrder).toBeLessThan(probeOrder);
    expect(probeOrder).toBeLessThan(createOrder);
    expect(mocks.createStore).toHaveBeenCalled();
  });

  test.each([
    {
      status: "none" as const,
      lastAccessMs: null,
      blocker: "server_poller_absent",
    },
    {
      status: "stale" as const,
      lastAccessMs: 120_000,
      blocker: "server_poller_stale",
    },
    {
      status: "unavailable" as const,
      lastAccessMs: null,
      error: "describeTaskQueue unavailable",
      blocker: "server_poller_probe_unavailable",
    },
  ])(
    "fails closed before opening a temporal store when target queue poller evidence is $status",
    async ({ blocker, ...probe }) => {
      mocks.ensureProjectTemporalQueue.mockRejectedValueOnce(
        new Error("no local worker"),
      );
      mocks.probeTaskQueuePollers.mockResolvedValueOnce(probe);
      const callback = vi.fn(async () => null);

      await expect(
        withTargetPathStore(
          {
            currentProjectPath,
            target_path: targetPath,
            stateRequirement: "temporal-required",
            target_confirmed: true,
            confirmationEvidence: "user approved target mutation",
          },
          callback,
        ),
      ).rejects.toThrow(
        new RegExp(
          `Target project Temporal queue is not serviceable.*${blocker}.*remediation=open or restart`,
          "s",
        ),
      );
      // Pre-mutation invariant: no target store creation, no store init, no
      // workflow signal, and no mutation callback on readiness failure.
      expect(mocks.createStore).not.toHaveBeenCalled();
      expect(mocks.temporalStore.init).not.toHaveBeenCalled();
      expect(
        mocks.temporalBundle.client.workflow.getHandle,
      ).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    },
  );

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

// rq-targetReadAuthority01: every snapshot-ok target read tool funnels through
// withOptionalTargetPathStore / withTargetPathStore("snapshot-ok"). These tests
// pin the structural contract at that shared seam: the returned target context
// must explicitly identify the data as a non-authoritative disk snapshot, and
// the snapshot path must not touch target worker lifecycle or Temporal state.
describe("target snapshot read authority marking", () => {
  const originalXdgDataHome = process.env.XDG_DATA_HOME;
  let root: string;
  let currentProjectPath: string;
  let targetPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    root = await mkdtemp(join(tmpdir(), "adv-target-read-authority-"));
    currentProjectPath = join(root, "source");
    targetPath = join(root, "target");
    await mkdir(join(currentProjectPath, ".git"), { recursive: true });
    await mkdir(join(targetPath, ".git"), { recursive: true });
    mocks.getProjectId.mockResolvedValue(TARGET_PROJECT_ID);
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

  test("withOptionalTargetPathStore marks target snapshot reads as non-authoritative disk snapshots", async () => {
    const sourceStore = { paths: { root: currentProjectPath } };

    const seen = await withOptionalTargetPathStore(
      { store: sourceStore as never, target_path: targetPath },
      async (store, projectContext) => ({ store, projectContext }),
    );

    // Snapshot reads open the target as a legacy disk store rooted at the
    // resolved target project's canonical external root — never a
    // Temporal-backed store, never worker lifecycle mutation.
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
    expect(mocks.getService).not.toHaveBeenCalled();
    expect(mocks.ensureProjectTemporalQueue).not.toHaveBeenCalled();
    expect(mocks.restartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
    // The emitted context explicitly identifies the returned data as a
    // non-authoritative disk snapshot of the resolved target project.
    expect(seen.projectContext).toMatchObject({
      root: targetPath,
      projectId: TARGET_PROJECT_ID,
      stateMode: "disk-snapshot",
      authority: "disk_snapshot_non_authoritative",
    });
    expect(seen.projectContext?.warning).toContain(
      "Non-authoritative disk snapshot",
    );
  });

  test("withOptionalTargetPathStore without target_path emits no project context and opens no target store", async () => {
    const sourceStore = { paths: { root: currentProjectPath } };

    const seen = await withOptionalTargetPathStore(
      { store: sourceStore as never },
      async (store, projectContext) => ({ store, projectContext }),
    );

    expect(seen.store).toBe(sourceStore);
    expect(seen.projectContext).toBeUndefined();
    expect(mocks.createLegacyStore).not.toHaveBeenCalled();
    expect(mocks.createStore).not.toHaveBeenCalled();
  });

  test("snapshot-ok target context formats as a non-authoritative disk snapshot", async () => {
    const formatted = await withTargetPathStore(
      {
        currentProjectPath,
        target_path: targetPath,
        stateRequirement: "snapshot-ok",
      },
      async ({ context }) => formatTargetProjectContext(context),
    );

    expect(formatted).toMatchObject({
      root: targetPath,
      projectId: TARGET_PROJECT_ID,
      stateMode: "disk-snapshot",
      authority: "disk_snapshot_non_authoritative",
    });
    expect(formatted.warning).toContain("Non-authoritative disk snapshot");
    // rq-targetReadAuthority01.2: snapshot reads must not register, restart,
    // or otherwise mutate target worker lifecycle or Temporal state.
    expect(mocks.ensureProjectTemporalQueue).not.toHaveBeenCalled();
    expect(mocks.getService).not.toHaveBeenCalled();
    expect(mocks.createStore).not.toHaveBeenCalled();
  });

  test("temporal-required target context is authoritative and carries no snapshot marker", async () => {
    mocks.ensureProjectTemporalQueue.mockImplementation(async () => {
      const queue = `advance-${TARGET_PROJECT_ID}`;
      mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([queue]);
      mocks.getTemporalWorkerDiagnostics.mockReturnValue([
        {
          kind: "in_process" as const,
          queues: [queue],
          failedQueues: [] as string[],
          alive: true,
        },
      ]);
      mocks.getTemporalWorkerAliveness.mockReturnValue(true);
      mocks.getTemporalWorkerRole.mockReturnValue("host");
    });

    const formatted = await withTargetPathStore(
      {
        currentProjectPath,
        target_path: targetPath,
        stateRequirement: "temporal-required",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
      },
      async ({ context }) => formatTargetProjectContext(context),
    );

    expect(formatted.stateMode).toBe("temporal");
    expect(formatted.authority).toBeUndefined();
    expect(formatted.warning ?? "").not.toContain(
      "Non-authoritative disk snapshot",
    );
  });
});

describe("ensureTargetMutationQueueReady", () => {
  const expectedQueue = `advance-${TARGET_PROJECT_ID}`;

  function liveLocalDiagnostics() {
    return [
      {
        kind: "in_process" as const,
        queues: [expectedQueue],
        failedQueues: [] as string[],
        alive: true,
      },
    ];
  }

  function failedLocalDiagnostics() {
    return [
      {
        kind: "in_process" as const,
        queues: [expectedQueue],
        failedQueues: [expectedQueue],
        alive: false,
      },
    ];
  }

  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  test("admits an already-registered live local queue without server evidence", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([expectedQueue]);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue(liveLocalDiagnostics());
    mocks.getTemporalWorkerAliveness.mockReturnValue(true);
    mocks.getTemporalWorkerRole.mockReturnValue("host");

    const result = await ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mocks.temporalBundle as any,
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("local");
    expect(result.expectedQueue).toBe(expectedQueue);
    expect(result.evidence.localRegistered).toBe(true);
    expect(result.evidence.localWorkerAlive).toBe(true);
    expect(mocks.ensureProjectTemporalQueue).not.toHaveBeenCalled();
    expect(mocks.probeTaskQueuePollers).not.toHaveBeenCalled();
  });

  test("registers the local target queue before consulting server evidence", async () => {
    mocks.ensureProjectTemporalQueue.mockImplementation(async () => {
      mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([expectedQueue]);
      mocks.getTemporalWorkerDiagnostics.mockReturnValue(
        liveLocalDiagnostics(),
      );
      mocks.getTemporalWorkerAliveness.mockReturnValue(true);
      mocks.getTemporalWorkerRole.mockReturnValue("host");
    });

    const result = await ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mocks.temporalBundle as any,
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("local");
    expect(mocks.ensureProjectTemporalQueue).toHaveBeenCalledWith(
      TARGET_PROJECT_ID,
    );
    expect(mocks.probeTaskQueuePollers).not.toHaveBeenCalled();
  });

  test("accepts a fresh server poller as conservative admission evidence without claiming local liveness", async () => {
    mocks.ensureProjectTemporalQueue.mockRejectedValueOnce(
      new Error("no local worker"),
    );
    mocks.probeTaskQueuePollers.mockResolvedValueOnce({
      status: "fresh",
      lastAccessMs: 12_000,
    });

    const result = await ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mocks.temporalBundle as any,
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("server");
    // Admission only: fresh server poller evidence must not be reported as
    // guaranteed local worker liveness.
    expect(result.evidence.localRegistered).toBe(false);
    expect(result.evidence.localWorkerAlive).toBe(false);
    expect(result.blockers).toEqual([]);
    const registerOrder =
      mocks.ensureProjectTemporalQueue.mock.invocationCallOrder[0]!;
    const probeOrder = mocks.probeTaskQueuePollers.mock.invocationCallOrder[0]!;
    expect(registerOrder).toBeLessThan(probeOrder);
    expect(mocks.probeTaskQueuePollers).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: expectedQueue,
        freshPollerMs: 60_000,
      }),
    );
  });

  test("does not admit a registered-but-failed local queue without fresh server evidence", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([expectedQueue]);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue(
      failedLocalDiagnostics(),
    );
    mocks.getTemporalWorkerRole.mockReturnValue("host");

    const attempt = ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mocks.temporalBundle as any,
    });

    await expect(attempt).rejects.toThrow(TargetProjectError);
    await expect(attempt).rejects.toThrow(/local_worker_not_alive/);
    await expect(attempt).rejects.toThrow(/server_poller_probe_unavailable/);
    // Registration state alone must not short-circuit readiness: the failed
    // queue falls through to the bounded server probe before failing closed.
    expect(mocks.probeTaskQueuePollers).toHaveBeenCalled();
  });

  test("treats a registered-but-failed local queue as inadmissible even when a fresh server poller admits", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([expectedQueue]);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue(
      failedLocalDiagnostics(),
    );
    mocks.getTemporalWorkerRole.mockReturnValue("host");
    mocks.probeTaskQueuePollers.mockResolvedValueOnce({
      status: "fresh",
      lastAccessMs: 5_000,
    });

    const result = await ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mocks.temporalBundle as any,
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("server");
    expect(result.evidence.localRegistered).toBe(false);
    expect(result.evidence.localWorkerAlive).toBe(false);
  });

  test.each([
    {
      probe: { status: "stale" as const, lastAccessMs: 120_000 },
      expectedStatus: "not_serviceable",
      blocker: "server_poller_stale",
    },
    {
      probe: { status: "none" as const, lastAccessMs: null },
      expectedStatus: "not_serviceable",
      blocker: "server_poller_absent",
    },
    {
      probe: {
        status: "unavailable" as const,
        lastAccessMs: null,
        error: "describeTaskQueue unavailable",
      },
      expectedStatus: "unknown",
      blocker: "server_poller_probe_unavailable",
    },
  ])(
    "fails with queue, status, confidence, blockers, and remediation when poller evidence is $probe.status",
    async ({ probe, expectedStatus, blocker }) => {
      mocks.ensureProjectTemporalQueue.mockRejectedValueOnce(
        new Error("no local worker"),
      );
      mocks.probeTaskQueuePollers.mockResolvedValueOnce(probe);

      const error: Error = await ensureTargetMutationQueueReady({
        projectId: TARGET_PROJECT_ID,
        temporalBundle: mocks.temporalBundle as any,
      }).then(
        () => {
          throw new Error("expected readiness failure");
        },
        (err) => err as Error,
      );

      expect(error).toBeInstanceOf(TargetProjectError);
      const segments = error.message.split("; ");
      expect(segments).toHaveLength(5);
      expect(segments[0]).toBe(
        `Target project Temporal queue is not serviceable for target_path mutation: ${expectedQueue}`,
      );
      expect(segments[1]).toBe(`status=${expectedStatus}`);
      expect(segments[2]).toBe("confidence=none");
      expect(segments[3]).toContain("blockers=");
      expect(segments[3]).toContain(blocker);
      expect(segments[4]).toBe(
        "remediation=open or restart the target project ADV worker, then retry the target_path mutation",
      );
    },
  );
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

function makeTargetContext(
  overrides: Partial<
    Omit<
      import("./target-project").TargetProjectContext,
      "root" | "projectId" | "externalRoot"
    >
  >,
): import("./target-project").TargetProjectContext {
  return {
    root: "/repo/target",
    projectId: TARGET_PROJECT_ID,
    externalRoot: "/repo/target/.advance",
    trusted: true,
    trustSource: "current_project",
    stateMode: "current",
    ...overrides,
  };
}

describe("formatTargetProjectContext", () => {
  test("disk-snapshot trusted output carries non-authoritative metadata", () => {
    const context = makeTargetContext({
      trusted: true,
      trustSource: "related_repos",
      stateMode: "disk-snapshot",
    });

    expect(formatTargetProjectContext(context)).toEqual({
      root: context.root,
      projectId: context.projectId,
      trusted: true,
      trustSource: "related_repos",
      stateMode: "disk-snapshot",
      authority: "disk_snapshot_non_authoritative",
      warning:
        "Non-authoritative disk snapshot: Temporal-backed target state was not consulted.",
    });
  });

  test("disk-snapshot untrusted output merges non-authoritative and untrusted warnings", () => {
    const context = makeTargetContext({
      trusted: false,
      trustSource: "explicit",
      stateMode: "disk-snapshot",
    });

    const formatted = formatTargetProjectContext(context);

    expect(formatted.authority).toBe("disk_snapshot_non_authoritative");
    expect(formatted.warning).toContain(
      "Non-authoritative disk snapshot: Temporal-backed target state was not consulted.",
    );
    expect(formatted.warning).toContain(
      "Read-only untrusted target_path snapshot. Mutations require explicit target confirmation.",
    );
  });

  test("current project output omits authority and warning", () => {
    const context = makeTargetContext({
      trusted: true,
      trustSource: "current_project",
      stateMode: "current",
    });

    expect(formatTargetProjectContext(context)).toEqual({
      root: context.root,
      projectId: context.projectId,
      trusted: true,
      trustSource: "current_project",
      stateMode: "current",
    });
  });

  test.each(["temporal", "scaffold"] as const)(
    "%s state mode remains backward-compatible without authority or warning when trusted",
    (stateMode) => {
      const context = makeTargetContext({
        trusted: true,
        trustSource: "related_repos",
        stateMode,
      });

      expect(formatTargetProjectContext(context)).toEqual({
        root: context.root,
        projectId: context.projectId,
        trusted: true,
        trustSource: "related_repos",
        stateMode,
      });
    },
  );

  test("non-disk-snapshot untrusted output keeps the original warning only", () => {
    const context = makeTargetContext({
      trusted: false,
      trustSource: "explicit",
      stateMode: "temporal",
    });

    expect(formatTargetProjectContext(context)).toEqual({
      root: context.root,
      projectId: context.projectId,
      trusted: false,
      trustSource: "explicit",
      stateMode: "temporal",
      warning:
        "Read-only untrusted target_path snapshot. Mutations require explicit target confirmation.",
    });
  });
});
