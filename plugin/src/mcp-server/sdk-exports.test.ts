/**
 * Smoke test: verifies that `@modelcontextprotocol/sdk` v1.x exposes the
 * server-side primitives the ADV MCP server depends on.
 *
 * This is the gate for task tk-58f607bd3ba1 (Phase A0 — SDK install). It must
 * fail before `pnpm add @modelcontextprotocol/sdk@^1` and pass after.
 *
 * Verified against SDK v1.x docs:
 *   - https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md
 *   - https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/README.md
 *
 * Per docs (v1.29.0 verified):
 *   - `Server` (low-level) — exported from `@modelcontextprotocol/sdk/server/index.js`.
 *     Has `setRequestHandler` (protocol-level). Does NOT have `registerTool`.
 *   - `McpServer` (high-level) — exported from `@modelcontextprotocol/sdk/server/mcp.js`.
 *     Wraps `Server`; provides `registerTool`/`tool` (deprecated → registerTool)
 *     with schema validation. The ADV MCP server uses McpServer.
 *   - `StdioServerTransport` — exported from `@modelcontextprotocol/sdk/server/stdio.js`.
 *   - `registerTool` is a method on `McpServer`, NOT on `Server`.
 */
import { describe, expect, it } from "vitest";

describe("@modelcontextprotocol/sdk v1.x server exports", () => {
  it("exports Server class from server/index.js", async () => {
    const mod = await import("@modelcontextprotocol/sdk/server/index.js");
    expect(typeof mod.Server).toBe("function");
    const s = new mod.Server(
      { name: "smoke", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    expect(s).toBeInstanceOf(mod.Server);
    // Low-level Server uses setRequestHandler, NOT registerTool
    expect(
      typeof (s as unknown as { setRequestHandler: unknown }).setRequestHandler,
    ).toBe("function");
  });

  it("exports StdioServerTransport from server/stdio.js", async () => {
    const mod = await import("@modelcontextprotocol/sdk/server/stdio.js");
    expect(typeof mod.StdioServerTransport).toBe("function");
    const t = new mod.StdioServerTransport({
      stdin: process.stdin,
      stdout: process.stdout,
    });
    expect(t).toBeInstanceOf(mod.StdioServerTransport);
  });

  it("exports McpServer (high-level) from server/mcp.js", async () => {
    const mod = await import("@modelcontextprotocol/sdk/server/mcp.js");
    expect(typeof mod.McpServer).toBe("function");
  });

  it("McpServer.registerTool accepts (name, schema, handler) with Zod inputSchema", async () => {
    const { McpServer } =
      await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { z } = await import("zod");
    const mcp = new McpServer({ name: "smoke", version: "0.0.0" });
    // Should not throw — registers a tool with Zod schema (the API the ADV MCP server uses)
    expect(() =>
      mcp.registerTool(
        "smoke-tool",
        {
          description: "smoke",
          inputSchema: { value: z.number() },
        },
        async ({ value }) => ({
          content: [{ type: "text" as const, text: String(value) }],
        }),
      ),
    ).not.toThrow();
    // McpServer.server exposes the low-level Server for transport.connect()
    expect(mcp.server).toBeDefined();
    expect(typeof mcp.server.setRequestHandler).toBe("function");
  });
});
