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
  // Honest current state: real parity execution not yet wired into the CLI path.
  // This intentionally yields AMBIGUOUS and is the subject of tk-9ed5kt7O.
  return {
    pass: false,
    unresolvedMismatches: 0,
    scenarioCount: 6,
  };
}

async function collectDryRunMigration() {
  // Honest current state: project sweep scaffold exists, but per-project import +
  // parity execution is not yet wired into the CLI path.
  return {
    pass: false,
    projectCount: 0,
    unmappableProjects: ["dry-run migrator not yet wired into CLI"],
  };
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
  return {
    pass: false,
    ratios: {
      taskUpdate: Number.POSITIVE_INFINITY,
      changeGet: Number.POSITIVE_INFINITY,
      gateComplete: Number.POSITIVE_INFINITY,
    },
  };
}

async function collectMemory() {
  return {
    pass: false,
    peakRssBytes: 0,
  };
}

async function collectOperatorSetup() {
  try {
    const start = Date.now();
    await execFileAsync("temporal", ["--help"], {
      cwd: REPO_ROOT,
      maxBuffer: 5 * 1024 * 1024,
    });
    return {
      pass: true,
      elapsedMinutes: (Date.now() - start) / 60000,
    };
  } catch {
    return {
      pass: false,
      elapsedMinutes: 0,
    };
  }
}

async function main(): Promise<number> {
  const tempDir = await createValidationTempDir("validateTemporalStorageShapeIs");
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
    await cleanupValidationTempDir(tempDir);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
