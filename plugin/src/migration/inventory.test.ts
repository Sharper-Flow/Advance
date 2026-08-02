/**
 * inventory tests — local project/workflow/process/session inventory (AC9/DDC5, OOS2).
 *
 * The validator turns collected inventory into typed blockers. Unknown or
 * stale identity and incomplete inventory MUST block activation: an
 * unreadable project dir, an unavailable workflow probe, an unreadable
 * process table, a stale deployed worker, a foreign worker with an
 * unverifiable or mismatching build, a session-registry mismatch, or an
 * unregistered live OpenCode session each produce a typed blocker. Only a
 * fully proven inventory is complete.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  BUILD_IDENTITY_FILENAME,
  writeBuildIdentityFile,
} from "./build-identity";
import {
  collectMachineInventory,
  collectProjectInventory,
  validateMigrationReadiness,
  type MachineInventory,
} from "./inventory";
import { registerLoadedBuildSession } from "./session-registry";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
  tempDirs = [];
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await createTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

const PID_A = 4101;
const PID_B = 4102;

/** Deployed-plugin tree with a recorded build identity. */
function makeDeployment(root: string): {
  deployRoot: string;
  pluginRoot: string;
  digest: string;
} {
  const deployRoot = join(root, "Advance");
  const pluginRoot = join(deployRoot, "plugin");
  mkdirSync(join(pluginRoot, "dist", "temporal"), { recursive: true });
  writeFileSync(join(pluginRoot, "dist", "index.js"), "export {};\n");
  writeFileSync(
    join(pluginRoot, "dist", "temporal", "worker.js"),
    "export {};\n",
  );
  writeFileSync(
    join(pluginRoot, "dist", "temporal", "workflows.js"),
    "export {};\n",
  );
  const identity = writeBuildIdentityFile(pluginRoot);
  return { deployRoot, pluginRoot, digest: identity.digest };
}

function makeProjectState(root: string, projectId: string): void {
  mkdirSync(join(root, "opencode", "plugins", "advance", projectId), {
    recursive: true,
  });
}

/** Build a fully-passing inventory fixture; tests then poke one hole each. */
async function makePassingSetup(prefix: string) {
  const root = await tempDir(prefix);
  const { deployRoot, pluginRoot, digest } = makeDeployment(root);
  const homeDir = join(root, "home");
  makeProjectState(join(homeDir, ".local", "share"), "a".repeat(40));
  const migrationRoot = join(deployRoot, "migration");
  registerLoadedBuildSession({
    migrationRoot,
    projectId: "a000000000000000000000000000000000000000".repeat(40),
    buildDigest: digest,
    pluginRoot,
    pid: PID_A,
    startTicks: "500",
  });
  const procRoot = join(root, "proc");
  mkdirSync(procRoot, { recursive: true });
  const addProc = (
    pid: number,
    comm: string,
    argv: string[],
    ticks: string,
  ) => {
    const dir = join(procRoot, String(pid));
    mkdirSync(dir, { recursive: true });
    const f = Array.from({ length: 19 }, (_, i) => String(100 + i));
    writeFileSync(
      join(dir, "stat"),
      `${pid} (${comm}) ${[...f, ticks, "0", "0"].join(" ")}`,
    );
    writeFileSync(join(dir, "cmdline"), argv.join("\0") + "\0");
  };
  // Registered session process (matches registry pid + ticks).
  addProc(PID_A, "opencode", ["opencode"], "500");
  writeFileSync(join(procRoot, "stat"), "cpu 1\nbtime 1700000000\n");
  return {
    root,
    deployRoot,
    pluginRoot,
    digest,
    homeDir,
    migrationRoot,
    procRoot,
  };
}

async function collectPassing(
  setup: Awaited<ReturnType<typeof makePassingSetup>>,
) {
  return collectMachineInventory({
    pluginRoot: setup.pluginRoot,
    deployRoot: setup.deployRoot,
    migrationRoot: setup.migrationRoot,
    homeDir: setup.homeDir,
    procRoot: setup.procRoot,
    isAlive: () => true,
    listRunningWorkflows: async () => 0,
  });
}

describe("collectProjectInventory", () => {
  test("discovers projects in canonical and oc-shard roots; skips non-project and synthetic entries", async () => {
    const root = await tempDir("adv-inv-projects-");
    const shareRoot = join(root, "home", ".local", "share");
    makeProjectState(shareRoot, "b".repeat(40));
    // oc per-project shard layout
    makeProjectState(
      join(shareRoot, "opencode-projects", "c".repeat(40)),
      "d".repeat(40),
    );
    // non-project leftovers and synthetic test ids are not projects
    makeProjectState(shareRoot, "drain-12345");
    makeProjectState(shareRoot, "0000000000000000" + "e".repeat(24));

    const projects = collectProjectInventory({ homeDir: join(root, "home") });
    const ids = projects.map((p) => p.projectId).sort();
    expect(ids).toEqual(["b".repeat(40), "d".repeat(40)]);
    expect(projects.every((p) => p.readable)).toBe(true);
  });
});

describe("validateMigrationReadiness", () => {
  test("complete when identity matches and inventory is fully proven", async () => {
    const setup = await makePassingSetup("adv-inv-pass-");
    const inv = await collectPassing(setup);
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.complete).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  test("blocks on stale deployed build identity", async () => {
    const setup = await makePassingSetup("adv-inv-stale-build-");
    writeFileSync(join(setup.pluginRoot, "dist", "index.js"), "/* drift */\n");
    const inv = await collectPassing(setup);
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.complete).toBe(false);
    expect(readiness.blockers.map((b) => b.code)).toContain(
      "build_identity_stale",
    );
  });

  test("blocks on missing build identity", async () => {
    const setup = await makePassingSetup("adv-inv-noident-");
    const { rmSync } = await import("node:fs");
    rmSync(join(setup.pluginRoot, "dist", BUILD_IDENTITY_FILENAME));
    const inv = await collectPassing(setup);
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.blockers.map((b) => b.code)).toContain(
      "build_identity_missing",
    );
  });

  test("blocks when the workflow probe is unavailable", async () => {
    const setup = await makePassingSetup("adv-inv-wf-unavail-");
    const inv = await collectMachineInventory({
      pluginRoot: setup.pluginRoot,
      deployRoot: setup.deployRoot,
      migrationRoot: setup.migrationRoot,
      homeDir: setup.homeDir,
      procRoot: setup.procRoot,
      isAlive: () => true,
      // no listRunningWorkflows probe
    });
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.blockers.map((b) => b.code)).toContain(
      "workflow_inventory_unavailable",
    );
  });

  test("blocks on an unreadable process table", async () => {
    const setup = await makePassingSetup("adv-inv-proc-unreadable-");
    const inv = await collectMachineInventory({
      pluginRoot: setup.pluginRoot,
      deployRoot: setup.deployRoot,
      migrationRoot: setup.migrationRoot,
      homeDir: setup.homeDir,
      procRoot: join(setup.root, "no-proc"),
      isAlive: () => true,
      listRunningWorkflows: async () => 0,
    });
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.blockers.map((b) => b.code)).toContain(
      "process_scan_incomplete",
    );
  });

  test("blocks on a stale deployed worker process", async () => {
    const setup = await makePassingSetup("adv-inv-stale-worker-");
    // Worker started at boot+1s, identity installed later (ctime is now).
    const dir = join(setup.procRoot, "4999");
    mkdirSync(dir, { recursive: true });
    const f = Array.from({ length: 19 }, (_, i) => String(100 + i));
    writeFileSync(
      join(dir, "stat"),
      `4999 (node) ${[...f, "100", "0", "0"].join(" ")}`,
    );
    writeFileSync(
      join(dir, "cmdline"),
      ["node", join(setup.pluginRoot, "dist", "temporal", "worker.js")].join(
        "\0",
      ) + "\0",
    );
    const inv = await collectPassing(setup);
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.blockers.map((b) => b.code)).toContain("worker_stale");
  });

  test("blocks on a foreign worker whose build identity is unverifiable", async () => {
    const setup = await makePassingSetup("adv-inv-foreign-");
    const dir = join(setup.procRoot, "4998");
    mkdirSync(dir, { recursive: true });
    const f = Array.from({ length: 19 }, (_, i) => String(100 + i));
    writeFileSync(
      join(dir, "stat"),
      `4998 (node) ${[...f, "100", "0", "0"].join(" ")}`,
    );
    writeFileSync(
      join(dir, "cmdline"),
      [
        "node",
        join(
          setup.root,
          "dev-checkout",
          "plugin",
          "dist",
          "temporal",
          "worker.js",
        ),
      ].join("\0") + "\0",
    );
    const inv = await collectPassing(setup);
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.blockers.map((b) => b.code)).toContain(
      "worker_foreign_unknown",
    );
  });

  test("accepts a foreign worker whose recorded digest matches the deployed build", async () => {
    const setup = await makePassingSetup("adv-inv-foreign-match-");
    // Foreign checkout with identical dist content → same digest.
    const foreignPlugin = join(setup.root, "dev-checkout", "plugin");
    mkdirSync(join(foreignPlugin, "dist", "temporal"), { recursive: true });
    writeFileSync(join(foreignPlugin, "dist", "index.js"), "export {};\n");
    writeFileSync(
      join(foreignPlugin, "dist", "temporal", "worker.js"),
      "export {};\n",
    );
    writeFileSync(
      join(foreignPlugin, "dist", "temporal", "workflows.js"),
      "export {};\n",
    );
    writeBuildIdentityFile(foreignPlugin);
    const dir = join(setup.procRoot, "4998");
    mkdirSync(dir, { recursive: true });
    const f = Array.from({ length: 19 }, (_, i) => String(100 + i));
    writeFileSync(
      join(dir, "stat"),
      `4998 (node) ${[...f, "100", "0", "0"].join(" ")}`,
    );
    writeFileSync(
      join(dir, "cmdline"),
      ["node", join(foreignPlugin, "dist", "temporal", "worker.js")].join(
        "\0",
      ) + "\0",
    );
    const inv = await collectPassing(setup);
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.complete).toBe(true);
  });

  test("blocks on a live session whose loaded digest differs", async () => {
    const setup = await makePassingSetup("adv-inv-sess-mismatch-");
    registerLoadedBuildSession({
      migrationRoot: setup.migrationRoot,
      projectId: "a000000000000000000000000000000000000000".repeat(40),
      buildDigest: "sha256:" + "f".repeat(64),
      pluginRoot: setup.pluginRoot,
      pid: PID_B,
      startTicks: "900",
    });
    const inv = await collectPassing(setup);
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.blockers.map((b) => b.code)).toContain(
      "session_digest_mismatch",
    );
  });

  test("blocks on a live opencode session missing from the registry", async () => {
    const setup = await makePassingSetup("adv-inv-sess-unknown-");
    const dir = join(setup.procRoot, "4777");
    mkdirSync(dir, { recursive: true });
    const f = Array.from({ length: 19 }, (_, i) => String(100 + i));
    writeFileSync(
      join(dir, "stat"),
      `4777 (opencode) ${[...f, "700", "0", "0"].join(" ")}`,
    );
    writeFileSync(join(dir, "cmdline"), "opencode --agent adv\0");
    const inv = await collectPassing(setup);
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.blockers.map((b) => b.code)).toContain(
      "session_process_unknown",
    );
  });

  test("blocks on malformed session records (unknown inventory)", async () => {
    const setup = await makePassingSetup("adv-inv-sess-malformed-");
    mkdirSync(join(setup.migrationRoot, "sessions"), { recursive: true });
    writeFileSync(join(setup.migrationRoot, "sessions", "9.json"), "{ nope");
    const inv = await collectPassing(setup);
    const readiness = validateMigrationReadiness(inv);
    expect(readiness.blockers.map((b) => b.code)).toContain(
      "session_record_malformed",
    );
  });

  test("inventory summary counts are exposed for the receipt proof", async () => {
    const setup = await makePassingSetup("adv-inv-summary-");
    const inv: MachineInventory = await collectPassing(setup);
    expect(inv.summary).toEqual({
      projects: 1,
      runningWorkflows: 0,
      liveSessions: 1,
      workers: 0,
    });
  });
});
