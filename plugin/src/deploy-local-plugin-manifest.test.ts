import { describe, expect, test, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
  existsSync,
  statSync,
} from "fs";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");

// Executable regression harness for the plugin bundle manifest publication
// sequence in deploy-local.sh. Contract encoded here (AC8, C2):
//   - Deployment must refuse to proceed when the required plugin bundle
//     manifest is missing.
//   - The manifest must be excluded from the payload rsync, the copied
//     dist/index.js must be validated against the manifest hash, and only
//     then must the manifest be copied to the runtime path as the LAST
//     publication step.
//   - Filesystem mtime of dist/index.js is preserved through the copy; bundle
//     identity is carried by the generation/hash in the manifest, not by mtime.
//
// Safety: every deploy runs against a throwaway HOME and a throwaway git
// worktree. Fake pnpm/rsync binaries keep the run hermetic and fast.
vi.setConfig({ testTimeout: 120_000 });

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const FAKE_INDEX = "// fake build\n";
const FAKE_INDEX_SHA256 = sha256(FAKE_INDEX);
const FAKE_WORKER = "// fake worker\n";
const FAKE_WORKFLOWS = "// fake workflows\n";
const FAKE_WORKER_MANIFEST =
  '{"schema_version":1,"generation":"fake","files":{"worker.js":"fake","workflows.js":"fake"},"built_at":"2026-01-01T00:00:00.000Z"}';

const FRESH_MTIME = new Date("2030-01-01T00:00:00Z");
const INDEX_MTIME = new Date("2020-01-01T00:00:00Z");
const MANIFEST_MTIME = new Date("2030-01-01T00:00:00Z");

function writeFakePnpm(
  fakeBin: string,
  pluginManifest: { generation: string; indexHash: string } | null,
): void {
  const manifestLine =
    pluginManifest === null
      ? ""
      : `printf '%s\\n' '{"schema_version":1,"generation":"${pluginManifest.generation}","files":{"index":"${pluginManifest.indexHash}"},"built_at":"2026-01-01T00:00:00.000Z"}' > "$PWD/dist/plugin-bundle-manifest.json"\n`;
  writeFileSync(
    join(fakeBin, "pnpm"),
    `#!/usr/bin/env bash
mkdir -p "$PWD/dist" "$PWD/dist/temporal"
printf '%s\\n' '// fake build' > "$PWD/dist/index.js"
printf '%s\\n' '// fake worker' > "$PWD/dist/temporal/worker.js"
printf '%s\\n' '// fake workflows' > "$PWD/dist/temporal/workflows.js"
printf '%s\\n' '${FAKE_WORKER_MANIFEST}' > "$PWD/dist/temporal/bundle-manifest.json"
${manifestLine}`,
    { mode: 0o755 },
  );
}

function writeFakeRsync(fakeBin: string, rsyncLog: string): void {
  writeFileSync(
    join(fakeBin, "rsync"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${rsyncLog}"
src=""
dest=""
exclude_patterns=()
while [ $# -gt 0 ]; do
  case "$1" in
    --exclude)
      shift
      exclude_patterns+=("$1")
      ;;
    --exclude=*)
      exclude_patterns+=("\${1#--exclude=}")
      ;;
    -a|--delete)
      ;;
    *)
      src="$dest"
      dest="$1"
      ;;
  esac
  shift
done
mkdir -p "$dest"
cp -a "$src/." "$dest/"
for pattern in "\${exclude_patterns[@]}"; do
  rm -rf "$dest/$pattern"
done
exit 0
`,
    { mode: 0o755 },
  );
}

function setupWorktree(): {
  tempHome: string;
  tempWorktree: string;
  tempWorktreeRoot: string;
  fakeBin: string;
} {
  const tempHome = mkdtempSync(join(tmpdir(), "adv-manifest-"));
  const tempWorktreeRoot = mkdtempSync(join(tmpdir(), "adv-manifest-wt-"));
  const tempWorktree = join(tempWorktreeRoot, "repo-worktree");
  const fakeBin = join(tempHome, "bin");
  const configDir = join(tempHome, ".config/opencode");
  mkdirSync(configDir, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(
    join(configDir, "opencode.json"),
    JSON.stringify({ plugin: [], instructions: [] }),
  );
  return { tempHome, tempWorktree, tempWorktreeRoot, fakeBin };
}

function deployInWorktree(
  tempWorktree: string,
  env: Record<string, string>,
): { status: number | null; output: string } {
  const result = spawnSync(
    "bash",
    [join(tempWorktree, "scripts", "deploy-local.sh"), "--fix"],
    {
      cwd: tempWorktree,
      env,
      encoding: "utf8",
    },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

describe("deploy-local plugin manifest publication", () => {
  const content = readFileSync(DEPLOY_SCRIPT_PATH, "utf8");

  test("requires plugin bundle manifest before deploying", () => {
    const { tempHome, tempWorktree, tempWorktreeRoot, fakeBin } =
      setupWorktree();

    try {
      writeFakePnpm(fakeBin, null);
      writeFileSync(join(fakeBin, "rsync"), `#!/usr/bin/env bash\nexit 0\n`, {
        mode: 0o755,
      });

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

      // Create a dist that is fresh except for the missing plugin manifest.
      const distDir = join(tempWorktree, "plugin", "dist");
      const temporalDir = join(distDir, "temporal");
      mkdirSync(temporalDir, { recursive: true });
      writeFileSync(join(distDir, "index.js"), FAKE_INDEX);
      writeFileSync(join(temporalDir, "worker.js"), FAKE_WORKER);
      writeFileSync(join(temporalDir, "workflows.js"), FAKE_WORKFLOWS);
      writeFileSync(
        join(temporalDir, "bundle-manifest.json"),
        FAKE_WORKER_MANIFEST + "\n",
      );
      for (const f of [
        join(distDir, "index.js"),
        join(temporalDir, "worker.js"),
        join(temporalDir, "workflows.js"),
        join(temporalDir, "bundle-manifest.json"),
      ]) {
        utimesSync(f, FRESH_MTIME, FRESH_MTIME);
      }

      const { status, output } = deployInWorktree(tempWorktree, {
        ...process.env,
        HOME: tempHome,
        CI: "true",
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      });

      expect(status).not.toBe(0);
      expect(output).toMatch(
        /plugin bundle manifest missing|dist\/plugin-bundle-manifest\.json/i,
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

  test("excludes manifest from payload copy and publishes it last with mtime-preserved identity", () => {
    const { tempHome, tempWorktree, tempWorktreeRoot, fakeBin } =
      setupWorktree();
    const rsyncLog = join(tempHome, "rsync.log");
    const runtimePlugin = join(tempHome, ".local/share/Advance/plugin");

    const sourceManifest = {
      schema_version: 1,
      generation:
        "aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111",
      files: { index: FAKE_INDEX_SHA256 },
      built_at: "2026-01-01T00:00:00.000Z",
    };

    try {
      writeFakePnpm(fakeBin, {
        generation: sourceManifest.generation,
        indexHash: FAKE_INDEX_SHA256,
      });
      writeFakeRsync(fakeBin, rsyncLog);

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

      const distDir = join(tempWorktree, "plugin", "dist");
      const temporalDir = join(distDir, "temporal");
      const indexPath = join(distDir, "index.js");
      const manifestPath = join(distDir, "plugin-bundle-manifest.json");
      mkdirSync(temporalDir, { recursive: true });
      writeFileSync(indexPath, FAKE_INDEX);
      writeFileSync(join(temporalDir, "worker.js"), FAKE_WORKER);
      writeFileSync(join(temporalDir, "workflows.js"), FAKE_WORKFLOWS);
      writeFileSync(
        join(temporalDir, "bundle-manifest.json"),
        FAKE_WORKER_MANIFEST + "\n",
      );
      writeFileSync(manifestPath, JSON.stringify(sourceManifest, null, 2));
      utimesSync(indexPath, INDEX_MTIME, INDEX_MTIME);
      utimesSync(manifestPath, MANIFEST_MTIME, MANIFEST_MTIME);
      for (const f of [
        join(temporalDir, "worker.js"),
        join(temporalDir, "workflows.js"),
        join(temporalDir, "bundle-manifest.json"),
      ]) {
        utimesSync(f, FRESH_MTIME, FRESH_MTIME);
      }

      // Make source/build inputs older than dist so the deploy does not
      // trigger a rebuild; this lets us verify the copied index retains its
      // original mtime.
      const oldMtime = new Date("2019-01-01T00:00:00Z");
      const sourcePaths = [
        join(tempWorktree, "plugin", "src"),
        join(tempWorktree, "plugin", "package.json"),
        join(tempWorktree, "plugin", "pnpm-lock.yaml"),
        join(tempWorktree, "plugin", "tsconfig.json"),
        join(tempWorktree, "plugin", "tsup.config.ts"),
        join(tempWorktree, "plugin", "scripts"),
      ];
      for (const p of sourcePaths) {
        if (!existsSync(p)) continue;
        const stat = statSync(p);
        if (stat.isDirectory()) {
          const stack = [p];
          while (stack.length > 0) {
            const dir = stack.pop()!;
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
              const full = join(dir, entry.name);
              if (entry.isDirectory()) {
                stack.push(full);
              } else if (entry.isFile()) {
                utimesSync(full, oldMtime, oldMtime);
              }
            }
          }
        } else {
          utimesSync(p, oldMtime, oldMtime);
        }
      }

      const { status, output } = deployInWorktree(tempWorktree, {
        ...process.env,
        HOME: tempHome,
        CI: "true",
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      });

      expect(status).toBe(0);
      expect(output).toMatch(/published plugin bundle manifest/i);

      const rsyncCommands = readFileSync(rsyncLog, "utf8");
      expect(rsyncCommands).toContain("dist/plugin-bundle-manifest.json");

      const deployedIndex = join(runtimePlugin, "dist", "index.js");
      expect(existsSync(deployedIndex)).toBe(true);
      expect(statSync(deployedIndex).mtime.toISOString()).toBe(
        INDEX_MTIME.toISOString(),
      );

      const deployedManifest = join(
        runtimePlugin,
        "dist",
        "plugin-bundle-manifest.json",
      );
      expect(existsSync(deployedManifest)).toBe(true);
      // The manifest is published last; its mtime reflects the publish time,
      // while the index mtime is preserved through rsync. Identity is in the
      // manifest generation/hash, not the filesystem timestamp.
      const deployedManifestMtime = statSync(deployedManifest).mtime;
      expect(deployedManifestMtime.getTime()).toBeGreaterThan(
        INDEX_MTIME.getTime(),
      );
      expect(
        readdirSync(join(runtimePlugin, "dist")).filter((entry) =>
          entry.endsWith(".tmp"),
        ),
      ).toEqual([]);
      const parsed = JSON.parse(readFileSync(deployedManifest, "utf8"));
      expect(parsed.generation).toBe(sourceManifest.generation);
      expect(parsed.files.index).toBe(FAKE_INDEX_SHA256);
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
