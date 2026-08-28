import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "../../..");
const PACKAGE_PATH = join(REPO_ROOT, "plugin/package.json");
const WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/ci.yml");
const COMMAND_PATH = join(REPO_ROOT, "bin/dead-code-check.ts");
const REFRESH_COMMAND_PATH = join(
  REPO_ROOT,
  "bin/dead-code-provenance-refresh.ts",
);

describe("dead-code ratchet wiring", () => {
  test("exposes the read-only package command", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["dead-code:check"]).toBe(
      "bun ../bin/dead-code-check.ts",
    );
  });

  test("runs the package command as a mandatory CI step", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const bunSetup = workflow.indexOf("- name: Install Bun");
    const ratchet = workflow.indexOf("- name: Dead-code ratchet");

    expect(workflow).toContain("- name: Dead-code ratchet");
    expect(workflow).toContain("run: pnpm run dead-code:check");
    expect(workflow).toContain("working-directory: plugin");
    expect(bunSetup).toBeGreaterThanOrEqual(0);
    expect(bunSetup).toBeLessThan(ratchet);
  });

  test("command has no baseline write or replacement options", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    expect(command).not.toMatch(/writeFile|rename|unlink|rm\(/);
    expect(command).not.toMatch(
      /--baseline|--update-baseline|--write-baseline/,
    );
  });

  test("registers one fixed-scope provenance writer beside the read-only checker", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const command = readFileSync(COMMAND_PATH, "utf8");
    const refreshCommand = readFileSync(REFRESH_COMMAND_PATH, "utf8");
    const refreshScripts = Object.keys(packageJson.scripts ?? {}).filter(
      (key) => key.startsWith("dead-code:provenance:"),
    );

    expect(refreshScripts).toEqual(["dead-code:provenance:refresh"]);
    expect(packageJson.scripts?.["dead-code:provenance:refresh"]).toBe(
      "bun ../bin/dead-code-provenance-refresh.ts",
    );
    expect(command).not.toContain("refreshDeadCodeBaselineProvenance");
    expect(refreshCommand).toContain("refreshDeadCodeBaselineProvenance");
    expect(refreshCommand).not.toContain("clearDeadCodeBaseline");
  });
});
