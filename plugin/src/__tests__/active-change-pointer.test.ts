import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { AdvancePlugin } from "../index";
import { getStatus, resetStatusForTest } from "../events/status";
import { createTempDir, cleanupTempDir } from "./setup";
import type { Store } from "../storage/store-types";

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

vi.mock("../tool-registry", () => ({
  createToolMap: vi.fn(() => ({})),
  createDegradedToolMap: vi.fn(() => ({})),
}));

const createMockPluginInput = (directory: string) => ({
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

const forgetOutput = (changeId: string) =>
  JSON.stringify({ success: true, changeId, action: "forget", cleared: true });

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

  describe("T5 — adv_change_forget validation + clear", () => {
    const setPointerViaCreate = async (changeId: string) => {
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_create" } as any,
        {
          args: { summary: "test" },
          output: JSON.stringify({ changeId }),
        } as any,
      );
    };

    it("clears pointer when changeId matches active pointer", async () => {
      await createPlugin();
      const activeId = "forgetMatch";
      await setPointerViaCreate(activeId);
      expect(getStatus().activeChangeId).toBe(activeId);
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_forget" } as any,
        { args: { changeId: activeId }, output: forgetOutput(activeId) } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
    });

    it("throws FORGET_MISMATCH when changeId does not match active pointer", async () => {
      await createPlugin();
      const activeId = "forgetActive";
      await setPointerViaCreate(activeId);
      expect(getStatus().activeChangeId).toBe(activeId);
      await expect(
        hooks["tool.execute.before"]!(
          { tool: "adv_change_forget" } as any,
          { args: { changeId: "wrongId" } } as any,
        ),
      ).rejects.toThrow(/FORGET_MISMATCH/);
    });

    it("is idempotent when no active pointer is set", async () => {
      await createPlugin();
      await expect(
        hooks["tool.execute.before"]!(
          { tool: "adv_change_forget" } as any,
          { args: { changeId: "anything" } } as any,
        ),
      ).resolves.toBeUndefined();
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_forget" } as any,
        {
          args: { changeId: "anything" },
          output: forgetOutput("anything"),
        } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
    });

    it("is idempotent after pointer already cleared", async () => {
      await createPlugin();
      const activeId = "forgetTwice";
      await setPointerViaCreate(activeId);
      expect(getStatus().activeChangeId).toBe(activeId);
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_forget" } as any,
        { args: { changeId: activeId }, output: forgetOutput(activeId) } as any,
      );
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_forget" } as any,
        { args: { changeId: activeId }, output: forgetOutput(activeId) } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
    });
  });

  describe("T7 — reachability gate in handleToolExecuteBefore", () => {
    it("re-points to a reachable changeId", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(["realChange"]),
      });
      await createPlugin();
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId: "realChange" } } as any,
      );
      expect(getStatus().activeChangeId).toBe("realChange");
    });

    it("preserves existing pointer when changeId is not reachable", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(["existingChange"]),
      });
      await createPlugin();
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId: "existingChange" } } as any,
      );
      expect(getStatus().activeChangeId).toBe("existingChange");

      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
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
        { tool: "adv_task_list" } as any,
        { args: { changeId: diskOnlyId } } as any,
      );
      expect(getStatus().activeChangeId).toBe(diskOnlyId);
    });

    it("does not touch caller pointer for cross-project target_path calls", async () => {
      mockStore = makeFakeStore({
        changesDir: join(tempDir, ".adv/changes"),
        reachable: new Set(["otherProjectChange"]),
      });
      await createPlugin();
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        {
          args: {
            changeId: "otherProjectChange",
            target_path: "/some/other/project",
          },
        } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
    });

    it("lets adv_change_forget bypass the reachability gate", async () => {
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
      // Forget should succeed even though the change is not reachable.
      await hooks["tool.execute.before"]!(
        { tool: "adv_change_forget" } as any,
        { args: { changeId: "ghost" } } as any,
      );
      await hooks["tool.execute.after"]!(
        { tool: "adv_change_forget" } as any,
        { args: { changeId: "ghost" }, output: forgetOutput("ghost") } as any,
      );
      expect(getStatus().activeChangeId).toBeNull();
    });
  });
});
