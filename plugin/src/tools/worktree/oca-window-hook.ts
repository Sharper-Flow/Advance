import { execFile } from "node:child_process";

export type OcaEnsureWindowResult = { ok: true } | { ok: false; error: string };

export type OcaEnsureWindowHook = (
  sessionName: string,
  windowName: string,
  worktreePath: string,
) => Promise<OcaEnsureWindowResult>;

const OCA_ENSURE_WINDOW_TIMEOUT_MS = 20_000;

function buildOcaHookEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CI: "true",
    GIT_TERMINAL_PROMPT: "0",
    GIT_EDITOR: "true",
    GIT_PAGER: "cat",
    PAGER: "cat",
  };
}

function formatExecError(
  error: NodeJS.ErrnoException & { code?: number | string },
  stderr: string,
): string {
  const parts = [error.message];
  if (error.code !== undefined) parts.push(`exit=${String(error.code)}`);
  const trimmedStderr = stderr.trim();
  if (trimmedStderr) parts.push(trimmedStderr);
  return parts.join("; ");
}

/**
 * Best-effort bridge from ADV worktree lifecycle to OCA Pattern B tmux windows.
 *
 * Failure is intentionally non-fatal: old/no-OCA environments should still be
 * able to create worktrees, while callers can surface the returned warning.
 */
export function createOcaEnsureWindowHook(): OcaEnsureWindowHook {
  return async (sessionName, windowName, worktreePath) => {
    return new Promise<OcaEnsureWindowResult>((resolve) => {
      execFile(
        "oca",
        [
          "session",
          "ensure-window",
          "--session",
          sessionName,
          "--name",
          windowName,
          "--cwd",
          worktreePath,
        ],
        {
          cwd: worktreePath,
          env: buildOcaHookEnv(),
          timeout: OCA_ENSURE_WINDOW_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        },
        (error, _stdout, stderr) => {
          if (error) {
            resolve({
              ok: false,
              error: formatExecError(
                error as NodeJS.ErrnoException & { code?: number | string },
                typeof stderr === "string" ? stderr : "",
              ),
            });
            return;
          }
          resolve({ ok: true });
        },
      );
    });
  };
}
