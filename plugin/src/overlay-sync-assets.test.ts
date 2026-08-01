import { describe, expect, test, vi } from "vitest";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  symlinkSync,
} from "fs";
import { spawnSync } from "child_process";
import { join, resolve } from "path";
import {
  createDeployFixture,
  withDeployFixture,
} from "./__tests__/deploy-local-fixture";

const REPO_ROOT = resolve(__dirname, "../..");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");

// deploy-local.sh can rebuild plugin/dist before syncing runtime assets in
// addition to copying the single ADV runtime agent and provider hint assets;
// the first integration-style spawn in a fresh checkout may pay that build
// cost on top of the asset copies. Bump beyond the default 5s timeout.
//
// 240s rather than 120s because CI is *always* the fresh-checkout case and
// runs on slower shared hardware, so it always pays the full rebuild. The
// "bootstraps missing shared adv agent on --fix" case measured 120_322ms on a
// GitHub runner — over by 0.3% — while its siblings in this file take 55-86s.
// The old budget left no headroom for the slowest spawn on the slowest
// runner, which made this test a recurring red across multiple trunk runs.
vi.setConfig({ testTimeout: 240_000 });

describe("overlay sync script support", () => {
  const content = readFileSync(DEPLOY_SCRIPT_PATH, "utf8");

  test("deploy-local fixture refuses the repository root as working directory", () => {
    const fixture = createDeployFixture();
    try {
      expect(() => fixture.runDeploy(["--fix"], {}, REPO_ROOT)).toThrow(
        /Refusing to run deploy from repository root/i,
      );
    } finally {
      fixture.cleanup();
    }
  });

  test("deploy-local fixture records no pnpm build during normal --fix", () => {
    withDeployFixture((fixture) => {
      const result = fixture.runDeploy(["--fix"]);
      expect(result.status).toBe(0);
      const pnpmLog = readFileSync(fixture.pnpmLog, "utf8");
      expect(pnpmLog).toContain("run generate:manifests");
      expect(pnpmLog).not.toContain("run build");
    });
  });

  test("deploy-local fixture leaves the source worktree and build output unmodified", () => {
    const before = spawnSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).stdout;
    withDeployFixture((fixture) => {
      fixture.runDeploy(["--fix"]);
    });
    const after = spawnSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).stdout;
    expect(after).toBe(before);
  });

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
    expect(content).toContain("plugin_build_input_newer_than()");
    expect(content).toContain("plugin_dist_stale_reason()");
    expect(content).toContain("ensure_plugin_dist_fresh()");
    expect(content).toContain("same_git_common_dir()");
    expect(content).toContain(
      'ADV_PLUGIN_DIST="$ADV_SOURCE_PLUGIN_PATH/dist/index.js"',
    );
    expect(content).toContain(
      'find "$ADV_SOURCE_PLUGIN_PATH/src" -type f -newer "$output" -print -quit',
    );
    expect(content).toContain("pnpm-lock.yaml");
    expect(content).toContain("tsup.config.ts");
    expect(content).toContain("dist/temporal/worker.js");
    expect(content).toContain("dist/temporal/workflows.js");
    expect(content).toContain("dist/temporal/bundle-manifest.json");
    expect(content).toContain("dist/plugin-bundle-manifest.json");
    expect(content).toContain(
      '(cd "$ADV_SOURCE_PLUGIN_PATH" && pnpm run build)',
    );
    expect(content).toContain("refusing to deploy stale dist");
    expect(content).toContain("refusing to deploy stale dist after build");
  });

  test("plugin dist freshness guard preserves check-only mode", () => {
    const checkExit = content.indexOf('if [ "$MODE" = "check" ]; then');
    const sourceGuard = content.indexOf(
      'if [ ! -d "$ADV_SOURCE_PLUGIN_PATH" ]; then',
    );
    const guardCall = content.indexOf("ensure_plugin_dist_fresh", sourceGuard);
    const pluginRsync = content.indexOf('rsync -a --delete --exclude="dist/');

    expect(checkExit).toBeGreaterThan(-1);
    expect(sourceGuard).toBeGreaterThan(checkExit);
    expect(guardCall).toBeGreaterThan(sourceGuard);
    expect(pluginRsync).toBeGreaterThan(guardCall);
  });

  test("plugin dist freshness guard supports dry-run without building", () => {
    expect(content).toContain("would rebuild plugin dist");
    expect(content).toContain('if [ "$DRY_RUN" = true ]; then');
    expect(content).toContain("plugin dist output is missing");
    expect(content).toContain("plugin build input is newer than $output_rel");
  });

  test("plugin dist freshness guard replaces warn-only deploy behavior", () => {
    expect(content).not.toContain("Warn loudly but do not abort");
    expect(content).not.toContain("sync can still copy assets even if the");
  });

  test("plugin dist freshness guard exercises build, dry-run, and failure paths", () => {
    const fixture = createDeployFixture();
    try {
      fixture.makeDistStale();
      const dryRunResult = fixture.runDeploy(["--fix", "--dry-run"]);
      expect(dryRunResult.status).toBe(0);
      expect(`${dryRunResult.stdout}${dryRunResult.stderr}`).toContain(
        "would rebuild plugin dist",
      );
      expect(existsSync(fixture.pnpmLog)).toBe(false);

      fixture.makeDistFresh();
      const freshResult = fixture.runDeploy(["--fix"]);
      expect(
        freshResult.status,
        `${freshResult.stdout}${freshResult.stderr}`,
      ).toBe(0);
      const freshPnpmLog = readFileSync(fixture.pnpmLog, "utf8");
      expect(freshPnpmLog).toContain("run generate:manifests");
      expect(freshPnpmLog).not.toContain("run build");
      expect(readFileSync(fixture.rsyncLog, "utf8")).toContain("--delete");
      rmSync(fixture.rsyncLog, { force: true });

      fixture.makeDistStale();
      const failureResult = fixture.runDeploy(["--fix"], {
        FAKE_PNPM_FAIL: "1",
      });
      expect(failureResult.status).not.toBe(0);
      expect(`${failureResult.stdout}${failureResult.stderr}`).toContain(
        "refusing to deploy stale dist",
      );
      expect(existsSync(fixture.rsyncLog)).toBe(false);

      rmSync(fixture.pnpmLog, { force: true });
      fixture.makeDistStale();
      const postBuildFailureResult = fixture.runDeploy(["--fix"], {
        FAKE_PNPM_NO_REFRESH: "1",
      });
      expect(postBuildFailureResult.status).not.toBe(0);
      expect(
        `${postBuildFailureResult.stdout}${postBuildFailureResult.stderr}`,
      ).toContain("refusing to deploy stale dist after build");
      expect(existsSync(fixture.rsyncLog)).toBe(false);

      rmSync(fixture.pnpmLog, { force: true });
      fixture.makeBuildInputStale();
      const buildInputResult = fixture.runDeploy(["--fix"]);
      expect(buildInputResult.status).toBe(0);
      expect(readFileSync(fixture.pnpmLog, "utf8")).toContain("run build");
      expect(readFileSync(fixture.rsyncLog, "utf8")).toContain("--delete");
      rmSync(fixture.rsyncLog, { force: true });
      rmSync(fixture.pnpmLog, { force: true });

      fixture.makeDistStale();
      const successResult = fixture.runDeploy(["--fix"]);
      expect(successResult.status).toBe(0);
      const successPnpmLog = readFileSync(fixture.pnpmLog, "utf8");
      expect(successPnpmLog).toContain("run build");
      expect(successPnpmLog).toContain("run generate:manifests");
      expect(readFileSync(fixture.rsyncLog, "utf8")).toContain("--delete");
    } finally {
      fixture.cleanup();
    }
  });

  test("detects duplicate overlay markers and skips unsafe writes", () => {
    expect(content).toContain("duplicate overlay marker");
    expect(content).toContain("skipped missing shared agent");
  });

  test("bootstraps missing shared adv agent on --fix", () => {
    withDeployFixture((fixture) => {
      const result = fixture.runDeploy(["--fix"]);
      const advPath = join(
        fixture.tempHome,
        ".config",
        "opencode",
        "agents",
        "adv.md",
      );
      expect(result.status).toBe(0);
      expect(readFileSync(advPath, "utf8")).toContain("ADV_SYNC:START adv");
    });
  });

  test("removes stale global orca agent on --fix", () => {
    withDeployFixture((fixture) => {
      const globalAgents = join(
        fixture.tempHome,
        ".config",
        "opencode",
        "agents",
      );
      writeFileSync(join(globalAgents, "orca.md"), "stale orca\n");

      const result = fixture.runDeploy(["--fix"]);

      expect(result.status).toBe(0);
      expect(() =>
        readFileSync(join(globalAgents, "orca.md"), "utf8"),
      ).toThrow();
    });
  });

  test("removes stale global scout and refine agents on --fix", () => {
    withDeployFixture((fixture) => {
      const globalAgents = join(
        fixture.tempHome,
        ".config",
        "opencode",
        "agents",
      );
      writeFileSync(join(globalAgents, "scout.md"), "stale scout\n");
      writeFileSync(join(globalAgents, "refine.md"), "stale refine\n");

      const result = fixture.runDeploy(["--fix"]);

      expect(result.status).toBe(0);
      expect(() =>
        readFileSync(join(globalAgents, "scout.md"), "utf8"),
      ).toThrow();
      expect(() =>
        readFileSync(join(globalAgents, "refine.md"), "utf8"),
      ).toThrow();
    });
  });

  test("refuses unsafe regular adv file with generic schema_version text", () => {
    withDeployFixture((fixture) => {
      const localBin = join(fixture.tempHome, ".local", "bin");
      mkdirSync(localBin, { recursive: true });
      const unsafeAdv = join(localBin, "adv");
      const unsafeContent = `#!/usr/bin/env bash
# unrelated local tool that happens to mention schema_version
schema_version=1
`;
      writeFileSync(unsafeAdv, unsafeContent, { mode: 0o755 });

      const result = fixture.runDeploy(["--fix"]);

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "Refusing to overwrite unrelated file",
      );
      expect(readFileSync(unsafeAdv, "utf8")).toBe(unsafeContent);
    });
  });

  test("refuses unsafe symlink with advance-like path but unrelated content", () => {
    withDeployFixture((fixture) => {
      const localBin = join(fixture.tempHome, ".local", "bin");
      const unrelatedBin = join(fixture.tempHome, "advance-mal", "bin");
      mkdirSync(localBin, { recursive: true });
      mkdirSync(unrelatedBin, { recursive: true });
      const unrelatedAdv = join(unrelatedBin, "adv");
      const unrelatedContent = `#!/usr/bin/env bash
printf 'unrelated tool\n'
`;
      writeFileSync(unrelatedAdv, unrelatedContent, { mode: 0o755 });
      const unsafeLink = join(localBin, "adv");
      symlinkSync(unrelatedAdv, unsafeLink);

      const result = fixture.runDeploy(["--fix"]);

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "Refusing to overwrite unrelated file",
      );
      expect(readFileSync(unrelatedAdv, "utf8")).toBe(unrelatedContent);
      expect(readFileSync(unsafeLink, "utf8")).toBe(unrelatedContent);
    });
  });

  test("removes stale scout and refine agent config keys on --fix", () => {
    withDeployFixture((fixture) => {
      const configPath = join(
        fixture.tempHome,
        ".config",
        "opencode",
        "opencode.json",
      );
      writeFileSync(
        configPath,
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

      const result = fixture.runDeploy(["--fix"]);

      expect(result.status).toBe(0);
      const patched = JSON.parse(readFileSync(configPath, "utf8"));
      expect(patched.agent.scout).toBeUndefined();
      expect(patched.agent.refine).toBeUndefined();
      expect(patched.agent.plan).toEqual({});
      expect(patched.agent.build).toEqual({});
    });
  });

  test("deploy run from a worktree uses stable runtime plugin and canonical instruction paths", () => {
    withDeployFixture((fixture) => {
      const fixResult = fixture.runDeploy(["--fix"]);
      expect(fixResult.status, `${fixResult.stdout}${fixResult.stderr}`).toBe(
        0,
      );
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
        join(fixture.tempHome, ".local/share/Advance/plugin");

      const patched = JSON.parse(
        readFileSync(
          join(fixture.tempHome, ".config", "opencode", "opencode.json"),
          "utf8",
        ),
      );

      expect(patched.plugin).toContain(runtimePlugin);
      expect(patched.plugin).not.toContain(join(canonicalRoot, "plugin"));
      expect(patched.plugin).not.toContain(
        join(fixture.tempWorktree, "plugin"),
      );

      expect(patched.instructions ?? []).not.toContain(
        join(canonicalRoot, "ADV_INSTRUCTIONS.md"),
      );
      expect(patched.instructions).not.toContain(
        join(fixture.tempWorktree, "ADV_INSTRUCTIONS.md"),
      );
    });
  });

  // ===========================================================================
  // Single ADV runtime agent (providerAdvAgentAssemblySystem retired)
  // ===========================================================================

  test("sync --fix does not generate provider ADV variants", () => {
    withDeployFixture((fixture) => {
      const globalAgents = join(
        fixture.tempHome,
        ".config",
        "opencode",
        "agents",
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\nCANONICAL BODY SHOULD MOVE TO PROMPT PART\n",
      );

      const result = fixture.runDeploy(["--fix"]);

      expect(result.status).toBe(0);
      expect(existsSync(join(globalAgents, "adv.md"))).toBe(true);
      for (const p of ["claude", "gpt", "glm", "kimi", "minimax", "qwen"]) {
        const variantPath = join(globalAgents, `adv-${p}.md`);
        expect(
          existsSync(variantPath),
          `retired variant exists: adv-${p}.md`,
        ).toBe(false);
      }
    });
  });

  test("synced adv.md contains lean canonical ADV runtime prompt without full ADV_INSTRUCTIONS append", () => {
    withDeployFixture((fixture) => {
      const globalAgents = join(
        fixture.tempHome,
        ".config",
        "opencode",
        "agents",
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\nCANONICAL BODY SHOULD MOVE TO PROMPT PART\n",
      );

      const result = fixture.runDeploy(["--fix"]);

      expect(result.status).toBe(0);
      const config = JSON.parse(
        readFileSync(
          join(fixture.tempHome, ".config", "opencode", "opencode.json"),
          "utf8",
        ),
      );
      const advContent = readFileSync(join(globalAgents, "adv.md"), "utf8");
      expect(advContent).toContain("ADV_SYNC:START adv");
      expect(advContent).toContain("## Slash Command Boundary");
      expect(advContent).toContain("### Worktree Isolation Routing");
      expect(advContent).not.toContain("### TDD Protocol (RSTC)");
      expect(advContent).not.toContain("## Critical Protocols");
      expect(advContent).not.toContain("### Provider ADV runtime hints");
      expect(advContent).not.toContain("<!-- PROVIDER_HINT:");
      expect(config.agent?.["adv-gpt"]?.prompt).toBeUndefined();
    });
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
    withDeployFixture((fixture) => {
      const globalAgents = join(
        fixture.tempHome,
        ".config",
        "opencode",
        "agents",
      );
      for (const p of ["claude", "gpt", "glm", "kimi", "minimax", "qwen"]) {
        writeFileSync(join(globalAgents, `adv-${p}.md`), `stale ${p}\n`);
      }

      const result = fixture.runDeploy(["--fix"]);

      expect(result.status).toBe(0);
      for (const p of ["claude", "gpt", "glm", "kimi", "minimax", "qwen"]) {
        expect(existsSync(join(globalAgents, `adv-${p}.md`))).toBe(false);
      }
    });
  });

  test("sync --fix does not patch provider prompt refs or disable generic adv", () => {
    withDeployFixture((fixture) => {
      const configPath = join(
        fixture.tempHome,
        ".config",
        "opencode",
        "opencode.json",
      );
      writeFileSync(
        configPath,
        JSON.stringify({ plugin: [], instructions: [], agent: {} }),
      );

      const result = fixture.runDeploy(["--fix"]);

      expect(result.status).toBe(0);
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      expect(config.agent?.adv?.disable).toBeUndefined();
      for (const p of ["claude", "gpt", "glm", "kimi", "minimax", "qwen"]) {
        expect(config.agent?.[`adv-${p}`]?.prompt).toBeUndefined();
      }
    });
  });

  test("fails loud on JSONC drift during --fix without stripping comments", () => {
    withDeployFixture((fixture) => {
      const configDir = join(fixture.tempHome, ".config", "opencode");
      const jsoncPath = join(configDir, "opencode.jsonc");
      writeFileSync(
        jsoncPath,
        `{
          // This is a comment
          "plugin": [],
          "instructions": []
        }`,
      );

      const result = fixture.runDeploy(["--fix"]);

      // Should fail loud rather than silently strip comments.
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "JSONC drift detected — manual patch required",
      );
      const content = readFileSync(jsoncPath, "utf8");
      expect(content).toContain("// This is a comment");
    });
  });
});
