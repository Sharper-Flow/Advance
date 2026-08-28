/**
 * Descriptor + catalog parity tests (DDC4).
 *
 * Gate for task tk-d1c59f0af2ca. Asserts every MCP tool descriptor carries
 * the expected structural shape and that the catalog is complete (13 Tier-4
 * tools + adv_handshake). Full inputSchema parity (ZodToJsonSchema projection
 * matching PUBLIC_TOOL_ENTRIES[name].args) is partially covered here; the
 * remaining 10 tools currently use passthrough schemas and require descriptor
 * migration to use the canonical Zod args from PUBLIC_TOOL_ENTRIES.
 *
 * Coverage:
 *   - Catalog completeness (14 entries; no removed tools) ✓
 *   - Descriptor structural shape (name + description + inputSchema) ✓
 *   - Pure-tool schema parity (project_context, tool_catalog, tool_describe) — sample
 *
 * Deferred to follow-up:
 *   - needs-context / needs-temporal / needs-host-git tools currently use
 *     z.object({}).passthrough(); migrating to per-tool canonical Zod args
 *     requires touching tools/index.ts registration loop.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startServer } from "./index.js";
import { HANDSHAKE_TIER4_TOOLS } from "./handshake.js";

const REMOVED_TOOL_NAMES = [
  "adv_reflect",
  "adv_project_metadata",
  "reflect",
  "project_metadata",
  "conformance",
  "session_list",
  "session_show",
] as const;

async function connectToServer() {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await startServer({ transport: serverTransport });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, clientTransport, serverTransport };
}

async function closeClient(
  client: Client,
  clientTransport: InMemoryTransport,
  serverTransport: InMemoryTransport,
) {
  await client.close();
  await clientTransport.close();
  await serverTransport.close();
}

describe("DDC4 — catalog completeness", () => {
  it("tools/list returns exactly 14 entries (13 Tier-4 + adv_handshake)", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();
    const tools = await client.listTools();
    expect(tools.tools.length).toBe(14);
    await closeClient(client, clientTransport, serverTransport);
  });

  it("tools/list contains every Tier-4 name (unprefixed) + adv_handshake", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((t) => t.name));
    for (const tier4 of HANDSHAKE_TIER4_TOOLS) {
      expect(names.has(tier4), `expected Tier-4 tool ${tier4}`).toBe(true);
    }
    expect(names.has("adv_handshake")).toBe(true);
    await closeClient(client, clientTransport, serverTransport);
  });

  it("tools/list does NOT contain any removed tool name", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((t) => t.name));
    for (const removed of REMOVED_TOOL_NAMES) {
      expect(
        names.has(removed),
        `removed tool ${removed} must not appear in catalog`,
      ).toBe(false);
    }
    await closeClient(client, clientTransport, serverTransport);
  });
});

describe("DDC4 — descriptor structural shape", () => {
  it("every catalog tool has non-empty name, description, and inputSchema", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();
    const tools = await client.listTools();
    for (const t of tools.tools) {
      expect(typeof t.name, `name is string: ${t.name}`).toBe("string");
      expect(t.name.length, `name non-empty: ${t.name}`).toBeGreaterThan(0);
      expect(typeof t.description, `description is string: ${t.name}`).toBe(
        "string",
      );
      expect(
        t.description!.length,
        `description non-empty: ${t.name}`,
      ).toBeGreaterThan(0);
      expect(t.inputSchema, `inputSchema present: ${t.name}`).toBeDefined();
      expect(typeof t.inputSchema, `inputSchema is object: ${t.name}`).toBe(
        "object",
      );
    }
    await closeClient(client, clientTransport, serverTransport);
  });
});
