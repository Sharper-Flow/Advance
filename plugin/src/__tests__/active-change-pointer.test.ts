// Tests for rq-activeChangePointer01: phantom pointer prevention.
// Covers T4 (recordTerminalChange), T5 (forget validation + clear),
// T7 (reachability gate + cross-project skip + forget early-return).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { AdvancePlugin } from "../index";
import { getDoctorPointerRepairProvider } from "../tools/doctor";
import {
  getStatus,
  resetStatusForTest,
  setActiveChange,
} from "../events/status";
import { createTempDir, cleanupTempDir } from "./setup";
import type { Store } from "../storage/store-types";
import { getWorktreeBase } from "../utils/project-id";

// Multiple plugin instances register SIGINT/SIGTERM listeners; raise the
// default warning threshold for this test file.
process.setMaxListeners(20);

// Mutable mock store; tests set this before creating the plugin.
let mockStore: Store | null = null;

vi.mock("../plugin-init", async () => {
  const actual =
    await vi.importActual<typeof import("../plugin-init")>("../plugin-init");
  return {
    ...actual,
    tryInitStore: vi.fn(async () => ({
      store: mockStore,
      initError: null,
    })),
  };
});

vi.mock("../tool-registry", async () => {
  const actual =
    await vi.importActual<typeof import("../tool-registry")>(
      "../tool-registry",
    );
  return {
    ...actual,
    createToolMap: vi.fn(() => ({})),
    createDegradedToolMap: vi.fn(() => ({})),
    getRegisteredAdvToolEntries: vi.fn(() => []),
  };
});

vi.mock("../plugin-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../plugin-context")>();
  return {
    ...actual,
    resolveProjectContext: vi.fn(async (directory: string) => ({
      effectiveDir: directory,
      projectId: "0e000000ec00d000000000000000000000000000",
      externalRoot: undefined,
      identityError: undefined,
    })),
  };
});

vi.mock("../events/status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../events/status")>();
  return {
    ...actual,
    setActiveChange: vi.fn(actual.setActiveChange),
  };
});

// Mock target-project resolution so cross-project tests can control the
// target's externalRoot without setting up a real git repo at target_path.
// Test fixtures write change.json at ${target_path}/.adv/changes/${cid}/
// so the mock returns externalRoot = ${target_path}/.adv to match.
vi.mock("../tools/target-project", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../tools/target-project")>();
  return {
    ...actual,
    resolveTargetProject: vi.fn(
      async (input: { currentProjectPath: string; target_path?: string }) => {
        if (!input.target_path) {
          throw new Error(
            "target_path required for mocked resolveTargetProject",
          );
        }
        return {
          root: input.target_path,
          projectId: "0a00e00000ec00d0000000000000000000000000",
          externalRoot: join(input.target_path, ".adv"),
          trusted: true,
          trustSource: "test",
          stateMode: "current" as const,
        };
      },
    ),
  };
});

const createMockPluginInput = (directory: string) => ({
  client: {
    session: {
      get: async ({ path }: { path: { id: string } }) => ({
        data: { id: path.id, parentID: null },
      }),
    },
  },
  project: {
    id: "test-project",
    worktree: directory,
    time: { created: Date.now() },
  },
  directory,
  worktree: directory,
  serverUrl: new URL("http://localhost:3000"),
});

const terminalOutput = (changeId: string, success = true) =>
  JSON.stringify({ success, changeId });

function makeFakeStore(
  overrides: {
    changesDir?: string;
    reachable?: Set<string>;
  } = {},
): Store {
  const reachable = overrides.reachable ?? new Set<string>();
  const changesDir = overrides.changesDir ?? "/tmp/fake-project/.adv/changes";
  return {
    paths: {
      root: "/tmp/fake-project",
      specs: "/tmp/fake-project/.adv/specs",
      docs: "/tmp/fake-project/docs/specs",
      config: "/tmp/fake-project/project.json",
      changes: changesDir,
      archive: "/tmp/fake-project/.adv/archive",
      wisdom: "/tmp/fake-project/.adv/wisdom",
      agenda: "/tmp/fake-project/.adv/agenda",
      reflections: "/tmp/fake-project/.adv/reflections",
      projectMetadata: "/tmp/fake-project/.adv/projectMetadata",
      external: null,
    },
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {
      list: vi.fn(async () => ({ specs: [] })),
      get: vi.fn(),
    },
    changes: {
      get: vi.fn(async (cid: string) => ({
        success: reachable.has(cid),
        data: null,
      })),
      list: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
      archive: vi.fn(),
      reenter: vi.fn(),
      forget: vi.fn(),
      bulkClose: vi.fn(),
      statusRepair: vi.fn(),
    },
    tasks: {
      add: vi.fn(),
      list: vi.fn(async () => []),
      show: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
      ready: vi.fn(async () => ({ ready: [], blocked: [] })),
      reclassifyTdd: vi.fn(),
    },
    gates: {
      get: vi.fn(),
      complete: vi.fn(),
    },
    wisdom: {
      add: vi.fn(),
      list: vi.fn(async () => []),
      search: vi.fn(async () => []),
    },
    agenda: {
      list: vi.fn(async () => []),
      add: vi.fn(),
      complete: vi.fn(),
    },
    reflections: {
      add: vi.fn(),
      list: vi.fn(async () => []),
    },
    projectMetadata: {
      read: vi.fn(),
      write: vi.fn(),
      list: vi.fn(async () => []),
    },
  } as unknown as Store;
}

async function seedDiskChange(
  changesDir: string,
  changeId: string,
): Promise<void> {
  const changeDir = join(changesDir, changeId);
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    join(changeDir, "change.json"),
    JSON.stringify({ id: changeId, status: "active" }),
  );
}

describe("active-change pointer hooks (T4/T5/T7)", () => {
  let tempDir: string;
  let hooks: any;

  beforeEach(async () => {
    resetStatusForTest();
    tempDir = await createTempDir();
    mockStore = makeFakeStore({ changesDir: join(tempDir, ".adv/changes") });
  });

  afterEach(async () => {
    if (hooks?.event) {
      try {
        await hooks.event({
          event: { type: "session.deleted", properties: {} },
        });
      } catch {
        // ignore cleanup errors
      }
    }
    hooks = null;
    await cleanupTempDir(tempDir);
  });

  const createPlugin = async () => {
    hooks = await AdvancePlugin(createMockPluginInput(tempDir) as any);
    await setMainSession("main");
  };

  const setMainSession = async (sessionID: string = "main") => {
    await hooks["experimental.chat.system.transform"]!(
      { sessionID } as any,
      { system: [] } as any,
    );
  };

  describe("T4 — recordTerminalChange post-output hook", () => {
    const setPointerViaCreate = async (changeId: string) => {
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_create" } as any,
        {
          args: { summary: "test" },
          output: JSON.stringify({ changeId }),
        } as any,
      );
    };

    it("clears pointer after successful close with matching changeId", async () => {
      await createPlugin();
      const changeId = "activeClose";
      await setPointerViaCreate(changeId);
      expect(getStatus().activeChangeId).toBe(changeId);

      await hooks["tool.execute.after"]!(
        { tool: "adv_change_close" } as any,
        { args: { changeId }, output: terminalOutput(changeId) } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
    });

    it("does NOT clear when close changeId differs from active pointer", async () => {
      await createPlugin();
      const activeId = "activeOne";
      await setPointerViaCreate(activeId);
      expect(getStatus().activeChangeId).toBe(activeId);

      await hooks["tool.execute.after"]!(
        { tool: "adv_change_close" } as any,
        {
          args: { changeId: "otherId" },
          output: terminalOutput("otherId"),
        } as any,
      );
      expect(getStatus().activeChangeId).toBe(activeId);
    });

    it("does NOT clear on failed close", async () => {
      await createPlugin();
      const activeId = "activeFail";
      await setPointerViaCreate(activeId);
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_close" } as any,
        {
          args: { changeId: activeId },
          output: terminalOutput(activeId, false),
        } as any,
      );
      expect(getStatus().activeChangeId).toBe(activeId);
    });

    it("clears pointer after successful archive with matching changeId", async () => {
      await createPlugin();
      const activeId = "activeArchive";
      await setPointerViaCreate(activeId);
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_archive" } as any,
        {
          args: { changeId: activeId },
          output: terminalOutput(activeId),
        } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
    });

    it("is a no-op when no active pointer is set", async () => {
      await createPlugin();
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_close" } as any,
        {
          args: { changeId: "nobody" },
          output: terminalOutput("nobody"),
        } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
    });
  });

  describe("T5 — phantom-pointer clearing via adv_doctor provider (option B)", () => {
    const setPointerViaCreate = async (changeId: string) => {
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_create" } as any,
        {
          args: { summary: "test" },
          output: JSON.stringify({ changeId }),
        } as any,
      );
    };

    // rq-recoverySurfaceParity01 / rq-doctorConsolidation01 option B:
    // adv_change_forget was retired. Its session-pointer clearing is now
    // owned by adv_doctor via the pointer-repair provider that index.ts
    // injects during plugin init. These tests verify the WIRING: the
    // injected provider reads and clears the real session pointer.

    it("index.ts injects a pointer-repair provider after plugin init", async () => {
      await createPlugin();
      expect(getDoctorPointerRepairProvider()).not.toBeNull();
    });

    it("provider.getActivePointer reflects the current session pointer", async () => {
      await createPlugin();
      const activeId = "providerReads";
      await setPointerViaCreate(activeId);
      expect(getStatus().activeChangeId).toBe(activeId);
      expect(getDoctorPointerRepairProvider()!.getActivePointer()).toBe(
        activeId,
      );
    });

    it("provider.clearActivePointer clears the session pointer", async () => {
      await createPlugin();
      const activeId = "providerClears";
      await setPointerViaCreate(activeId);
      expect(getStatus().activeChangeId).toBe(activeId);
      getDoctorPointerRepairProvider()!.clearActivePointer();
      expect(getStatus().activeChangeId).toBeNull();
    });

    it("provider.clearActivePointer is idempotent when no pointer is set", async () => {
      await createPlugin();
      expect(getStatus().activeChangeId).toBeNull();
      getDoctorPointerRepairProvider()!.clearActivePointer();
      expect(getStatus().activeChangeId).toBeNull();
    });
  });

  describe("T7 — reachability gate in handleToolExecuteBefore", () => {
    it("does not re-point for read-only adv_change_show with reachable changeId", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(["realChange"]),
      });
      await createPlugin();
      await hooks["tool.execute.before"]!(
        { tool: "adv_change_show", sessionID: "main" } as any,
        { args: { changeId: "realChange" } } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
    });

    it("preserves existing pointer for read-only adv_gate_status", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(["activeA", "otherB"]),
      });
      await createPlugin();
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_create" } as any,
        {
          args: { summary: "test" },
          output: JSON.stringify({ changeId: "activeA" }),
        } as any,
      );
      expect(getStatus().activeChangeId).toBe("activeA");

      await hooks["tool.execute.before"]!(
        { tool: "adv_gate_status", sessionID: "main" } as any,
        { args: { changeId: "otherB" } } as any,
      );
      expect(getStatus().activeChangeId).toBe("activeA");
    });

    it("preserves existing pointer for read-only adv_task_list", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(["activeA", "otherB"]),
      });
      await createPlugin();
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_create" } as any,
        {
          args: { summary: "test" },
          output: JSON.stringify({ changeId: "activeA" }),
        } as any,
      );
      expect(getStatus().activeChangeId).toBe("activeA");

      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list", sessionID: "main" } as any,
        { args: { changeId: "otherB" } } as any,
      );
      expect(getStatus().activeChangeId).toBe("activeA");
    });

    it("re-points to a reachable changeId for an allowed active-work mutator", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(["realChange"]),
      });
      await seedDiskChange(join(tempDir, ".adv/changes"), "realChange");
      await createPlugin();
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_update", sessionID: "main" } as any,
        { args: { changeId: "realChange" } } as any,
      );
      expect(getStatus().activeChangeId).toBe("realChange");
    });

    it("preserves existing pointer when changeId is not reachable", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(["existingChange"]),
      });
      await seedDiskChange(join(tempDir, ".adv/changes"), "existingChange");
      await createPlugin();
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_update", sessionID: "main" } as any,
        { args: { changeId: "existingChange" } } as any,
      );
      expect(getStatus().activeChangeId).toBe("existingChange");

      await hooks["tool.execute.before"]!(
        { tool: "adv_task_update", sessionID: "main" } as any,
        { args: { changeId: "typoChange" } } as any,
      );
      expect(getStatus().activeChangeId).toBe("existingChange");
    });

    it("falls back to disk snapshot when store getter returns false but change.json exists", async () => {
      const changesDir = join(tempDir, ".adv/changes");
      const diskOnlyId = "diskOnly";
      await mkdir(join(changesDir, diskOnlyId), { recursive: true });
      await writeFile(
        join(changesDir, diskOnlyId, "change.json"),
        JSON.stringify({ id: diskOnlyId, status: "active" }),
      );
      mockStore = makeFakeStore({ changesDir });
      await createPlugin();
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_update", sessionID: "main" } as any,
        { args: { changeId: diskOnlyId } } as any,
      );
      expect(getStatus().activeChangeId).toBe(diskOnlyId);
    });

    it("re-points caller's pointer for cross-project active-work mutator when target change.json exists", async () => {
      const targetDir = join(tempDir, "other-project");
      const targetChangeId = "otherProjectChange";
      const targetChangesDir = join(
        targetDir,
        ".adv",
        "changes",
        targetChangeId,
      );
      await mkdir(targetChangesDir, { recursive: true });
      await writeFile(
        join(targetChangesDir, "change.json"),
        JSON.stringify({
          id: targetChangeId,
          title: "Other Project Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          epic_membership: {
            epic_id: "epic-1",
            entry_id: "entry-1",
            order: 0,
            title: "Test Entry",
            linked_at: "2026-01-01T00:00:00Z",
          },
        }),
      );

      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv", "changes"),
        reachable: new Set(), // target is reachable only via disk
      });
      await createPlugin();

      await hooks["tool.execute.before"]!(
        { tool: "adv_task_update", sessionID: "main" } as any,
        {
          args: {
            changeId: targetChangeId,
            target_path: targetDir,
          },
        } as any,
      );
      expect(getStatus().activeChangeId).toBe(targetChangeId);
      expect(getStatus().activeEpicId).toBe("epic-1");
    });

    it("does not re-point for cross-project read/diagnostic tool", async () => {
      const targetDir = join(tempDir, "other-project");
      const targetChangeId = "otherProjectChange";
      const targetChangesDir = join(
        targetDir,
        ".adv",
        "changes",
        targetChangeId,
      );
      await mkdir(targetChangesDir, { recursive: true });
      await writeFile(
        join(targetChangesDir, "change.json"),
        JSON.stringify({
          id: targetChangeId,
          title: "Other Project Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          epic_membership: {
            epic_id: "epic-1",
            entry_id: "entry-1",
            order: 0,
            title: "Test Entry",
            linked_at: "2026-01-01T00:00:00Z",
          },
        }),
      );

      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv", "changes"),
        reachable: new Set(),
      });
      await createPlugin();

      await hooks["tool.execute.before"]!(
        { tool: "adv_change_show", sessionID: "main" } as any,
        {
          args: {
            changeId: targetChangeId,
            target_path: targetDir,
          },
        } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
      expect(getStatus().activeEpicId).toBeNull();
    });

    it("clears caller's pointer on cross-project terminal transition with matching changeId", async () => {
      const targetDir = join(tempDir, "other-project");
      const targetChangeId = "otherProjectChange";

      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv", "changes"),
        reachable: new Set(),
      });
      await createPlugin();

      // Establish an active pointer (could have been set by a cross-project repoint)
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_create" } as any,
        {
          args: { summary: "test" },
          output: JSON.stringify({ changeId: targetChangeId }),
        } as any,
      );
      expect(getStatus().activeChangeId).toBe(targetChangeId);

      // Cross-project close with matching changeId clears regardless of project ownership
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_close" } as any,
        {
          args: { changeId: targetChangeId, target_path: targetDir },
          output: terminalOutput(targetChangeId),
        } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
      expect(getStatus().activeEpicId).toBeNull();
    });

    it("provider clears a pointer even when the change is unreachable (phantom)", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(),
      });
      await createPlugin();
      // Set pointer via create after-hook, which is not gated on reachability.
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_create" } as any,
        {
          args: { summary: "test" },
          output: JSON.stringify({ changeId: "ghost" }),
        } as any,
      );
      expect(getStatus().activeChangeId).toBe("ghost");
      // The doctor pointer-repair provider clears unconditionally when
      // invoked; the confirmed-absent gating lives in adv_doctor's probe
      // (covered by doctor.test.ts). Here we assert the wiring clears the
      // real session pointer.
      getDoctorPointerRepairProvider()!.clearActivePointer();
      expect(getStatus().activeChangeId).toBeNull();
    });
  });

  describe("cwd-detect at init (AC1/AC2)", () => {
    const cid = "cwdChange";
    let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;
    let worktreeBase: string;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env.ADV_WORKTREE_HOME = join(tempDir, "worktrees");
      worktreeBase = getWorktreeBase(
        "0e000000ec00d000000000000000000000000000",
      );
    });

    afterEach(() => {
      cwdSpy?.mockRestore();
      cwdSpy = undefined;
      delete process.env.ADV_WORKTREE_HOME;
    });

    it("AC1: seeds pointer from matching worktree cwd", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set([cid]),
      });
      await seedDiskChange(join(tempDir, ".adv/changes"), cid);
      cwdSpy = vi
        .spyOn(process, "cwd")
        .mockReturnValue(`${worktreeBase}/change/${cid}/`);
      await createPlugin();
      expect(getStatus().activeChangeId).toBe(cid);
      expect(setActiveChange).toHaveBeenCalledWith(cid, {});
    });

    it("AC2: leaves pointer null when cwd does not match worktree pattern", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set([cid]),
      });
      await seedDiskChange(join(tempDir, ".adv/changes"), cid);
      cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/some-random-dir");
      await createPlugin();
      expect(getStatus().activeChangeId).toBeNull();
      expect(setActiveChange).not.toHaveBeenCalled();
    });

    it("matches trailing slash on cwd", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set([cid]),
      });
      await seedDiskChange(join(tempDir, ".adv/changes"), cid);
      cwdSpy = vi
        .spyOn(process, "cwd")
        .mockReturnValue(`${worktreeBase}/change/${cid}/`);
      await createPlugin();
      expect(getStatus().activeChangeId).toBe(cid);
    });

    it("matches nested path under change dir", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set([cid]),
      });
      await seedDiskChange(join(tempDir, ".adv/changes"), cid);
      cwdSpy = vi
        .spyOn(process, "cwd")
        .mockReturnValue(`${worktreeBase}/change/${cid}/src/foo/`);
      await createPlugin();
      expect(getStatus().activeChangeId).toBe(cid);
    });

    it("does not seed when changeId segment is empty", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(),
      });
      cwdSpy = vi
        .spyOn(process, "cwd")
        .mockReturnValue(`${worktreeBase}/change/`);
      await createPlugin();
      expect(getStatus().activeChangeId).toBeNull();
      expect(setActiveChange).not.toHaveBeenCalled();
    });

    it("does not seed when changeId is not reachable", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(),
      });
      cwdSpy = vi
        .spyOn(process, "cwd")
        .mockReturnValue(`${worktreeBase}/change/${cid}/`);
      await createPlugin();
      expect(getStatus().activeChangeId).toBeNull();
      expect(setActiveChange).not.toHaveBeenCalled();
    });
  });
});
