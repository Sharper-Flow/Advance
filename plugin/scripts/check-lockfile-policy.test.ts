import { describe, expect, test } from "vitest";
import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { findLockfilePolicyViolations } from "./check-lockfile-policy";

describe("lockfile policy check", () => {
  test("passes when pnpm is sole project lockfile", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "adv-lockfile-pass-"));
    await writeFile(join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    await expect(findLockfilePolicyViolations(tempDir)).resolves.toEqual([]);
  });

  test("fails when Bun lockfile appears next to pnpm lockfile", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "adv-lockfile-fail-"));
    await writeFile(join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(tempDir, "bun.lock"), "stale bun lock\n");

    await expect(findLockfilePolicyViolations(tempDir)).resolves.toEqual([
      "bun.lock",
    ]);
  });

  test("fails when binary Bun lockfile appears next to pnpm lockfile", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "adv-lockfile-binary-"));
    await writeFile(join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(tempDir, "bun.lockb"), "binary-ish\n");

    await expect(findLockfilePolicyViolations(tempDir)).resolves.toEqual([
      "bun.lockb",
    ]);
  });
});
