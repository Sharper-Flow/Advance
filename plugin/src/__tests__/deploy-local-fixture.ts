import { spawnSync, type SpawnSyncReturns } from "child_process";
import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

export const REPO_ROOT = resolve(__dirname, "../../..");
const DEPLOY_SCRIPT_SOURCE_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");

const FUTURE = new Date("2030-01-01T00:00:00Z");
const SEED_BUILT_AT = "2030-01-01T00:00:00.000Z";
const SEED_GENERATION = "test-fixture";

const SEED_CONTENTS = {
  index: "// fresh plugin index\n",
  mcpServer: "// fake mcp server\n",
  reconcileCli: "// fake reconcile cli\n",
  doctorCli: "// fake doctor cli\n",
  worker: "// fresh worker\n",
  workflows: "// fresh workflows\n",
} as const;

const SEED_HASHES = {
  index: createHash("sha256").update(SEED_CONTENTS.index).digest("hex"),
  mcpServer: createHash("sha256").update(SEED_CONTENTS.mcpServer).digest("hex"),
  reconcileCli: createHash("sha256")
    .update(SEED_CONTENTS.reconcileCli)
    .digest("hex"),
  doctorCli: createHash("sha256").update(SEED_CONTENTS.doctorCli).digest("hex"),
  worker: createHash("sha256").update(SEED_CONTENTS.worker).digest("hex"),
  workflows: createHash("sha256").update(SEED_CONTENTS.workflows).digest("hex"),
} as const;

const PLUGIN_BUNDLE_MANIFEST = JSON.stringify({
  schema_version: 1,
  generation: SEED_GENERATION,
  files: {
    index: SEED_HASHES.index,
    "mcp-server": SEED_HASHES.mcpServer,
    "reconcile-cli": SEED_HASHES.reconcileCli,
    "doctor-cli": SEED_HASHES.doctorCli,
  },
  built_at: SEED_BUILT_AT,
});

const TEMPORAL_BUNDLE_MANIFEST = JSON.stringify({
  schema_version: 1,
  generation: SEED_GENERATION,
  files: {
    "worker.js": SEED_HASHES.worker,
    "workflows.js": SEED_HASHES.workflows,
  },
  built_at: SEED_BUILT_AT,
});

export interface DeployFixtureContext {
  tempHome: string;
  tempWorktreeRoot: string;
  tempWorktree: string;
  deployScriptPath: string;
  fakeBin: string;
  pnpmLog: string;
  rsyncLog: string;
  /**
   * Run the deploy-local.sh script from the fixture worktree.
   * Passing `cwd` equal to the repository root is refused so tests cannot
   * silently reacquire the real checkout.
   */
  runDeploy(
    args?: string[],
    extraEnv?: Record<string, string>,
    cwd?: string,
  ): SpawnSyncReturns<string>;
  /** Make the pre-seeded dist stale by aging the plugin index output. */
  makeDistStale(): void;
  /** Restore the pre-seeded fresh dist state. */
  makeDistFresh(): void;
  /** Remove the dist directory so the script sees missing outputs. */
  makeDistMissing(): void;
  /** Make the plugin package.json newer than the dist output. */
  makeBuildInputStale(): void;
  /** Remove the fixture worktree and temp home. */
  cleanup(): void;
}

function seedDist(worktree: string): void {
  const distPath = join(worktree, "plugin", "dist");
  const temporalDistPath = join(distPath, "temporal");
  mkdirSync(distPath, { recursive: true });
  mkdirSync(temporalDistPath, { recursive: true });

  writeFileSync(join(distPath, "index.js"), SEED_CONTENTS.index);
  writeFileSync(join(distPath, "mcp-server.js"), SEED_CONTENTS.mcpServer);
  writeFileSync(join(distPath, "reconcile-cli.js"), SEED_CONTENTS.reconcileCli);
  writeFileSync(join(distPath, "doctor-cli.js"), SEED_CONTENTS.doctorCli);
  writeFileSync(join(temporalDistPath, "worker.js"), SEED_CONTENTS.worker);
  writeFileSync(
    join(temporalDistPath, "workflows.js"),
    SEED_CONTENTS.workflows,
  );
  writeFileSync(
    join(distPath, "plugin-bundle-manifest.json"),
    PLUGIN_BUNDLE_MANIFEST,
  );
  writeFileSync(
    join(temporalDistPath, "bundle-manifest.json"),
    TEMPORAL_BUNDLE_MANIFEST,
  );

  for (const f of [
    join(distPath, "index.js"),
    join(distPath, "mcp-server.js"),
    join(distPath, "reconcile-cli.js"),
    join(distPath, "doctor-cli.js"),
    join(temporalDistPath, "worker.js"),
    join(temporalDistPath, "workflows.js"),
    join(distPath, "plugin-bundle-manifest.json"),
    join(temporalDistPath, "bundle-manifest.json"),
  ]) {
    utimesSync(f, FUTURE, FUTURE);
  }
}

function writeFakePnpm(fakeBin: string): void {
  const script = `#!/usr/bin/env bash
printf '%s %s\\n' "$PWD" "$*" >> "$FAKE_PNPM_LOG"
if [ "\${FAKE_PNPM_FAIL:-}" = "1" ]; then
  exit 42
fi
if [ "$1 $2" = "run generate:manifests" ]; then
  exit 0
fi
if [ "\${FAKE_PNPM_NO_REFRESH:-}" = "1" ]; then
  exit 0
fi
mkdir -p "$PWD/dist"
mkdir -p "$PWD/dist/temporal"
printf '${bashLiteral(SEED_CONTENTS.index)}' > "$PWD/dist/index.js"
printf '${bashLiteral(SEED_CONTENTS.mcpServer)}' > "$PWD/dist/mcp-server.js"
printf '${bashLiteral(SEED_CONTENTS.reconcileCli)}' > "$PWD/dist/reconcile-cli.js"
printf '${bashLiteral(SEED_CONTENTS.doctorCli)}' > "$PWD/dist/doctor-cli.js"
printf '${bashLiteral(SEED_CONTENTS.worker)}' > "$PWD/dist/temporal/worker.js"
printf '${bashLiteral(SEED_CONTENTS.workflows)}' > "$PWD/dist/temporal/workflows.js"
printf '${bashLiteral(TEMPORAL_BUNDLE_MANIFEST)}' > "$PWD/dist/temporal/bundle-manifest.json"
printf '${bashLiteral(PLUGIN_BUNDLE_MANIFEST)}' > "$PWD/dist/plugin-bundle-manifest.json"
touch "$PWD/dist/index.js"
touch "$PWD/dist/mcp-server.js"
touch "$PWD/dist/reconcile-cli.js"
touch "$PWD/dist/doctor-cli.js"
touch "$PWD/dist/temporal/worker.js"
touch "$PWD/dist/temporal/workflows.js"
touch "$PWD/dist/temporal/bundle-manifest.json"
touch "$PWD/dist/plugin-bundle-manifest.json"
`;
  writeFileSync(join(fakeBin, "pnpm"), script, { mode: 0o755 });
}

function writeFakeRsync(fakeBin: string): void {
  const script = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_RSYNC_LOG"
src=""
dest=""
for arg in "$@"; do
  src="$dest"
  dest="$arg"
done
mkdir -p "$dest"
cp -a "$src/." "$dest/"
exit 0
`;
  writeFileSync(join(fakeBin, "rsync"), script, { mode: 0o755 });
}

function bashLiteral(input: string): string {
  return input.replace(/'/g, "'\\''");
}

export function createDeployFixture(): DeployFixtureContext {
  const tempHome = realpathSync(
    mkdtempSync(join(tmpdir(), "adv-deploy-fixture-home-")),
  );
  const tempWorktreeRoot = realpathSync(
    mkdtempSync(join(tmpdir(), "adv-deploy-fixture-wt-")),
  );
  const tempWorktree = join(tempWorktreeRoot, "repo-worktree");
  const fakeBin = join(tempHome, "bin");
  const pnpmLog = join(tempHome, "pnpm.log");
  const rsyncLog = join(tempHome, "rsync.log");
  const deployScriptPath = join(tempWorktree, "scripts", "deploy-local.sh");

  const configDir = join(tempHome, ".config", "opencode");
  const globalAgents = join(configDir, "agents");
  const runtimePluginDir = join(
    tempHome,
    ".local",
    "share",
    "Advance",
    "plugin",
  );
  mkdirSync(configDir, { recursive: true });
  mkdirSync(globalAgents, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(runtimePluginDir, { recursive: true });

  writeFileSync(
    join(configDir, "opencode.json"),
    JSON.stringify({ plugin: [], instructions: [] }),
  );
  writeFileSync(
    join(globalAgents, "adv.md"),
    "---\ndescription: temp adv\n---\n",
  );

  writeFakePnpm(fakeBin);
  writeFakeRsync(fakeBin);

  const addResult = spawnSync(
    "git",
    ["worktree", "add", "--detach", tempWorktree],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, CI: "true" },
      encoding: "utf8",
    },
  );
  if (addResult.status !== 0) {
    cleanup();
    throw new Error(
      `git worktree add failed: ${addResult.stdout}${addResult.stderr}`,
    );
  }

  // Ensure the worktree has a committed adv.md so the bootstrap path can read it from git.
  const advMdInWorktree = join(tempWorktree, ".opencode", "agents", "adv.md");
  if (!existsSync(advMdInWorktree)) {
    cleanup();
    throw new Error(
      `.opencode/agents/adv.md is not committed in the fixture worktree`,
    );
  }

  // Copy the deploy script under test into the worktree so the script is exercised from there.
  writeFileSync(
    deployScriptPath,
    readFileSync(DEPLOY_SCRIPT_SOURCE_PATH, "utf8"),
  );

  seedDist(tempWorktree);

  const baseEnv: Record<string, string> = {
    HOME: tempHome,
    CI: "true",
    PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    FAKE_PNPM_LOG: pnpmLog,
    FAKE_RSYNC_LOG: rsyncLog,
  };

  function runDeploy(
    args: string[] = [],
    extraEnv: Record<string, string> = {},
    cwd?: string,
  ): SpawnSyncReturns<string> {
    const runCwd = cwd ?? tempWorktree;
    if (runCwd === REPO_ROOT) {
      throw new Error(
        `Refusing to run deploy from repository root (${REPO_ROOT}); use the fixture worktree instead`,
      );
    }
    return spawnSync("bash", [deployScriptPath, ...args], {
      cwd: runCwd,
      env: { ...process.env, ...baseEnv, ...extraEnv },
      encoding: "utf8",
    });
  }

  function makeDistStale(): void {
    const distPath = join(tempWorktree, "plugin", "dist");
    rmSync(distPath, { recursive: true, force: true });
    mkdirSync(distPath, { recursive: true });
    writeFileSync(join(distPath, "index.js"), "// stale dist\n");
    utimesSync(
      join(distPath, "index.js"),
      new Date("2020-01-01T00:00:00Z"),
      new Date("2020-01-01T00:00:00Z"),
    );
  }

  function makeDistFresh(): void {
    seedDist(tempWorktree);
  }

  function makeDistMissing(): void {
    rmSync(join(tempWorktree, "plugin", "dist"), {
      recursive: true,
      force: true,
    });
  }

  function makeBuildInputStale(): void {
    const distPath = join(tempWorktree, "plugin", "dist");
    const packagePath = join(tempWorktree, "plugin", "package.json");
    mkdirSync(distPath, { recursive: true });
    writeFileSync(join(distPath, "index.js"), "// stale dist\n");
    utimesSync(
      join(distPath, "index.js"),
      new Date("2020-01-01T00:00:00Z"),
      new Date("2020-01-01T00:00:00Z"),
    );
    utimesSync(
      packagePath,
      new Date("2020-01-02T00:00:00Z"),
      new Date("2020-01-02T00:00:00Z"),
    );
  }

  function cleanup(): void {
    spawnSync("git", ["worktree", "remove", "--force", tempWorktree], {
      cwd: REPO_ROOT,
      env: { ...process.env, CI: "true" },
      encoding: "utf8",
    });
    rmSync(tempWorktreeRoot, { recursive: true, force: true });
    rmSync(tempHome, { recursive: true, force: true });
  }

  return {
    tempHome,
    tempWorktreeRoot,
    tempWorktree,
    deployScriptPath,
    fakeBin,
    pnpmLog,
    rsyncLog,
    runDeploy,
    makeDistStale,
    makeDistFresh,
    makeDistMissing,
    makeBuildInputStale,
    cleanup,
  };
}

export function withDeployFixture(
  callback: (ctx: DeployFixtureContext) => void,
): void {
  const ctx = createDeployFixture();
  try {
    callback(ctx);
  } finally {
    ctx.cleanup();
  }
}
