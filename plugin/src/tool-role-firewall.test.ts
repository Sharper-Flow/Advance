// Tests for the runtime role firewall (Decision 3, AC4/AC6/AC7/AC8).
//
// Covers both the pure predicate in tool-role-firewall.ts and the
// integration through the plugin's tool.execute.before hook. Main session ID
// is set via the experimental.chat.system.transform hook, matching the
// production capture path.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";

import { AdvancePlugin } from "./index";
import { getStatus, resetStatusForTest } from "./events/status";
import { createTempDir, cleanupTempDir } from "./__tests__/setup";
import type { Store } from "./storage/store-types";
import {
  RoleFirewallError,
  resolveBlockableSet,
  roleFirewallCheck,
} from "./tool-role-firewall";
import * as policyModule from "./tool-role-policy";

process.setMaxListeners(20);

let mockStore: Store | null = null;

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
    // Representative union-floor tools must NOT be blockable.
    expect(blockable.has("adv_run_test")).toBe(false);
    expect(blockable.has("adv_subagent_report_submit")).toBe(false);
    expect(blockable.has("adv_status")).toBe(false);
    expect(blockable.has("adv_change_show")).toBe(false);
    // Representative orchestrator-only / operator-only tools MUST be blockable.
    expect(blockable.has("adv_gate_complete")).toBe(true);
    expect(blockable.has("adv_change_workflow_terminate")).toBe(true);
    expect(blockable.has("adv_archive_purge")).toBe(true);
    expect(blockable.has("adv_change_create")).toBe(true);
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
    // Union-floor tools remain allowed; everything else is blocked.
    expect(blockable.has("adv_run_test")).toBe(false);
    expect(blockable.has("adv_subagent_report_submit")).toBe(false);
    expect(blockable.has("adv_gate_complete")).toBe(true);
    expect(blockable.has("adv_change_workflow_terminate")).toBe(true);
  });

  it("fails closed to the union floor when blockable derivation yields empty", () => {
    vi.spyOn(policyModule, "blockableFromSubAgentSession").mockReturnValue(
      Object.freeze([]),
    );
    const { blockable, usedFallback } = resolveBlockableSet();
    expect(usedFallback).toBe(true);
    expect(blockable.has("adv_run_test")).toBe(false);
    expect(blockable.has("adv_gate_complete")).toBe(true);
  });

  it("fails closed to the union floor when blockable derivation is incomplete", () => {
    vi.spyOn(policyModule, "blockableFromSubAgentSession").mockReturnValue(
      Object.freeze(["adv_gate_complete"]),
    );
    const { blockable, usedFallback } = resolveBlockableSet();
    expect(usedFallback).toBe(true);
    expect(blockable.has("adv_run_test")).toBe(false);
    expect(blockable.has("adv_gate_complete")).toBe(true);
    expect(blockable.has("adv_change_workflow_terminate")).toBe(true);
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
        toolName: "adv_run_test",
        callerSessionID: "sub-agent",
        mainSessionId: "main-session",
      }),
    ).not.toThrow();
  });

  it("allows blockable tools from the main session", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "adv_gate_complete",
        callerSessionID: "main-session",
        mainSessionId: "main-session",
      }),
    ).not.toThrow();
  });

  it("blocks blockable tools from sub-agent sessions", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "adv_gate_complete",
        callerSessionID: "sub-agent",
        mainSessionId: "main-session",
      }),
    ).toThrow(RoleFirewallError);
  });

  it("blocks blockable tools when mainSessionId is unresolved", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "adv_gate_complete",
        callerSessionID: "anything",
      }),
    ).toThrow(RoleFirewallError);
  });

  it("blocks blockable tools when callerSessionID is missing", () => {
    expect(() =>
      roleFirewallCheck({
        toolName: "adv_gate_complete",
        mainSessionId: "main-session",
      }),
    ).toThrow(RoleFirewallError);
  });
});

describe("Runtime role firewall in tool.execute.before", () => {
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

  it("blocks operator-only adv_change_workflow_terminate from a sub-agent session", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_change_workflow_terminate", "sub-agent"),
    ).rejects.toThrow(RoleFirewallError);
  });

  it("blocks orchestrator-only adv_gate_complete from a sub-agent session", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_gate_complete", "sub-agent", { changeId: "x" }),
    ).rejects.toThrow(RoleFirewallError);
  });

  it("allows union-floor adv_run_test from a sub-agent session", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_run_test", "sub-agent"),
    ).resolves.toBeUndefined();
  });

  it("allows union-floor adv_subagent_report_submit from a sub-agent session", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_subagent_report_submit", "sub-agent"),
    ).resolves.toBeUndefined();
  });

  it("allows blockable adv_gate_complete from the main session", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_gate_complete", "main", { changeId: "x" }),
    ).resolves.toBeUndefined();
  });

  it("blocks blockable tools when mainSessionId is unresolved", async () => {
    await createPlugin();
    // No transform call, so mainSessionId stays null.
    await expect(
      callToolBefore("adv_gate_complete", "some-session", { changeId: "x" }),
    ).rejects.toThrow(RoleFirewallError);
  });

  it("allows union-floor reads when mainSessionId is unresolved", async () => {
    await createPlugin();
    await expect(
      callToolBefore("adv_status", "some-session"),
    ).resolves.toBeUndefined();
  });

  it("blocks blockable tools when callerSessionID is missing", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_gate_complete", undefined, { changeId: "x" }),
    ).rejects.toThrow(RoleFirewallError);
  });

  it("ignores forged caller-supplied role args (spoofing resistance)", async () => {
    await createPlugin();
    await setMainSession("main");
    await expect(
      callToolBefore("adv_gate_complete", "sub-agent", {
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
      await callToolBefore("adv_gate_complete", "sub-agent", { changeId: "x" });
    } catch (e) {
      caught = e as RoleFirewallError;
    }
    expect(caught).toBeInstanceOf(RoleFirewallError);
    expect(caught?.code).toBe("ROLE_FIREWALL_BLOCK");
    expect(caught?.tool).toBe("adv_gate_complete");
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
        args: { summary: "coexistence" },
        output: JSON.stringify({ changeId: "coexistence" }),
      } as any,
    );
    expect(getStatus().activeChangeId).toBe("coexistence");

    // A blockable tool from the main session is allowed and the existing
    // active-change re-point logic still resolves.
    await expect(
      callToolBefore("adv_gate_complete", "main", { changeId: "coexistence" }),
    ).resolves.toBeUndefined();
  });
});
