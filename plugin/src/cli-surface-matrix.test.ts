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
});
