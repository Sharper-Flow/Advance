/**
 * Regression tests for trunk-write-firewall behavior matrix.
 * Promoted from the investigation test for change fixTrunkFirewallRelPath.
 *
 * Characterizes firewall behavior when the session directory is set to either
 * the trunk or a worktree, and the tool's target path is absolute or relative.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";

import { AdvancePlugin } from "../index";
import { resetStatusForTest } from "../events/status";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
} from "../__tests__/setup";

interface ToolCase {
  tool: "write" | "edit" | "morph_edit" | "bash";
  buildArgs: (targetPath: string) => Record<string, unknown>;
}

const FILE_TOOL_CASES: ToolCase[] = [
  { tool: "write", buildArgs: (p) => ({ filePath: p, content: "x" }) },
  {
    tool: "edit",
    buildArgs: (p) => ({ filePath: p, oldString: "a", newString: "b" }),
  },
  {
    tool: "morph_edit",
    buildArgs: (p) => ({
      target_filepath: p,
      instructions: "x",
      code_edit: "y",
    }),
  },
];

describe("Regression: trunk-write-firewall behavior matrix", () => {
  let trunk: string;
  let worktreePath: string;
  let hooks: any;

  beforeEach(async () => {
    resetStatusForTest();
    trunk = await createTempDir();
    await createTestProject(trunk);
    execSync("git init -b main", { cwd: trunk });
    execSync("git config user.email 'test@test.com'", { cwd: trunk });
    execSync("git config user.name 'Test'", { cwd: trunk });
    execSync("git config init.defaultBranch main", { cwd: trunk });
    mkdirSync(join(trunk, "src"), { recursive: true });
    writeFileSync(join(trunk, "README.md"), "initial");
    execSync("git add README.md", { cwd: trunk });
    execSync("git commit -m initial", { cwd: trunk });
    await writeFile(
      join(trunk, "project.json"),
      JSON.stringify(
        {
          name: "test-project",
          features: { worktree_guard_enforce: true },
        },
        null,
        2,
      ),
    );
    worktreePath = `${trunk}-wt`;
    execSync(
      `git worktree add -b change/test ${JSON.stringify(worktreePath)}`,
      { cwd: trunk },
    );
    mkdirSync(join(worktreePath, "src"), { recursive: true });
  });

  afterEach(async () => {
    if (hooks?.event) {
      try {
        await hooks.event({
          event: { type: "session.deleted", properties: {} },
        });
      } catch {
        // ignore cleanup errors
      }
    }
    hooks = null;
    try {
      execSync(`git worktree remove --force ${JSON.stringify(worktreePath)}`, {
        cwd: trunk,
        stdio: "ignore",
      });
    } catch {
      // best-effort cleanup
    }
    await cleanupTempDir(worktreePath);
    await cleanupTempDir(trunk);
  });

  async function bootPlugin(directory: string) {
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: trunk, time: { created: Date.now() } },
      directory,
      worktree: directory,
      serverUrl: new URL("http://localhost"),
    } as any);
  }

  async function invoke(
    toolName: ToolCase["tool"],
    args: Record<string, unknown>,
  ) {
    return hooks["tool.execute.before"]!(
      { tool: toolName, sessionID: "test" } as any,
      { args } as any,
    );
  }

  describe("session directory = trunk (NOT warped)", () => {
    beforeEach(async () => {
      await bootPlugin(trunk);
    });

    test.each(FILE_TOOL_CASES)(
      "ABS path to TRUNK on %s -> BLOCK",
      async ({ tool, buildArgs }) => {
        await expect(
          invoke(tool, buildArgs(join(trunk, "src/file.ts"))),
        ).rejects.toThrow(/Trunk write firewall/);
      },
    );

    test.each(FILE_TOOL_CASES)(
      "ABS path to WORKTREE on %s -> ALLOW",
      async ({ tool, buildArgs }) => {
        await expect(
          invoke(tool, buildArgs(join(worktreePath, "src/file.ts"))),
        ).resolves.toBeUndefined();
      },
    );

    test.each(FILE_TOOL_CASES)(
      "REL path on %s session=trunk -> BLOCK (resolves against trunk)",
      async ({ tool, buildArgs }) => {
        await expect(invoke(tool, buildArgs("src/file.ts"))).rejects.toThrow(
          /Trunk write firewall/,
        );
      },
    );

    test("bash ABS->worktree ALLOW", async () => {
      await expect(
        invoke("bash", { command: `echo hi > ${worktreePath}/src/file.ts` }),
      ).resolves.toBeUndefined();
    });

    test("bash ABS->trunk BLOCK", async () => {
      await expect(
        invoke("bash", { command: `echo hi > ${trunk}/src/file.ts` }),
      ).rejects.toThrow(/Trunk write firewall/);
    });

    test("bash REL+workdir=worktree ALLOW", async () => {
      await expect(
        invoke("bash", {
          command: "echo hi > src/file.ts",
          workdir: worktreePath,
        }),
      ).resolves.toBeUndefined();
    });

    test("bash REL+no workdir BLOCK (resolves against trunk)", async () => {
      await expect(
        invoke("bash", { command: "echo hi > src/file.ts" }),
      ).rejects.toThrow(/Trunk write firewall/);
    });
  });

  describe("session directory = worktree (post-warp)", () => {
    beforeEach(async () => {
      await bootPlugin(worktreePath);
    });

    test.each(FILE_TOOL_CASES)(
      "ABS->trunk %s BLOCK",
      async ({ tool, buildArgs }) => {
        await expect(
          invoke(tool, buildArgs(join(trunk, "src/file.ts"))),
        ).rejects.toThrow(/Trunk write firewall/);
      },
    );

    test.each(FILE_TOOL_CASES)(
      "ABS->worktree %s ALLOW",
      async ({ tool, buildArgs }) => {
        await expect(
          invoke(tool, buildArgs(join(worktreePath, "src/file.ts"))),
        ).resolves.toBeUndefined();
      },
    );

    test.each(FILE_TOOL_CASES)(
      "REL %s session=worktree ALLOW",
      async ({ tool, buildArgs }) => {
        await expect(
          invoke(tool, buildArgs("src/file.ts")),
        ).resolves.toBeUndefined();
      },
    );

    test("bash REL+no workdir session=worktree ALLOW", async () => {
      await expect(
        invoke("bash", { command: "echo hi > src/file.ts" }),
      ).resolves.toBeUndefined();
    });
  });
});
