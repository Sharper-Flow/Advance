import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import type { Store } from "../storage/store";
import { formatToolOutput } from "../utils/tool-output";
import {
  appendTargetProjectContextOutput,
  withTargetPathStore,
} from "./target-project";

const execAsync = promisify(exec);

/**
 * Default bounded-execution limits for `adv_run_test`.
 *
 * These protect the agent session from runaway user test commands:
 *  - `DEFAULT_TEST_TIMEOUT_MS` caps wall-clock runtime via SIGTERM.
 *  - `DEFAULT_TEST_MAX_BUFFER` caps combined stdout/stderr bytes.
 *
 * Both are Node-compatible `child_process.exec` options. They are set
 * internally (not via tool schema) to keep the public tool contract
 * unchanged while still bounding execution.
 */
export const DEFAULT_TEST_TIMEOUT_MS = 30_000;
export const DEFAULT_TEST_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_OUTPUT_MAX_LENGTH = 2000;
const TRUNCATION_SUFFIX = "... (truncated)";

interface ExecBounds {
  timeoutMs?: number;
  maxBuffer?: number;
}

interface ExecError {
  stdout?: string;
  stderr?: string;
  /**
   * `code` may be a numeric exit code (e.g. `1`) or a Node error code
   * string (e.g. `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`), depending on how
   * the exec failed.
   */
  code?: number | string;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  message?: string;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  maxBufferExceeded: boolean;
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

const runCommand = async (
  command: string,
  cwd: string,
  bounds: Required<ExecBounds>,
): Promise<ExecResult> => {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: bounds.timeoutMs,
      maxBuffer: bounds.maxBuffer,
    });
    return {
      stdout,
      stderr,
      exitCode: 0,
      timedOut: false,
      maxBufferExceeded: false,
    };
  } catch (e: unknown) {
    const err = e as ExecError;
    const msg = typeof err.message === "string" ? err.message : String(err);
    const codeNum = typeof err.code === "number" ? err.code : 1;

    // Timeout classification: exec sends SIGTERM (default killSignal) on
    // timeout; `killed: true` or `signal: "SIGTERM"` both indicate it.
    const timedOut =
      err.killed === true ||
      err.signal === "SIGTERM" ||
      err.signal === "SIGKILL";

    // maxBuffer classification: surfaced either via the dedicated error
    // code `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` or an explicit "maxBuffer"
    // phrase in the message.
    const maxBufferExceeded =
      err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
      /maxBuffer/i.test(msg);

    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: codeNum,
      timedOut,
      maxBufferExceeded,
    };
  }
};

// rq-ADVEXEC01: Canonical Apply Tool Path for Inline TDD
// rq-ADVEXEC02: Apply Contract Regression Anchors
// rq-ADVEXEC03: Runtime Enforcement for Inline-TDD Bash Workarounds

export const testTools = {
  adv_run_test: {
    description:
      "Run a test command, capture the exit code, and return the result.",
    args: {
      taskId: z.string().describe("Task ID to record evidence for"),
      command: z
        .string()
        .describe("The exact shell command to run (e.g. 'npm test')"),
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
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
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
        );
      }

      const task = await store.tasks.get(args.taskId);
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

      const { stdout, stderr, exitCode, timedOut, maxBufferExceeded } =
        await runCommand(args.command, cwd, effective);

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

      const truncatedOutput = shapeCommandOutput(rawOutput, exitCode);

      return formatToolOutput({
        success: true,
        exitCode,
        output: truncatedOutput,
        command: args.command,
        timedOut,
        maxBufferExceeded,
        ...(timedOut && { timeoutMs: effective.timeoutMs }),
      });
    },
  },
};
