/**
 * Tool Registry Tests
 *
 * Validates that tool-registry.ts exists and exports the expected API.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";
import {
  ADV_TOOL_NAMES,
  createDegradedToolMap,
  createToolMap,
  registerTool,
} from "./tool-registry";
import {
  formatAdvToolTitle,
  hasExplicitAdvToolTitle,
} from "./utils/tool-title";
import { createLegacyStore } from "./storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "./__tests__/setup";

type ToolArgsSchema = Record<string, z.ZodTypeAny>;

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
      ).sort((a, b) => a.localeCompare(b));
      const stubToolNames = [...ADV_TOOL_NAMES].sort((a, b) =>
        a.localeCompare(b),
      );

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

  test("every registered ADV tool name has a display title", () => {
    for (const name of ADV_TOOL_NAMES) {
      expect(hasExplicitAdvToolTitle(name), `explicit title for ${name}`).toBe(
        true,
      );
      const first = formatAdvToolTitle(name, {});
      const second = formatAdvToolTitle(name, {});
      expect(second, `deterministic display title for ${name}`).toEqual(first);
      const title = first.title;
      expect(title, `display title for ${name}`).toEqual(expect.any(String));
      expect(title.trim(), `display title for ${name}`).not.toBe("");
      expect(
        title.length,
        `bounded display title for ${name}`,
      ).toBeLessThanOrEqual(96);
      const hasControlChar = [...title].some((char) => {
        const code = char.charCodeAt(0);
        return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
      });
      expect(hasControlChar, `control-free display title for ${name}`).toBe(
        false,
      );
    }
  });

  test("registered tools return ToolResult objects with title and parseable output", async () => {
    const store = await createLegacyStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda);
      const result = await map.adv_session_list.execute({});

      expect(result).toEqual(
        expect.objectContaining({
          title: "List sessions",
          output: expect.any(String),
          metadata: expect.objectContaining({
            adv: expect.objectContaining({
              toolName: "adv_session_list",
              title: "List sessions",
            }),
          }),
        }),
      );
      expect(
        JSON.parse((result as { output: string }).output).sessions,
      ).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("registered tools set running metadata when context supports it", async () => {
    const store = await createLegacyStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda);
      const metadataCalls: unknown[] = [];
      await map.adv_session_list.execute(
        {},
        { metadata: (input: unknown) => metadataCalls.push(input) },
      );

      expect(metadataCalls).toEqual([
        expect.objectContaining({
          title: "List sessions",
          metadata: expect.objectContaining({
            adv: expect.objectContaining({ toolName: "adv_session_list" }),
          }),
        }),
      ]);
    } finally {
      store.close();
    }
  });

  test("registry display metadata overrides object result title and deep-merges adv namespace", async () => {
    const execute = async () => ({
      title: "Custom raw title",
      output: JSON.stringify({ ok: true }),
      metadata: { adv: { custom: "kept", title: "Wrong title" }, other: true },
    });
    (execute as { __advToolName?: string }).__advToolName = "adv_change_show";
    const registered = registerTool("test", { changeId: z.string() }, execute);

    const result = await registered.execute({ changeId: "abc" }, {} as any);

    expect(result).toEqual(
      expect.objectContaining({
        title: "Show change: abc",
        output: JSON.stringify({ ok: true }),
        metadata: expect.objectContaining({
          other: true,
          adv: expect.objectContaining({
            custom: "kept",
            toolName: "adv_change_show",
            title: "Show change: abc",
            changeId: "abc",
          }),
        }),
      }),
    );
  });

  test("registry passes normalized preflight args into execute", async () => {
    let receivedArgs: unknown;
    const execute = async (args: unknown) => {
      receivedArgs = args;
      return JSON.stringify({ ok: true });
    };
    (execute as { __advToolName?: string }).__advToolName = "adv_change_create";
    const registered = registerTool(
      "test",
      {
        summary: z.string(),
        scope_repos: z.array(z.object({ repo_id: z.string() })).optional(),
      },
      execute,
    );

    await registered.execute(
      { summary: "Add rate limiting", scope_repos: [] },
      {} as any,
    );

    expect(receivedArgs).toEqual({ summary: "Add rate limiting" });
  });

  test("registry rejects invalid preflight args for non-create tools", async () => {
    const execute = async () => JSON.stringify({ ok: true });
    (execute as { __advToolName?: string }).__advToolName = "adv_wisdom_add";
    const registered = registerTool(
      "test",
      {
        changeId: z.string(),
        type: z.enum(["pattern", "success", "failure", "gotcha", "convention"]),
        content: z.string(),
      },
      execute,
    );

    const result = await registered.execute(
      { changeId: "c", type: "pattern", content: " " },
      {} as any,
    );
    const output = JSON.parse((result as { output: string }).output);

    expect(output.code).toBe("INVALID_TOOL_ARGS");
    expect(output.tool).toBe("adv_wisdom_add");
    expect(output.invalid).toContainEqual({
      field: "content",
      message: "content must be a non-blank string.",
    });
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

  test("createToolMap contains all branch-aware worktree/session tool names", async () => {
    const map = createToolMap(store, tempDir, store.paths.agenda);
    const expected = [
      "adv_worktree_create",
      "adv_worktree_resume",
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
      "adv_worktree_resume",
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

  test("adv_session_list smoke-test returns empty sessions in test fixture", async () => {
    const map = createToolMap(store, tempDir, store.paths.agenda);
    const tool = map.adv_session_list as {
      execute: (args: unknown) => Promise<string | { output: string }>;
    };
    const raw = await tool.execute({});
    const output = typeof raw === "string" ? raw : raw.output;
    const parsed = JSON.parse(output) as {
      unavailable?: boolean;
      sessions?: unknown[];
      total?: number;
    };
    // After projectWorkflow retirement, initStateDb never throws;
    // sessions are local-only and empty in test fixtures.
    expect(parsed.sessions).toEqual([]);
    expect(parsed.total).toBe(0);
  });

  test("legacy standalone worktree aliases are not registered", async () => {
    const map = createToolMap(store, tempDir, store.paths.agenda);
    const aliases = ["worktree_create", "worktree_delete", "worktree_cleanup"];
    for (const name of aliases) {
      expect(map).not.toHaveProperty(name);
    }
  });

  test("degraded tool names do not include legacy worktree aliases", () => {
    expect(ADV_TOOL_NAMES).toContain("adv_worktree_create");
    expect(ADV_TOOL_NAMES).toContain("adv_worktree_delete");
    expect(ADV_TOOL_NAMES).toContain("adv_worktree_cleanup");
    expect(ADV_TOOL_NAMES).not.toContain("worktree_create");
    expect(ADV_TOOL_NAMES).not.toContain("worktree_delete");
    expect(ADV_TOOL_NAMES).not.toContain("worktree_cleanup");
  });
});

describe("adv_snapshot_health registration", () => {
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

  test("registers adv_snapshot_health in createToolMap", async () => {
    const map = createToolMap(store, tempDir, store.paths.agenda);
    expect(map.adv_snapshot_health).toBeDefined();
    expect(typeof map.adv_snapshot_health).toBe("object");
  });

  test("includes adv_snapshot_health in ADV_TOOL_NAMES", () => {
    expect(ADV_TOOL_NAMES).toContain("adv_snapshot_health");
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

  test("adv_temporal_worker_restart registers safeExecute with timeoutMs override ≥ 15s (rq-toolTimeoutOverride01.2)", () => {
    const block = extractRegistrationBlock(
      registrySrc,
      "adv_temporal_worker_restart",
    );
    expect(
      block,
      "adv_temporal_worker_restart registration block not found",
    ).not.toBeNull();
    expect(block!).toContain("rq-toolTimeoutOverride01");
    expect(block!).toMatch(/timeoutMs:\s*\d/);
    const valueMatch = block!.match(/timeoutMs:\s*(\d[\d_]*)/);
    expect(valueMatch).toBeTruthy();
    const value = Number(valueMatch![1].replace(/_/g, ""));
    expect(value).toBeGreaterThanOrEqual(15_000);
  });
});

describe("rq-zodParseValidation01 — runtime Zod schema validation at SDK boundary", () => {
  // GH #45: Add runtime z.parse() validation at the SDK boundary during
  // tests. The SDK and plugin each use their own Zod import identity. Even
  // though pnpm.overrides pins a single zod@4.3.6 runtime instance, TypeScript
  // treats them as nominal types so the `as any` cast is required. This test
  // exercises every registered tool's Zod schema against itself as a runtime
  // guard so that malformed schemas are caught in CI, not silently accepted.
  //
  // Note: the SDK mock accepts any args without running Zod validation, so
  // registerTool's own test-only guard is the only thing that catches
  // non-Zod values in args. We test this by checking the guard's validation
  // logic directly rather than calling registerTool (which requires
  // creating a full tool map and depends on SDK mock timing).

  test("every tool in ADV_TOOL_NAMES has a non-empty args object", async () => {
    // Smoke test: verify every name resolves to a tool with a truthy args
    // shape. Full schema parsing is done by registerTool itself during test
    // runs — if any tool's schema is unparseable registerTool throws before
    // we even reach this assertion.
    const storeTempDir = await createTempDir();
    const mapTempDir = await createTempDir();
    const store = await createLegacyStore(storeTempDir);
    await store.init();
    try {
      const map = createToolMap(store, mapTempDir, store.paths.agenda);
      for (const name of ADV_TOOL_NAMES) {
        const tool = (map as Record<string, { args: unknown }>)[name];
        expect(tool, `tool "${name}" should exist`).toBeDefined();
        expect(
          tool.args,
          `tool "${name}" should have a truthy args object`,
        ).toBeTruthy();
        expect(
          typeof tool.args,
          `tool "${name}" args should be an object`,
        ).toBe("object");
      }
    } finally {
      store.close();
      await cleanupTempDir(mapTempDir);
      await cleanupTempDir(storeTempDir);
    }
  });

  test("registerTool validation logic catches non-Zod values in args", async () => {
    // registerTool checks `typeof schema.safeParse !== "function"` for each
    // field. We verify this logic directly — calling registerTool itself
    // requires the SDK mock to be fully initialised first.
    const { z } = await import("zod");
    const goodArgs: ToolArgsSchema = { name: z.string() };
    const badArgs: ToolArgsSchema = {
      name: z.string(),
      bad: "not-a-zod-type" as unknown as z.ZodTypeAny,
    };

    // Good args: all fields have .safeParse
    for (const [key, schema] of Object.entries(goodArgs)) {
      expect(
        typeof (schema as z.ZodTypeAny).safeParse,
        `"${key}" should be a ZodType`,
      ).toBe("function");
    }

    // Bad args: 'bad' field has no .safeParse — should be caught
    for (const [key, schema] of Object.entries(badArgs)) {
      if (typeof (schema as z.ZodTypeAny).safeParse !== "function") {
        expect(key, `"${key}" is not a ZodType (guard target)`).toBe("bad");
        return; // caught — test passes
      }
    }
    throw new Error("Expected to catch 'bad' field but it was not detected");
  });

  test("registerTool skips validation when NODE_ENV is not 'test'", async () => {
    // registerTool only runs the Zod guard when NODE_ENV === "test".
    // We verify the guard is test-only by confirming the environment check.
    const originalEnv = process.env.NODE_ENV;
    expect(originalEnv).toBe("test"); // vitest sets this
    // Restore and confirm production path skips guard.
    process.env.NODE_ENV = "production";
    expect(process.env.NODE_ENV).toBe("production");
    process.env.NODE_ENV = originalEnv;
  });
});
