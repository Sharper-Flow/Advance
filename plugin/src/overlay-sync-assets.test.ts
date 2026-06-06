import { describe, expect, test, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
  existsSync,
} from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");

// deploy-local.sh can rebuild plugin/dist before syncing runtime assets in
// addition to copying the single ADV runtime agent and provider hint assets;
// the first integration-style spawn in a fresh checkout may pay that build
// cost on top of the asset copies. Bump beyond the default 5s timeout.
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
    const pluginRsync = content.indexOf(
      'rsync -a --delete "$ADV_SOURCE_PLUGIN_PATH/"',
    );

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
    const tempHome = mkdtempSync(join(tmpdir(), "adv-dist-guard-home-"));
    const tempWorktreeRoot = mkdtempSync(join(tmpdir(), "adv-dist-guard-wt-"));
    const tempWorktree = join(tempWorktreeRoot, "repo-worktree");
    const fakeBin = join(tempHome, "bin");
    const pnpmLog = join(tempHome, "pnpm.log");
    const rsyncLog = join(tempHome, "rsync.log");

    const makeStale = () => {
      const distPath = join(tempWorktree, "plugin", "dist", "index.js");
      const srcPath = join(tempWorktree, "plugin", "src", "index.ts");
      mkdirSync(join(tempWorktree, "plugin", "dist"), { recursive: true });
      writeFileSync(distPath, "// stale dist\n");
      utimesSync(
        distPath,
        new Date("2020-01-01T00:00:00Z"),
        new Date("2020-01-01T00:00:00Z"),
      );
      utimesSync(
        srcPath,
        new Date("2020-01-02T00:00:00Z"),
        new Date("2020-01-02T00:00:00Z"),
      );
    };

    const makeFresh = () => {
      const distPath = join(tempWorktree, "plugin", "dist", "index.js");
      mkdirSync(join(tempWorktree, "plugin", "dist"), { recursive: true });
      mkdirSync(join(tempWorktree, "plugin", "dist", "temporal"), {
        recursive: true,
      });
      writeFileSync(distPath, "// fresh dist\n");
      writeFileSync(
        join(tempWorktree, "plugin", "dist", "temporal", "worker.js"),
        "// fresh worker\n",
      );
      writeFileSync(
        join(tempWorktree, "plugin", "dist", "temporal", "workflows.js"),
        "// fresh workflows\n",
      );
      utimesSync(
        distPath,
        new Date("2030-01-01T00:00:00Z"),
        new Date("2030-01-01T00:00:00Z"),
      );
      utimesSync(
        join(tempWorktree, "plugin", "dist", "temporal", "worker.js"),
        new Date("2030-01-01T00:00:00Z"),
        new Date("2030-01-01T00:00:00Z"),
      );
      utimesSync(
        join(tempWorktree, "plugin", "dist", "temporal", "workflows.js"),
        new Date("2030-01-01T00:00:00Z"),
        new Date("2030-01-01T00:00:00Z"),
      );
    };

    const makeBuildInputStale = () => {
      const distPath = join(tempWorktree, "plugin", "dist", "index.js");
      const packagePath = join(tempWorktree, "plugin", "package.json");
      mkdirSync(join(tempWorktree, "plugin", "dist"), { recursive: true });
      writeFileSync(distPath, "// stale dist\n");
      utimesSync(
        distPath,
        new Date("2020-01-01T00:00:00Z"),
        new Date("2020-01-01T00:00:00Z"),
      );
      utimesSync(
        packagePath,
        new Date("2020-01-02T00:00:00Z"),
        new Date("2020-01-02T00:00:00Z"),
      );
    };

    const runDeploy = (extraEnv: Record<string, string> = {}) =>
      spawnSync(
        "bash",
        [join(tempWorktree, "scripts", "deploy-local.sh"), "--fix"],
        {
          cwd: tempWorktree,
          env: {
            ...process.env,
            ...extraEnv,
            HOME: tempHome,
            CI: "true",
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

    try {
      const configDir = join(tempHome, ".config/opencode");
      mkdirSync(configDir, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(fakeBin, "pnpm"),
        `#!/usr/bin/env bash
printf '%s %s\n' "$PWD" "$*" >> "$FAKE_PNPM_LOG"
if [ "\${FAKE_PNPM_FAIL:-}" = "1" ]; then
  exit 42
fi
if [ "\${FAKE_PNPM_NO_REFRESH:-}" = "1" ]; then
  exit 0
fi
mkdir -p "$PWD/dist"
mkdir -p "$PWD/dist/temporal"
printf '// fake build\n' > "$PWD/dist/index.js"
printf '// fake worker\n' > "$PWD/dist/temporal/worker.js"
printf '// fake workflows\n' > "$PWD/dist/temporal/workflows.js"
touch "$PWD/dist/index.js"
touch "$PWD/dist/temporal/worker.js"
touch "$PWD/dist/temporal/workflows.js"
`,
        { mode: 0o755 },
      );
      writeFileSync(
        join(fakeBin, "rsync"),
        `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_RSYNC_LOG"
src=""
dest=""
for arg in "$@"; do
  src="$dest"
  dest="$arg"
done
mkdir -p "$dest"
cp -a "$src/." "$dest/"
exit 0
`,
        { mode: 0o755 },
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
      writeFileSync(join(tempWorktree, "scripts", "deploy-local.sh"), content);

      makeStale();
      const dryRunResult = spawnSync(
        "bash",
        [
          join(tempWorktree, "scripts", "deploy-local.sh"),
          "--fix",
          "--dry-run",
        ],
        {
          cwd: tempWorktree,
          env: {
            ...process.env,
            HOME: tempHome,
            CI: "true",
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
            FAKE_PNPM_LOG: pnpmLog,
            FAKE_RSYNC_LOG: rsyncLog,
          },
          encoding: "utf8",
        },
      );
      expect(dryRunResult.status).toBe(0);
      expect(`${dryRunResult.stdout}${dryRunResult.stderr}`).toContain(
        "would rebuild plugin dist",
      );
      expect(existsSync(pnpmLog)).toBe(false);

      makeFresh();
      const freshResult = runDeploy({
        FAKE_PNPM_LOG: pnpmLog,
        FAKE_RSYNC_LOG: rsyncLog,
      });
      expect(freshResult.status).toBe(0);
      expect(existsSync(pnpmLog)).toBe(false);
      expect(readFileSync(rsyncLog, "utf8")).toContain("--delete");
      rmSync(rsyncLog, { force: true });

      makeStale();
      const failureResult = runDeploy({
        FAKE_PNPM_LOG: pnpmLog,
        FAKE_RSYNC_LOG: rsyncLog,
        FAKE_PNPM_FAIL: "1",
      });
      expect(failureResult.status).not.toBe(0);
      expect(`${failureResult.stdout}${failureResult.stderr}`).toContain(
        "refusing to deploy stale dist",
      );
      expect(existsSync(rsyncLog)).toBe(false);

      rmSync(pnpmLog, { force: true });
      makeStale();
      const postBuildFailureResult = runDeploy({
        FAKE_PNPM_LOG: pnpmLog,
        FAKE_RSYNC_LOG: rsyncLog,
        FAKE_PNPM_NO_REFRESH: "1",
      });
      expect(postBuildFailureResult.status).not.toBe(0);
      expect(
        `${postBuildFailureResult.stdout}${postBuildFailureResult.stderr}`,
      ).toContain("refusing to deploy stale dist after build");
      expect(existsSync(rsyncLog)).toBe(false);

      rmSync(pnpmLog, { force: true });
      makeBuildInputStale();
      const buildInputResult = runDeploy({
        FAKE_PNPM_LOG: pnpmLog,
        FAKE_RSYNC_LOG: rsyncLog,
      });
      expect(buildInputResult.status).toBe(0);
      expect(readFileSync(pnpmLog, "utf8")).toContain("run build");
      expect(readFileSync(rsyncLog, "utf8")).toContain("--delete");
      rmSync(rsyncLog, { force: true });
      rmSync(pnpmLog, { force: true });

      makeStale();
      const successResult = runDeploy({
        FAKE_PNPM_LOG: pnpmLog,
        FAKE_RSYNC_LOG: rsyncLog,
      });
      expect(successResult.status).toBe(0);
      expect(readFileSync(pnpmLog, "utf8")).toContain("run build");
      expect(readFileSync(rsyncLog, "utf8")).toContain("--delete");
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

  test("refuses unsafe regular adv file with generic schema_version text", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-unsafe-cli-home-"));
    const fakeBin = join(tempHome, "fake-bin");

    try {
      const configDir = join(tempHome, ".config/opencode");
      const localBin = join(tempHome, ".local/bin");
      mkdirSync(configDir, { recursive: true });
      mkdirSync(localBin, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      const unsafeAdv = join(localBin, "adv");
      const unsafeContent = `#!/usr/bin/env bash
# unrelated local tool that happens to mention schema_version
schema_version=1
`;
      writeFileSync(unsafeAdv, unsafeContent, { mode: 0o755 });
      writeFileSync(
        join(fakeBin, "rsync"),
        `#!/usr/bin/env bash
src=""
dest=""
for arg in "$@"; do
  src="$dest"
  dest="$arg"
done
mkdir -p "$dest"
cp -a "$src/." "$dest/"
`,
        { mode: 0o755 },
      );

      const result = spawnSync("bash", [DEPLOY_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          HOME: tempHome,
          CI: "true",
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        },
        encoding: "utf8",
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "Refusing to overwrite unrelated file",
      );
      expect(readFileSync(unsafeAdv, "utf8")).toBe(unsafeContent);
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
      mkdirSync(join(tempWorktree, "plugin", "dist", "temporal"), {
        recursive: true,
      });
      writeFileSync(
        join(tempWorktree, "plugin", "dist", "index.js"),
        "// test dist is fresh\n",
      );
      writeFileSync(
        join(tempWorktree, "plugin", "dist", "temporal", "worker.js"),
        "// test worker is fresh\n",
      );
      writeFileSync(
        join(tempWorktree, "plugin", "dist", "temporal", "workflows.js"),
        "// test workflows is fresh\n",
      );
      for (const distFile of [
        join(tempWorktree, "plugin", "dist", "index.js"),
        join(tempWorktree, "plugin", "dist", "temporal", "worker.js"),
        join(tempWorktree, "plugin", "dist", "temporal", "workflows.js"),
      ]) {
        utimesSync(
          distFile,
          new Date("2030-01-01T00:00:00Z"),
          new Date("2030-01-01T00:00:00Z"),
        );
      }

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

  test("synced adv.md contains lean canonical ADV runtime prompt without full ADV_INSTRUCTIONS append", () => {
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
      expect(advContent).toContain("## Slash Command Boundary");
      expect(advContent).toContain("### Worktree Isolation Routing");
      expect(advContent).not.toContain("### TDD Protocol (RSTC)");
      expect(advContent).not.toContain("## Critical Protocols");
      expect(advContent).not.toContain("### Provider ADV runtime hints");
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

  test("fails loud on JSONC drift during --fix without stripping comments", () => {
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

      // Should fail loud rather than silently strip comments.
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "JSONC drift detected — manual patch required",
      );
      const content = readFileSync(jsoncPath, "utf8");
      expect(content).toContain("// This is a comment");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
