/**
 * Git binary resolution + spawn helpers.
 *
 * Background: ADV worktree / archive / snapshot tools shell out to `git`
 * from the plugin host process. When the host runtime (typically Bun
 * inside OpenCode) is launched from a desktop launcher, systemd unit, or
 * any non-shell context, `process.env.PATH` may be missing or minimal.
 * Node/Bun's `execFile("git", …)` then fails with
 * `ENOENT posix_spawn 'git'` even though the binary exists on disk.
 *
 * Fix: resolve git to an absolute path once at module init and reuse it
 * for every spawn. Always pass an explicit env with an augmented PATH
 * (system bin dirs prepended) so child processes git itself spawns
 * (hooks, credential helpers, …) can still find their tools.
 *
 * This module is workflow-unsafe (uses node:child_process / node:fs). It
 * is imported only by tool-layer code, never by `temporal/workflows.ts`
 * reachable modules.
 */

import {
  spawn,
  spawnSync,
  execFile,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
  type ExecFileException,
  type SpawnOptions,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
  type ExecFileOptions,
} from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const POSIX_CANDIDATE_BINARIES: readonly string[] = [
  "/usr/bin/git",
  "/usr/local/bin/git",
  "/bin/git",
  "/opt/homebrew/bin/git",
  "/opt/local/bin/git",
  "/usr/local/git/bin/git",
];

const POSIX_SYSTEM_PATH_DIRS: readonly string[] = [
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
  "/opt/homebrew/bin",
  "/opt/local/bin",
];

const WINDOWS_CANDIDATE_BINARIES_FROM_ENV = (
  env: NodeJS.ProcessEnv,
): string[] => {
  const programFiles = env["ProgramFiles"];
  const programFilesX86 = env["ProgramFiles(x86)"];
  const localAppData = env["LOCALAPPDATA"];
  const candidates: string[] = [];
  if (programFiles) {
    candidates.push(join(programFiles, "Git", "cmd", "git.exe"));
    candidates.push(join(programFiles, "Git", "bin", "git.exe"));
  }
  if (programFilesX86) {
    candidates.push(join(programFilesX86, "Git", "cmd", "git.exe"));
    candidates.push(join(programFilesX86, "Git", "bin", "git.exe"));
  }
  if (localAppData) {
    candidates.push(
      join(localAppData, "Programs", "Git", "cmd", "git.exe"),
      join(localAppData, "Programs", "Git", "bin", "git.exe"),
    );
  }
  return candidates;
};

const isExecutableFile = (path: string): boolean => {
  try {
    const stats = statSync(path);
    return stats.isFile();
  } catch {
    return false;
  }
};

interface ResolveGitBinaryOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** When true, ignore the memoized value (used by tests). */
  forceRefresh?: boolean;
  /** Override the resolution result entirely (used by tests). */
  override?: string;
}

let cachedGitBinary: string | null = null;

/**
 * Resolve `git` to an absolute path. Memoized after first successful
 * resolution. Order of precedence:
 *
 *   1. Explicit `ADV_GIT_PATH` env override
 *   2. Common absolute paths (`/usr/bin/git`, `/opt/homebrew/bin/git`, …)
 *   3. `which git` / `where git` against an augmented PATH
 *   4. Fallback to the literal string `"git"` (caller may still succeed
 *      if PATH is set on subsequent spawns)
 *
 * Falling back to `"git"` is intentional — it preserves prior behavior
 * for environments where PATH is sane and lets ENOENT surface clearly
 * for diagnosis instead of hiding behind a hardcoded path.
 */
export function resolveGitBinary(opts: ResolveGitBinaryOptions = {}): string {
  if (opts.override) return opts.override;
  if (cachedGitBinary && !opts.forceRefresh) return cachedGitBinary;

  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;

  // 1. explicit override
  const override = (env.ADV_GIT_PATH ?? "").trim();
  if (override && isExecutableFile(override)) {
    cachedGitBinary = override;
    return override;
  }

  // 2. common absolute paths
  const absoluteCandidates =
    platform === "win32"
      ? WINDOWS_CANDIDATE_BINARIES_FROM_ENV(env)
      : POSIX_CANDIDATE_BINARIES;
  for (const candidate of absoluteCandidates) {
    if (isExecutableFile(candidate)) {
      cachedGitBinary = candidate;
      return candidate;
    }
  }

  // 3. spawn `which`/`where` with augmented PATH so the lookup is
  // tolerant of an empty inherited PATH.
  const lookupCmd = platform === "win32" ? "where" : "which";
  const lookupName = platform === "win32" ? "git.exe" : "git";
  const lookupEnv: NodeJS.ProcessEnv = {
    ...env,
    PATH: ensureAugmentedPath(env.PATH, platform),
  };
  try {
    const result = spawnSync(lookupCmd, [lookupName], {
      env: lookupEnv,
      encoding: "utf8",
      timeout: 3000,
    });
    if (result.status === 0 && typeof result.stdout === "string") {
      const firstMatch = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (firstMatch && isExecutableFile(firstMatch)) {
        cachedGitBinary = firstMatch;
        return firstMatch;
      }
    }
  } catch {
    // fall through to manual walk
  }

  // 4. manual PATH walk
  const pathSeparator = platform === "win32" ? ";" : ":";
  const pathEntries = ensureAugmentedPath(env.PATH, platform)
    .split(pathSeparator)
    .filter(Boolean);
  for (const dir of pathEntries) {
    const candidate = join(dir, lookupName);
    if (isExecutableFile(candidate)) {
      cachedGitBinary = candidate;
      return candidate;
    }
  }

  // 5. last resort: literal "git" — let the OS try, ENOENT will surface
  return "git";
}

// Memoize the per-platform list of system bin dirs that actually exist
// on this host. Probed once via existsSync to avoid syscalls on every
// spawn. Keyed by `${platform}` so cross-platform tests stay isolated.
const cachedPosixAugment: { value: readonly string[] | null } = { value: null };

function posixAugmentDirs(): readonly string[] {
  if (cachedPosixAugment.value !== null) return cachedPosixAugment.value;
  cachedPosixAugment.value = POSIX_SYSTEM_PATH_DIRS.filter((dir) =>
    existsSync(dir),
  );
  return cachedPosixAugment.value;
}

/**
 * Build a PATH string that includes the inherited PATH plus common
 * system bin dirs. Idempotent: existing entries are preserved and
 * deduped. Probed system-dir list is memoized.
 */
export function ensureAugmentedPath(
  currentPath: string | undefined,
  platform: NodeJS.Platform = process.platform,
): string {
  const separator = platform === "win32" ? ";" : ":";
  const existing = (currentPath ?? "")
    .split(separator)
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);
  const augment = platform === "win32" ? [] : posixAugmentDirs();
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...existing, ...augment]) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    merged.push(entry);
  }
  return merged.join(separator);
}

/**
 * Build a spawn env suitable for invoking git. Always includes an
 * augmented PATH, scrubs `GIT_ASKPASS`, and forces non-interactive
 * prompts. Pass `extraEnv` to override individual keys (e.g. add
 * `GIT_DIR` for `--git-dir` workflows).
 */
export function getGitSpawnEnv(
  extraEnv: Record<string, string | undefined> = {},
  base: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...base };
  delete merged.GIT_ASKPASS;
  merged.PATH = ensureAugmentedPath(base.PATH, platform);
  merged.GIT_TERMINAL_PROMPT = "0";
  for (const [k, v] of Object.entries(extraEnv)) {
    if (v === undefined) {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }
  return merged;
}

/**
 * Reset the memoized git-binary resolution and augmented-PATH probe.
 * Test-only.
 */
export function _resetGitBinaryCacheForTesting(): void {
  cachedGitBinary = null;
  cachedPosixAugment.value = null;
}

// ---------------------------------------------------------------------------
// Spawn helpers — drop-in replacements for `spawn("git", …)` etc.
// All helpers preload a resolved git binary and merge an augmented PATH
// into the spawn env so callers don't have to think about PATH hygiene.
// ---------------------------------------------------------------------------

type GitSpawnOptions = SpawnOptions & { env?: NodeJS.ProcessEnv };
type GitSpawnSyncOptions = SpawnSyncOptions & { env?: NodeJS.ProcessEnv };
type GitExecFileOptions = ExecFileOptions & { env?: NodeJS.ProcessEnv };

const mergeGitEnv = (opts: { env?: NodeJS.ProcessEnv }): NodeJS.ProcessEnv =>
  getGitSpawnEnv({}, opts.env ?? process.env);

export function spawnGit(
  args: readonly string[],
  options: GitSpawnOptions = {},
): ChildProcess {
  const bin = resolveGitBinary();
  return spawn(bin, [...args], {
    ...options,
    env: mergeGitEnv(options),
  });
}

export function spawnGitStreams(
  args: readonly string[],
  options: GitSpawnOptions = {},
): ChildProcessWithoutNullStreams {
  return spawnGit(args, options) as ChildProcessWithoutNullStreams;
}

export function spawnSyncGit(
  args: readonly string[],
  options: GitSpawnSyncOptions = {},
): SpawnSyncReturns<string | Buffer> {
  const bin = resolveGitBinary();
  return spawnSync(bin, [...args], {
    ...options,
    env: mergeGitEnv(options),
  });
}

export function execFileGitCb(
  args: readonly string[],
  options: GitExecFileOptions,
  callback: (
    error: ExecFileException | null,
    stdout: string,
    stderr: string,
  ) => void,
): ChildProcess {
  const bin = resolveGitBinary();
  return execFile(
    bin,
    [...args],
    {
      ...options,
      env: mergeGitEnv(options),
    },
    (err, stdout, stderr) => {
      callback(
        err ?? null,
        typeof stdout === "string" ? stdout : stdout.toString(),
        typeof stderr === "string" ? stderr : stderr.toString(),
      );
    },
  );
}

export async function execFileGitAsync(
  args: readonly string[],
  options: GitExecFileOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const bin = resolveGitBinary();
  const result = await execFileAsync(bin, [...args], {
    ...options,
    env: mergeGitEnv(options),
  });
  return {
    stdout:
      typeof result.stdout === "string"
        ? result.stdout
        : result.stdout.toString(),
    stderr:
      typeof result.stderr === "string"
        ? result.stderr
        : result.stderr.toString(),
  };
}
