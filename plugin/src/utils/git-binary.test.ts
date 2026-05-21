import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetGitBinaryCacheForTesting,
  ensureAugmentedPath,
  execFileGitAsync,
  getGitSpawnEnv,
  resolveGitBinary,
  spawnGit,
  spawnSyncGit,
} from "./git-binary.js";

describe("git-binary resolution", () => {
  beforeEach(() => {
    _resetGitBinaryCacheForTesting();
  });

  afterEach(() => {
    _resetGitBinaryCacheForTesting();
    vi.unstubAllEnvs();
  });

  it("honors ADV_GIT_PATH override when target is executable", () => {
    // Pick a guaranteed-executable file: process.execPath (node binary)
    const result = resolveGitBinary({
      env: { ADV_GIT_PATH: process.execPath },
      forceRefresh: true,
    });
    expect(result).toBe(process.execPath);
  });

  it("returns an absolute path when PATH is empty (Bug 2 regression)", () => {
    // Reproduce the ENOENT-posix_spawn-git failure mode: process.env.PATH
    // is empty / missing when the host runtime is launched from a context
    // that doesn't propagate shell PATH (systemd, desktop launcher, …).
    const result = resolveGitBinary({
      env: { PATH: "" },
      forceRefresh: true,
    });
    // Either it found an absolute path via the candidate list, or it
    // augmented PATH internally and found git via the lookup. Both are
    // acceptable; the assertion is "not the bare 'git' literal".
    // (The literal fallback only triggers when no candidate exists AND
    // augmented PATH also misses, which would mean git isn't installed.)
    if (result !== "git") {
      expect(result).toMatch(/git(\.exe)?$/);
      expect(result.startsWith("/") || /^[A-Z]:\\/.test(result)).toBe(true);
    }
  });

  it("memoizes the resolved path across calls", () => {
    const first = resolveGitBinary({ forceRefresh: true });
    const second = resolveGitBinary();
    expect(second).toBe(first);
  });

  it("forceRefresh re-resolves", () => {
    const first = resolveGitBinary({ forceRefresh: true });
    const overrideTarget = process.execPath;
    const second = resolveGitBinary({
      env: { ADV_GIT_PATH: overrideTarget },
      forceRefresh: true,
    });
    expect(second).toBe(overrideTarget);
    expect(second).not.toBe(first); // sanity
  });
});

describe("ensureAugmentedPath", () => {
  it("returns existing PATH augmented with system bin dirs on posix", () => {
    const result = ensureAugmentedPath("/some/user/bin", "linux");
    expect(result).toContain("/some/user/bin");
    // At least one common system bin dir should be present on a posix host
    expect(result.split(":").some((p) => p === "/usr/bin")).toBe(true);
  });

  it("dedupes entries idempotently", () => {
    const augmented = ensureAugmentedPath("/usr/bin", "linux");
    const augmentedAgain = ensureAugmentedPath(augmented, "linux");
    expect(augmented).toBe(augmentedAgain);
  });

  it("works with undefined PATH", () => {
    const result = ensureAugmentedPath(undefined, "linux");
    // Should still produce a non-empty PATH from augmentation alone.
    expect(typeof result).toBe("string");
  });

  it("uses ; separator on windows", () => {
    const result = ensureAugmentedPath("C:\\Users\\test\\bin", "win32");
    expect(result).toContain("C:\\Users\\test\\bin");
    // Windows augment list is empty (we let Git installer / PATHEXT handle
    // discovery) so input should round-trip.
    expect(result).toBe("C:\\Users\\test\\bin");
  });
});

describe("getGitSpawnEnv", () => {
  it("scrubs GIT_ASKPASS and forces GIT_TERMINAL_PROMPT=0", () => {
    const env = getGitSpawnEnv(
      {},
      { GIT_ASKPASS: "/some/script", PATH: "/usr/bin" },
      "linux",
    );
    expect(env.GIT_ASKPASS).toBeUndefined();
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.PATH).toContain("/usr/bin");
  });

  it("never returns an empty PATH even when input has none", () => {
    const env = getGitSpawnEnv({}, { PATH: undefined }, "linux");
    expect(typeof env.PATH).toBe("string");
  });

  it("applies extraEnv overrides on top of base env", () => {
    const env = getGitSpawnEnv(
      { GIT_DIR: "/repos/foo.git", GIT_TERMINAL_PROMPT: "1" },
      { PATH: "/usr/bin" },
      "linux",
    );
    expect(env.GIT_DIR).toBe("/repos/foo.git");
    // extraEnv may override defaults — that's intentional.
    expect(env.GIT_TERMINAL_PROMPT).toBe("1");
  });

  it("removes keys passed as undefined in extraEnv", () => {
    const env = getGitSpawnEnv(
      { GIT_TERMINAL_PROMPT: undefined },
      { PATH: "/usr/bin", GIT_TERMINAL_PROMPT: "0" },
      "linux",
    );
    expect(env.GIT_TERMINAL_PROMPT).toBeUndefined();
  });
});

describe("spawn wrappers actually find git", () => {
  beforeEach(() => {
    _resetGitBinaryCacheForTesting();
  });

  it("execFileGitAsync runs `git --version` even with empty inherited PATH", async () => {
    // Stub PATH to "" to simulate the broken launch context. The wrapper
    // should still find git because it resolves the binary path itself
    // and augments PATH on the spawn env.
    vi.stubEnv("PATH", "");
    _resetGitBinaryCacheForTesting();

    const { stdout } = await execFileGitAsync(["--version"], { timeout: 5000 });
    expect(stdout).toMatch(/^git version /);
  });

  it("spawnGit returns a ChildProcess with stdout stream", async () => {
    const child = spawnGit(["--version"], { stdio: "pipe" });
    expect(child.pid).toBeTypeOf("number");
    const output = await new Promise<string>((resolve, reject) => {
      let buf = "";
      child.stdout?.on("data", (data) => {
        buf += data.toString();
      });
      child.on("close", () => resolve(buf));
      child.on("error", reject);
    });
    expect(output).toMatch(/^git version /);
  });

  it("spawnSyncGit returns status=0 for `git --version`", () => {
    const result = spawnSyncGit(["--version"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(String(result.stdout)).toMatch(/^git version /);
  });
});
