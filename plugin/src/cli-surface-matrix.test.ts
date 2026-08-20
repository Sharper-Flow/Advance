import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { ADV_TOOL_NAMES } from "./tool-registry";

const REPO_ROOT = resolve(__dirname, "../..");
const MATRIX_DOC = join(REPO_ROOT, "docs/cli-surface-matrix.md");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");

const TOOL_DISPOSITIONS = [
  "keep-mcp-only",
  "mcp+cli-additive",
  "no-cli-dangerous",
];

const COMMAND_DISPOSITIONS = [
  "cli-bridge-primary",
  "mcp+cli-additive",
  "agent-workflow-only",
];

const TIER_4_READ_DOCS = [
  "docs/runbooks/adv-mcp-code-mode.md",
  "docs/tool-ownership.md",
  "skills/adv-triage/BOOTSTRAP.md",
  "docs/checklists/improve-checklist.md",
];

describe("cli-surface-matrix coverage (AC1/AC2)", () => {
  const matrixContent = readFileSync(MATRIX_DOC, "utf8");
  const lines = matrixContent.split("\n");

  test("every ADV_TOOL_NAMES entry has a matrix row with a disposition", () => {
    const missing: string[] = [];
    for (const tool of ADV_TOOL_NAMES) {
      const found = lines.some(
        (line) =>
          line.includes(tool) &&
          TOOL_DISPOSITIONS.some((disp) => line.includes(disp)),
      );
      if (!found) missing.push(tool);
    }
    expect(
      missing,
      `docs/cli-surface-matrix.md missing rows for tools: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  test("every .opencode/command/adv-*.md command has a matrix row with a disposition", () => {
    const commandFiles = readdirSync(COMMAND_DIR).filter(
      (f) => f.startsWith("adv-") && f.endsWith(".md"),
    );
    const missing: string[] = [];
    for (const file of commandFiles) {
      const name = file.replace(/\.md$/, "");
      const found = lines.some(
        (line) =>
          line.includes(name) &&
          COMMAND_DISPOSITIONS.some((disp) => line.includes(disp)),
      );
      if (!found) missing.push(name);
    }
    expect(
      missing,
      `docs/cli-surface-matrix.md missing rows for commands: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  test("operational docs do not tell agents to call retired Epic or backlog reads", () => {
    // dc461d3a retired these four from the host registry; they survive only as
    // Tier-4 MCP reads bridged by plugin/src/mcp-server/tier4-tool-map.ts.
    //
    // Scope is deliberate. These docs are operational instructions — they tell
    // an agent what to invoke — so a host-shaped mention is always wrong here.
    // docs/tool-ownership.md is excluded because it is the one doc that must
    // name retired tools to document their retirement; its own stricter,
    // registry-derived rule lives in tool-role-policy.test.ts.
    const retiredHostTools = [
      "`adv_epic_list`",
      "`adv_epic_show`",
      "`adv_backlog_list`",
      "`adv_backlog_show`",
    ];
    const operationalDocs = TIER_4_READ_DOCS.filter(
      (doc) => doc !== "docs/tool-ownership.md",
    );
    const staleRows: string[] = [];
    for (const doc of operationalDocs) {
      const lines = readFileSync(join(REPO_ROOT, doc), "utf8").split("\n");
      for (const line of lines) {
        for (const tool of retiredHostTools) {
          if (line.includes(tool)) staleRows.push(`${doc}: ${line.trim()}`);
        }
      }
    }
    expect(
      staleRows,
      "use the tools.adv.* Tier-4 names in operational docs",
    ).toEqual([]);
  });
});
