import { z } from "zod";
import { spawn, type ChildProcess } from "child_process";
import type { Store } from "../storage/store";
import { formatToolOutput } from "../utils/tool-output";
import { recordPhaseDuration, withRecordedPhase } from "../utils/metrics";
import {
  appendTargetProjectContextOutput,
  withTargetPathStore,
} from "./target-project";

/**
 * Default bounded-execution limits for `adv_run_test`.
 *
 * These protect the agent session from runaway user test commands:
 *  - `DEFAULT_TEST_TIMEOUT_MS` caps wall-clock runtime via SIGTERM.
 *  - `DEFAULT_TEST_MAX_BUFFER` caps combined stdout/stderr bytes.
 *
 * Both are internal streaming-runner limits (not public tool schema fields)
 * that preserve shell execution while bounding runaway subprocesses.
 */
export const DEFAULT_TEST_TIMEOUT_MS = 30_000;
export const DEFAULT_TEST_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_OUTPUT_MAX_LENGTH = 2000;
const TRUNCATION_SUFFIX = "... (truncated)";
const ADV_RUN_TEST_PHASES = ["red", "green", "verify"] as const;
type AdvRunTestPhase = (typeof ADV_RUN_TEST_PHASES)[number];

interface ExecBounds {
  timeoutMs?: number;
  maxBuffer?: number;
}

type TestClassification =
  | "passed"
  | "failed"
  | "timed_out"
  | "output_limit"
  | "spawn_error";

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  maxBufferExceeded: boolean;
  outputBytesSeen: number;
  durationMs: number;
  spawnError?: string;
}

const FAILURE_LINE =
  /\b(?:fail(?:ed|ure|ures)?|error|exception|assert(?:ion)?|expected|received)\b|\b[\w./-]+:\d+:\d+\b|\bat\s+.*:\d+:\d+\b/i;
const SUMMARY_LINE =
  /\b(?:tests?|test files?|passed|failed|skipped|duration|time|pass|ok)\b/i;

const appendUnique = (target: string[], seen: Set<string>, lines: string[]) => {
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    target.push(line);
  }
};

const withTruncationSuffix = (output: string, maxLength: number): string => {
  if (output.length > maxLength) {
    return output.slice(0, maxLength) + TRUNCATION_SUFFIX;
  }
  return `${output}\n${TRUNCATION_SUFFIX}`;
};

/**
 * Shape noisy command output for agent consumption without changing the
 * `adv_run_test` API. Keep output bounded, but prefer high-signal failure or
 * summary lines plus tail context over raw head-only truncation.
 */
export const shapeCommandOutput = (
  rawOutput: string,
  exitCode: number,
  maxOutputLen = DEFAULT_OUTPUT_MAX_LENGTH,
): string => {
  if (rawOutput.length <= maxOutputLen) return rawOutput;

  const lines = rawOutput.split(/\r?\n/);
  const diagnosticLines = lines.filter((line) =>
    line.startsWith("[adv_run_test]"),
  );
  const bodyLines = lines.filter((line) => !line.startsWith("[adv_run_test]"));
  const signalPattern = exitCode === 0 ? SUMMARY_LINE : FAILURE_LINE;
  const signalLines = bodyLines.filter((line) => signalPattern.test(line));
  const selectedSignalLines =
    exitCode === 0 ? signalLines.slice(-12) : signalLines.slice(-24);
  const tailLines = bodyLines.slice(-20);

  const shapedLines: string[] = [
    "[adv_run_test] Output truncated; showing high-signal lines.",
  ];
  const seen = new Set<string>();
  appendUnique(shapedLines, seen, diagnosticLines);

  if (selectedSignalLines.length > 0) {
    shapedLines.push(exitCode === 0 ? "[summary]" : "[diagnostics]");
    appendUnique(shapedLines, seen, selectedSignalLines);
  }

  shapedLines.push("[tail]");
  appendUnique(shapedLines, seen, tailLines);

  return withTruncationSuffix(shapedLines.join("\n"), maxOutputLen);
};

const killSubprocess = (child: ChildProcess, signal: NodeJS.Signals): void => {
  if (child.pid === undefined) return;

  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
    // Fall back to killing the shell process below. ESRCH is benign when the
    // process exited between timeout/output-limit detection and kill delivery.
  }

  try {
    child.kill(signal);
  } catch {
    // Best-effort cleanup; close/error handlers still classify the run.
  }
};

const classifyRun = (run: ExecResult): TestClassification => {
  if (run.spawnError) return "spawn_error";
  if (run.timedOut) return "timed_out";
  if (run.maxBufferExceeded) return "output_limit";
  return run.exitCode === 0 ? "passed" : "failed";
};

const runCommand = async (
  command: string,
  cwd: string,
  bounds: Required<ExecBounds>,
): Promise<ExecResult> => {
  const startedAt = performance.now();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let retainedBytes = 0;
  let outputBytesSeen = 0;
  let timedOut = false;
  let maxBufferExceeded = false;
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let hardKillTimeout: ReturnType<typeof setTimeout> | undefined;

  const appendChunk = (target: Buffer[], chunk: Buffer): void => {
    outputBytesSeen += chunk.length;
    if (maxBufferExceeded) return;

    const remaining = bounds.maxBuffer - retainedBytes;
    if (remaining <= 0) {
      maxBufferExceeded = true;
      return;
    }

    if (chunk.length <= remaining) {
      target.push(chunk);
      retainedBytes += chunk.length;
      return;
    }

    target.push(chunk.subarray(0, remaining));
    retainedBytes += remaining;
    maxBufferExceeded = true;
  };

  return await new Promise<ExecResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, {
        cwd,
        shell: true,
        detached: process.platform !== "win32",
        windowsHide: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolve({
        stdout: "",
        stderr: message,
        exitCode: 1,
        signal: null,
        timedOut: false,
        maxBufferExceeded: false,
        outputBytesSeen: 0,
        durationMs: performance.now() - startedAt,
        spawnError: message,
      });
      return;
    }

    const finish = (result: Omit<ExecResult, "durationMs">): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (hardKillTimeout) clearTimeout(hardKillTimeout);
      resolve({ ...result, durationMs: performance.now() - startedAt });
    };

    const requestKill = (signal: NodeJS.Signals): void => {
      killSubprocess(child, signal);
      hardKillTimeout ??= setTimeout(() => {
        killSubprocess(child, "SIGKILL");
      }, 1000);
    };

    const onData =
      (target: Buffer[]) =>
      (chunk: Buffer | string): void => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        appendChunk(target, buffer);
        if (maxBufferExceeded) requestKill("SIGTERM");
      };

    child.stdout?.on("data", onData(stdoutChunks));
    child.stderr?.on("data", onData(stderrChunks));

    timeout = setTimeout(() => {
      timedOut = true;
      requestKill("SIGTERM");
    }, bounds.timeoutMs);

    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      finish({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: [Buffer.concat(stderrChunks).toString("utf8"), message]
          .filter(Boolean)
          .join("\n"),
        exitCode: 1,
        signal: null,
        timedOut,
        maxBufferExceeded,
        outputBytesSeen,
        spawnError: message,
      });
    });

    child.on("close", (code, signal) => {
      finish({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code ?? 1,
        signal,
        timedOut,
        maxBufferExceeded,
        outputBytesSeen,
      });
    });
  });
};

// rq-ADVEXEC01: Canonical Apply Tool Path for Inline TDD
// rq-ADVEXEC02: Apply Contract Regression Anchors
// rq-ADVEXEC03: Runtime Enforcement for Inline-TDD Bash Workarounds
// rq-advRunTestLatency01 (advance-meta v1.12): substep telemetry MUST be
// recorded for targetRouting, taskLookup, commandExecution, and
// outputShaping while preserving shell-command semantics, timeout/
// maxBuffer classification, exit-code reporting, and output shaping.

export const testTools = {
  adv_run_test: {
    description:
      "Run a test command, capture the exit code, and return typed pass/fail evidence with bounded output.",
    args: {
      taskId: z.string().describe("Task ID to record evidence for"),
      command: z
        .string()
        .describe("The exact shell command to run (e.g. 'npm test')"),
      phase: z
        .enum(ADV_RUN_TEST_PHASES)
        .optional()
        .describe(
          "Optional descriptive TDD phase metadata. Does not gate task completion; use 'red', 'green', or 'verify'.",
        ),
      workdir: z
        .string()
        .optional()
        .describe("Working directory to run the test in"),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(300_000)
        .optional()
        .describe(
          "Optional wall-clock timeout in milliseconds. Default 30000. Range [1000, 300000]. Use a higher value for slow commands like full test suites or `pnpm run check` (cap 5min anti-runaway).",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, records evidence in that project through a Temporal-backed target store.",
        ),
      target_confirmed: z.literal(true).optional(),
      confirmationEvidence: z.string().optional(),
    },
    execute: async (
      args: {
        taskId: string;
        command: string;
        phase?: AdvRunTestPhase;
        workdir?: string;
        timeoutMs?: number;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
      defaultWorkdir: string,
      bounds?: ExecBounds,
    ): Promise<string> => {
      if (args.target_path) {
        const targetPath = args.target_path;
        return withRecordedPhase("adv_run_test", "targetRouting", async () =>
          withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path: targetPath,
              stateRequirement: "temporal-required",
              target_confirmed: args.target_confirmed,
              confirmationEvidence: args.confirmationEvidence,
            },
            async ({ context, store: targetStore }): Promise<string> => {
              const output: string = await testTools.adv_run_test.execute(
                { ...args, target_path: undefined },
                targetStore,
                args.workdir ?? context.root,
                bounds,
              );
              return appendTargetProjectContextOutput(output, context);
            },
          ),
        );
      }

      const task = await withRecordedPhase(
        "adv_run_test",
        "taskLookup",
        async () => store.tasks.get(args.taskId),
      );
      if (!task) {
        return formatToolOutput({ error: `Task not found: ${args.taskId}` });
      }

      const cwd = args.workdir || defaultWorkdir;
      // Precedence: tool arg (caller-controlled) > internal bounds > default.
      // Tool arg is schema-validated to [1000, 300_000] ms; internal bounds is
      // an unrestricted seam for tests; default protects against runaway when
      // neither is provided.
      const effective: Required<ExecBounds> = {
        timeoutMs:
          args.timeoutMs ?? bounds?.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
        maxBuffer: bounds?.maxBuffer ?? DEFAULT_TEST_MAX_BUFFER,
      };

      const run = await runCommand(args.command, cwd, effective);
      const {
        stdout,
        stderr,
        exitCode,
        timedOut,
        maxBufferExceeded,
        durationMs,
      } = run;
      const classification = classifyRun(run);
      const passed = classification === "passed";
      recordPhaseDuration({
        tool: "adv_run_test",
        phase: "commandExecution",
        durationMs,
        outcome: passed ? "success" : "error",
      });

      let rawOutput = `${stdout}\n${stderr}`.trim();
      if (timedOut) {
        rawOutput = [
          `[adv_run_test] Command timed out after ${effective.timeoutMs}ms: ${args.command}`,
          rawOutput,
        ]
          .filter(Boolean)
          .join("\n");
      } else if (maxBufferExceeded) {
        rawOutput = [
          `[adv_run_test] Command exceeded maxBuffer (${effective.maxBuffer} bytes): ${args.command}`,
          rawOutput,
        ]
          .filter(Boolean)
          .join("\n");
      }

      const truncatedOutput = await withRecordedPhase(
        "adv_run_test",
        "outputShaping",
        async () => shapeCommandOutput(rawOutput, exitCode),
      );
      const outputBytesSeen = Math.max(
        run.outputBytesSeen,
        Buffer.byteLength(rawOutput, "utf8"),
      );
      const outputBytesRetained = Buffer.byteLength(truncatedOutput, "utf8");
      const outputTruncated = rawOutput !== truncatedOutput;

      return formatToolOutput({
        success: true,
        passed,
        classification,
        durationMs,
        outputBytesSeen,
        outputBytesRetained,
        outputTruncated,
        executionMode: "shell",
        exitCode,
        output: truncatedOutput,
        command: args.command,
        ...(args.phase && { phase: args.phase }),
        timedOut,
        maxBufferExceeded,
        evidence: {
          schema_version: "adv_run_test.v1",
          command: args.command,
          exitCode,
          passed,
          classification,
          durationMs,
        },
        ...(timedOut && { timeoutMs: effective.timeoutMs }),
      });
    },
  },
};
