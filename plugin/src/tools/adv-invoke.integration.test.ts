import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createToolMap } from "../tool-registry";
import { createDiskStore } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
import type { ToolDefinition } from "@opencode-ai/plugin";

/**
 * Integration tests for `adv_tool_invoke` (addProviderToolSearch AC1–AC4).
 *
 * The unit suite in `adv-invoke.test.ts` covers the facade's behavior with a
 * mocked `ToolLookup`. These tests exercise the production wiring in
 * `createToolMap`: the closure-captured lookup over `baseToolMap` returns the
 * SAME wrapped `ToolDefinition` that direct calls dispatch to, so the facade
 * re-runs the canonical Zod preflight, `safeExecute`, and the target tool's
 * own handler — preserving authorization, approval, target-path trust,
 * recovery-only, audit, and timeout semantics.
 *
 * Test strategy mapped to design:
 *   - Integration (real tool registry): invoke a real read tool via facade
 *     and assert the observable result matches a direct call.
 *   - Recursion exclusion: still enforced through the wrapped layer.
 *   - Unknown name / unknown args: typed rejection before any dispatch.
 *   - target_path trust: the wrapped handler still runs its own check.
 */

const NO_CTX = undefined;

function getInvokeTool(map: Record<string, unknown>): ToolDefinition {
  const invoke = map.adv_tool_invoke;
  if (
    !invoke ||
    typeof (invoke as { execute?: unknown }).execute !== "function"
  ) {
    throw new Error("adv_tool_invoke not registered or missing execute");
  }
  return invoke as ToolDefinition;
}

function asTool(def: unknown): ToolDefinition {
  return def as ToolDefinition;
}

async function invokeFacade(
  map: Record<string, unknown>,
  args: { name: string; args: Record<string, unknown> },
  ctx?: unknown,
): Promise<string> {
  const result = await getInvokeTool(map).execute(
    args as unknown as Parameters<ToolDefinition["execute"]>[0],
    ctx as Parameters<ToolDefinition["execute"]>[1],
  );
  // SDK-wrapped execute returns the SDK ToolResult shape: either a bare
  // string or `{ title, output, metadata }`. The inner execute's
  // formatToolOutput JSON is inside `.output` for the wrapped form.
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "output" in result) {
    const out = (result as { output: unknown }).output;
    return typeof out === "string" ? out : JSON.stringify(out);
  }
  return JSON.stringify(result);
}

describe("adv_tool_invoke integration — real createToolMap dispatch", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("AC1: facade dispatch of adv_change_list matches a direct call", async () => {
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda) as Record<
        string,
        unknown
      >;

      // Direct call: invoke adv_change_list without going through the facade.
      // adv_change_list takes only optional filters, so empty-ish args are
      // schema-valid and exercise the real read path.
      const direct = asTool(map.adv_change_list);
      const directResult = await direct.execute(
        { status: "in-flight", limit: 5 } as unknown as Parameters<
          ToolDefinition["execute"]
        >[0],
        NO_CTX as Parameters<ToolDefinition["execute"]>[1],
      );
      const directStr =
        typeof directResult === "string"
          ? directResult
          : String((directResult as { output?: string })?.output ?? "");

      // Facade call: same args, dispatched through adv_tool_invoke.
      const facadeStr = await invokeFacade(map, {
        name: "adv_change_list",
        args: { status: "in-flight", limit: 5 },
      });

      // Both paths return stringified JSON via the canonical formatter.
      // Compare structurally — formatting timestamps may differ by
      // milliseconds between the two calls.
      const directParsed = parseToolOutput(directStr) as {
        data?: unknown;
        status?: string;
      };
      const facadeParsed = parseToolOutput(facadeStr) as {
        data?: unknown;
        status?: string;
      };
      expect(facadeParsed.status).toEqual(directParsed.status);
      expect(facadeParsed.data).toEqual(directParsed.data);
    } finally {
      store.close();
    }
  });

  test("AC2: unknown name returns typed TOOL_NOT_FOUND before any handler runs", async () => {
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda) as Record<
        string,
        unknown
      >;
      const result = await invokeFacade(map, {
        name: "adv_definitely_not_a_tool",
        args: {},
      });
      const parsed = parseToolOutput(result) as {
        error?: string;
        code?: string;
      };
      expect(parsed.code).toBe("TOOL_NOT_FOUND");
      expect(parsed.error).toMatch(/not found/i);
    } finally {
      store.close();
    }
  });

  test("AC2: args failing the target's canonical Zod schema are rejected before dispatch", async () => {
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda) as Record<
        string,
        unknown
      >;
      // adv_change_list.limit is `z.number().optional()`. Passing a string
      // forces a Zod type-check rejection at the canonical schema layer.
      const result = await invokeFacade(map, {
        name: "adv_change_list",
        args: { limit: "not-a-number" },
      });
      const parsed = parseToolOutput(result) as {
        error?: string;
        code?: string;
        details?: string;
      };
      expect(parsed.code).toBe("SCHEMA_VALIDATION_FAILED");
      expect(parsed.error).toMatch(/schema validation failed/i);
    } finally {
      store.close();
    }
  });

  test("AC2: unknown target args are rejected instead of silently stripped", async () => {
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda) as Record<
        string,
        unknown
      >;
      const result = await invokeFacade(map, {
        name: "adv_change_list",
        args: { limit: 5, unexpected: true },
      });
      const parsed = parseToolOutput(result) as { code?: string };
      expect(parsed.code).toBe("SCHEMA_VALIDATION_FAILED");
    } finally {
      store.close();
    }
  });

  test("AC3: recursion set rejected before lookup through the wrapped layer", async () => {
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda) as Record<
        string,
        unknown
      >;
      for (const name of [
        "adv_tool_invoke",
        "adv_tool_catalog",
        "adv_tool_describe",
        "execute",
      ]) {
        const result = await invokeFacade(map, { name, args: {} });
        const parsed = parseToolOutput(result) as { code?: string };
        expect(parsed.code).toBe("RECURSIVE_INVOCATION");
      }
    } finally {
      store.close();
    }
  });

  test("AC4: approval-required args still reach the wrapped handler (handler enforces approval)", async () => {
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda) as Record<
        string,
        unknown
      >;
      // adv_change_close requires approvedByUser=true AND non-empty
      // approvalEvidence at the canonical Zod schema layer. Passing both
      // lets the facade dispatch to the wrapped handler; the handler then
      // runs its own checks (change existence, supersede validity, etc.)
      // and rejects for handler-level reasons. The assertion proves the
      // facade did NOT shortcut to a facade-level code — dispatch occurred
      // and the wrapped tool's own enforcement ran.
      const result = await invokeFacade(map, {
        name: "adv_change_close",
        args: {
          changeId: "fake-change-id-not-present",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "test-evidence-for-dispatch-only",
        },
      });
      const parsed = parseToolOutput(result) as {
        code?: string;
        error?: string;
        status?: string;
      };
      // Facade-level rejection codes that would indicate the facade
      // shortcut the dispatch:
      const FACADE_SHORTHAND_CODES = new Set([
        "TOOL_NOT_FOUND",
        "SCHEMA_VALIDATION_FAILED",
        "RECURSIVE_INVOCATION",
      ]);
      expect(
        FACADE_SHORTHAND_CODES.has(parsed.code ?? ""),
        `facade must dispatch approval-required tools to the wrapped handler; got facade-level code ${parsed.code}`,
      ).toBe(false);
    } finally {
      store.close();
    }
  });

  test("AC1: target_path on adv_change_show reaches the wrapped handler", async () => {
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda) as Record<
        string,
        unknown
      >;
      // adv_change_show requires changeId; target_path is optional.
      // Passing both through the facade must reach the handler unchanged.
      // The handler will run its own target_path handling (disk snapshot
      // for untrusted paths). We assert only that the args flow through
      // without facade-level rejection.
      const result = await invokeFacade(map, {
        name: "adv_change_show",
        args: {
          changeId: "fake-change-id-not-present",
          target_path: tempDir,
        },
      });
      // No facade-level rejection should fire for a valid arg shape.
      const parsed = parseToolOutput(result) as { code?: string };
      expect(parsed.code).not.toBe("SCHEMA_VALIDATION_FAILED");
      expect(parsed.code).not.toBe("TOOL_NOT_FOUND");
      expect(parsed.code).not.toBe("RECURSIVE_INVOCATION");
    } finally {
      store.close();
    }
  });
});
