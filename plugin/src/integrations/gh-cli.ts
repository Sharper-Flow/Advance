/**
 * GitHub CLI Integration
 *
 * Provides execGh, detectGhAuth, isGhAvailable, getGhAuthStatus —
 * a GH CLI adapter modeled on runGit from checkpoint.ts.
 *
 * Design decisions:
 * - Uses argv-based execFile (NOT shell-string exec) matching checkpoint.ts pattern.
 * - Hardened environment: GIT_TERMINAL_PROMPT=0 to prevent auth prompts.
 * - Graceful degradation: gh not found is not a crash, returns structured result.
 * - Rate limit detection: parses stderr for HTTP 429 patterns.
 */

import { execFile } from "child_process";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

const GH_ENV = {
  GIT_TERMINAL_PROMPT: "0",
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GhExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** True when gh binary was not found (ENOENT) */
  ghNotFound?: boolean;
  /** True when the process was killed (timeout) */
  timedOut?: boolean;
  /** True when rate limit detected from stderr */
  rateLimited?: boolean;
}

export interface GhAuthStatus {
  /** Whether gh CLI is installed and reachable */
  available: boolean;
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** Authenticated username, if available */
  username?: string;
  /** GitHub host (e.g., "github.com") */
  host?: string;
}

// ─── Core exec function ─────────────────────────────────────────────────────

/**
 * Execute a gh CLI command via argv-based execFile.
 * Always resolves (never rejects) — errors are captured in the result object.
 */
export function execGh(
  args: string[],
  cwd: string,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<GhExecResult> {
  return new Promise((resolve) => {
    execFile(
      "gh",
      args,
      {
        cwd,
        timeout,
        maxBuffer: DEFAULT_MAX_BUFFER,
        env: { ...process.env, ...GH_ENV },
      },
      (error, stdout, stderr) => {
        if (error) {
          const isEnoent =
            (error as NodeJS.ErrnoException).code === "ENOENT";
          const isKilled = ("killed" in error ? (error as { killed: boolean }).killed : false);
          const rawStderr = stderr ?? "";
          const isRateLimit =
            rawStderr.includes("HTTP 429") ||
            rawStderr.includes("rate limit") ||
            false;
          // Include error.message when stderr is empty (e.g., ENOENT)
          const effectiveStderr = rawStderr || error.message;

          resolve({
            stdout: stdout ?? "",
            stderr: effectiveStderr,
            exitCode: isEnoent ? -1 : (error as NodeJS.ErrnoException).errno ?? (isKilled ? -1 : 1),
            ghNotFound: isEnoent || undefined,
            timedOut: isKilled || undefined,
            rateLimited: isRateLimit || undefined,
          });
        } else {
          resolve({
            stdout: stdout ?? "",
            stderr: stderr ?? "",
            exitCode: 0,
          });
        }
      },
    );
  });
}

// ─── Auth detection ─────────────────────────────────────────────────────────

/**
 * Detect GH CLI authentication status by running `gh auth status`.
 * Parses stderr for username and host.
 */
export async function detectGhAuth(): Promise<GhAuthStatus> {
  const result = await execGh(["auth", "status"], process.cwd());

  if (result.ghNotFound) {
    return { available: false, authenticated: false };
  }

  if (result.exitCode !== 0) {
    return { available: true, authenticated: false };
  }

  // Parse stderr for username and host
  // Format: "github.com\n  ✓ Logged in to github.com as user (oauth_token)\n"
  const output = result.stderr || result.stdout;
  const usernameMatch = output.match(/Logged in to \S+ as (\S+)/);
  const hostMatch = output.match(/^(\S+)$/m);

  return {
    available: true,
    authenticated: true,
    username: usernameMatch?.[1],
    host: hostMatch?.[1],
  };
}

// ─── Convenience utilities ──────────────────────────────────────────────────

/**
 * Check if the gh CLI is available (installed and reachable).
 */
export async function isGhAvailable(): Promise<boolean> {
  const result = await execGh(["--version"], process.cwd());
  return !result.ghNotFound;
}

/**
 * Get full auth status — combines availability and authentication checks.
 */
export async function getGhAuthStatus(): Promise<GhAuthStatus> {
  const authStatus = await detectGhAuth();
  return authStatus;
}
