/**
 * Bun parity tests for `bin/adv reconcile`.
 *
 * The command is intentionally exercised through the root CLI and its emitted
 * plugin bundle, rather than importing the reconciliation engine into `bin/`.
 */

import { createHash } from "crypto";
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");
const ADV_PATH = join(import.meta.dir, "adv");
const BUNDLE_PATH = join(REPO_ROOT, "plugin/dist/reconcile-cli.js");

async function runAdv(
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, ADV_PATH, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "1", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function makeRepo(): Promise<{
  root: string;
  xdg: string;
  env: Record<string, string>;
}> {
  const root = mkdtempSync(join(tmpdir(), "adv-reconcile-cli-"));
  const xdg = join(root, "xdg");
  await mkdir(xdg, { recursive: true });
  const init = Bun.spawn(["git", "-c", "init.defaultBranch=trunk", "init", "--quiet"], {
    cwd: root,
    stdout: "ignore",
    stderr: "ignore",
  });
  await init.exited;
  const commit = Bun.spawn(
    [
      "git",
      "-c",
      "user.name=ADV Test",
      "-c",
      "user.email=adv-test@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "init",
    ],
    { cwd: root, stdout: "ignore", stderr: "ignore" },
  );
  await commit.exited;
  return {
    root,
    xdg,
    env: {
      ADV_TEST_MODE: "1",
      ADV_TEST_DATA_HOME: "0",
      XDG_DATA_HOME: xdg,
      ADV_RECONCILE_CLI_BUNDLE: BUNDLE_PATH,
    },
  };
}

function parse(stdout: string): Record<string, any> {
  return JSON.parse(stdout) as Record<string, any>;
}

function syntheticProjectId(root: string): string {
  return (
    "0000000000000000" +
    createHash("sha1")
      .update(`adv-test::${root}`)
      .digest("hex")
      .slice(0, 24)
  );
}

describe("adv reconcile CLI parity", () => {
  test("plan and dry-run emit the host-tool plan contract", async () => {
    const fixture = await makeRepo();
    try {
      const plan = await runAdv(["reconcile", "--mode", "plan"], fixture.root, fixture.env);
      expect(plan.exitCode).toBe(0);
      expect(parse(plan.stdout)).toMatchObject({
        ok: true,
        mode: "plan",
        plan_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        zero_mutations: true,
      });

      const dryRun = await runAdv(["reconcile", "--dry-run"], fixture.root, fixture.env);
      expect(dryRun.exitCode).toBe(0);
      expect(parse(dryRun.stdout)).toMatchObject({
        ok: true,
        mode: "dry_run",
        plan_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        zero_mutations: true,
      });

      const approvedApply = await runAdv(
        [
          "reconcile",
          "--apply",
          "--confirm-plan-hash",
          parse(plan.stdout).plan_hash as string,
        ],
        fixture.root,
        fixture.env,
      );
      expect(approvedApply.exitCode).toBe(0);
      expect(parse(approvedApply.stdout)).toMatchObject({
        ok: true,
        mode: "apply",
        plan_hash: parse(plan.stdout).plan_hash,
        report: { counters: { failed: 0 } },
        exit_code: 0,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  test("apply without the dry-run hash is the typed stale-plan refusal", async () => {
    const fixture = await makeRepo();
    try {
      const result = await runAdv(["reconcile", "--apply"], fixture.root, fixture.env);
      expect(result.exitCode).toBe(6);
      expect(parse(result.stdout)).toMatchObject({
        ok: false,
        mode: "apply",
        error_class: "stale_plan",
        exit_code: 6,
        zero_mutations: true,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  test("apply preserves the host worker-lock refusal and exit code", async () => {
    const fixture = await makeRepo();
    try {
      const workerLock = join(
        fixture.xdg,
        "opencode/plugins/advance",
        syntheticProjectId(fixture.root),
        "worker.lock",
      );
      await mkdir(join(workerLock, ".."), { recursive: true });
      await writeFile(workerLock, JSON.stringify({ pid: process.pid }));
      const planned = await runAdv(["reconcile", "--plan"], fixture.root, fixture.env);
      const planHash = parse(planned.stdout).plan_hash as string;

      const result = await runAdv(
        ["reconcile", "--apply", "--confirm-plan-hash", planHash],
        fixture.root,
        fixture.env,
      );
      expect(result.exitCode).toBe(4);
      expect(parse(result.stdout)).toMatchObject({
        ok: false,
        mode: "apply",
        error_class: "worker_lock_live",
        exit_code: 4,
        zero_mutations: true,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  test("invalid mode is a CLI usage refusal", async () => {
    const fixture = await makeRepo();
    try {
      const result = await runAdv(["reconcile", "--mode", "unknown"], fixture.root, fixture.env);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toMatch(/reconcile:.*mode/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});
