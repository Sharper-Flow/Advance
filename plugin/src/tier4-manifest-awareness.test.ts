import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { SPAWNABLE_SUBAGENT_ROSTER } from "./tool-role-policy.js";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENTS_DIR = resolve(REPO_ROOT, ".opencode/agents");

describe("Tier-4 MCP surface in agent manifests", () => {
  for (const agent of SPAWNABLE_SUBAGENT_ROSTER) {
    const source = readFileSync(resolve(AGENTS_DIR, `${agent}.md`), "utf8");
    if (!source.includes("> **Invoke routing:**")) {
      continue;
    }
    test(`${agent}.md invoke-routing comment mentions Tier-4 Code Mode surface`, () => {
      expect(source).toMatch(
        /Tier[- ]?4.*tools\.adv\.\*|tools\.adv\.\*.*Tier[- ]?4/i,
      );
    });
  }
});

describe("tool-role-policy Tier-4 catalog import", () => {
  test("imports the neutral catalog, not the handshake module", () => {
    const source = readFileSync(
      resolve(__dirname, "tool-role-policy.ts"),
      "utf8",
    );
    expect(source).toContain('from "./tool-tier4-catalog.js"');
    expect(source).not.toContain('from "./mcp-server/handshake.js"');
    expect(source).not.toContain('from "./mcp-server/handshake"');
  });
});
