import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { partitionEslintTargets, runSlopScan } from "./scan";
import type { ToolRunRequest, ToolRunResult, ToolRunner } from "./runner";

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
    exitCode: status === "success" ? 0 : status === "unavailable" ? null : 1,
    stdout,
    stderr: "",
    durationMs: 0,
  };
}

interface FakeOptions {
  astGrep?: "success" | "unavailable";
  jscpd?: "success" | "unavailable";
  failEslintTarget?: string;
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
        if (opts.jscpd === "unavailable")
          return makeResult(request, "unavailable");
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

      if (
        request.detectorId === "eslint" &&
        opts.failEslintTarget &&
        request.command.at(-1) === opts.failEslintTarget
      ) {
        return makeResult(request, "failed");
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
    await writeFile(
      join(repoRoot, "plugin", "eslint.config.js"),
      "export default [];\n",
    );
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  test("routes ast-grep and jscpd through pnpm exec at the package root cwd", async () => {
    const { runner, calls } = makeFakeRunner();
    await runSlopScan({ repoRoot, requestedPath: "plugin/src/a.ts", runner });

    const packageRoot = join(repoRoot, "plugin");
    const byId = Object.fromEntries(
      calls.map((call) => [call.detectorId, call]),
    );

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
    expect(byId["eslint"].command.at(-1)).toBe(
      join(repoRoot, "plugin", "src", "a.ts"),
    );
    expect(byId["knip"].cwd).toBe(packageRoot);
  });

  test("recovers a required detector from degraded to run when the tool becomes available", async () => {
    // Run 1: ast-grep unavailable -> required coverage degrades the scan.
    const degraded = makeFakeRunner({
      astGrep: "unavailable",
      jscpd: "unavailable",
    });
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
      recoveredReport.failure?.failedDetectors.map((detector) => detector.id) ??
        [],
    ).not.toContain("ast-grep");
  });

  test("routes pnpm exec to auto-detected nested package when requestedPath is repo root", async () => {
    // repoRoot has plugin/package.json + plugin/src/a.ts (from beforeEach); no root package.json.
    // Default-`.` invocation must descend into plugin/ to find the package root.
    const { runner, calls } = makeFakeRunner();
    const report = await runSlopScan({ repoRoot, requestedPath: ".", runner });

    const packageRoot = join(repoRoot, "plugin");
    const byId = Object.fromEntries(
      calls.map((call) => [call.detectorId, call]),
    );

    expect(byId["eslint"].cwd).toBe(packageRoot);
    expect(byId["knip"].cwd).toBe(packageRoot);
    expect(byId["ast-grep"].cwd).toBe(packageRoot);
    expect(byId["jscpd"].cwd).toBe(packageRoot);
    // All detectors succeeded via the fake runner; no SLOP_SCAN_DEGRADED.
    expect(report.failure).toBeUndefined();
  });

  test("partitions a repo-root target before invoking eslint", async () => {
    await mkdir(join(repoRoot, "bin", "src"), { recursive: true });
    await writeFile(
      join(repoRoot, "bin", "src", "b.ts"),
      "export const b = 2;\n",
    );

    const partition = await partitionEslintTargets(repoRoot, repoRoot);
    expect(partition).toEqual({
      covered: [
        {
          configRoot: join(repoRoot, "plugin"),
          target: join(repoRoot, "plugin"),
        },
      ],
      // Collapses to the shallowest unlinted directory rather than listing
      // every unlinted file beneath it — one coverage entry per region.
      uncovered: [join(repoRoot, "bin")],
    });

    const { runner, calls } = makeFakeRunner();
    const report = await runSlopScan({ repoRoot, requestedPath: ".", runner });
    const eslintCalls = calls.filter((call) => call.detectorId === "eslint");

    expect(eslintCalls).toHaveLength(1);
    expect(eslintCalls[0]?.command.at(-1)).toBe(join(repoRoot, "plugin"));
    expect(
      report.coverage.detectors.find((detector) => detector.id === "eslint")
        ?.state,
    ).toBe("run");

    const uncovered = report.coverage.detectors.find(
      (detector) => detector.id === "eslint:bin",
    );
    expect(uncovered).toMatchObject({
      id: "eslint:bin",
      important: false,
      state: "unavailable",
    });
    expect(uncovered?.reason).toBe(
      "no eslint.config.* reachable from bin; region not linted",
    );

    // Region collapse must not fan out to per-file entries.
    const eslintEntries = report.coverage.detectors.filter((detector) =>
      detector.id.startsWith("eslint:"),
    );
    expect(eslintEntries).toHaveLength(1);
  });

  test("finds covered regions below config-less intermediate directories and reports loose source files", async () => {
    await mkdir(join(repoRoot, "packages", "nested", "src"), {
      recursive: true,
    });
    await writeFile(
      join(repoRoot, "packages", "nested", "src", "index.ts"),
      "export const nested = 1;\n",
    );
    await writeFile(
      join(repoRoot, "packages", "nested", "eslint.config.js"),
      "export default [];\n",
    );
    await writeFile(
      join(repoRoot, "root-source.ts"),
      "export const root = 1;\n",
    );

    const partition = await partitionEslintTargets(repoRoot, repoRoot);
    expect(partition).toEqual({
      covered: [
        {
          configRoot: join(repoRoot, "packages", "nested"),
          target: join(repoRoot, "packages", "nested"),
        },
        {
          configRoot: join(repoRoot, "plugin"),
          target: join(repoRoot, "plugin"),
        },
      ],
      uncovered: [join(repoRoot, "root-source.ts")],
    });
  });

  test("fails closed when every eslint region is uncovered", async () => {
    const uncoveredRepo = await mkdtemp(
      join(tmpdir(), "slop-scan-eslint-uncovered-"),
    );
    try {
      await mkdir(join(uncoveredRepo, "bin", "src"), { recursive: true });
      await writeFile(
        join(uncoveredRepo, "package.json"),
        JSON.stringify({ name: "uncovered", type: "module" }),
      );
      await writeFile(
        join(uncoveredRepo, "bin", "src", "a.ts"),
        "export const a = 1;\n",
      );

      const { runner } = makeFakeRunner();
      const report = await runSlopScan({
        repoRoot: uncoveredRepo,
        requestedPath: ".",
        runner,
      });
      const eslint = report.coverage.detectors.filter(
        (detector) => detector.id === "eslint",
      );

      expect(eslint).toHaveLength(1);
      expect(eslint[0]).toMatchObject({
        id: "eslint",
        important: true,
        state: "unavailable",
        reason: "no eslint.config.* reachable from any region under .",
      });
      expect(report.failure?.code).toBe("SLOP_SCAN_DEGRADED");
    } finally {
      await rm(uncoveredRepo, { recursive: true, force: true });
    }
  });

  test("emits one primary eslint coverage entry across multiple covered regions", async () => {
    const multiRegionRepo = await mkdtemp(
      join(tmpdir(), "slop-scan-eslint-regions-"),
    );
    try {
      await writeFile(
        join(multiRegionRepo, "package.json"),
        JSON.stringify({ name: "multi-region", type: "module" }),
      );
      for (const region of ["one", "two"]) {
        await mkdir(join(multiRegionRepo, "packages", region, "src"), {
          recursive: true,
        });
        await writeFile(
          join(multiRegionRepo, "packages", region, "src", "index.ts"),
          `export const ${region} = 1;\n`,
        );
        await writeFile(
          join(multiRegionRepo, "packages", region, "eslint.config.js"),
          "export default [];\n",
        );
      }

      const { runner } = makeFakeRunner();
      const report = await runSlopScan({
        repoRoot: multiRegionRepo,
        requestedPath: "packages",
        runner,
      });

      expect(
        report.coverage.detectors.filter(
          (detector) => detector.id === "eslint",
        ),
      ).toHaveLength(1);
      expect(
        report.coverage.detectors.filter((detector) =>
          detector.id.startsWith("eslint:"),
        ),
      ).toHaveLength(0);
    } finally {
      await rm(multiRegionRepo, { recursive: true, force: true });
    }
  });

  test("preserves a failed covered region instead of reporting eslint as complete", async () => {
    const multiRegionRepo = await mkdtemp(
      join(tmpdir(), "slop-scan-eslint-partial-failure-"),
    );
    try {
      await writeFile(
        join(multiRegionRepo, "package.json"),
        JSON.stringify({ name: "multi-region", type: "module" }),
      );
      for (const region of ["one", "two"]) {
        await mkdir(join(multiRegionRepo, "packages", region, "src"), {
          recursive: true,
        });
        await writeFile(
          join(multiRegionRepo, "packages", region, "src", "index.ts"),
          `export const ${region} = 1;\n`,
        );
        await writeFile(
          join(multiRegionRepo, "packages", region, "eslint.config.js"),
          "export default [];\n",
        );
      }

      const failedTarget = join(multiRegionRepo, "packages", "two");
      const { runner } = makeFakeRunner({ failEslintTarget: failedTarget });
      const report = await runSlopScan({
        repoRoot: multiRegionRepo,
        requestedPath: "packages",
        runner,
      });

      expect(report.coverage.detectors).toContainEqual(
        expect.objectContaining({
          id: "eslint:packages/two",
          state: "failed",
          important: true,
        }),
      );
      expect(report.failure?.code).toBe("SLOP_SCAN_DEGRADED");
    } finally {
      await rm(multiRegionRepo, { recursive: true, force: true });
    }
  });

  test("fails with actionable error when multiple nested package.json roots exist", async () => {
    // Separate repo with two nested packages so the resolver cannot pick deterministically.
    const multiRepo = await mkdtemp(join(tmpdir(), "slop-scan-multi-"));
    try {
      await mkdir(join(multiRepo, "plugin", "src"), { recursive: true });
      await writeFile(
        join(multiRepo, "plugin", "package.json"),
        JSON.stringify({ name: "plugin-pkg", type: "module" }),
      );
      await writeFile(
        join(multiRepo, "plugin", "src", "a.ts"),
        "export const a = 1;\n",
      );
      await mkdir(join(multiRepo, "other-pkg", "src"), { recursive: true });
      await writeFile(
        join(multiRepo, "other-pkg", "package.json"),
        JSON.stringify({ name: "other-pkg", type: "module" }),
      );
      await writeFile(
        join(multiRepo, "other-pkg", "src", "b.ts"),
        "export const b = 2;\n",
      );

      const { runner } = makeFakeRunner();
      const report = await runSlopScan({
        repoRoot: multiRepo,
        requestedPath: ".",
        runner,
      });

      // Required coverage degrades with an actionable ambiguity message.
      expect(report.failure?.code).toBe("SLOP_SCAN_DEGRADED");
      expect(report.failure?.message ?? "").toContain("plugin");
      expect(report.failure?.message ?? "").toContain("other-pkg");
      // Each applicable required detector is marked failed with the ambiguity reason.
      const requiredDetectors = report.coverage.detectors.filter(
        (d) => d.important,
      );
      expect(requiredDetectors.length).toBeGreaterThan(0);
      for (const detector of requiredDetectors) {
        expect(detector.state).toBe("failed");
      }
    } finally {
      await rm(multiRepo, { recursive: true, force: true });
    }
  });

  test("preserves walk-up behavior when requestedPath is inside a package subdirectory", async () => {
    // Sanity check: walk-up still wins over descent. A path inside plugin/ must resolve to plugin/,
    // not be re-routed through the descent path.
    const { runner, calls } = makeFakeRunner();
    await runSlopScan({ repoRoot, requestedPath: "plugin/src/a.ts", runner });

    const packageRoot = join(repoRoot, "plugin");
    const byId = Object.fromEntries(
      calls.map((call) => [call.detectorId, call]),
    );

    expect(byId["eslint"].cwd).toBe(packageRoot);
    expect(byId["knip"].cwd).toBe(packageRoot);
  });
});
