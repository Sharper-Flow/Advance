import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import type { Store } from "../storage/store";
import { truncateOutput } from "../types";
import { formatToolOutput } from "../utils/tool-output";

const execAsync = promisify(exec);

export const testTools = {
  adv_run_test: {
    description:
      "Run a test command, capture the exit code, and record it as TDD evidence for a task.",
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
    },
    execute: async (
      args: {
        taskId: string;
        command: string;
        phase: "red" | "green";
        workdir?: string;
      },
      store: Store,
      defaultWorkdir: string,
    ) => {
      const task = await store.tasks.get(args.taskId);
      if (!task) {
        return formatToolOutput({ error: `Task not found: ${args.taskId}` });
      }

      const cwd = args.workdir || defaultWorkdir;
      let output = "";
      let exitCode = 0;

      try {
        const { stdout, stderr } = await execAsync(args.command, { cwd });
        output = stdout + "\n" + stderr;
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; code?: number };
        output = (err.stdout || "") + "\n" + (err.stderr || "");
        exitCode = err.code || 1;
      }

      const maxOutputLen = 2000;
      let truncatedOutput = output.trim();
      if (truncatedOutput.length > maxOutputLen) {
        truncatedOutput =
          truncatedOutput.substring(0, maxOutputLen) + "... (truncated)";
      }

      const evidence = {
        recorded_at: new Date().toISOString(),
        test_file: args.command,
        command: args.command,
        exit_code: exitCode,
        output_snippet: truncateOutput(truncatedOutput),
      };

      const updatedTask = await store.tasks.recordEvidence(
        args.taskId,
        args.phase,
        evidence,
      );

      return formatToolOutput({
        success: true,
        exitCode,
        phase: args.phase,
        recordedPhase: updatedTask?.tdd_phase,
        output: truncatedOutput,
      });
    },
  },
};
