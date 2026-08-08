/** Abortable process execution with POSIX process-group cleanup. */

import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import type { WorktreeOperationContext } from "./worktree-operation";

export interface AbortableProcessInput {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  killGraceMs?: number;
  platform?: NodeJS.Platform;
  destructiveSubtree?: boolean;
  operation?: WorktreeOperationContext;
  spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
}

export interface AbortableProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
  closed: boolean;
}

export class UnsupportedDestructiveProcessPlatformError extends Error {
  constructor(platform: NodeJS.Platform) {
    super(
      `destructive subtree process cancellation is unsupported on ${platform}`,
    );
    this.name = "UnsupportedDestructiveProcessPlatformError";
  }
}

export async function runAbortableProcess(
  input: AbortableProcessInput,
): Promise<AbortableProcessResult> {
  const platform = input.platform ?? process.platform;
  if (input.destructiveSubtree && platform === "win32") {
    throw new UnsupportedDestructiveProcessPlatformError(platform);
  }
  if (input.signal?.aborted || input.operation?.signal.aborted) {
    return {
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      timedOut: false,
      aborted: true,
      closed: true,
    };
  }

  const child = (input.spawnProcess ?? spawn)(
    input.command,
    [...(input.args ?? [])],
    {
      cwd: input.cwd,
      env: input.env,
      stdio: "pipe",
      detached: platform !== "win32",
      windowsHide: true,
    },
  );
  const killGraceMs = Math.max(1, input.killGraceMs ?? 250);
  let timedOut = false;
  let aborted = input.signal?.aborted ?? false;
  let terminateStarted = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let unregister: (() => void) | undefined;

  let terminate: (reason: string) => Promise<void> = async () => undefined;
  const closePromise = new Promise<AbortableProcessResult>(
    (resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const sendSignal = (signal: NodeJS.Signals): void => {
        if (child.pid === undefined) return;
        try {
          if (platform !== "win32") {
            process.kill(-child.pid, signal);
          } else {
            child.kill(signal);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
            try {
              child.kill(signal);
            } catch {
              // close/error below remains authoritative for process completion
            }
          }
        }
      };

      terminate = async (_reason: string): Promise<void> => {
        if (terminateStarted) return;
        terminateStarted = true;
        sendSignal("SIGTERM");
        killTimer = setTimeout(() => sendSignal("SIGKILL"), killGraceMs);
        killTimer.unref?.();
        await closePromise;
      };

      const finish = (result: AbortableProcessResult): void => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        unregister?.();
        resolve(result);
      };

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        unregister?.();
        reject(error);
      };

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.once("error", (error) => {
        fail(error);
      });
      child.once("close", (code, signal) => {
        finish({
          stdout,
          stderr,
          exitCode: code,
          signal,
          timedOut,
          aborted,
          closed: true,
        });
      });
    },
  );

  if (input.operation) {
    unregister = input.operation.registerChildLease({ terminate });
  }
  const abort = (): void => {
    aborted = true;
    void terminate("abort");
  };
  if (input.signal) {
    if (input.signal.aborted) abort();
    else input.signal.addEventListener("abort", abort, { once: true });
  }
  if (input.timeoutMs !== undefined) {
    timeoutTimer = setTimeout(
      () => {
        timedOut = true;
        void terminate("timeout");
      },
      Math.max(0, input.timeoutMs),
    );
    timeoutTimer.unref?.();
  }

  try {
    return await closePromise;
  } finally {
    input.signal?.removeEventListener("abort", abort);
  }
}
