#!/usr/bin/env node
/**
 * CI guard: pnpm is authoritative for plugin dependencies.
 * Fail when Bun lockfiles appear beside plugin/pnpm-lock.yaml.
 */

import { access } from "fs/promises";
import { join } from "path";

const PNPM_LOCKFILE = "pnpm-lock.yaml";
const BUN_LOCKFILES = ["bun.lock", "bun.lockb"];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

export async function findLockfilePolicyViolations(
  targetDir: string,
): Promise<string[]> {
  const hasPnpmLockfile = await exists(join(targetDir, PNPM_LOCKFILE));
  if (!hasPnpmLockfile) {
    return [];
  }

  const violations: string[] = [];
  for (const lockfile of BUN_LOCKFILES) {
    if (await exists(join(targetDir, lockfile))) {
      violations.push(lockfile);
    }
  }

  return violations;
}

async function main() {
  const targetDir = process.argv[2] || process.cwd();
  const violations = await findLockfilePolicyViolations(targetDir);

  if (violations.length > 0) {
    console.error(
      `pnpm-lock.yaml is authoritative; remove Bun lockfile(s): ${violations.join(", ")}`,
    );
    process.exit(1);
  }
}

main();
