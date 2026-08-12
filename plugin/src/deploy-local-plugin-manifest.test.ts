import { describe, expect, test, vi } from "vitest";
import {
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
import { join, resolve } from "path";
import {
  createDeployFixture,
  withDeployFixture,
} from "./__tests__/deploy-local-fixture";

const REPO_ROOT = resolve(__dirname, "../..");

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
// worktree via the shared deploy-local fixture. Fake pnpm/rsync binaries keep
// the run hermetic and fast.
vi.setConfig({ testTimeout: 120_000 });

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const FAKE_INDEX = "// fake build\n";
const FAKE_INDEX_SHA256 = sha256(FAKE_INDEX);
const FAKE_MCP_SERVER = "// fake mcp server\n";
const FAKE_MCP_SERVER_SHA256 = sha256(FAKE_MCP_SERVER);
const FAKE_RECONCILE_CLI = "// fake reconcile cli\n";
const FAKE_RECONCILE_CLI_SHA256 = sha256(FAKE_RECONCILE_CLI);
const FAKE_DOCTOR_CLI = "// fake doctor cli\n";
const FAKE_DOCTOR_CLI_SHA256 = sha256(FAKE_DOCTOR_CLI);

const INDEX_MTIME = new Date("2020-01-01T00:00:00Z");
const MANIFEST_MTIME = new Date("2030-01-01T00:00:00Z");

function ageSourceInputs(worktree: string): void {
  const oldMtime = new Date("2019-01-01T00:00:00Z");
  const sourcePaths = [
    join(worktree, "plugin", "src"),
    join(worktree, "plugin", "package.json"),
    join(worktree, "plugin", "pnpm-lock.yaml"),
    join(worktree, "plugin", "tsconfig.json"),
    join(worktree, "plugin", "tsup.config.ts"),
    join(worktree, "plugin", "scripts"),
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
}

describe("deploy-local plugin manifest publication", () => {
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

  test("no spawn uses the repository root as its working directory", () => {
    const source = readFileSync(__filename, "utf8");
    expect(source).not.toMatch(/\{[^}]*cwd:\s*REPO_ROOT[^}]*\}/s);
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

  test("requires plugin bundle manifest before deploying", () => {
    withDeployFixture((fixture) => {
      rmSync(
        join(
          fixture.tempWorktree,
          "plugin",
          "dist",
          "plugin-bundle-manifest.json",
        ),
      );
      const result = fixture.runDeploy(["--fix"], {
        FAKE_PNPM_NO_REFRESH: "1",
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      expect(result.status).not.toBe(0);
      expect(output).toMatch(
        /plugin bundle manifest missing|dist\/plugin-bundle-manifest\.json/i,
      );
    });
  });

  test("excludes manifest from payload copy and publishes it last with mtime-preserved identity", () => {
    withDeployFixture((fixture) => {
      const distDir = join(fixture.tempWorktree, "plugin", "dist");
      const indexPath = join(distDir, "index.js");
      const manifestPath = join(distDir, "plugin-bundle-manifest.json");
      const sourceManifest = {
        schema_version: 1,
        generation:
          "aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111",
        files: {
          index: FAKE_INDEX_SHA256,
          "mcp-server": FAKE_MCP_SERVER_SHA256,
          "reconcile-cli": FAKE_RECONCILE_CLI_SHA256,
          "doctor-cli": FAKE_DOCTOR_CLI_SHA256,
        },
        built_at: "2026-01-01T00:00:00.000Z",
      };

      writeFileSync(indexPath, FAKE_INDEX);
      writeFileSync(join(distDir, "mcp-server.js"), FAKE_MCP_SERVER);
      writeFileSync(join(distDir, "reconcile-cli.js"), FAKE_RECONCILE_CLI);
      writeFileSync(join(distDir, "doctor-cli.js"), FAKE_DOCTOR_CLI);
      writeFileSync(manifestPath, JSON.stringify(sourceManifest, null, 2));
      utimesSync(indexPath, INDEX_MTIME, INDEX_MTIME);
      utimesSync(join(distDir, "mcp-server.js"), INDEX_MTIME, INDEX_MTIME);
      utimesSync(join(distDir, "reconcile-cli.js"), INDEX_MTIME, INDEX_MTIME);
      utimesSync(join(distDir, "doctor-cli.js"), INDEX_MTIME, INDEX_MTIME);
      utimesSync(manifestPath, MANIFEST_MTIME, MANIFEST_MTIME);
      ageSourceInputs(fixture.tempWorktree);

      const result = fixture.runDeploy(["--fix"]);
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

      expect(result.status).toBe(0);
      expect(output).toMatch(/published plugin bundle manifest/i);

      const rsyncCommands = readFileSync(fixture.rsyncLog, "utf8");
      expect(rsyncCommands).toContain(
        "-a --delete --exclude=dist/plugin-bundle-manifest.json",
      );

      const runtimePlugin = join(
        fixture.tempHome,
        ".local/share/Advance/plugin",
      );
      const deployedIndex = join(runtimePlugin, "dist", "index.js");
      expect(existsSync(deployedIndex)).toBe(true);
      expect(statSync(deployedIndex).mtime.toISOString()).toBe(
        INDEX_MTIME.toISOString(),
      );
      for (const bundle of [
        "mcp-server.js",
        "reconcile-cli.js",
        "doctor-cli.js",
      ]) {
        const deployedBundle = join(runtimePlugin, "dist", bundle);
        expect(existsSync(deployedBundle)).toBe(true);
        expect(statSync(deployedBundle).mtime.toISOString()).toBe(
          INDEX_MTIME.toISOString(),
        );
      }

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
      expect(parsed.files["mcp-server"]).toBe(FAKE_MCP_SERVER_SHA256);
      expect(parsed.files["reconcile-cli"]).toBe(FAKE_RECONCILE_CLI_SHA256);
      expect(parsed.files["doctor-cli"]).toBe(FAKE_DOCTOR_CLI_SHA256);
    });
  });
});
