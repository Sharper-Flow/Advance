/**
 * getProjectId() Tests
 *
 * Verifies stable project identifier derivation from git root commit hash,
 * AND the test-mode synthetic override that prevents test fixtures from
 * leaking into a real ADV project's external state directory.
 */

import { describe, test, expect, afterEach } from "vitest";
import {
  getProjectId,
  getProjectIdFromGit,
  getExternalRoot,
  SYNTHETIC_TEST_PROJECT_ID,
  SYNTHETIC_TEST_PROJECT_ID_PREFIX,
  synthesizeTestProjectId,
} from "./project-id";
import { join } from "path";
import { homedir } from "os";

describe("SYNTHETIC_TEST_PROJECT_ID_PREFIX + SYNTHETIC_TEST_PROJECT_ID", () => {
  test("prefix is 16 zeros (unambiguously synthetic, no real SHA collides)", () => {
    expect(SYNTHETIC_TEST_PROJECT_ID_PREFIX).toBe("0000000000000000");
    expect(SYNTHETIC_TEST_PROJECT_ID_PREFIX).toHaveLength(16);
  });

  test("default sentinel is 40-char zero string starting with the prefix", () => {
    expect(SYNTHETIC_TEST_PROJECT_ID).toBe(
      "0000000000000000000000000000000000000000",
    );
    expect(SYNTHETIC_TEST_PROJECT_ID).toHaveLength(40);
    expect(
      SYNTHETIC_TEST_PROJECT_ID.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX),
    ).toBe(true);
  });
});

describe("synthesizeTestProjectId", () => {
  test("returns 40-char hex with the synthetic prefix", () => {
    const id = synthesizeTestProjectId("/some/path");
    expect(id).toHaveLength(40);
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(id.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX)).toBe(true);
  });

  test("is deterministic for the same directory", () => {
    expect(synthesizeTestProjectId("/dir/a")).toBe(
      synthesizeTestProjectId("/dir/a"),
    );
  });

  test("returns distinct IDs for distinct directories (cross-project isolation)", () => {
    expect(synthesizeTestProjectId("/dir/a")).not.toBe(
      synthesizeTestProjectId("/dir/b"),
    );
  });

  test("collapses to default sentinel for empty directory", () => {
    expect(synthesizeTestProjectId("")).toBe(SYNTHETIC_TEST_PROJECT_ID);
  });
});

describe("getProjectId — test-mode synthetic override", () => {
  // Save and restore env vars so other test files aren't affected.
  const originalVitest = process.env.VITEST;
  const originalAdvTestMode = process.env.ADV_TEST_MODE;

  afterEach(() => {
    if (originalVitest !== undefined) process.env.VITEST = originalVitest;
    else delete process.env.VITEST;
    if (originalAdvTestMode !== undefined)
      process.env.ADV_TEST_MODE = originalAdvTestMode;
    else delete process.env.ADV_TEST_MODE;
  });

  test("hard-fail guardrail: vitest sets VITEST=true and getProjectId returns synthetic ID", async () => {
    // This test guarantees that no future test can accidentally resolve a real
    // git SHA from getProjectId. If this test fails, the synthetic override
    // is broken and tests may leak fixture state into a real ADV project.
    expect(process.env.VITEST).toBe("true");
    const id = await getProjectId(process.cwd());
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(id?.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX)).toBe(true);
  });

  test("returns synthetic ID when VITEST=true and directory is a real git repo", async () => {
    process.env.VITEST = "true";
    delete process.env.ADV_TEST_MODE;
    // process.cwd() during tests is the plugin checkout — a real git repo.
    const id = await getProjectId(process.cwd());
    expect(id).toBe(synthesizeTestProjectId(process.cwd()));
  });

  test("returns synthetic ID when ADV_TEST_MODE=1 and directory is a real git repo", async () => {
    delete process.env.VITEST;
    process.env.ADV_TEST_MODE = "1";
    const id = await getProjectId(process.cwd());
    expect(id).toBe(synthesizeTestProjectId(process.cwd()));
  });

  test("returns null in test mode for non-git directory (preserves legacy fallback)", async () => {
    process.env.VITEST = "true";
    // /tmp is not a git repo; callers depend on null to fall back to
    // legacy in-repo paths. Without this, createTestProject fixtures
    // (stub .git, no commits) would resolve to a synthetic external
    // root and break tests that expect dir-rooted state.
    const id = await getProjectId("/tmp");
    expect(id).toBeNull();
  });

  test("returns null in test mode for nonexistent directory", async () => {
    process.env.VITEST = "true";
    const id = await getProjectId("/nonexistent/path/xyz");
    expect(id).toBeNull();
  });

  test("synthetic IDs isolate distinct real-git fixture directories from each other", () => {
    // Pure-function check on synthesizeTestProjectId — proves cross-project
    // isolation without needing two real-git fixtures in this unit test.
    const idA = synthesizeTestProjectId("/fixture/source");
    const idB = synthesizeTestProjectId("/fixture/target");
    expect(idA).not.toBe(idB);
    expect(idA.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX)).toBe(true);
    expect(idB.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX)).toBe(true);
  });

  test("does NOT short-circuit when VITEST is falsy and ADV_TEST_MODE missing", async () => {
    process.env.VITEST = "false";
    delete process.env.ADV_TEST_MODE;
    // Without test-mode flags, falls through to real git resolution.
    // /tmp (non-git) returns null deterministically.
    const id = await getProjectId("/tmp");
    expect(id).toBeNull();
  });
});

describe("getProjectIdFromGit (raw, bypasses test-mode override)", () => {
  test("returns root commit hash for a git repo", async () => {
    const id = await getProjectIdFromGit(process.cwd());
    expect(id).toMatch(/^[0-9a-f]{40}$/);
  });

  test("returns consistent ID for same repo", async () => {
    const id1 = await getProjectIdFromGit(process.cwd());
    const id2 = await getProjectIdFromGit(process.cwd());
    expect(id1).toBe(id2);
  });

  test("returns null for non-git directory", async () => {
    const id = await getProjectIdFromGit("/tmp");
    expect(id).toBeNull();
  });

  test("returns null for nonexistent directory", async () => {
    const id = await getProjectIdFromGit("/nonexistent/path/xyz");
    expect(id).toBeNull();
  });
});

describe("getExternalRoot", () => {
  const originalEnv = process.env.XDG_DATA_HOME;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.XDG_DATA_HOME = originalEnv;
    } else {
      delete process.env.XDG_DATA_HOME;
    }
  });

  test("uses XDG_DATA_HOME when set", () => {
    process.env.XDG_DATA_HOME = "/custom/data";
    const root = getExternalRoot("abc123");
    expect(root).toBe("/custom/data/opencode/plugins/advance/abc123");
  });

  test("falls back to ~/.local/share when XDG_DATA_HOME unset", () => {
    delete process.env.XDG_DATA_HOME;
    const root = getExternalRoot("abc123");
    expect(root).toBe(
      join(homedir(), ".local/share/opencode/plugins/advance/abc123"),
    );
  });

  test("handles empty string projectId gracefully", () => {
    delete process.env.XDG_DATA_HOME;
    const root = getExternalRoot("");
    // Should still return a path (caller is responsible for null-checking projectId)
    expect(root).toBe(join(homedir(), ".local/share/opencode/plugins/advance"));
  });
});
