import { describe, expect, test, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");

// deploy-local.sh can rebuild plugin/dist before syncing runtime assets. The
// first integration-style spawn in a fresh checkout may pay that build cost.
vi.setConfig({ testTimeout: 120_000 });

describe("overlay sync script support", () => {
  const content = readFileSync(DEPLOY_SCRIPT_PATH, "utf8");

  test("supports dry-run and diff options for overlay review", () => {
    expect(content).toContain("--dry-run");
    expect(content).toContain("--diff");
  });

  test("contains a helper for applying managed overlay blocks", () => {
    expect(content).toContain("apply_overlay_block()");
    expect(content).toContain("ADV_SYNC:START");
    expect(content).toContain("ADV_SYNC:END");
  });

  test("contains a deploy-time plugin dist freshness guard", () => {
    expect(content).toContain("ensure_plugin_dist_fresh()");
    expect(content).toContain('ADV_PLUGIN_DIST="$ADV_SOURCE_PLUGIN_PATH/dist/index.js"');
    expect(content).toContain(
      'find "$ADV_SOURCE_PLUGIN_PATH/src" -type f -newer "$ADV_PLUGIN_DIST" -print -quit',
    );
    expect(content).toContain('(cd "$ADV_SOURCE_PLUGIN_PATH" && pnpm run build)');
    expect(content).toContain("refusing to deploy stale dist");
  });

  test("plugin dist freshness guard preserves check-only mode", () => {
    const checkExit = content.indexOf('if [ "$MODE" = "check" ]; then');
    const sourceGuard = content.indexOf('if [ ! -d "$ADV_SOURCE_PLUGIN_PATH" ]; then');
    const guardCall = content.indexOf("ensure_plugin_dist_fresh", sourceGuard);
    const pluginRsync = content.indexOf('rsync -a --delete "$ADV_SOURCE_PLUGIN_PATH/"');

    expect(checkExit).toBeGreaterThan(-1);
    expect(sourceGuard).toBeGreaterThan(checkExit);
    expect(guardCall).toBeGreaterThan(sourceGuard);
    expect(pluginRsync).toBeGreaterThan(guardCall);
  });

  test("plugin dist freshness guard supports dry-run without building", () => {
    expect(content).toContain("would rebuild plugin dist");
    expect(content).toContain('if [ "$DRY_RUN" = true ]; then');
    expect(content).toContain("plugin dist is missing");
    expect(content).toContain("plugin source is newer than dist");
  });

  test("plugin dist freshness guard replaces warn-only deploy behavior", () => {
    expect(content).not.toContain("Warn loudly but do not abort");
    expect(content).not.toContain("sync can still copy assets even if the");
  });

  test("detects duplicate overlay markers and skips unsafe writes", () => {
    expect(content).toContain("duplicate overlay marker");
    expect(content).toContain("skipped missing shared agent");
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

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
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

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
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

  test("removes stale global scout and refine agents on --fix", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-scout-refine-cleanup-"));

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
      writeFileSync(join(globalAgents, "scout.md"), "stale scout\n");
      writeFileSync(join(globalAgents, "refine.md"), "stale refine\n");

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(() =>
        readFileSync(join(globalAgents, "scout.md"), "utf8"),
      ).toThrow();
      expect(() =>
        readFileSync(join(globalAgents, "refine.md"), "utf8"),
      ).toThrow();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("removes stale scout and refine agent config keys on --fix", () => {
    const tempHome = mkdtempSync(
      join(tmpdir(), "adv-scout-refine-config-cleanup-"),
    );

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({
          plugin: [],
          instructions: [],
          agent: {
            scout: { model: "zai-coding-plan/glm-5.1" },
            refine: { model: "anthropic/claude-opus-4-7" },
            plan: {},
            build: {},
          },
        }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      const patched = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );
      expect(patched.agent.scout).toBeUndefined();
      expect(patched.agent.refine).toBeUndefined();
      expect(patched.agent.plan).toEqual({});
      expect(patched.agent.build).toEqual({});
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("deploy run from a worktree uses stable runtime plugin and canonical instruction paths", () => {
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
      // the *current* working-tree version of deploy-local.sh under test.
      writeFileSync(join(tempWorktree, "scripts", "deploy-local.sh"), content);
      mkdirSync(join(tempWorktree, "plugin", "dist"), { recursive: true });
      writeFileSync(
        join(tempWorktree, "plugin", "dist", "index.js"),
        "// test dist is fresh\n",
      );

      const worktreeScript = join(tempWorktree, "scripts", "deploy-local.sh");
      const fixResult = spawnSync("bash", [worktreeScript, "--fix"], {
        cwd: tempWorktree,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });
      expect(fixResult.status).toBe(0);
      const deployOutput = `${fixResult.stdout}${fixResult.stderr}`;
      const canonicalRootMatch = deployOutput.match(
        /ADV deploy-local \(fix\):\s+(.*?)\s+->/,
      );
      const canonicalRoot = canonicalRootMatch?.[1] ?? REPO_ROOT;
      const runtimePluginMatch = deployOutput.match(
        /runtime plugin:\s+.*?\s+->\s+(.*)/,
      );
      const runtimePlugin =
        runtimePluginMatch?.[1]?.trim() ??
        join(tempHome, ".local/share/Advance/plugin");

      const patched = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );

      expect(patched.plugin).toContain(runtimePlugin);
      expect(patched.plugin).not.toContain(join(canonicalRoot, "plugin"));
      expect(patched.plugin).not.toContain(join(tempWorktree, "plugin"));

      expect(patched.instructions ?? []).not.toContain(
        join(canonicalRoot, "ADV_INSTRUCTIONS.md"),
      );
      expect(patched.instructions).not.toContain(
        join(tempWorktree, "ADV_INSTRUCTIONS.md"),
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

  // ===========================================================================
  // Single ADV runtime agent (providerAdvAgentAssemblySystem retired)
  // ===========================================================================

  test("sync --fix does not generate provider ADV variants", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-single-agent-"));

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
        "---\ndescription: temp adv\n---\nCANONICAL BODY SHOULD MOVE TO PROMPT PART\n",
      );

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(existsSync(join(globalAgents, "adv.md"))).toBe(true);
      for (const p of ["claude", "gpt", "glm", "kimi"]) {
        const variantPath = join(globalAgents, `adv-${p}.md`);
        expect(
          existsSync(variantPath),
          `retired variant exists: adv-${p}.md`,
        ).toBe(false);
      }
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("synced adv.md contains canonical ADV body plus ADV_INSTRUCTIONS protocol", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-single-runtime-"));

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
        "---\ndescription: temp adv\n---\nCANONICAL BODY SHOULD MOVE TO PROMPT PART\n",
      );

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      const config = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );
      const advContent = readFileSync(join(globalAgents, "adv.md"), "utf8");
      expect(advContent).toContain("ADV_SYNC:START adv");
      expect(advContent).toContain("### TDD Protocol (RSTC)");
      expect(advContent).not.toContain("<!-- PROVIDER_HINT:");
      expect(config.agent?.["adv-gpt"]?.prompt).toBeUndefined();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("non-ADV build agent prompt is self-contained without ADV_INSTRUCTIONS section refs", () => {
    const buildAgent = readFileSync(
      join(REPO_ROOT, ".opencode/agents/build.md"),
      "utf8",
    );
    expect(buildAgent).toContain(
      "NEVER suggest splitting a change based on size, complexity, or task count alone",
    );
    expect(buildAgent).not.toContain(
      "See `ADV_INSTRUCTIONS.md § Large-Scope Validity`",
    );
    expect(buildAgent).not.toContain("### TDD Protocol (RSTC)");
    expect(buildAgent).not.toContain("## Critical Protocols");
  });

  test("sync --fix removes stale generated provider variants", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-provider-stale-clean-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      for (const p of ["claude", "gpt", "glm", "kimi"]) {
        writeFileSync(join(globalAgents, `adv-${p}.md`), `stale ${p}\n`);
      }

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      for (const p of ["claude", "gpt", "glm", "kimi"]) {
        expect(existsSync(join(globalAgents, `adv-${p}.md`))).toBe(false);
      }
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("sync --fix does not patch provider prompt refs or disable generic adv", () => {
    const tempHome = mkdtempSync(
      join(tmpdir(), "adv-provider-no-config-patch-"),
    );

    try {
      const configDir = join(tempHome, ".config/opencode");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [], agent: {} }),
      );

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      const config = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );
      expect(config.agent?.adv?.disable).toBeUndefined();
      for (const p of ["claude", "gpt", "glm", "kimi"]) {
        expect(config.agent?.[`adv-${p}`]?.prompt).toBeUndefined();
      }
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("skips JSONC patching during --fix without stripping comments", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-jsonc-protect-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      mkdirSync(configDir, { recursive: true });
      const jsoncPath = join(configDir, "opencode.jsonc");
      writeFileSync(
        jsoncPath,
        `{
          // This is a comment
          "plugin": [],
          "instructions": []
        }`,
      );

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      // Should warn and skip config mutation rather than silently strip comments.
      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "Config is JSONC — skipping auto-patch",
      );
      const content = readFileSync(jsoncPath, "utf8");
      expect(content).toContain("// This is a comment");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
