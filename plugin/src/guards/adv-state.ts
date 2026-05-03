/**
 * ADV State Path Guard
 *
 * Pure-function guard that blocks `read | glob | grep | lgrep_*` tools
 * from referencing paths inside the external ADV state directory tree
 * (`{external_root}/changes/**` and `{external_root}/archive/**`).
 *
 * Mirrors `guards/conformance.ts` shape so reviewers can confirm the
 * guard pattern is consistent across boundary controls.
 *
 * # Excluded from this guard: bash
 *
 * Bash gating is `enforceBashPolicy`'s domain. Parsing arbitrary bash
 * for path patterns is fragile (env vars, pipes, `python -c`, `xargs`,
 * heredocs trivially bypass). Defense-in-depth here is INTENTIONALLY
 * instruction-based:
 *
 *   - AGENTS.md and ADV_INSTRUCTIONS.md state "NEVER read ADV state
 *     files directly" with the canonical tool list.
 *   - This guard prevents *accidental* reads via tool names.
 *
 * If a future threat model requires adversarial-resistant isolation,
 * filesystem-level sandboxing is required (out of scope for this
 * change). See V-D4 in `change/makeAdvContextEmissionSingle`'s design
 * gate.
 *
 * In-repo `.adv/specs/**` is intentionally outside this guard's scope:
 * specs are git-tracked and meant to be read by agents.
 */

// rq-advStatePath01 — ADV-state path guard blocks read/glob/grep/lgrep_*
// against external state directories (/changes, /archive).

/** Context supplied by tool.execute.before for path policy check. */
export interface AdvStatePathContext {
  /** Absolute paths of locked ADV-state roots to block. */
  lockedPaths: string[];
}

/**
 * Compute the locked ADV-state roots for a given external root.
 *
 * @param externalRoot — `getExternalRoot(projectId)` output, i.e.
 *   `$XDG_DATA_HOME/opencode/plugins/advance/{projectId}`.
 * @returns Array of absolute paths to block: `{root}/changes`
 *   and `{root}/archive`. Other peers under externalRoot
 *   (`db/`, `agenda.jsonl`, `wisdom.jsonl`, etc.) are NOT
 *   blocked because they lack a corresponding adv_* tool that
 *   needs adversarial protection — they are written via tools
 *   only.
 */
export function getAdvStateLockedPaths(externalRoot: string): string[] {
  if (!externalRoot) return [];
  return [`${externalRoot}/changes`, `${externalRoot}/archive`];
}

/**
 * Tools whose args may contain file paths subject to ADV-state path
 * policy. EXACTLY mirrors the conformance guard's PATH_GATED_TOOLS set
 * — agents that need filesystem access for ADV state must use
 * `adv_change_show`, `adv_task_list`, etc.
 *
 * Excluded: bash. Bash gating lives in enforceBashPolicy. Defense is
 * instruction-based ('NEVER read ADV state directly') for adversarial
 * paths; this guard prevents accidental reads via tool names.
 */
const PATH_GATED_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "lgrep_search_semantic",
  "lgrep_search_symbols",
  "lgrep_search_text",
  "lgrep_get_file_outline",
  "lgrep_get_file_tree",
  "lgrep_get_repo_outline",
  "lgrep_get_symbol",
  "lgrep_get_symbols",
  "lgrep_index_semantic",
  "lgrep_index_symbols_folder",
]);

/**
 * Extract the path-like argument(s) from a tool's args object.
 *
 * Different tools use different arg names for paths:
 * - read: filePath
 * - glob: path
 * - grep: path
 * - lgrep_*: path or repo_root
 */
function extractPathArgs(args: Record<string, unknown>): string[] {
  const candidates = [
    "filePath",
    "path",
    "target_filepath",
    "repo_root",
  ] as const;
  const paths: string[] = [];
  for (const key of candidates) {
    const val = args[key];
    if (typeof val === "string" && val.length > 0) paths.push(val);
  }
  return paths;
}

/** True when `candidatePath` equals or is nested under any locked path. */
function isInsideLockedPath(
  candidatePath: string,
  lockedPaths: string[],
): boolean {
  for (const locked of lockedPaths) {
    if (candidatePath === locked || candidatePath.startsWith(locked + "/")) {
      return true;
    }
  }
  return false;
}

/**
 * Enforce ADV-state path policy.
 *
 * Blocks read/glob/grep/lgrep_* tools when their args reference a path
 * inside the locked ADV-state directories. Non-path tools (bash, edit,
 * write, adv_*) are not gated here.
 *
 * @throws Error with descriptive message when policy is violated.
 */
export function enforceAdvStatePathPolicy(
  toolName: string,
  args: Record<string, unknown>,
  context: AdvStatePathContext,
): void {
  if (!PATH_GATED_TOOLS.has(toolName)) return;
  if (!context.lockedPaths.length) return;

  const pathArgs = extractPathArgs(args);
  if (!pathArgs.length) return;

  const blockedPath = pathArgs.find((pathArg) =>
    isInsideLockedPath(pathArg, context.lockedPaths),
  );
  if (blockedPath) {
    throw new Error(
      `Path "${blockedPath}" is inside the ADV state directory. ` +
        `Direct reads of ADV state files are not permitted via ${toolName}. ` +
        `Use ADV MCP tools instead: adv_change_show, adv_task_list, adv_task_show, ` +
        `adv_change_list, adv_wisdom_list, adv_agenda_list. ` +
        `See ADV_INSTRUCTIONS.md § "ADV State Access" for the full mapping.`,
    );
  }
}
