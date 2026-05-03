/**
 * Tests for hooks.ts (T12 — KD-15).
 *
 * Verifies the 5 task scenarios:
 *   - clean hook execution (exit 0, no error)
 *   - timeout (long-running command killed with timedOut:true)
 *   - non-zero exit blocks preDelete (HookFailedError thrown)
 *   - env sanitization (CI=true etc. injected into hook env)
 *   - empty hooks list short-circuits without error
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import {
  runHooksWithSafety,
  HookFailedError,
  HOOK_DEFAULTS,
} from "./hooks";

const isLinux = process.platform === "linux";

describe.skipIf(!isLinux)("hooks.ts (T12) — Linux only", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "adv-hooks-test-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("clean preDelete hook executes successfully", async () => {
    const results = await runHooksWithSafety(
      "preDelete",
      cwd,
      ["echo hello"],
    );
    expect(results).toHaveLength(1);
    expect(results[0].exitCode).toBe(0);
    expect(results[0].timedOut).toBe(false);
    expect(results[0].stdout).toContain("hello");
  });

  it("postCreate hook with non-zero exit does NOT throw", async () => {
    const results = await runHooksWithSafety("postCreate", cwd, [
      "exit 7",
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].exitCode).toBe(7);
  });

  it("preDelete hook with non-zero exit throws HookFailedError", async () => {
    await expect(
      runHooksWithSafety("preDelete", cwd, ["exit 3"]),
    ).rejects.toThrow(HookFailedError);
  });

  it("preDelete hook timeout surfaces as HookFailedError with timedOut:true", async () => {
    let caught: HookFailedError | undefined;
    try {
      await runHooksWithSafety("preDelete", cwd, ["sleep 5"], {
        timeoutMs: 200,
      });
    } catch (err) {
      caught = err as HookFailedError;
    }
    expect(caught).toBeInstanceOf(HookFailedError);
    expect(caught?.results[0].timedOut).toBe(true);
  });

  it("env sanitization injects CI/GIT_TERMINAL_PROMPT/PAGER defaults", async () => {
    const results = await runHooksWithSafety("preDelete", cwd, [
      'printf "CI=%s GIT_TERMINAL_PROMPT=%s PAGER=%s" "$CI" "$GIT_TERMINAL_PROMPT" "$PAGER"',
    ]);
    expect(results[0].stdout).toBe("CI=true GIT_TERMINAL_PROMPT=0 PAGER=cat");
  });

  it("empty commands list returns empty array (no shell spawn)", async () => {
    const results = await runHooksWithSafety("preDelete", cwd, []);
    expect(results).toEqual([]);
  });

  it("HOOK_DEFAULTS exposes timeoutMs + shell + trustModel", () => {
    expect(HOOK_DEFAULTS.timeoutMs).toBe(30_000);
    expect(HOOK_DEFAULTS.shell).toBe("/bin/sh");
    expect(HOOK_DEFAULTS.trustModel).toBe("project_owner");
  });
});
