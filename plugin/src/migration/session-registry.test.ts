/**
 * session-registry tests — live-session loaded-build identity (AC9/DDC5).
 *
 * After the bridge build deploys, every plugin session records the build
 * digest it loaded. Activation then proves every live session restarted onto
 * the migrated build: records with dead PIDs are reaped (PID-reuse-safe via
 * start ticks), records with a mismatched digest block activation, and
 * malformed records are unknown inventory — they block too.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  listLiveBuildSessions,
  LoadedBuildSessionSchema,
  registerLoadedBuildSession,
  registerPluginSession,
  unregisterLoadedBuildSession,
} from "./session-registry";

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

const DIGEST = "sha256:" + "a".repeat(64);

function sessionFile(migrationRoot: string, pid: number): string {
  return join(migrationRoot, "sessions", `${pid}.json`);
}

describe("registerLoadedBuildSession", () => {
  test("writes a schema-valid session record atomically", async () => {
    const root = await tempDir("adv-sessreg-write-");
    const result = registerLoadedBuildSession({
      migrationRoot: root,
      projectId: "0000100000000000000000000000000000000000",
      buildDigest: DIGEST,
      pluginRoot: "/deploy/Advance/plugin",
      pid: 4321,
      startTicks: "777",
      now: new Date("2026-07-16T01:00:00.000Z"),
    });
    expect(result.registered).toBe(true);
    const parsed = JSON.parse(readFileSync(sessionFile(root, 4321), "utf8"));
    expect(() => LoadedBuildSessionSchema.parse(parsed)).not.toThrow();
    expect(parsed).toMatchObject({
      pid: 4321,
      processStartTicks: "777",
      projectId: "0000100000000000000000000000000000000000",
      buildDigest: DIGEST,
      startedAt: "2026-07-16T01:00:00.000Z",
    });
  });

  test("re-registering the same pid overwrites (session restart)", async () => {
    const root = await tempDir("adv-sessreg-rewrite-");
    registerLoadedBuildSession({
      migrationRoot: root,
      projectId: "0000100000000000000000000000000000000000",
      buildDigest: DIGEST,
      pluginRoot: "/deploy/Advance/plugin",
      pid: 1,
      now: new Date("2026-07-16T01:00:00.000Z"),
    });
    registerLoadedBuildSession({
      migrationRoot: root,
      projectId: "0000200000000000000000000000000000000000",
      buildDigest: DIGEST,
      pluginRoot: "/deploy/Advance/plugin",
      pid: 1,
      now: new Date("2026-07-16T02:00:00.000Z"),
    });
    const parsed = JSON.parse(readFileSync(sessionFile(root, 1), "utf8"));
    expect(parsed.projectId).toBe("0000200000000000000000000000000000000000");
    expect(parsed.startedAt).toBe("2026-07-16T02:00:00.000Z");
  });

  test("never throws on unwritable roots — reports the error", async () => {
    const result = registerLoadedBuildSession({
      migrationRoot: join("/definitely", "not", "writable-\0"),
      projectId: "0000100000000000000000000000000000000000",
      buildDigest: DIGEST,
      pluginRoot: "/x",
      pid: 1,
    });
    expect(result.registered).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("unregisterLoadedBuildSession", () => {
  test("removes only the own-pid record; missing files are fine", async () => {
    const root = await tempDir("adv-sessreg-unreg-");
    registerLoadedBuildSession({
      migrationRoot: root,
      projectId: "0000100000000000000000000000000000000000",
      buildDigest: DIGEST,
      pluginRoot: "/x",
      pid: 10,
    });
    registerLoadedBuildSession({
      migrationRoot: root,
      projectId: "0000100000000000000000000000000000000000",
      buildDigest: DIGEST,
      pluginRoot: "/x",
      pid: 20,
    });
    unregisterLoadedBuildSession({ migrationRoot: root, pid: 10 });
    expect(readdirSync(join(root, "sessions"))).toEqual(["20.json"]);
    expect(() =>
      unregisterLoadedBuildSession({ migrationRoot: root, pid: 99 }),
    ).not.toThrow();
  });
});

describe("listLiveBuildSessions", () => {
  test("reaps dead-pid records and returns live ones", async () => {
    const root = await tempDir("adv-sessreg-list-");
    for (const [pid, ticks] of [
      [100, "500"],
      [200, "600"],
    ] as const) {
      registerLoadedBuildSession({
        migrationRoot: root,
        projectId: "0000100000000000000000000000000000000000",
        buildDigest: DIGEST,
        pluginRoot: "/x",
        pid,
        startTicks: ticks,
      });
    }
    const result = listLiveBuildSessions({
      migrationRoot: root,
      isAlive: (pid) => pid === 200,
    });
    expect(result.live.map((s) => s.pid)).toEqual([200]);
    expect(result.reaped).toBe(1);
    // Reaped file is gone from the registry.
    expect(readdirSync(join(root, "sessions"))).toEqual(["200.json"]);
  });

  test("malformed records are unknown inventory, not silently dropped", async () => {
    const root = await tempDir("adv-sessreg-malformed-");
    const dir = join(root, "sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "300.json"), "{ not json", {
      flag: "w",
    });
    const result = listLiveBuildSessions({ migrationRoot: root });
    expect(result.live).toEqual([]);
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0]).toContain("300.json");
  });

  test("missing sessions directory is an empty registry", async () => {
    const root = await tempDir("adv-sessreg-empty-");
    const result = listLiveBuildSessions({ migrationRoot: root });
    expect(result).toEqual({ live: [], reaped: 0, malformed: [] });
  });
});

describe("registerPluginSession (init seam)", () => {
  test("skips registration in test mode even with an identity", async () => {
    const root = await tempDir("adv-sessreg-seam-test-");
    const result = registerPluginSession({
      projectId: "0000100000000000000000000000000000000000",
      migrationRoot: root,
      identity: {
        schemaVersion: 1,
        digest: DIGEST,
        files: [{ path: "index.js", sha256: "a".repeat(64), bytes: 1 }],
        computedAt: "2026-07-16T00:00:00.000Z",
        pluginRoot: "/x",
      },
      sessionId: "sess_test123",
      env: { VITEST: "true" },
    });
    expect(result.registered).toBe(false);
    expect(result.skipped).toBe("test_mode");
  });

  test("skips when no build identity is available (dev/src mode)", async () => {
    const root = await tempDir("adv-sessreg-seam-noident-");
    const result = registerPluginSession({
      projectId: "0000100000000000000000000000000000000000",
      migrationRoot: root,
      identity: null,
      sessionId: "sess_test123",
      env: {},
    });
    expect(result).toMatchObject({ registered: false, skipped: "no_identity" });
  });

  test("registers when identity is present outside test mode", async () => {
    const root = await tempDir("adv-sessreg-seam-ok-");
    const result = registerPluginSession({
      projectId: "0000100000000000000000000000000000000000",
      migrationRoot: root,
      identity: {
        schemaVersion: 1,
        digest: DIGEST,
        files: [{ path: "index.js", sha256: "a".repeat(64), bytes: 1 }],
        computedAt: "2026-07-16T00:00:00.000Z",
        pluginRoot: "/x",
      },
      sessionId: "sess_test123",
      env: {},
      pid: 5150,
    });
    expect(result.registered).toBe(true);
    const parsed = JSON.parse(readFileSync(sessionFile(root, 5150), "utf8"));
    expect(parsed.buildDigest).toBe(DIGEST);
  });
});
