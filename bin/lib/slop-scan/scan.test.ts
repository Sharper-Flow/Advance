import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { runSlopScan } from "./scan";
import type {
  ToolRunRequest,
  ToolRunResult,
  ToolRunner,
} from "./runner";

interface RecordedCall {
  detectorId: string;
  cwd: string;
  command: string[];
}

function makeResult(
  request: ToolRunRequest,
  status: ToolRunResult["status"],
  stdout = "",
): ToolRunResult {
  return {
    detectorId: request.detectorId,
    command: request.command,
    status,
    exitCode:
      status === "success" ? 0 : status === "unavailable" ? null : 1,
    stdout,
    stderr: "",
    durationMs: 0,
  };
}

interface FakeOptions {
  astGrep?: "success" | "unavailable";
  jscpd?: "success" | "unavailable";
}

function makeFakeRunner(opts: FakeOptions = {}): {
  runner: ToolRunner;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const runner: ToolRunner = {
    async run(request: ToolRunRequest): Promise<ToolRunResult> {
      calls.push({
        detectorId: request.detectorId,
        cwd: request.cwd,
        command: request.command,
      });

      if (request.detectorId === "ast-grep" && opts.astGrep === "unavailable") {
        return makeResult(request, "unavailable");
      }

      if (request.detectorId === "jscpd") {
        if (opts.jscpd === "unavailable") return makeResult(request, "unavailable");
        // Mirror the real adapter: jscpd writes its JSON report to the --output dir.
        const outIdx = request.command.indexOf("--output");
        const outDir = outIdx >= 0 ? request.command[outIdx + 1] : undefined;
        if (outDir) {
          await mkdir(outDir, { recursive: true });
          await writeFile(
            join(outDir, "jscpd-report.json"),
            JSON.stringify({ duplicates: [], statistics: {} }),
          );
        }
        return makeResult(request, "success");
      }

      if (request.detectorId === "knip") {
        return makeResult(request, "success", JSON.stringify({ issues: [] }));
      }

      // eslint + ast-grep(success): empty array stdout parses cleanly.
      return makeResult(request, "success", "[]");
    },
  };
  return { runner, calls };
}

describe("slop-scan detector dispatch", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "slop-scan-dispatch-"));
    await mkdir(join(repoRoot, "plugin", "src"), { recursive: true });
    await writeFile(
      join(repoRoot, "plugin", "package.json"),
      JSON.stringify({ name: "probe", type: "module" }),
    );
    await writeFile(
      join(repoRoot, "plugin", "src", "a.ts"),
      "export const a = 1;\n",
    );
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  test("routes ast-grep and jscpd through pnpm exec at the package root cwd", async () => {
    const { runner, calls } = makeFakeRunner();
    await runSlopScan({ repoRoot, requestedPath: "plugin/src/a.ts", runner });

    const packageRoot = join(repoRoot, "plugin");
    const byId = Object.fromEntries(calls.map((call) => [call.detectorId, call]));

    expect(byId["ast-grep"].cwd).toBe(packageRoot);
    expect(byId["jscpd"].cwd).toBe(packageRoot);
    expect(byId["ast-grep"].command.slice(0, 3)).toEqual([
      "pnpm",
      "exec",
      "ast-grep",
    ]);
    expect(byId["jscpd"].command.slice(0, 3)).toEqual([
      "pnpm",
      "exec",
      "jscpd",
    ]);
    // Package-local detectors already share the package root cwd.
    expect(byId["eslint"].cwd).toBe(packageRoot);
    expect(byId["knip"].cwd).toBe(packageRoot);
  });

  test("recovers a required detector from degraded to run when the tool becomes available", async () => {
    // Run 1: ast-grep unavailable -> required coverage degrades the scan.
    const degraded = makeFakeRunner({ astGrep: "unavailable", jscpd: "unavailable" });
    const degradedReport = await runSlopScan({
      repoRoot,
      requestedPath: "plugin/src/a.ts",
      runner: degraded.runner,
    });
    const degradedAstGrep = degradedReport.coverage.detectors.find(
      (detector) => detector.id === "ast-grep",
    );
    expect(degradedAstGrep?.state).toBe("unavailable");
    expect(degradedReport.failure?.code).toBe("SLOP_SCAN_DEGRADED");
    expect(
      degradedReport.failure?.failedDetectors.map((detector) => detector.id),
    ).toContain("ast-grep");

    // Run 2: ast-grep available -> the same dispatch path reports it as run.
    const recovered = makeFakeRunner({ astGrep: "success" });
    const recoveredReport = await runSlopScan({
      repoRoot,
      requestedPath: "plugin/src/a.ts",
      runner: recovered.runner,
    });
    const recoveredAstGrep = recoveredReport.coverage.detectors.find(
      (detector) => detector.id === "ast-grep",
    );
    expect(recoveredAstGrep?.state).toBe("run");
    expect(
      recoveredReport.failure?.failedDetectors.map((detector) => detector.id) ?? [],
    ).not.toContain("ast-grep");
  });
});
