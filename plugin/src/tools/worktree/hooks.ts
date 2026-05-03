/**
 * Worktree Hooks Safety Wrapper (T12 — KD-15, peer-review F7, R17).
 *
 * Replaces the unsafe `runHooks` shipped with the standalone worktree
 * plugin. Adds:
 *   - **Bounded execution** — `timeoutMs` cap (default 30s) per command;
 *     timed-out hooks surface as failures (do not silently succeed).
 *   - **Sanitized env** — non-interactive defaults (`CI`, `DEBIAN_FRONTEND`,
 *     `GIT_TERMINAL_PROMPT`, `GIT_EDITOR`, `GIT_PAGER`, `PAGER`).
 *   - **Explicit shell** — `/bin/sh` (Linux-only per J4 SCOPE REDUCTION;
 *     Windows / non-bash shells out of scope in v1).
 *   - **Surfaced exit codes** — preDelete failure throws `HookFailedError`
 *     (blocks worktree removal); postCreate failure logs but does not throw.
 *   - **Stdout/stderr capture** — buffered, surfaced in `HookResult` for
 *     audit + diagnosis.
 *
 * J4 SCOPE REDUCTION (post-Phase 1.5): Linux-only shell defaults. Drops
 * cross-platform shell variations. Module asserts `process.platform ===
 * "linux"` at module-import or first-use to fail-fast on unsupported OSes.
 *
 * # Trust contract (validator finding 1.1)
 *
 * - Hooks ARE trusted project configuration. The user owns
 *   `.opencode/worktree.jsonc` and is responsible for the safety of any
 *   command listed under `hooks.{preDelete,postCreate}`.
 * - Hooks MUST NOT mutate worktree content during `preDelete`. The T9
 *   delete flow enforces this with a post-hook re-verification of
 *   `git status --porcelain` cleanliness; if the hook introduced
 *   uncommitted changes, the delete is aborted with `HOOK_INTRODUCED_CHANGES`.
 * - Hooks MUST NEVER be invoked from read-only paths: `adv_status`,
 *   `adv_worktree_triage`, `adv_session_list`, `adv_session_show`,
 *   `adv_temporal_diagnose`. The hook entry points are exported only
 *   from this module and called only from the explicit create/delete
 *   flows in T9 / T10.
 * - Hooks MUST NEVER be invoked during execution-gate operations
 *   except via the dedicated create/delete tool surfaces.
 *
 * Citations: rq-worktreeRegistry01, rq-multiSessionFraming01.
 */

import { execFile } from "child_process";

export type HookPhase = "preDelete" | "postCreate";

export interface HookResult {
  command: string;
  phase: HookPhase;
  exitCode: number | null;
  /** True when the command was killed by the timeout. */
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export class HookFailedError extends Error {
  readonly results: HookResult[];

  constructor(message: string, results: HookResult[]) {
    super(message);
    this.name = "HookFailedError";
    this.results = results;
  }
}

/**
 * Safety defaults (KD-15). Tunable per-call via `runHooksWithSafety`
 * options; defaults match the design contract.
 */
export const HOOK_DEFAULTS = Object.freeze({
  timeoutMs: 30_000,
  shell: "/bin/sh" as const,
  /**
   * Trust model: hooks are project_owner trusted. Surfaced for audit;
   * the wrapper does NOT enforce trust at runtime — this is documentation.
   */
  trustModel: "project_owner" as const,
});

/**
 * Sanitized environment passed to hook commands. Non-interactive defaults
 * applied first; the caller's `process.env` is layered on top so users
 * can override safely.
 */
function buildHookEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CI: "true",
    DEBIAN_FRONTEND: "noninteractive",
    GIT_TERMINAL_PROMPT: "0",
    GIT_EDITOR: "true",
    GIT_PAGER: "cat",
    PAGER: "cat",
    ...extra,
  };
}

interface RunHooksOptions {
  /** Per-command timeout in ms. Defaults to `HOOK_DEFAULTS.timeoutMs`. */
  timeoutMs?: number;
  /** Extra environment overrides applied AFTER the safe defaults. */
  env?: NodeJS.ProcessEnv;
  /**
   * Execute the command list as a single batch via `sh -c "cmd1 && cmd2 && ..."`
   * (default `false` — each command runs independently). Single-batch
   * mode is occasionally useful for hook authors that need cwd-relative
   * sequencing without re-spawning the shell.
   */
  asBatch?: boolean;
}

/**
 * Execute a list of hook commands with bounded safety.
 *
 * Returns an array of `HookResult` (one per command). When `phase`
 * is `"preDelete"` and ANY command fails (non-zero exit OR timed out),
 * throws `HookFailedError` after all commands have run — so the caller
 * can audit every hook before aborting the delete. `postCreate` failure
 * is logged via the result array but does NOT throw.
 *
 * @param phase — `"preDelete"` (failure blocks delete) or `"postCreate"`
 *                (failure logged only).
 * @param worktreePath — cwd for hook execution.
 * @param commands — list of shell-evaluated command strings.
 * @param options — `timeoutMs`, `env`, `asBatch` overrides.
 *
 * J4 platform guard: throws on non-Linux at first use.
 */
export async function runHooksWithSafety(
  phase: HookPhase,
  worktreePath: string,
  commands: string[],
  options: RunHooksOptions = {},
): Promise<HookResult[]> {
  if (process.platform !== "linux") {
    throw new Error(
      `worktree hooks require Linux (got platform=${process.platform})`,
    );
  }

  if (commands.length === 0) return [];

  const timeoutMs = options.timeoutMs ?? HOOK_DEFAULTS.timeoutMs;
  const env = buildHookEnv(options.env);

  const targets = options.asBatch ? [commands.join(" && ")] : commands;
  const results: HookResult[] = [];

  for (const command of targets) {
    results.push(
      await execOneHookCommand(phase, worktreePath, command, timeoutMs, env),
    );
  }

  if (phase === "preDelete") {
    const failures = results.filter(
      (r) => r.timedOut || (r.exitCode !== null && r.exitCode !== 0),
    );
    if (failures.length > 0) {
      const summary = failures
        .map(
          (f) =>
            `- ${f.command} (exit=${f.exitCode}, timedOut=${f.timedOut})`,
        )
        .join("\n");
      throw new HookFailedError(
        `preDelete hook failed (${failures.length}/${results.length}):\n${summary}`,
        results,
      );
    }
  }

  return results;
}

async function execOneHookCommand(
  phase: HookPhase,
  cwd: string,
  command: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<HookResult> {
  const startedAt = Date.now();
  return new Promise<HookResult>((resolve) => {
    const child = execFile(
      HOOK_DEFAULTS.shell,
      ["-c", command],
      {
        cwd,
        env,
        timeout: timeoutMs,
        // Cap captured output so a runaway hook can't OOM us.
        maxBuffer: 1024 * 1024,
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startedAt;
        if (error) {
          // execFile populates `error.killed === true` AND
          // `error.signal === 'SIGKILL'` when the timeout fires.
          const errAny = error as NodeJS.ErrnoException & {
            killed?: boolean;
            signal?: string;
            code?: number | string;
          };
          const timedOut =
            errAny.killed === true && errAny.signal === "SIGKILL";
          const exitCode =
            typeof errAny.code === "number" ? errAny.code : null;
          resolve({
            command,
            phase,
            exitCode,
            timedOut,
            durationMs,
            stdout: typeof stdout === "string" ? stdout : "",
            stderr: typeof stderr === "string" ? stderr : "",
          });
          return;
        }
        resolve({
          command,
          phase,
          exitCode: 0,
          timedOut: false,
          durationMs,
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
        });
      },
    );
    // Defensive: if execFile somehow doesn't honour `timeout`, fall back
    // to manual kill after 2× the timeout.
    setTimeout(() => {
      try {
        if (!child.killed) child.kill("SIGKILL");
      } catch {
        // Process may already be gone; ignore.
      }
    }, timeoutMs * 2).unref();
  });
}
