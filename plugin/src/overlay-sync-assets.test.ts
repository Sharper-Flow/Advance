import { describe, expect, test } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const SYNC_SCRIPT_PATH = join(REPO_ROOT, "scripts/sync-global.sh");

describe("overlay sync script support", () => {
  const content = readFileSync(SYNC_SCRIPT_PATH, "utf8");

  test("supports dry-run and diff options for overlay review", () => {
    expect(content).toContain("--dry-run");
    expect(content).toContain("--diff");
  });

  test("contains a helper for applying managed overlay blocks", () => {
    expect(content).toContain("apply_overlay_block()");
    expect(content).toContain("ADV_SYNC:START");
    expect(content).toContain("ADV_SYNC:END");
  });

  test("detects duplicate overlay markers and skips unsafe writes", () => {
    expect(content).toContain("duplicate overlay marker");
    expect(content).toContain("skipped missing shared agent");
  });

  test("fails fast on orphaned overlay markers", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-sync-"));

    try {
      const globalAgents = join(tempHome, ".config/opencode/agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(globalAgents, "adv.md"),
        [
          "---",
          'description: "temp adv agent"',
          "---",
          "",
          "<!-- ADV_SYNC:START adv -->",
          "stale overlay without end marker",
          "",
        ].join("\n"),
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--dry-run"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      const output = `${result.stdout}${result.stderr}`;
      expect(result.status).toBe(1);
      expect(output).toContain("orphaned overlay marker: adv.md");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("bootstraps missing shared adv agent on --fix", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-bootstrap-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      const advPath = join(configDir, "agents", "adv.md");
      expect(result.status).toBe(0);
      expect(readFileSync(advPath, "utf8")).toContain("ADV_SYNC:START adv");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("removes stale global orca agent on --fix", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-orca-cleanup-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );
      writeFileSync(join(globalAgents, "orca.md"), "stale orca\n");

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(() =>
        readFileSync(join(globalAgents, "orca.md"), "utf8"),
      ).toThrow();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // Cost Governance Instruction Management (addCostTimeInvestment)
  // ===========================================================================

  test("sync script defines ADV_COST_GOVERNANCE_PATH variable", () => {
    expect(content).toContain("ADV_COST_GOVERNANCE_PATH");
    expect(content).toContain(".opencode/instructions/cost-governance.md");
  });

  test("sync script checks for cost-governance.md registration in instructions[]", () => {
    // check_config() block
    expect(content).toMatch(
      /cost-governance\.md registered|cost-governance\.md missing/,
    );
  });

  test("sync script patches instructions[] to include cost-governance.md", () => {
    // fix_config() block — jq patch for the new path
    expect(content).toMatch(/Added instruction:\s*\$ADV_COST_GOVERNANCE_PATH/);
  });

  test("sync --fix patches instructions[] with cost-governance.md when file exists", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-cost-gov-sync-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      const patched = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );
      // Instructions array should now include the cost-governance path
      expect(
        patched.instructions.some((p: string) =>
          p.endsWith("cost-governance.md"),
        ),
      ).toBe(true);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("sync run from a worktree canonicalizes plugin/instruction paths back to the main repo root", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-worktree-home-"));
    const tempWorktreeRoot = mkdtempSync(join(tmpdir(), "adv-worktree-root-"));
    const tempWorktree = join(tempWorktreeRoot, "repo-worktree");

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );

      const addResult = spawnSync(
        "git",
        ["worktree", "add", "--detach", tempWorktree],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, CI: "true" },
          encoding: "utf8",
        },
      );
      expect(addResult.status).toBe(0);

      // The temp worktree is created from HEAD, but this test needs to execute
      // the *current* working-tree version of sync-global.sh under test.
      writeFileSync(join(tempWorktree, "scripts", "sync-global.sh"), content);

      const worktreeScript = join(tempWorktree, "scripts", "sync-global.sh");
      const fixResult = spawnSync("bash", [worktreeScript, "--fix"], {
        cwd: tempWorktree,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });
      expect(fixResult.status).toBe(0);
      const syncOutput = `${fixResult.stdout}${fixResult.stderr}`;
      const canonicalRootMatch = syncOutput.match(
        /ADV sync-global \(fix\):\s+(.*?)\s+->/,
      );
      const canonicalRoot = canonicalRootMatch?.[1] ?? REPO_ROOT;

      const syncOutput = `${fixResult.stdout}${fixResult.stderr}`;
      const canonicalRootMatch = syncOutput.match(
        /ADV sync-global \(fix\):\s+(.*?)\s+->/,
      );
      const canonicalRoot = canonicalRootMatch?.[1] ?? REPO_ROOT;

      const patched = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );

      expect(patched.plugin).toContain(join(canonicalRoot, "plugin"));
      expect(patched.plugin).not.toContain(join(tempWorktree, "plugin"));

      expect(patched.instructions).toContain(
        join(canonicalRoot, "ADV_INSTRUCTIONS.md"),
      );
      expect(patched.instructions).toContain(
        join(canonicalRoot, ".opencode", "instructions", "cost-governance.md"),
      );
      expect(patched.instructions).not.toContain(
        join(tempWorktree, "ADV_INSTRUCTIONS.md"),
      );
      expect(patched.instructions).not.toContain(
        join(tempWorktree, ".opencode", "instructions", "cost-governance.md"),
      );
    } finally {
      spawnSync("git", ["worktree", "remove", "--force", tempWorktree], {
        cwd: REPO_ROOT,
        env: { ...process.env, CI: "true" },
        encoding: "utf8",
      });
      rmSync(tempWorktreeRoot, { recursive: true, force: true });
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
