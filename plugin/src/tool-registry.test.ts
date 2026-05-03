/**
 * Tool Registry Tests
 *
 * Validates that tool-registry.ts exists and exports the expected API.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  ADV_TOOL_NAMES,
  createDegradedToolMap,
  createToolMap,
} from "./tool-registry";
import { createLegacyStore } from "./storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "./__tests__/setup";

describe("tool-registry module contract", () => {
  const srcDir = resolve(new URL(".", import.meta.url).pathname);

  test("tool-registry.ts module exists", () => {
    expect(existsSync(resolve(srcDir, "tool-registry.ts"))).toBe(true);
  });
});

describe("tool-registry functional contract", () => {
  test("tool-registry.ts exports a registerTool helper function", async () => {
    const mod = await import("./tool-registry");
    expect(typeof mod.registerTool).toBe("function");
  });

  test("index.ts delegates tool registration to tool-registry helpers", () => {
    const src = readFileSync(
      resolve(new URL(".", import.meta.url).pathname, "index.ts"),
      "utf8",
    );
    expect(src).toContain("createToolMap");
    expect(src).toContain("createDegradedToolMap");
    expect(src).not.toContain("adv_change_show:");
  });
});

describe("createDegradedToolMap parity with createToolMap", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("ADV_TOOL_NAMES exactly matches the keys returned by createToolMap", async () => {
    // Drift guard: if a new tool is added to createToolMap but ADV_TOOL_NAMES
    // is not updated, agents in degraded sessions will see "tool missing" for
    // that tool and lose the structured ADV_PLUGIN_INIT_FAILED diagnostic path.
    const store = await createLegacyStore(tempDir);
    await store.init();
    try {
      const realToolNames = Object.keys(
        createToolMap(store, tempDir, store.paths.agenda),
      ).sort();
      const stubToolNames = [...ADV_TOOL_NAMES].sort();

      const onlyInReal = realToolNames.filter(
        (n) => !stubToolNames.includes(n),
      );
      const onlyInStub = stubToolNames.filter(
        (n) => !realToolNames.includes(n),
      );

      expect(onlyInReal).toEqual([]);
      expect(onlyInStub).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("createDegradedToolMap registers a stub for every name in ADV_TOOL_NAMES", () => {
    const map = createDegradedToolMap(new Error("test init failure"), "/tmp/x");
    for (const name of ADV_TOOL_NAMES) {
      expect(map).toHaveProperty(name);
    }
    expect(Object.keys(map).length).toBe(ADV_TOOL_NAMES.length);
  });
});

describe("KD-8 worktree + session tool registrations", () => {
  let tempDir: string;
  let store: Awaited<ReturnType<typeof createLegacyStore>>;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);
    await store.init();
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("createToolMap contains all 6 new KD-8 tool names", async () => {
    const map = createToolMap(store, tempDir, store.paths.agenda);
    const expected = [
      "adv_worktree_create",
      "adv_worktree_delete",
      "adv_worktree_cleanup",
      "adv_worktree_triage",
      "adv_session_list",
      "adv_session_show",
    ];
    for (const name of expected) {
      expect(map).toHaveProperty(name);
    }
  });

  test("each new tool has description, args, and execute function", async () => {
    const map = createToolMap(store, tempDir, store.paths.agenda);
    const expected = [
      "adv_worktree_create",
      "adv_worktree_delete",
      "adv_worktree_cleanup",
      "adv_worktree_triage",
      "adv_session_list",
      "adv_session_show",
    ];
    for (const name of expected) {
      const tool = (map as Record<string, unknown>)[name];
      expect(typeof tool).toBe("object");
      expect(tool).toHaveProperty("description");
      expect(typeof (tool as { description: unknown }).description).toBe(
        "string",
      );
      expect(tool).toHaveProperty("args");
      expect(typeof (tool as { args: unknown }).args).toBe("object");
      expect(tool).toHaveProperty("execute");
      expect(typeof (tool as { execute: unknown }).execute).toBe("function");
    }
  });

  test("adv_session_list smoke-test returns unavailable in test fixture", async () => {
    const map = createToolMap(store, tempDir, store.paths.agenda);
    const tool = map.adv_session_list as {
      execute: (args: unknown) => Promise<string>;
    };
    const raw = await tool.execute({});
    const parsed = JSON.parse(raw) as {
      unavailable?: boolean;
      sessions?: unknown[];
      total?: number;
    };
    expect(parsed.unavailable).toBe(true);
    expect(parsed.sessions).toEqual([]);
    expect(parsed.total).toBe(0);
  });

  test("backward-compat aliases are registered (KD-8 phase 2)", async () => {
    const map = createToolMap(store, tempDir, store.paths.agenda);
    const aliases = ["worktree_create", "worktree_delete", "worktree_cleanup"];
    for (const name of aliases) {
      expect(map).toHaveProperty(name);
      const tool = (map as Record<string, unknown>)[name];
      expect(typeof tool).toBe("object");
      expect(tool).toHaveProperty("description");
      expect(typeof (tool as { description: unknown }).description).toBe(
        "string",
      );
      expect((tool as { description: string }).description).toContain(
        "Alias →",
      );
      expect(tool).toHaveProperty("execute");
      expect(typeof (tool as { execute: unknown }).execute).toBe("function");
    }
  });

  test("aliases share the same execute shape as adv_worktree_* counterparts", async () => {
    const map = createToolMap(store, tempDir, store.paths.agenda);
    const pairs: [string, string][] = [
      ["worktree_create", "adv_worktree_create"],
      ["worktree_delete", "adv_worktree_delete"],
      ["worktree_cleanup", "adv_worktree_cleanup"],
    ];
    for (const [aliasName, canonicalName] of pairs) {
      const alias = (map as Record<string, unknown>)[aliasName];
      const canonical = (map as Record<string, unknown>)[canonicalName];
      expect(alias).toBeDefined();
      expect(canonical).toBeDefined();
      expect(typeof (alias as { execute: unknown }).execute).toBe("function");
      expect(typeof (canonical as { execute: unknown }).execute).toBe(
        "function",
      );
      // Args schemas should be identical (same reference)
      expect((alias as { args: unknown }).args).toBe(
        (canonical as { args: unknown }).args,
      );
    }
  });
});

describe("safeExecute timeout overrides for slow-subprocess tools", () => {
  // Tools that wrap external subprocesses (test runs, git commits with
  // pre-commit hooks) budget more than the default 10s outer timeout
  // internally. Without a matching outer override, the safety-net wrapper
  // kills tools whose inner subprocess would have succeeded.
  //
  // adv_run_test:        DEFAULT_TEST_TIMEOUT_MS = 30_000 (test.ts)
  // adv_task_checkpoint: DEFAULT_TIMEOUT_MS      = 30_000 (checkpoint.ts)
  //
  // Outer wrapper must allow at least the inner budget plus modest
  // headroom so the subprocess is the authoritative timeout source.
  const registrySrc = readFileSync(
    resolve(new URL(".", import.meta.url).pathname, "tool-registry.ts"),
    "utf8",
  );

  /**
   * Extract the registration block for `toolName` by anchoring at
   * `<toolName>:` and walking until the matching closing paren of the
   * outer `registerTool(` call. Avoids brittle multi-line regex.
   */
  function extractRegistrationBlock(
    src: string,
    toolName: string,
  ): string | null {
    const anchor = `${toolName}: registerTool(`;
    const start = src.indexOf(anchor);
    if (start === -1) return null;
    let depth = 0;
    let i = start + anchor.length - 1; // position at the `(`
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
    return null;
  }

  test("adv_run_test registers safeExecute with timeoutMs override ≥ 35s", () => {
    const block = extractRegistrationBlock(registrySrc, "adv_run_test");
    expect(block, "adv_run_test registration block not found").not.toBeNull();
    expect(block!).toMatch(/timeoutMs:\s*\d/);
    const valueMatch = block!.match(/timeoutMs:\s*(\d[\d_]*)/);
    expect(valueMatch).toBeTruthy();
    const value = Number(valueMatch![1].replace(/_/g, ""));
    expect(value).toBeGreaterThanOrEqual(35_000);
  });

  test("adv_task_checkpoint registers safeExecute with timeoutMs override ≥ 35s", () => {
    const block = extractRegistrationBlock(registrySrc, "adv_task_checkpoint");
    expect(
      block,
      "adv_task_checkpoint registration block not found",
    ).not.toBeNull();
    expect(block!).toMatch(/timeoutMs:\s*\d/);
    const valueMatch = block!.match(/timeoutMs:\s*(\d[\d_]*)/);
    expect(valueMatch).toBeTruthy();
    const value = Number(valueMatch![1].replace(/_/g, ""));
    expect(value).toBeGreaterThanOrEqual(35_000);
  });

  test("adv_workflow_repair registers safeExecute with timeoutMs override ≥ 30s (B2 / KD-6)", () => {
    // adv_workflow_repair rebuilds project workflow state from legacy
    // snapshots and re-imports change state, which legitimately exceeds
    // the 10s default safety net on mature projects. rq-toolTimeoutOverride01
    // requires every tool that needs >10s to declare an explicit override.
    const block = extractRegistrationBlock(registrySrc, "adv_workflow_repair");
    expect(
      block,
      "adv_workflow_repair registration block not found",
    ).not.toBeNull();
    expect(block!).toMatch(/timeoutMs:\s*\d/);
    const valueMatch = block!.match(/timeoutMs:\s*(\d[\d_]*)/);
    expect(valueMatch).toBeTruthy();
    const value = Number(valueMatch![1].replace(/_/g, ""));
    expect(value).toBeGreaterThanOrEqual(30_000);
  });
});
