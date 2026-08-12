// Tests for the runtime role firewall (Decision 3, AC4/AC6/AC7/AC8).
//
// Covers both the pure predicate in tool-role-firewall.ts and the
// integration through the plugin's tool.execute.before hook. Runtime role is
// resolved from the caller session's SDK parentID ancestry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";

import { AdvancePlugin } from "./index";
import { getStatus, resetStatusForTest } from "./events/status";
import { createTempDir, cleanupTempDir } from "./__tests__/setup";
import type { Store } from "./storage/store-types";
import {
  RoleFirewallError,
  resolveBlockableSet,
  resolveRootSessionId,
  roleFirewallCheck,
} from "./tool-role-firewall";
import * as policyModule from "./tool-role-policy";

process.setMaxListeners(20);

let mockStore: Store | null = null;
const sessionParents = new Map<string, string | null>();
const sessionGet = vi.fn(async ({ path }: { path: { id: string } }) => {
  if (!sessionParents.has(path.id)) return { data: undefined };
  return {
    data: {
      id: path.id,
      parentID: sessionParents.get(path.id) ?? null,
    },
  };
});

vi.mock("./plugin-init", async () => {
  const actual =
    await vi.importActual<typeof import("./plugin-init")>("./plugin-init");
  return {
    ...actual,
    tryInitStore: vi.fn(async () => ({
      store: mockStore,
      initError: null,
    })),
  };
});

vi.mock("./tool-registry", async () => {
  const actual =
    await vi.importActual<typeof import("./tool-registry")>("./tool-registry");
  return {
    ...actual,
    createToolMap: vi.fn(() => ({})),
    createDegradedToolMap: vi.fn(() => ({})),
  };
});

const createMockPluginInput = (directory: string) => ({
  project: {
    id: "test-project",
    worktree: directory,
    time: { created: Date.now() },
  },
  directory,
  worktree: directory,
  serverUrl: new URL("http://localhost:3000"),
  client: {
    session: {
      get: sessionGet,
    },
  },
});

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

describe("RoleFirewallError", () => {
  it("has stable code, tool, reason, and resolution fields", () => {
    const err = new RoleFirewallError(
      "adv_gate_complete",
      "blocked from sub-agent",
      "sub_agent",
    );
    expect(err.code).toBe("ROLE_FIREWALL_BLOCK");
    expect(err.tool).toBe("adv_gate_complete");
    expect(err.reason).toBe("blocked from sub-agent");
    expect(err.resolution).toBe("sub_agent");
    expect(err.message).toMatch(/^Role firewall:/);
    expect(err.name).toBe("RoleFirewallError");
  });
});

describe("resolveBlockableSet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the expected blockable complement of the union floor", () => {
    const { blockable, usedFallback } = resolveBlockableSet();
    // Representative TIER_1 (union-floor) tools must NOT be blockable.
    expect(blockable.has("adv_change_show")).toBe(false);
    expect(blockable.has("adv_task_list")).toBe(false);
    expect(blockable.has("adv_gate_status")).toBe(false);
    expect(blockable.has("adv_gate_complete")).toBe(false);
    expect(blockable.has("adv_tool_invoke")).toBe(false);
    // Representative Tier 2/3 tools MUST be blockable.
    expect(blockable.has("adv_run_test")).toBe(false);
    expect(blockable.has("adv_worktree_create")).toBe(true);
    expect(usedFallback).toBe(false);
  });

  it("fails closed to the union floor when blockable derivation throws", () => {
    vi.spyOn(policyModule, "blockableFromSubAgentSession").mockImplementation(
      () => {
        throw new Error("simulated runtime derivation failure");
      },
    );
    const { blockable, usedFallback } = resolveBlockableSet();
    expect(usedFallback).toBe(true);
    // TIER_1 union-floor tools remain allowed; everything else is blocked.
    expect(blockable.has("adv_change_show")).toBe(false);
    expect(blockable.has("adv_task_list")).toBe(false);
    expect(blockable.has("adv_run_test")).toBe(false);
  });

  it("fails closed to the union floor when blockable derivation yields empty", () => {
    vi.spyOn(policyModule, "blockableFromSubAgentSession").mockReturnValue(
      Object.freeze([]),
    );
    const { blockable, usedFallback } = resolveBlockableSet();
    expect(usedFallback).toBe(true);
    expect(blockable.has("adv_change_show")).toBe(false);
    expect(blockable.has("adv_run_test")).toBe(false);
  });

  it("fails closed to the union floor when blockable derivation is incomplete", () => {
    vi.spyOn(policyModule, "blockableFromSubAgentSession").mockReturnValue(
      Object.freeze(["adv_worktree_create"]),
    );
    const { blockable, usedFallback } = resolveBlockableSet();
    expect(usedFallback).toBe(true);
    expect(blockable.has("adv_change_show")).toBe(false);
    expect(blockable.has("adv_run_test")).toBe(false);
  });
});

describe("roleFirewallCheck predicate", () => {
  it("is a no-op for non-adv_* tools", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "write",
        callerSessionID: "sub",
        mainSessionId: "main",
      }),
    ).not.toThrow();
  });

  it("allows union-floor tools from sub-agent sessions", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "adv_change_show",
        callerSessionID: "sub-agent",
        mainSessionId: "main-session",
      }),
    ).not.toThrow();
  });

  it("allows blockable tools from the main session", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "adv_worktree_create",
        callerSessionID: "main-session",
        mainSessionId: "main-session",
      }),
    ).not.toThrow();
  });

  it("blocks blockable tools from sub-agent sessions", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "adv_worktree_create",
        callerSessionID: "sub-agent",
        mainSessionId: "main-session",
      }),
    ).toThrow(RoleFirewallError);
  });

  it("blocks blockable tools when mainSessionId is unresolved", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "adv_worktree_create",
        callerSessionID: "anything",
      }),
    ).toThrow(RoleFirewallError);
  });

  it("blocks blockable tools when callerSessionID is missing", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "adv_worktree_create",
        mainSessionId: "main-session",
      }),
    ).toThrow(RoleFirewallError);
  });
});

describe("resolveRootSessionId", () => {
  it("resolves and caches the root for a descendant session", async () => {
    const cache = new Map<string, string>();
    const client = {
      session: {
        get: vi.fn(async ({ path }: { path: { id: string } }) => ({
          data:
            path.id === "child"
              ? { id: "child", parentID: "root" }
              : { id: "root", parentID: null },
        })),
      },
    };

    await expect(
      resolveRootSessionId({ callerSessionID: "child", client, cache }),
    ).resolves.toBe("root");
    expect(cache.get("child")).toBe("root");
    expect(cache.get("root")).toBe("root");
  });

  it("fails closed on cyclic ancestry", async () => {
    const client = {
      session: {
        get: vi.fn(async ({ path }: { path: { id: string } }) => ({
          data: {
            id: path.id,
            parentID: path.id === "left" ? "right" : "left",
          },
        })),
      },
    };

    await expect(
      resolveRootSessionId({ callerSessionID: "left", client }),
    ).resolves.toBeNull();
  });

  it("fails closed when the SDK lookup throws", async () => {
    const client = {
      session: {
        get: vi.fn(async () => {
          throw new Error("session service unavailable");
        }),
      },
    };

    await expect(
      resolveRootSessionId({ callerSessionID: "root", client }),
    ).resolves.toBeNull();
  });
});

describe("Runtime role firewall in tool.execute.before", () => {
  let tempDir: string;
  let hooks: any;

  beforeEach(async () => {
    resetStatusForTest();
    sessionParents.clear();
    sessionGet.mockClear();
    sessionParents.set("main", null);
    sessionParents.set("main-session", null);
    sessionParents.set("sub-agent", "main");
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

  const setMainSession = async (sessionID: string) => {
    await hooks["experimental.chat.system.transform"]!(
      { sessionID } as any,
      { system: [] } as any,
    );
  };

  const callToolBefore = async (
    toolName: string,
    sessionID: string | undefined,
    args: Record<string, unknown> = {},
  ) => {
    const input =
      sessionID === undefined
        ? ({ tool: toolName } as any)
        : ({ tool: toolName, sessionID } as any);
    return hooks["tool.execute.before"]!(input, { args } as any);
  };

  it("blocks invoke-only adv_worktree_create from a sub-agent session", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_worktree_create", "sub-agent", { changeId: "x" }),
    ).rejects.toThrow(RoleFirewallError);
  });

  it("allows union-floor adv_change_show from a sub-agent session", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_change_show", "sub-agent"),
    ).resolves.toBeUndefined();
  });

  it("allows union-floor adv_task_list from a sub-agent session", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_task_list", "sub-agent"),
    ).resolves.toBeUndefined();
  });

  it("allows blockable adv_change_create from the root session", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_worktree_create", "main", { changeId: "x" }),
    ).resolves.toBeUndefined();
  });

  it("allows the root orchestrator before any system transform runs", async () => {
    await createPlugin();
    await expect(
      callToolBefore("adv_worktree_create", "main", { changeId: "x" }),
    ).resolves.toBeUndefined();
  });

  it("does not let a sub-agent transform steal root orchestrator authority", async () => {
    await createPlugin();
    await hooks["experimental.chat.system.transform"]!(
      { sessionID: "sub-agent" } as any,
      { system: [] } as any,
    );

    await expect(
      callToolBefore("adv_worktree_create", "main", { changeId: "x" }),
    ).resolves.toBeUndefined();
    await expect(
      callToolBefore("adv_worktree_create", "sub-agent", { changeId: "x" }),
    ).rejects.toThrow(RoleFirewallError);
  });

  it("blocks blockable tools when session ancestry cannot be resolved", async () => {
    await createPlugin();
    await expect(
      callToolBefore("adv_worktree_create", "unknown-session", {
        changeId: "x",
      }),
    ).rejects.toThrow(RoleFirewallError);
  });

  it("allows union-floor reads when session ancestry cannot be resolved", async () => {
    await createPlugin();
    await expect(
      callToolBefore("adv_change_show", "unknown-session"),
    ).resolves.toBeUndefined();
  });

  it("blocks blockable tools when callerSessionID is missing", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_worktree_create", undefined, { changeId: "x" }),
    ).rejects.toThrow(RoleFirewallError);
  });

  it("ignores forged caller-supplied role args (spoofing resistance)", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_worktree_create", "sub-agent", {
        changeId: "x",
        role: "orchestrator",
      }),
    ).rejects.toThrow(RoleFirewallError);
  });

  it("exposes the typed RoleFirewallError through the hook", async () => {
    await createPlugin();
    await setMainSession("main");
    let caught: RoleFirewallError | undefined;
    try {
      await callToolBefore("adv_worktree_create", "sub-agent", {
        changeId: "x",
      });
    } catch (e) {
      caught = e as RoleFirewallError;
    }
    expect(caught).toBeInstanceOf(RoleFirewallError);
    expect(caught?.code).toBe("ROLE_FIREWALL_BLOCK");
    expect(caught?.tool).toBe("adv_worktree_create");
    expect(caught?.resolution).toBe("sub_agent");
    expect(caught?.message).toMatch(/^Role firewall:/);
  });

  it("does not interfere with existing hook responsibilities (coexistence)", async () => {
    await createPlugin();
    await setMainSession("main");
    // Change tracking via adv_change_create after-hook still works.
    await hooks["tool.execute.after"]!(
      { tool: "adv_change_create" } as any,
      {
        args: { changeId: "coexistence" },
        output: JSON.stringify({ changeId: "coexistence" }),
      } as any,
    );
    expect(getStatus().activeChangeId).toBe("coexistence");

    // A blockable tool from the main session is allowed and the existing
    // active-change re-point logic still resolves.
    await expect(
      callToolBefore("adv_change_create", "main", { summary: "coexistence" }),
    ).resolves.toBeUndefined();
  });
});
