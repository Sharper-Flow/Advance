/**
 * ADV MCP server end-to-end tests.
 *
 * Uses the MCP SDK Client + InMemoryTransport to verify the skeleton read
 * surface: serverInfo, tools/list, adv_handshake, project_context parity, and
 * AC6 mutation-shaped arg rejection.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { writeFile } from "fs/promises";
import { join } from "path";
import { startServer } from "./index.js";
import { HANDSHAKE_TIER4_TOOLS, ADV_CONTRACT_VERSION } from "./handshake.js";
import { executeTier4Tool } from "./tools/index.js";
import { createTier4ToolMap } from "./tier4-tool-map.js";
import { createDiskStore } from "../storage/store-disk.js";
import { projectTools } from "../tools/project.js";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup.js";

async function connectToServer(): Promise<{
  client: Client;
  clientTransport: InMemoryTransport;
  serverTransport: InMemoryTransport;
}> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await startServer({
    transport: serverTransport,
  });
  await clientTransport.start();
  await serverTransport.start();

  const client = new Client({ name: "adv-mcp-test", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, clientTransport, serverTransport };
}

async function closeClient(
  client: Client,
  clientTransport: InMemoryTransport,
  serverTransport: InMemoryTransport,
): Promise<void> {
  await client.close();
  await clientTransport.close();
  await serverTransport.close();
}

function extractText(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  return result.content[0].text ?? "";
}

describe("adv mcp server", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("adv-mcp-server-");
    await createTestProject(tempDir, {
      withSpecs: false,
      withChanges: false,
      withConfig: true,
    });
    await writeFile(
      join(tempDir, "project.md"),
      "# Test Project\n\nThis is the project context.",
    );
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("boots and exposes serverInfo with name adv and plugin version", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();

    expect(client.getServerVersion()).toEqual({
      name: "adv",
      version: "1.0.0",
    });

    await closeClient(client, clientTransport, serverTransport);
  });

  it("tools/list returns exactly the 14 expected Tier-4 tools", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(
      [
        "adv_handshake",
        "project_context",
        "status",
        "spec",
        "wisdom_list",
        "reflection_list",
        "backlog_list",
        "backlog_show",
        "epic_list",
        "epic_show",
        "wip_state",
        "worktree_triage",
        "tool_catalog",
        "tool_describe",
      ].sort(),
    );

    await closeClient(client, clientTransport, serverTransport);
  });

  it("tools/list does not expose removed tools", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();

    const tools = await client.listTools();
    const names = new Set(tools.tools.map((t) => t.name));
    for (const removed of [
      "reflect",
      "project_metadata",
      "conformance",
      "session_list",
      "session_show",
    ]) {
      expect(names).not.toContain(removed);
    }

    await closeClient(client, clientTransport, serverTransport);
  });

  it("adv_handshake returns tier4 tool list and contract version", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();

    const result = await client.callTool({
      name: "adv_handshake",
      arguments: {},
    });
    const text = extractText(result);
    const parsed = JSON.parse(text);
    expect(parsed).toEqual({
      tier4_tools: HANDSHAKE_TIER4_TOOLS,
      adv_contract_version: ADV_CONTRACT_VERSION,
    });

    await closeClient(client, clientTransport, serverTransport);
  });

  it("HANDSHAKE_TIER4_TOOLS count is exactly 13 (KD9 catalog invariant)", () => {
    // Count-guard: prevents silent drift if a tool is added/removed without
    // updating the design. Per AMEND-1 (AC2 → AC2'): the catalog was reduced
    // from 18 to 13 tools. Any future change to this count MUST be accompanied
    // by a design amendment + AC2' update.
    expect(HANDSHAKE_TIER4_TOOLS.length).toBe(13);
    // Explicit membership check (catches wrong-tool substitution)
    expect(new Set(HANDSHAKE_TIER4_TOOLS)).toEqual(
      new Set([
        "status",
        "spec",
        "wisdom_list",
        "reflection_list",
        "project_context",
        "backlog_list",
        "backlog_show",
        "epic_list",
        "epic_show",
        "wip_state",
        "worktree_triage",
        "tool_catalog",
        "tool_describe",
      ]),
    );
  });

  it("project_context returns the same output as the direct plugin tool", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();

    const mcpResult = await client.callTool({
      name: "project_context",
      arguments: {},
    });
    const mcpText = extractText(mcpResult);

    const store = await createDiskStore(tempDir);
    try {
      const directResult = await projectTools.adv_project_context.execute(
        {},
        store,
      );
      expect(mcpText).toBe(directResult);
    } finally {
      store.close();
    }

    await closeClient(client, clientTransport, serverTransport);
  });

  it("rejects project_root argument", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();

    const result = await client.callTool({
      name: "project_context",
      arguments: { project_root: "/evil" },
    });
    const text = extractText(result);
    expect(JSON.parse(text)).toEqual({
      error: "ARG_REJECTED",
      code: "MUTATION_SHAPED_ARGUMENT",
      arg: "project_root",
    });

    await closeClient(client, clientTransport, serverTransport);
  });

  it("rejects projectRoot argument", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();

    const result = await client.callTool({
      name: "project_context",
      arguments: { projectRoot: "/evil" },
    });
    const text = extractText(result);
    expect(JSON.parse(text)).toEqual({
      error: "ARG_REJECTED",
      code: "MUTATION_SHAPED_ARGUMENT",
      arg: "projectRoot",
    });

    await closeClient(client, clientTransport, serverTransport);
  });

  it("rejects target_path argument", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();

    const result = await client.callTool({
      name: "project_context",
      arguments: { target_path: "/evil" },
    });
    const text = extractText(result);
    expect(JSON.parse(text)).toEqual({
      error: "ARG_REJECTED",
      code: "MUTATION_SHAPED_ARGUMENT",
      arg: "target_path",
    });

    await closeClient(client, clientTransport, serverTransport);
  });

  it("tool_describe delegates to the plugin handler", async () => {
    const { client, clientTransport, serverTransport } =
      await connectToServer();

    const result = await client.callTool({
      name: "tool_describe",
      arguments: { name: "adv_project_context" },
    });
    const text = extractText(result);
    const parsed = JSON.parse(text);
    expect(parsed.name).toBe("adv_project_context");
    expect(parsed.description).toBeDefined();

    await closeClient(client, clientTransport, serverTransport);
  });

  it("cold starts in under 2 seconds", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const start = performance.now();
    await startServer({
      transport: serverTransport,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    await clientTransport.close();
    await serverTransport.close();
  });
});

// Also verify project_context is dispatched by the generic Tier-4 handler
// so parity failures are isolated from transport wiring.
describe("executeTier4Tool project_context dispatch", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("adv-mcp-dispatch-");
    await createTestProject(tempDir, {
      withSpecs: false,
      withChanges: false,
      withConfig: true,
    });
    await writeFile(
      join(tempDir, "project.md"),
      "# Direct Project\n\nDirect context.",
    );
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("matches the direct plugin tool output", async () => {
    const text = await executeTier4Tool(
      tempDir,
      "project_context",
      {},
      {
        createToolMap: createTier4ToolMap,
      },
    );

    const store = await createDiskStore(tempDir);
    try {
      const directResult = await projectTools.adv_project_context.execute(
        {},
        store,
      );
      expect(text).toBe(directResult);
    } finally {
      store.close();
    }
  });
});
