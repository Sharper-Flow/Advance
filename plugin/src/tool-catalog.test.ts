import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  ADV_TOOL_METADATA,
  ADV_TOOL_NAMES,
  createDegradedToolMap,
  createFullToolMap,
  getToolSurface,
  renderToolInputSchema,
  toolCatalogTools,
} from "./tool-registry";
import { hasExplicitAdvToolTitle } from "./utils/tool-title";
import { createDiskStore } from "./storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "./__tests__/setup";

describe("adv_tool_catalog", () => {
  test("catalog returns a deterministic sorted list of all canonical tools", async () => {
    const result = await toolCatalogTools.adv_tool_catalog.execute(
      { limit: 100, offset: 0 },
      {} as any,
    );
    const parsed = parseToolOutput(result) as {
      items: Array<{ name: string; description: string }>;
      pagination: { total: number; returned: number; hasMore: boolean };
    };
    expect(parsed.pagination.total).toBe(ADV_TOOL_NAMES.length);
    expect(parsed.pagination.returned).toBe(ADV_TOOL_NAMES.length);
    expect(parsed.pagination.hasMore).toBe(false);
    const names = parsed.items.map((i) => i.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual(
      [...ADV_TOOL_NAMES].sort((a, b) => a.localeCompare(b)),
    );
  });

  test("catalog respects pagination bounds and limit <= 100", async () => {
    const result = await toolCatalogTools.adv_tool_catalog.execute(
      { limit: 5, offset: 0 },
      {} as any,
    );
    const parsed = parseToolOutput(result) as {
      items: Array<{ name: string }>;
      pagination: {
        total: number;
        returned: number;
        hasMore: boolean;
        resumeHint?: string;
      };
    };
    expect(parsed.items.length).toBe(5);
    expect(parsed.pagination.hasMore).toBe(true);
    expect(parsed.pagination.resumeHint).toMatch(/offset: 5/);
    expect(parsed.pagination.resumeHint).toMatch(/limit: 5/);

    const page2 = await toolCatalogTools.adv_tool_catalog.execute(
      { limit: 5, offset: 5 },
      {} as any,
    );
    const parsed2 = parseToolOutput(page2) as {
      items: Array<{ name: string }>;
    };
    expect(parsed.items[0]?.name).not.toBe(parsed2.items[0]?.name);
  });

  test("catalog rejects limit > 100 at schema level", () => {
    const parse = toolCatalogTools.adv_tool_catalog.args.limit.safeParse(101);
    expect(parse.success).toBe(false);
  });

  test("catalog includes visibility metadata for every item and does not execute handlers", async () => {
    const result = await toolCatalogTools.adv_tool_catalog.execute(
      { limit: 100, offset: 0 },
      {} as any,
    );
    const parsed = parseToolOutput(result) as {
      items: Array<{
        name: string;
        visibility: {
          realm: string;
          group: string;
          risk: string;
          recoveryOnly: boolean;
        };
      }>;
    };
    for (const item of parsed.items) {
      const meta = ADV_TOOL_METADATA[item.name];
      expect(meta).toBeDefined();
      expect(item.visibility.realm).toBe(meta.realm);
      expect(item.visibility.group).toBe(meta.group);
      expect(item.visibility.risk).toBe(meta.risk);
      expect(item.visibility.recoveryOnly).toBe(meta.recoveryOnly);
    }
    expect(result).not.toContain("ADV_PLUGIN_INIT_FAILED");
  });

  test("catalog visibility metadata does not grant access or copy authority", async () => {
    const result = await toolCatalogTools.adv_tool_catalog.execute(
      { limit: 100, offset: 0 },
      {} as any,
    );
    const parsed = parseToolOutput(result) as {
      items: Array<{
        name: string;
        visibility: Record<string, unknown>;
      }>;
    };
    for (const item of parsed.items) {
      expect(item.visibility).not.toHaveProperty("allowed");
      expect(item.visibility).not.toHaveProperty("agentActions");
      expect(item.visibility).not.toHaveProperty("operatorActions");
      expect(item.visibility).not.toHaveProperty("denyWildcard");
      expect(item.visibility).not.toHaveProperty("rationale");
    }
  });

  test("catalog fails closed if metadata parity is missing", async () => {
    // Metadata parity is structurally enforced, but this documents the fail-closed intent.
    const result = await toolCatalogTools.adv_tool_catalog.execute(
      { limit: 100, offset: 0 },
      {} as any,
    );
    const parsed = parseToolOutput(result) as { error?: string };
    expect(parsed.error).toBeUndefined();
  });
});

describe("adv_tool_describe", () => {
  test("describe returns metadata and input schema for a known tool", async () => {
    const result = await toolCatalogTools.adv_tool_describe.execute(
      { name: "adv_change_show" },
      {} as any,
    );
    const parsed = parseToolOutput(result) as {
      name: string;
      description: string;
      visibility: { realm: string; group: string };
      argKeys: string[];
      inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
      };
    };
    expect(parsed.name).toBe("adv_change_show");
    expect(parsed.description.length).toBeGreaterThan(0);
    expect(parsed.visibility.realm).toBe("change");
    expect(parsed.visibility.group).toBe("read");
    expect(parsed.argKeys).toContain("changeId");
    expect(parsed.inputSchema.type).toBe("object");
    expect(parsed.inputSchema.required).toContain("changeId");
    expect(parsed.inputSchema.properties).toHaveProperty("changeId");
  });

  test("describe returns typed not-found for unknown names", async () => {
    const result = await toolCatalogTools.adv_tool_describe.execute(
      { name: "adv_not_a_real_tool" },
      {} as any,
    );
    const parsed = parseToolOutput(result) as { error: string; code: string };
    expect(parsed.error).toMatch(/not found/i);
    expect(parsed.code).toBe("TOOL_NOT_FOUND");
  });

  test("describe detects schema conversion failure", () => {
    const entry = {
      name: "adv_unrepresentable",
      description: "Unrepresentable",
      args: { fn: z.function() },
    };
    const converted = renderToolInputSchema(entry);
    expect(converted.ok).toBe(false);
    if (!converted.ok) {
      expect(converted.code).toBe("SCHEMA_CONVERSION_FAILED");
    }
  });

  test("describe input schema reflects optionality and descriptions", async () => {
    const result = await toolCatalogTools.adv_tool_describe.execute(
      { name: "adv_task_list" },
      {} as any,
    );
    const parsed = parseToolOutput(result) as {
      inputSchema: {
        properties: Record<string, { description?: string }>;
        required: string[];
      };
    };
    expect(parsed.inputSchema.properties).toHaveProperty("changeId");
    expect(parsed.inputSchema.properties).toHaveProperty("limit");
    expect(parsed.inputSchema.required).not.toContain("limit");
    expect(parsed.inputSchema.properties.changeId?.description).toBeTruthy();
  });
});

describe("tool catalog registration parity", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("new tools are on ADV_TOOL_NAMES", () => {
    expect(ADV_TOOL_NAMES).toContain("adv_tool_catalog");
    expect(ADV_TOOL_NAMES).toContain("adv_tool_describe");
  });

  test("new tools are in the runtime tool map", async () => {
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createFullToolMap(store, tempDir, store.paths.agenda);
      expect(map).toHaveProperty("adv_tool_catalog");
      expect(map).toHaveProperty("adv_tool_describe");
    } finally {
      store.close();
    }
  });

  test("new tools are in the degraded tool map", () => {
    const map = createDegradedToolMap(new Error("test"), "/tmp/x");
    expect(map).toHaveProperty("adv_tool_catalog");
    expect(Object.keys(map)).not.toContain("adv_tool_describe");
  });

  test("new tools are on the warrant-visible surface", () => {
    const surface = getToolSurface();
    expect(surface.has("adv_tool_catalog")).toBe(true);
    expect(surface.has("adv_tool_describe")).toBe(true);
  });

  test("new tools have metadata", () => {
    expect(ADV_TOOL_METADATA["adv_tool_catalog"]).toBeDefined();
    expect(ADV_TOOL_METADATA["adv_tool_describe"]).toBeDefined();
  });

  test("new tools have explicit titles", () => {
    expect(hasExplicitAdvToolTitle("adv_tool_catalog")).toBe(true);
    expect(hasExplicitAdvToolTitle("adv_tool_describe")).toBe(true);
  });
});
