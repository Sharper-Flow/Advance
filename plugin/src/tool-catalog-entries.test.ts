/**
 * Import-deps + parity test for the SDK-free catalog module.
 *
 * Gate for task tk-9ad1a04909a2 (Phase A1 — SDK-free catalog extraction).
 * The new `tool-catalog-entries.ts` module MUST be SDK-free (zero
 * `@opencode-ai/plugin` imports) so the future MCP server can consume it
 * without coupling to the OpenCode plugin SDK.
 *
 * Per KD2 (design.md): the MCP descriptors module imports ONLY this SDK-free
 * module — never `tool-registry.ts`. This test enforces that boundary
 * structurally (P33 — structural correctness over heuristic).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MODULE_PATH = resolve(import.meta.dirname, "tool-catalog-entries.ts");

describe("plugin/src/tool-catalog-entries.ts — SDK-free boundary", () => {
  it("source contains no @opencode-ai/plugin import", () => {
    const source = readFileSync(MODULE_PATH, "utf-8");
    expect(source).not.toMatch(/from\s+["']@opencode-ai\/plugin["']/);
    expect(source).not.toMatch(/import\s*\(\s*["']@opencode-ai\/plugin["']\)/);
  });

  it("source contains no ./tools/* import (those are SDK-coupled)", () => {
    const source = readFileSync(MODULE_PATH, "utf-8");
    expect(source).not.toMatch(/from\s+["']\.\/tools\//);
    expect(source).not.toMatch(/from\s+["']\.\.\/tools\//);
  });

  it("source contains no ./storage/* import (those are SDK-coupled)", () => {
    const source = readFileSync(MODULE_PATH, "utf-8");
    expect(source).not.toMatch(/from\s+["']\.\/storage\//);
  });
});

describe("tool-catalog-entries — exported API", () => {
  it("exports the expected types, functions, and constants", async () => {
    const mod = await import("./tool-catalog-entries");
    // Functions
    expect(typeof mod.collectPublicToolEntries).toBe("function");
    expect(typeof mod.renderToolInputSchema).toBe("function");
    expect(typeof mod.getToolSurface).toBe("function");
    expect(typeof mod.deriveToolRealm).toBe("function");
    expect(typeof mod.deriveToolMetadata).toBe("function");
    // Constants
    expect(mod.ADV_PUBLIC_TOOL_BASELINE_COUNT).toBe(80);
    // Realms/groups data structures
    expect(Array.isArray(mod.REALM_PREFIXES)).toBe(true);
    expect(mod.REALM_PREFIXES.length).toBeGreaterThan(0);
    expect(typeof mod.REALM_OVERRIDES).toBe("object");
    expect(typeof mod.GROUP_OVERRIDES).toBe("object");
    expect(typeof mod.LIFECYCLE_BY_REALM).toBe("object");
    expect(Array.isArray(mod.REPAIR_LIFECYCLE)).toBe(true);
  });

  it("collectPublicToolEntries preserves order across groups", async () => {
    const { collectPublicToolEntries } = await import("./tool-catalog-entries");
    const entries = collectPublicToolEntries([
      {
        alpha: {
          description: "first",
          args: {} as never,
        },
      },
      {
        beta: {
          description: "second",
          args: {} as never,
        },
      },
    ]);
    expect(entries.map((e) => e.name)).toEqual(["alpha", "beta"]);
  });

  it("deriveToolMetadata returns a complete metadata record", async () => {
    const { deriveToolMetadata } = await import("./tool-catalog-entries");
    const meta = deriveToolMetadata("adv_status");
    expect(meta.realm).toBe("status");
    expect(meta.group).toBe("read");
    expect(meta.lifecycle).toContain("execution");
    expect(["low", "medium", "high", "operator"]).toContain(meta.risk);
    expect(meta.recoveryOnly).toBe(false);
  });

  it("deriveToolMetadata classifies retained write tools", async () => {
    const { deriveToolMetadata } = await import("./tool-catalog-entries");
    const meta = deriveToolMetadata("adv_change_archive");
    expect(meta.group).toBe("lifecycle");
    expect(meta.risk).toBe("low");
    expect(meta.recoveryOnly).toBe(false);
  });
});

describe("tool-registry re-exports — parity preserved", () => {
  it("PUBLIC_TOOL_ENTRIES is now exported from tool-registry", async () => {
    const reg = await import("./tool-registry");
    expect(reg.PUBLIC_TOOL_ENTRIES).toBeDefined();
    expect(Array.isArray(reg.PUBLIC_TOOL_ENTRIES)).toBe(true);
    expect(reg.PUBLIC_TOOL_ENTRIES.length).toBeGreaterThan(0);
    // tool-registry pulls a heavy module graph (~1.5s cold import); the
    // throttled full run can push the first import past the 5s default.
  }, 20000);

  it("collectPublicToolEntries identity is the same function in both modules", async () => {
    const cat = await import("./tool-catalog-entries");
    const reg = await import("./tool-registry");
    // tool-registry re-exports collectPublicToolEntries from tool-catalog-entries
    expect(reg.collectPublicToolEntries).toBe(cat.collectPublicToolEntries);
  });
});
