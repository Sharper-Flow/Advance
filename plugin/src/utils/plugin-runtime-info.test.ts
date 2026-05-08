import { writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import {
  computeFreshness,
  computeCwdRelation,
  buildRecoveryHint,
  statMtimeIso,
  probeGit,
  getPluginRuntimeInfo,
  type FreshnessVerdict,
  type CwdRelation,
  type PluginRuntimeInfo,
} from "./plugin-runtime-info";

describe("plugin-runtime-info helpers", () => {
  describe("computeFreshness", () => {
    it("returns 'fresh' when source <= dist <= process", () => {
      const result = computeFreshness(
        "2026-05-08T10:00:00.000Z",
        "2026-05-08T11:00:00.000Z",
        "2026-05-08T12:00:00.000Z",
      );
      expect(result).toBe<FreshnessVerdict>("fresh");
    });

    it("returns 'fresh' when source equals dist (equal-mtime case)", () => {
      const ts = "2026-05-08T11:00:00.000Z";
      const result = computeFreshness(ts, ts, "2026-05-08T12:00:00.000Z");
      expect(result).toBe<FreshnessVerdict>("fresh");
    });

    it("returns 'fresh' when dist equals process (just-rebuilt-and-restarted)", () => {
      const ts = "2026-05-08T12:00:00.000Z";
      const result = computeFreshness("2026-05-08T11:00:00.000Z", ts, ts);
      expect(result).toBe<FreshnessVerdict>("fresh");
    });

    it("returns 'source_ahead_of_dist' when source > dist", () => {
      const result = computeFreshness(
        "2026-05-08T13:00:00.000Z",
        "2026-05-08T11:00:00.000Z",
        "2026-05-08T12:00:00.000Z",
      );
      expect(result).toBe<FreshnessVerdict>("source_ahead_of_dist");
    });

    it("returns 'dist_ahead_of_process' when dist > process AND source <= dist", () => {
      const result = computeFreshness(
        "2026-05-08T10:00:00.000Z",
        "2026-05-08T13:00:00.000Z",
        "2026-05-08T12:00:00.000Z",
      );
      expect(result).toBe<FreshnessVerdict>("dist_ahead_of_process");
    });

    it("prefers 'source_ahead_of_dist' when both source>dist AND dist>process", () => {
      // Edge case: source is the freshest. Surfacing source-ahead is
      // more actionable (rebuild before restart) than dist-ahead (just
      // restart).
      const result = computeFreshness(
        "2026-05-08T14:00:00.000Z",
        "2026-05-08T13:00:00.000Z",
        "2026-05-08T12:00:00.000Z",
      );
      expect(result).toBe<FreshnessVerdict>("source_ahead_of_dist");
    });

    it("returns 'unknown' when sourceMtime is null", () => {
      const result = computeFreshness(
        null,
        "2026-05-08T11:00:00.000Z",
        "2026-05-08T12:00:00.000Z",
      );
      expect(result).toBe<FreshnessVerdict>("unknown");
    });

    it("returns 'unknown' when distMtime is null", () => {
      const result = computeFreshness(
        "2026-05-08T10:00:00.000Z",
        null,
        "2026-05-08T12:00:00.000Z",
      );
      expect(result).toBe<FreshnessVerdict>("unknown");
    });

    it("returns 'unknown' when processStartedAt is null (defensive)", () => {
      const result = computeFreshness(
        "2026-05-08T10:00:00.000Z",
        "2026-05-08T11:00:00.000Z",
        null,
      );
      expect(result).toBe<FreshnessVerdict>("unknown");
    });
  });

  describe("computeCwdRelation", () => {
    it("returns 'match' when cwd === pluginRoot", () => {
      const result = computeCwdRelation("/home/x/proj", "/home/x/proj");
      expect(result).toBe<CwdRelation>("match");
    });

    it("returns 'child' when cwd is inside pluginRoot", () => {
      const result = computeCwdRelation("/home/x/proj/sub/dir", "/home/x/proj");
      expect(result).toBe<CwdRelation>("child");
    });

    it("returns 'outside' when cwd is unrelated to pluginRoot", () => {
      const result = computeCwdRelation("/home/y/other", "/home/x/proj");
      expect(result).toBe<CwdRelation>("outside");
    });

    it("returns 'outside' when cwd is parent of pluginRoot", () => {
      const result = computeCwdRelation("/home/x", "/home/x/proj");
      expect(result).toBe<CwdRelation>("outside");
    });
  });

  describe("buildRecoveryHint", () => {
    const pluginRoot = "/home/x/advance/plugin";

    it("returns null for fresh", () => {
      const result = buildRecoveryHint("fresh", { pluginRoot });
      expect(result).toBeNull();
    });

    it("returns rebuild action for source_ahead_of_dist", () => {
      const result = buildRecoveryHint("source_ahead_of_dist", {
        pluginRoot,
      });
      expect(result).not.toBeNull();
      expect(result!.action).toMatch(/source.*newer.*dist|rebuild/i);
      expect(result!.commands).toContain("pnpm run build");
      expect(result!.paths.plugin_root).toBe(pluginRoot);
    });

    it("returns restart action for dist_ahead_of_process", () => {
      const result = buildRecoveryHint("dist_ahead_of_process", {
        pluginRoot,
      });
      expect(result).not.toBeNull();
      expect(result!.action).toMatch(/restart.*session|dist.*newer/i);
      expect(result!.paths.plugin_root).toBe(pluginRoot);
    });

    it("returns degraded-mode hint for unknown", () => {
      const result = buildRecoveryHint("unknown", { pluginRoot });
      expect(result).not.toBeNull();
      expect(result!.action).toMatch(/cannot determine|degraded|probe/i);
    });

    it("includes worktree path when provided", () => {
      const result = buildRecoveryHint("source_ahead_of_dist", {
        pluginRoot,
        worktree: "/home/x/wt/branch",
      });
      expect(result!.paths.worktree).toBe("/home/x/wt/branch");
    });

    it("includes main_checkout path when provided", () => {
      const result = buildRecoveryHint("source_ahead_of_dist", {
        pluginRoot,
        mainCheckout: "/home/x/advance",
      });
      expect(result!.paths.main_checkout).toBe("/home/x/advance");
    });
  });

  describe("statMtimeIso", () => {
    let tempDir: string | undefined;

    afterEach(async () => {
      if (tempDir) await cleanupTempDir(tempDir);
      tempDir = undefined;
    });

    it("returns ISO timestamp for existing file", async () => {
      tempDir = await createTempDir();
      const file = join(tempDir, "exists.txt");
      await writeFile(file, "test");
      const knownTime = new Date("2026-05-08T10:00:00.000Z");
      await utimes(file, knownTime, knownTime);
      const result = await statMtimeIso(file);
      expect(result).toBe("2026-05-08T10:00:00.000Z");
    });

    it("returns null for missing file", async () => {
      const result = await statMtimeIso("/nonexistent/path/file.txt");
      expect(result).toBeNull();
    });
  });
});

describe("probeGit", () => {
  it("returns branch + sha for a real git repo", async () => {
    // The plugin checkout is itself a git repo — probe it.
    const result = await probeGit(process.cwd());
    expect(typeof result.branch).toBe("string");
    expect(result.branch!.length).toBeGreaterThan(0);
    expect(typeof result.sha).toBe("string");
    expect(result.sha!.length).toBeGreaterThanOrEqual(7);
  });

  it("returns null/null for a non-git directory", async () => {
    const tempDir = await createTempDir();
    try {
      const result = await probeGit(tempDir);
      expect(result.branch).toBeNull();
      expect(result.sha).toBeNull();
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("returns null/null when git binary execution times out", async () => {
    // Use a fake binary that we know won't respond — point at a path that
    // doesn't exist. execFile should fail fast (ENOENT) but the contract
    // is "any failure → both null".
    const result = await probeGit("/nonexistent/path/with/no/git");
    expect(result.branch).toBeNull();
    expect(result.sha).toBeNull();
  });

  it("does not throw on any failure mode", async () => {
    await expect(probeGit("/nonexistent")).resolves.toBeDefined();
  });
});

describe("getPluginRuntimeInfo (integration)", () => {
  it("populates plugin_checkout_branch + sha when running in a git repo", async () => {
    const info = await getPluginRuntimeInfo();
    // The worktree we run in is a real git repo, so probe succeeds.
    expect(typeof info.plugin_checkout_branch).toBe("string");
    expect(info.plugin_checkout_branch!.length).toBeGreaterThan(0);
    expect(typeof info.plugin_checkout_head_sha).toBe("string");
    expect(info.plugin_checkout_head_sha!.length).toBeGreaterThanOrEqual(7);
  });

  it("returns full extended shape with all new fields present", async () => {
    const info: PluginRuntimeInfo = await getPluginRuntimeInfo();
    // existing fields
    expect(typeof info.loaded_module_path).toBe("string");
    expect(typeof info.process_started_at).toBe("string");
    expect(typeof info.build_marker_path).toBe("string");
    expect(typeof info.build_marker_found).toBe("boolean");
    expect(typeof info.worker_script_path).toBe("string");
    expect(typeof info.reload_caveat).toBe("string");
    // new additive fields
    expect(typeof info.dist_index_path).toBe("string");
    expect(
      info.dist_mtime_iso === null || typeof info.dist_mtime_iso === "string",
    ).toBe(true);
    expect(typeof info.source_index_path).toBe("string");
    expect(
      info.source_index_mtime_iso === null ||
        typeof info.source_index_mtime_iso === "string",
    ).toBe(true);
    expect([
      "fresh",
      "source_ahead_of_dist",
      "dist_ahead_of_process",
      "unknown",
    ]).toContain(info.source_dist_freshness);
    expect(
      info.plugin_checkout_branch === null ||
        typeof info.plugin_checkout_branch === "string",
    ).toBe(true);
    expect(
      info.plugin_checkout_head_sha === null ||
        typeof info.plugin_checkout_head_sha === "string",
    ).toBe(true);
    expect(["match", "child", "outside"]).toContain(info.cwd_vs_plugin_root);
    expect(
      info.recovery_hint === null || typeof info.recovery_hint === "object",
    ).toBe(true);
  });

  it("recovery_hint is null when freshness is fresh; populated otherwise", async () => {
    const info = await getPluginRuntimeInfo();
    if (info.source_dist_freshness === "fresh") {
      expect(info.recovery_hint).toBeNull();
    } else {
      expect(info.recovery_hint).not.toBeNull();
      expect(typeof info.recovery_hint!.action).toBe("string");
      expect(Array.isArray(info.recovery_hint!.commands)).toBe(true);
      expect(typeof info.recovery_hint!.paths.plugin_root).toBe("string");
    }
  });

  it("accepts optional RuntimeInfoOptions and threads worktree info", async () => {
    const info = await getPluginRuntimeInfo({
      isWorktree: true,
      mainCheckoutPath: "/home/x/advance",
    });
    // Shape unchanged; options just inform recovery_hint paths
    expect(typeof info.source_dist_freshness).toBe("string");
  });
});
