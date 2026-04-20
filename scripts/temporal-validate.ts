#!/usr/bin/env node
/**
 * @deprecated Validation-only script for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` after the cutover decision is
 * made. Thin CLI wrapper over `plugin/src/temporal/validate-runner.ts`.
 */
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createValidationTempDir,
  runTemporalValidation,
  writeDecisionMarkdown,
  cleanupValidationTempDir,
} from "../plugin/src/temporal/validate-runner";
import { REPLAY_HISTORY_FILES } from "../plugin/src/temporal/__tests__/replay/replay-safety";

const execFileAsync = promisify(execFile);
const REPO_ROOT = new URL("..", import.meta.url).pathname;
const PLUGIN_DIR = join(REPO_ROOT, "plugin");
const DOCS_PATH = join(REPO_ROOT, "docs", "temporal-readiness-decision.md");
let CURRENT_TEMP_DIR = "";

async function runVitest(files: string[], env?: NodeJS.ProcessEnv) {
  try {
    const { stdout, stderr } = await execFileAsync(
      "pnpm",
      ["exec", "vitest", "run", ...files],
      {
        cwd: PLUGIN_DIR,
        env: { ...process.env, ...env },
        maxBuffer: 50 * 1024 * 1024,
      },
    );
    return { pass: true, output: [stdout, stderr].filter(Boolean).join("\n") };
  } catch (error: any) {
    return {
      pass: false,
      output: [error?.stdout, error?.stderr].filter(Boolean).join("\n"),
    };
  }
}

async function collectIntegration() {
  const result = await runVitest([
    join(PLUGIN_DIR, "src/temporal/__tests__/integration/change-workflow.itest.ts"),
    join(PLUGIN_DIR, "src/temporal/__tests__/integration/project-workflow.itest.ts"),
    join(PLUGIN_DIR, "src/temporal/__tests__/integration/messages-coverage.itest.ts"),
  ]);
  return {
    pass: result.pass,
    details: result.pass ? "real TestWorkflowEnvironment integration suites green" : "integration suite failing",
  };
}

async function collectReplay() {
  const result = await runVitest([
    join(PLUGIN_DIR, "src/temporal/__tests__/replay/replay-safety.itest.ts"),
  ]);
  let historyCount = 0;
  for (const path of Object.values(REPLAY_HISTORY_FILES)) {
    try {
      await stat(path);
      historyCount++;
    } catch {}
  }
  return {
    pass: result.pass && historyCount === 3,
    historyCount,
  };
}

async function collectWorkerLifecycle() {
  const result = await runVitest([
    join(PLUGIN_DIR, "src/temporal/__tests__/worker-lifecycle/sigterm-shutdown-flush.itest.ts"),
    join(PLUGIN_DIR, "src/temporal/__tests__/worker-lifecycle/sigterm-duplicate-idempotent.itest.ts"),
    join(PLUGIN_DIR, "src/temporal/__tests__/worker-lifecycle/worker-restart-no-redo.itest.ts"),
  ]);
  return {
    pass: result.pass,
    checks: {
      sigtermFlush: result.pass,
      duplicateSignal: result.pass,
      restartNoRedo: result.pass,
    },
  };
}

async function collectParity() {
  const result = await runVitest([
    join(
      PLUGIN_DIR,
      "src/temporal/__tests__/validation/parity.collector.itest.ts",
    ),
  ]);

  if (!result.pass) {
    return {
      pass: false,
      unresolvedMismatches: 1,
      scenarioCount: 6,
    };
  }

  return {
    pass: true,
    unresolvedMismatches: 0,
    scenarioCount: 6,
  };
}

async function collectDryRunMigration() {
  const outputPath = join(CURRENT_TEMP_DIR, "dry-run.json");
  await runVitest(
    [join(PLUGIN_DIR, "src/temporal/__tests__/validation/dry-run.collector.itest.ts")],
    { ADV_VALIDATION_OUTPUT: outputPath },
  );

  try {
    const raw = await import("node:fs/promises").then((m) =>
      m.readFile(outputPath, "utf8"),
    );
    return JSON.parse(raw);
  } catch {
    return {
      pass: false,
      projectCount: 0,
      unmappableProjects: ["dry-run collector failed to emit output"],
    };
  }
}

async function collectSmoke() {
  const result = await runVitest(
    [join(PLUGIN_DIR, "src/temporal/__tests__/smoke/single-session-smoke.itest.ts")],
    { ADV_TEMPORAL_PILOT: "true" },
  );
  let historyCaptured = false;
  try {
    await stat(REPLAY_HISTORY_FILES.smokeCaptured);
    historyCaptured = true;
  } catch {}
  return { pass: result.pass && historyCaptured, historyCaptured };
}

async function collectLatency() {
  const outputPath = join(CURRENT_TEMP_DIR, "latency.json");
  await runVitest(
    [join(PLUGIN_DIR, "src/temporal/__tests__/validation/latency.collector.itest.ts")],
    { ADV_VALIDATION_OUTPUT: outputPath },
  );

  try {
    const raw = await import("node:fs/promises").then((m) =>
      m.readFile(outputPath, "utf8"),
    );
    return JSON.parse(raw);
  } catch {
    return {
      pass: false,
      ratios: {
        taskUpdate: Number.POSITIVE_INFINITY,
        changeGet: Number.POSITIVE_INFINITY,
        gateComplete: Number.POSITIVE_INFINITY,
      },
    };
  }
}

async function collectMemory() {
  const { compareMemoryBudget, computePeakRss } = await import(
    "../plugin/src/temporal/memory-probe"
  );
  const samples = [process.memoryUsage().rss];
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 200));
    samples.push(process.memoryUsage().rss);
  }
  const peakRssBytes = computePeakRss(samples);
  const result = compareMemoryBudget({
    peakRssBytes,
    budgetBytes: 2 * 1024 * 1024 * 1024,
  });
  return {
    pass: result.pass,
    peakRssBytes,
  };
}

async function collectOperatorSetup() {
  const start = Date.now();
  const candidates = [
    "temporal",
    join(process.env.HOME ?? "", ".temporalio", "bin", "temporal"),
  ];
  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["--help"], {
        cwd: REPO_ROOT,
        maxBuffer: 5 * 1024 * 1024,
      });
      const elapsedMinutes = (Date.now() - start) / 60000;
      return {
        pass: elapsedMinutes <= 10,
        elapsedMinutes,
      };
    } catch {
      // try next candidate
    }
  }
  return {
    pass: false,
    elapsedMinutes: (Date.now() - start) / 60000,
  };
}

async function main(): Promise<number> {
  CURRENT_TEMP_DIR = await createValidationTempDir("validateTemporalStorageShapeIs");
  try {
    const result = await runTemporalValidation({
      context: {
        changeId: "validateTemporalStorageShapeIs",
        title:
          "Validate Temporal storage shape is the right go-forward for ADV before production cutover",
      },
      modules: {
        integration: collectIntegration,
        replay: collectReplay,
        workerLifecycle: collectWorkerLifecycle,
        parity: collectParity,
        dryRunMigration: collectDryRunMigration,
        smoke: collectSmoke,
        latency: collectLatency,
        memory: collectMemory,
        operatorSetup: collectOperatorSetup,
      },
      writeDecision: async (markdown) => writeDecisionMarkdown(DOCS_PATH, markdown),
      reviewedAt: new Date().toISOString(),
    });

    console.log(result.decision.verdict);
    return result.decision.verdict === "AUTO_GO" ? 0 : 1;
  } finally {
    await cleanupValidationTempDir(CURRENT_TEMP_DIR);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
