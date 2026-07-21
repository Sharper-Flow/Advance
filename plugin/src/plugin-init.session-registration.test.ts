/**
 * plugin-init session registration wiring (AC9/DDC5).
 *
 * Every plugin session records its loaded-build identity at init (so the
 * cutover inventory can prove every active session restarted onto the
 * migrated build) and removes the record at shutdown. Registration is
 * fire-and-forget: a later init failure must not undo it, and shutdown with
 * a null store still unregisters.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "./__tests__/setup";
import { synthesizeTestProjectId } from "./utils/project-id";

const mocks = vi.hoisted(() => ({
  registerPluginSession: vi.fn(() => ({ registered: true })),
  unregisterLoadedBuildSession: vi.fn(),
  resolveMigrationRoot: vi.fn(() => "/tmp/adv-test-migration-root"),
  resolveOwnBuildIdentity: vi.fn(() => ({
    schemaVersion: 1 as const,
    digest: "sha256:" + "a".repeat(64),
    files: [{ path: "index.js", sha256: "a".repeat(64), bytes: 1 }],
    computedAt: "2026-07-16T00:00:00.000Z",
    pluginRoot: "/deploy/Advance/plugin",
  })),
}));

vi.mock("./migration/session-registry", () => ({
  registerPluginSession: mocks.registerPluginSession,
  unregisterLoadedBuildSession: mocks.unregisterLoadedBuildSession,
}));

vi.mock("./migration/paths", () => ({
  resolveMigrationRoot: mocks.resolveMigrationRoot,
  resolveOwnBuildIdentity: mocks.resolveOwnBuildIdentity,
}));

vi.mock("./temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("./temporal/runtime-manager")
  >("./temporal/runtime-manager");
  return {
    ...actual,
    ensureTemporalRuntime: vi.fn(async () => {
      throw new Error("no Temporal runtime in unit test");
    }),
  };
});

import { getCurrentSessionId, registerShutdownHandlers, tryInitStore } from "./plugin-init";

describe("plugin-init loaded-build session registration (AC9/DDC5)", () => {
  let tempDirs: string[] = [];
  let savedXdg: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    savedXdg = process.env.XDG_DATA_HOME;
  });

  afterEach(async () => {
    if (savedXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = savedXdg;
    }
    await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
    tempDirs = [];
  });

  test("tryInitStore registers the session's loaded-build identity before runtime startup", async () => {
    // Isolate any external-state side effects from the real machine shard.
    const xdg = await createTempDir("adv-initreg-xdg-");
    tempDirs.push(xdg);
    process.env.XDG_DATA_HOME = xdg;

    const result = await tryInitStore(process.cwd(), undefined);

    // Registration fired even though Temporal runtime startup fails here.
    expect(mocks.registerPluginSession).toHaveBeenCalledTimes(1);
    const registerCall = mocks.registerPluginSession.mock.calls[0][0] as {
      projectId: string;
      migrationRoot: string;
      identity: { digest: string };
      sessionId: string;
    };
    expect(registerCall.projectId).toBe(synthesizeTestProjectId(process.cwd()));
    expect(registerCall.migrationRoot).toBe("/tmp/adv-test-migration-root");
    expect(registerCall.identity).toEqual(
      expect.objectContaining({
        digest: "sha256:" + "a".repeat(64),
      }),
    );
    expect(registerCall.sessionId).toMatch(/^sess_[A-Za-z0-9]{8}$/);
    expect(getCurrentSessionId()).toBe(registerCall.sessionId);
    expect(result.initError).not.toBeNull();
  });

  test("subsequent tryInitStore calls reuse the same session ID", async () => {
    // Isolate any external-state side effects from the real machine shard.
    const xdg = await createTempDir("adv-initreg-xdg-");
    tempDirs.push(xdg);
    process.env.XDG_DATA_HOME = xdg;

    await tryInitStore(process.cwd(), undefined);
    const firstSessionId = getCurrentSessionId();
    expect(firstSessionId).toMatch(/^sess_[A-Za-z0-9]{8}$/);

    vi.clearAllMocks();
    await tryInitStore(process.cwd(), undefined);

    // The module-level session ID is sticky: ADV's tryInitStore is designed to
    // run once per process, so the getter continues to return the originally
    // generated ID even if init is invoked again in the same process.
    expect(getCurrentSessionId()).toBe(firstSessionId);
    expect(mocks.registerPluginSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: firstSessionId }),
    );
  });

  test("shutdown unregisters the session record even with a null store", () => {
    const handlers = registerShutdownHandlers(null);
    handlers.handleExit();
    expect(mocks.unregisterLoadedBuildSession).toHaveBeenCalledWith({
      migrationRoot: "/tmp/adv-test-migration-root",
    });
  });
});
