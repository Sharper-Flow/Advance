/**
 * Bun tests for bin/adv CLI dispatcher
 *
 * Run with: bun test bin/adv.test.ts
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const ADV_PATH = join(import.meta.dir, "adv");
const GIT_TEST_IDENTITY = [
  "-c",
  "user.name=ADV Test",
  "-c",
  "user.email=adv-test@example.invalid",
];

function makeSnapshot() {
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

async function runAdv(
  args: string[],
  cwd?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", ADV_PATH, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

describe("adv dispatcher metadata", () => {
  test("--help exits 0 and lists --json once", async () => {
    const { exitCode, stdout } = await runAdv(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("USAGE:");
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

describe("adv roadmap dispatcher", () => {
  test("exit 0 with valid snapshot", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dispatch-"));
    await mkdir(join(tmp, ".adv"), { recursive: true });
    await writeFile(
      join(tmp, ".adv/roadmap-snapshot.json"),
      JSON.stringify(makeSnapshot()),
    );
    const { exitCode, stdout } = await runAdv(["roadmap", "--no-color"], tmp);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Roadmap (source: file");
    expect(stdout).toContain("Test feature");
  });

  test("exit 2 when snapshot missing", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dispatch-"));
    const { exitCode, stderr } = await runAdv(["roadmap", "--no-color"], tmp);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
    expect(stderr).toContain("/adv-triage");
  });

  test("--json outputs JSON with annotation marker", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dispatch-"));
    await mkdir(join(tmp, ".adv"), { recursive: true });
    await writeFile(
      join(tmp, ".adv/roadmap-snapshot.json"),
      JSON.stringify(makeSnapshot()),
    );
    const { exitCode, stdout } = await runAdv(
      ["roadmap", "--no-color", "--json"],
      tmp,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.active_change_annotation).toBe("unavailable_cli_file_mode");
    expect(parsed.features).toHaveLength(1);
  });

  test("invalid --kind exits 2", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dispatch-"));
    await mkdir(join(tmp, ".adv"), { recursive: true });
    await writeFile(
      join(tmp, ".adv/roadmap-snapshot.json"),
      JSON.stringify(makeSnapshot()),
    );
    const { exitCode, stderr } = await runAdv(
      ["roadmap", "--no-color", "--kind", "oops"],
      tmp,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("invalid --kind");
  });

  test("invalid --priority exits 2", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dispatch-"));
    await mkdir(join(tmp, ".adv"), { recursive: true });
    await writeFile(
      join(tmp, ".adv/roadmap-snapshot.json"),
      JSON.stringify(makeSnapshot()),
    );
    const { exitCode, stderr } = await runAdv(
      ["roadmap", "--no-color", "--priority", "urgent"],
      tmp,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("invalid --priority");
  });

  test("invalid --top exits 2", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dispatch-"));
    await mkdir(join(tmp, ".adv"), { recursive: true });
    await writeFile(
      join(tmp, ".adv/roadmap-snapshot.json"),
      JSON.stringify(makeSnapshot()),
    );
    const { exitCode, stderr } = await runAdv(
      ["roadmap", "--no-color", "--top", "abc"],
      tmp,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("invalid --top");
  });
});

describe("adv slop-scan dispatcher", () => {
  test("--json outputs typed report with detector coverage", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-slop-scan-"));
    await mkdir(join(tmp, "src"), { recursive: true });
    await writeFile(join(tmp, "src/app.ts"), "export function ok() { return 1; }\n");

    const { exitCode, stdout } = await runAdv(["slop-scan", "src", "--json", "--no-color"], tmp);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.schema_version).toBe("slop_scan_report.v1");
    expect(parsed.scope.requestedPath).toBe("src");
    expect(parsed.scope.languages).toContain("typescript");
    expect(parsed.coverage.detectors.length).toBeGreaterThan(0);
    expect(parsed.summary.total).toBe(parsed.findings.length);
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

  test("status --json failure reports live Temporal error without disk fallback", async () => {
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

    const proc = Bun.spawn(["bun", ADV_PATH, "status", "--json"], {
      cwd: tmp,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NO_COLOR: "1",
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:1",
        ADV_STATUS_TIMEOUT_MS: "250",
      },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout);
    expect(parsed.source).toBe("temporal");
    expect(parsed.live).toBe(false);
    expect(parsed.stale).toBe(false);
    expect(parsed.remediation).toContain("Temporal");
    expect(parsed.changes).toEqual([]);
  });
});
