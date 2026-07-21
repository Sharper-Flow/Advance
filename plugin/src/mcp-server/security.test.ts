/**
 * DDC7 exhaustive rejection tests for the ADV MCP read surface.
 *
 * Verifies that every Tier-4 catalog tool (13 HANDSHAKE_TIER4_TOOLS) plus
 * adv_handshake rejects every mutation-shaped argument with the same typed
 * error schema, while valid read args pass through unchanged.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { writeFile } from "fs/promises";
import { join } from "path";
import { startServer } from "./index.js";
import { HANDSHAKE_TIER4_TOOLS } from "./handshake.js";
import {
  REJECTED_MUTATION_ARG_NAMES,
  REJECTED_ARG_PREFIXES,
  MUTATING_KIND_ACTION_VALUES,
  formatArgRejection,
  rejectMutationShapedArgs,
} from "./security.js";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup.js";

const ALL_TIER4_TOOLS = ["adv_handshake", ...HANDSHAKE_TIER4_TOOLS];

/**
 * Valid read args for each tool. These must be accepted by the security
 * wrapper (they may still fail downstream with not-found/no-data errors).
 */
const POSITIVE_ARGS: Record<string, Record<string, unknown>> = {
  adv_handshake: {},
  status: { view: "summary" },
  spec: { action: "list" },
  wisdom_list: { changeId: "ch-test" },
  reflection_list: {},
  project_context: {},
  backlog_list: { include_archived: true },
  backlog_show: { id: "backlog-1" },
  epic_list: { status: "active" },
  epic_show: { epic_id: "myEpic" },
  wip_state: {},
  worktree_triage: {},
  tool_catalog: { limit: 10 },
  tool_describe: { name: "adv_status" },
};

interface RejectedCase {
  name: string;
  args: Record<string, unknown>;
  expectedArg: string;
}

const REJECTED_CASES: RejectedCase[] = [];

for (const arg of REJECTED_MUTATION_ARG_NAMES) {
  REJECTED_CASES.push({
    name: `exact-${arg}`,
    args: { [arg]: "/evil" },
    expectedArg: arg,
  });
}

for (const prefix of REJECTED_ARG_PREFIXES) {
  for (const suffix of ["", "Foo", "_bar"]) {
    const arg = `${prefix}${suffix}`;
    REJECTED_CASES.push({
      name: `prefix-${arg}`,
      args: { [arg]: "evil" },
      expectedArg: arg,
    });
  }
}

for (const key of ["kind", "action"]) {
  for (const value of MUTATING_KIND_ACTION_VALUES) {
    REJECTED_CASES.push({
      name: `${key}=${value}`,
      args: { [key]: value },
      expectedArg: key,
    });
  }
}

async function connectToServer(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await startServer({ transport: serverTransport });
  await clientTransport.start();
  await serverTransport.start();

  const client = new Client({ name: "adv-mcp-security", version: "1.0.0" });
  await client.connect(clientTransport);

  return {
    client,
    close: async () => {
      await client.close();
      await clientTransport.close();
      await serverTransport.close();
    },
  };
}

function extractText(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  return result.content[0].text ?? "";
}

describe("DDC7 mutation-shaped argument rejection", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("adv-mcp-security-");
    await createTestProject(tempDir, {
      withSpecs: false,
      withChanges: false,
      withConfig: true,
    });
    await writeFile(
      join(tempDir, "project.md"),
      "# Security Test Project\n\nContext.",
    );
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  for (const toolName of ALL_TIER4_TOOLS) {
    it(`rejects every mutation-shaped arg for ${toolName} and allows valid read args`, async () => {
      const { client, close } = await connectToServer();
      try {
        for (const { name: caseName, args, expectedArg } of REJECTED_CASES) {
          const result = await client.callTool({
            name: toolName,
            arguments: args,
          });
          const text = extractText(result);
          expect(
            JSON.parse(text),
            `${toolName} + ${caseName} should reject with typed error`,
          ).toEqual({
            error: "ARG_REJECTED",
            code: "MUTATION_SHAPED_ARGUMENT",
            arg: expectedArg,
          });
        }

        const positiveArgs = POSITIVE_ARGS[toolName] ?? {};
        const positiveResult = await client.callTool({
          name: toolName,
          arguments: positiveArgs,
        });
        const positiveText = extractText(positiveResult);
        expect(
          positiveText,
          `${toolName} valid args should not be rejected`,
        ).not.toContain("ARG_REJECTED");
      } finally {
        await close();
      }
    });
  }

  it("formatArgRejection produces the exact typed schema", () => {
    const text = formatArgRejection("target_path");
    expect(JSON.parse(text)).toEqual({
      error: "ARG_REJECTED",
      code: "MUTATION_SHAPED_ARGUMENT",
      arg: "target_path",
    });
  });
});

// Direct unit tests for the pure checker keep edge cases cheap and isolated.
describe("rejectMutationShapedArgs (pure)", () => {
  it("rejects the first mutation-shaped arg when multiple are present", () => {
    const check = rejectMutationShapedArgs({
      projectRoot: "/evil",
      approvedByUser: true,
    });
    expect(check.rejected).toBe(true);
    if (check.rejected) {
      expect(check.arg).toBe("projectRoot");
    }
  });

  it("allows read-only action values like spec list/show/search", () => {
    expect(rejectMutationShapedArgs({ action: "list" }).rejected).toBe(false);
    expect(rejectMutationShapedArgs({ action: "show" }).rejected).toBe(false);
    expect(rejectMutationShapedArgs({ action: "search" }).rejected).toBe(false);
  });

  it("rejects mutating action values case-insensitively", () => {
    expect(rejectMutationShapedArgs({ ACTION: "WRITE" }).rejected).toBe(true);
    expect(rejectMutationShapedArgs({ KIND: "ARCHIVE" }).rejected).toBe(true);
  });
});
