/**
 * getProjectId() Tests
 *
 * Verifies stable project identifier derivation from git root commit hash.
 */

import { describe, test, expect, afterEach } from "vitest";
import { getProjectId, getExternalRoot } from "./project-id";
import { join } from "path";
import { homedir } from "os";

describe("getProjectId", () => {
  test("returns root commit hash for a git repo", async () => {
    // Use the actual repo we're in — should return a 40-char hex SHA
    const id = await getProjectId(process.cwd());
    expect(id).toMatch(/^[0-9a-f]{40}$/);
  });

  test("returns consistent ID for same repo", async () => {
    const id1 = await getProjectId(process.cwd());
    const id2 = await getProjectId(process.cwd());
    expect(id1).toBe(id2);
  });

  test("returns null for non-git directory", async () => {
    const id = await getProjectId("/tmp");
    expect(id).toBeNull();
  });

  test("returns null for nonexistent directory", async () => {
    const id = await getProjectId("/nonexistent/path/xyz");
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
    expect(root).toBe(
      join(homedir(), ".local/share/opencode/plugins/advance"),
    );
  });
});
