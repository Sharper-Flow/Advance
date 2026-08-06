/**
 * Bun tests for bin/adv CLI dispatcher
 *
 * Run with: bun test bin/adv.test.ts
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { validateSlopScanReport } from "./lib/slop-scan/schema";

const ADV_PATH = join(import.meta.dir, "adv");
const GIT_TEST_IDENTITY = [
  "-c",
  "user.name=ADV Test",
  "-c",
  "user.email=adv-test@example.invalid",
];

function makeSnapshot() {
  // Unused after CLI dispatcher cleanup; kept temporarily to avoid churn
  // in unrelated test setup. Safe to delete in a follow-up if no test references it.
  return {
    version: 1,
    generated_at: "2024-06-01T12:00:00Z",
    project: { owner: "sharper-flow", number: 7, title: "Advance" },
    counts: { total: 1, bugs: 0, features: 1, deferred: 0 },
    bugs: [],
    features: [
      {
        number: 42,
        title: "Test feature",
        value: 5,
        time_criticality: 4,
        rroe: 3,
        effort: 2,
        wsjf: 12,
        labels: [],
      },
    ],
    deferred: [],
  };
}
void makeSnapshot;

interface RunAdvOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
}

async function runAdv(
  args: string[],
  cwd?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }>;
async function runAdv(
  args: string[],
  options?: RunAdvOptions,
): Promise<{ exitCode: number; stdout: string; stderr: string }>;
async function runAdv(
  args: string[],
  optionsOrCwd?: string | RunAdvOptions,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const options =
    typeof optionsOrCwd === "string"
      ? { cwd: optionsOrCwd }
      : optionsOrCwd ?? {};
  const env = options.env ?? { ...process.env, NO_COLOR: "1" };

  const proc = Bun.spawn([process.execPath, ADV_PATH, ...args], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

function buildDegradedEnv(emptyBinDir: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { NO_COLOR: "1" };
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() !== "path") env[key] = value;
  }
  env.PATH = emptyBinDir;
  return env;
}

describe("adv dispatcher metadata", () => {
  test("--help exits 0 and lists --json once", async () => {
    const { exitCode, stdout } = await runAdv(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("USAGE:");
    expect(stdout).toContain("epic list");
    expect(stdout).toContain("status, slop-scan; required for epic list");
    expect(stdout.match(/--json/g)).toHaveLength(1);
  });

  test("--version exits 0", async () => {
    const { exitCode, stdout } = await runAdv(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^adv v\d+\.\d+\.\d+\n$/);
  });

  test("unknown command exits 1", async () => {
    const { exitCode, stderr } = await runAdv(["nonsense"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("unknown command");
  });
});

describe("adv slop-scan dispatcher", () => {
  test(
    "--json exits 1 with parseable degraded failure when required detectors are unavailable",
    async () => {
      const tmp = mkdtempSync(join(tmpdir(), "adv-slop-scan-"));
      const emptyBin = join(tmp, "empty-bin");
      await mkdir(emptyBin, { recursive: true });
      await mkdir(join(tmp, "src"), { recursive: true });
      await writeFile(
        join(tmp, "src/app.ts"),
        "export function ok() { return 1; }\n",
      );
      const parentPath = process.env.PATH;

      try {
        const { exitCode, stdout } = await runAdv(
          ["slop-scan", "src", "--json", "--no-color"],
          { cwd: tmp, env: buildDegradedEnv(emptyBin) },
        );

        const validated = validateSlopScanReport(JSON.parse(stdout));
        expect(validated.ok).toBe(true);
        expect(exitCode).toBe(1);

        const parsed = validated.value!;
        expect(parsed.schema_version).toBe("slop_scan_report.v1");
        expect(parsed.scope.requestedPath).toBe("src");
        expect(parsed.scope.languages).toContain("typescript");
        expect(parsed.failure?.code).toBe("SLOP_SCAN_DEGRADED");

        const detectorStates = new Map(
          parsed.coverage.detectors.map((d) => [d.id, d.state]),
        );
        expect(detectorStates.get("eslint")).toBe("unavailable");
        expect(detectorStates.get("knip")).toBe("unavailable");
        expect(detectorStates.get("ast-grep")).toBe("unavailable");
        expect(detectorStates.get("jscpd")).toBe("unavailable");
        expect(
          parsed.failure!.failedDetectors.map((d) => d.id).sort(),
        ).toEqual(["ast-grep", "eslint", "jscpd", "knip"]);
        expect(parsed.summary.total).toBe(parsed.findings.length);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }

      expect(process.env.PATH).toBe(parentPath);
    },
    5000,
  );
});

describe("adv epic list dispatcher", () => {
  test("--json outputs disk Epic list payload", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-epic-list-"));
    const initProc = Bun.spawn(
      ["git", "-c", "init.defaultBranch=trunk", "init", "--quiet"],
      { cwd: tmp },
    );
    await initProc.exited;
    const commitProc = Bun.spawn(
      ["git", ...GIT_TEST_IDENTITY, "commit", "--allow-empty", "-m", "init"],
      { cwd: tmp },
    );
    await commitProc.exited;

    const { exitCode, stdout } = await runAdv(["epic", "list", "--json"], tmp);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.source).toBe("disk");
    expect(parsed.live).toBe(true);
    expect(parsed.stale).toBe(false);
    expect(typeof parsed.project_id).toBe("string");
    expect(Array.isArray(parsed.epics)).toBe(true);
  });

  test("non-json mode exits 2 with guidance", async () => {
    const { exitCode, stderr } = await runAdv(["epic", "list"]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--json");
  });

  test("unknown nested command exits 2", async () => {
    const { exitCode, stderr } = await runAdv(["epic", "create", "demo"]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("unknown command");
  });

  test("outside git repo fails closed with JSON metadata", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-epic-list-nongit-"));
    const { exitCode, stdout } = await runAdv(["epic", "list", "--json"], tmp);

    expect(exitCode).not.toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.source).toBe("disk");
    expect(parsed.live).toBe(false);
    expect(parsed.stale).toBe(false);
    expect(parsed.project_id).toBeNull();
    expect(parsed.epics).toEqual([]);
    expect(parsed.error).toContain("not in a git repo");
  });
});

describe("adv status live default", () => {
  test("status does not require a disk ADV state directory", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dispatch-"));
    // Initialize a git repo so resolveProjectId works
    const initProc = Bun.spawn(
      ["git", "-c", "init.defaultBranch=trunk", "init", "--quiet"],
      { cwd: tmp },
    );
    await initProc.exited;
    const commitProc = Bun.spawn(
      ["git", ...GIT_TEST_IDENTITY, "commit", "--allow-empty", "-m", "init"],
      { cwd: tmp },
    );
    await commitProc.exited;
    const { exitCode } = await runAdv(["status", "--no-color"], tmp);
    expect(exitCode).toBe(0);
  });

  test("status --json reports zero changes for a repo with no ADV state", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dispatch-"));
    const initProc = Bun.spawn(
      ["git", "-c", "init.defaultBranch=trunk", "init", "--quiet"],
      { cwd: tmp },
    );
    await initProc.exited;
    const commitProc = Bun.spawn(
      ["git", ...GIT_TEST_IDENTITY, "commit", "--allow-empty", "-m", "init"],
      { cwd: tmp },
    );
    await commitProc.exited;

    const proc = Bun.spawn([process.execPath, ADV_PATH, "status", "--json"], {
      cwd: tmp,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    // A git repo with no ADV state has zero changes — that is a truthful
    // result, not an error: disk projections are the sole read authority.
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.source).toBe("disk");
    expect(parsed.live).toBe(true);
    expect(parsed.stale).toBe(false);
    expect(parsed.counts.active).toBe(0);
    expect(parsed.changes).toEqual([]);
  });
});
