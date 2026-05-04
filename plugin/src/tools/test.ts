import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import type { Store } from "../storage/store";
import { truncateOutput } from "../types";
import { validateEvidenceSemantics } from "../validator/evidence";
import { createLogger } from "../utils/debug-log";
import { formatToolOutput } from "../utils/tool-output";
import {
  appendTargetProjectContextOutput,
  withTargetPathStore,
} from "./target-project";

const execAsync = promisify(exec);
const logger = createLogger("adv_run_test");

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
export const TASK_RUN_IDEMPOTENCY_OUTPUT_PREVIEW_CHARS = 64;

interface TaskRunRecordOutput {
  phase: string;
  requiredNextAction: string;
  /**
   * True when the task-run ledger already saw this idempotency key. Duplicate
   * events are ignored and the returned phase is the existing run state.
   */
  duplicate: boolean;
}

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
      "Run a test command, capture the exit code, and record durable TDD evidence for a task.",
    args: {
      taskId: z.string().describe("Task ID to record evidence for"),
      command: z
        .string()
        .describe("The exact shell command to run (e.g. 'npm test')"),
      phase: z
        .enum(["red", "green"])
        .describe("TDD phase (red=failing test, green=passing test)"),
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
        phase: "red" | "green";
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

      const maxOutputLen = 2000;
      let truncatedOutput = rawOutput;
      if (truncatedOutput.length > maxOutputLen) {
        truncatedOutput =
          truncatedOutput.substring(0, maxOutputLen) + "... (truncated)";
      }

      // Validate exit-code semantics before recording
      const validation = validateEvidenceSemantics(args.phase, exitCode);
      if (!validation.valid) {
        return formatToolOutput({
          error: `Evidence rejected: ${validation.reason}`,
          phase: args.phase,
          exitCode,
          output: truncatedOutput,
          command: args.command,
          timedOut,
          maxBufferExceeded,
          ...(timedOut && { timeoutMs: effective.timeoutMs }),
        });
      }

      const evidence = {
        recorded_at: new Date().toISOString(),
        test_file: args.command,
        command: args.command,
        exit_code: exitCode,
        output_snippet: truncateOutput(truncatedOutput),
      };

      const evidenceResult = await store.tasks.recordEvidence(
        args.taskId,
        args.phase,
        evidence,
      );

      if (args.phase === "red") {
        try {
          let run = await store.tasks.getRun(args.taskId);
          if (!run || run.phase === "not_started") {
            await store.tasks.recordRunEvent(args.taskId, {
              idempotencyKey: `${args.taskId}:auto-start:${evidence.recorded_at}`,
              type: "start",
              recordedAt: evidence.recorded_at,
              payload: { workdir: cwd },
            });
            run = await store.tasks.getRun(args.taskId);
          }
          if (run?.phase === "started") {
            await store.tasks.recordRunEvent(args.taskId, {
              idempotencyKey: `${args.taskId}:auto-baseline:${evidence.recorded_at}`,
              type: "baseline",
              recordedAt: evidence.recorded_at,
              payload: { branch: "unknown", headSha: "unknown", workdir: cwd },
            });
          }
        } catch (error) {
          // Ledger bootstrap is additive. Preserve evidence behavior if
          // the backing store rejects optional task-run bookkeeping.
          logger.debug(`task-run bootstrap skipped: ${error}`);
        }
      }

      let taskRun: TaskRunRecordOutput | undefined;
      let ledgerSkippedWarning: string | undefined;
      try {
        const recorded = await store.tasks.recordRunEvent(args.taskId, {
          idempotencyKey: `${args.taskId}:${args.phase}:${args.command}:${exitCode}:${truncatedOutput.slice(0, TASK_RUN_IDEMPOTENCY_OUTPUT_PREVIEW_CHARS)}`,
          type: args.phase === "red" ? "red_evidence" : "green_evidence",
          recordedAt: evidence.recorded_at,
          payload: {
            test_file: args.command,
            command: args.command,
            exit_code: exitCode,
            output_snippet: truncateOutput(truncatedOutput),
          },
        });
        if (recorded) {
          taskRun = {
            phase: recorded.run.phase,
            requiredNextAction: recorded.run.requiredNextAction,
            duplicate: recorded.duplicate,
          };
        }
      } catch (error) {
        // Ledger recording is additive. Preserve existing evidence behavior
        // for legacy/no-ledger callers; apply flow records task-run state in
        // the normal baseline -> red -> green order.
        // GH #30: surface the skip so agents know the ledger was not updated.
        logger.debug(`task-run evidence event skipped: ${error}`);
        ledgerSkippedWarning = `Task-run ledger not updated: ${error instanceof Error ? error.message : String(error)}. Test evidence recorded at task level; durable ledger is stale. Run adv_task_run_status to check current ledger state.`;
      }

      return formatToolOutput({
        success: true,
        exitCode,
        phase: args.phase,
        recordedPhase: evidenceResult?.task.tdd_phase,
        output: truncatedOutput,
        command: args.command,
        ...(taskRun ? { taskRun } : {}),
        ...(ledgerSkippedWarning ? { ledgerSkippedWarning } : {}),
        timedOut,
        maxBufferExceeded,
        ...(timedOut && { timeoutMs: effective.timeoutMs }),
      });
    },
  },
};
