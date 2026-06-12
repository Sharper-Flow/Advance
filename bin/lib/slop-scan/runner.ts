/** adv CLI — bounded slop detector command runner */

import type { DetectorCoverage } from "./schema";

export type ToolExecutionStatus =
  | "success"
  | "findings"
  | "failed"
  | "timed_out"
  | "unavailable";

export interface ToolRunRequest {
  detectorId: string;
  command: string[];
  cwd: string;
  timeoutMs: number;
  findingsExitCodes?: number[];
}

export interface ToolRunResult {
  detectorId: string;
  command: string[];
  status: ToolExecutionStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
}

export interface ToolRunner {
  run(request: ToolRunRequest): Promise<ToolRunResult>;
}

const OUTPUT_LIMIT = 200_000;

function bounded(text: string): string {
  if (text.length <= OUTPUT_LIMIT) return text;
  return `${text.slice(0, OUTPUT_LIMIT)}\n[truncated]`;
}

function classifyExitCode(exitCode: number, findingsExitCodes: number[]): ToolExecutionStatus {
  if (exitCode === 0) return "success";
  if (findingsExitCodes.includes(exitCode)) return "findings";
  return "failed";
}

export function createToolRunner(): ToolRunner {
  return {
    async run(request: ToolRunRequest): Promise<ToolRunResult> {
      const started = Date.now();
      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn(request.command, {
          cwd: request.cwd,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
      } catch (err) {
        return {
          detectorId: request.detectorId,
          command: request.command,
          status: "unavailable",
          exitCode: null,
          stdout: "",
          stderr: "",
          durationMs: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, request.timeoutMs);

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      clearTimeout(timeout);

      if (timedOut) {
        return {
          detectorId: request.detectorId,
          command: request.command,
          status: "timed_out",
          exitCode: null,
          stdout: bounded(stdout),
          stderr: bounded(stderr),
          durationMs: Date.now() - started,
        };
      }

      return {
        detectorId: request.detectorId,
        command: request.command,
        status: classifyExitCode(exitCode, request.findingsExitCodes ?? []),
        exitCode,
        stdout: bounded(stdout),
        stderr: bounded(stderr),
        durationMs: Date.now() - started,
      };
    },
  };
}

export function normalizeCoverageFromExecution(
  id: string,
  label: string,
  result: ToolRunResult,
  important = true,
): DetectorCoverage {
  const state =
    result.status === "success" || result.status === "findings"
      ? "run"
      : result.status;

  return {
    id,
    label,
    state,
    important,
    command: result.command.join(" "),
    reason:
      result.status === "success"
        ? "completed with no findings"
        : result.status === "findings"
          ? "completed with findings"
          : result.error || result.stderr || result.status,
  };
}
