/**
 * Conformance Enforcement Guards
 *
 * Two pure-function guards for the conformance boundary:
 *
 * 1. enforceConformanceToolPolicy — blocks `adv_conformance` when the caller
 *    is operating within the execution gate. The apply agent has no legitimate
 *    reason to call this tool; only the orchestrator (in /adv-archive) should.
 *
 * 2. enforceConformancePathPolicy — blocks read/glob/grep/lgrep tools when
 *    their args reference a path inside a locked sibling-repo conformance
 *    directory. This prevents the agent from reading the conformance test
 *    source during execution.
 *
 * Both are pure functions — no IO, no side effects. Caller (C2, wired into
 * index.ts tool.execute.before) supplies context from current state.
 */

// rq-confDegradation01 — role guard: tool.execute.before blocks
// adv_conformance during execution gate

/** Gate names that match the 7-gate model. */
export type GateName =
  | "proposal"
  | "discovery"
  | "design"
  | "planning"
  | "execution"
  | "acceptance"
  | "release"
  | null;

/** Context supplied by tool.execute.before for tool policy check. */
export interface ConformanceCallerContext {
  /** Current active gate, or null if not tracked. */
  gate: GateName;
}

/** Context for path policy check. */
export interface ConformancePathContext {
  /** Absolute paths of locked sibling-repo conformance roots. */
  lockedPaths: string[];
}

/**
 * Enforce tool-level conformance policy.
 *
 * Blocks `adv_conformance` when the caller is in the execution gate.
 * All other tools are allowed regardless of gate.
 *
 * @throws Error with descriptive message when policy is violated.
 */
export function enforceConformanceToolPolicy(
  toolName: string,
  context: ConformanceCallerContext,
): void {
  if (toolName !== "adv_conformance") return;
  if (context.gate === "execution") {
    throw new Error(
      "adv_conformance is not available during the execution gate. " +
        "The apply agent cannot invoke conformance operations. " +
        "Only the orchestrator may call adv_conformance (e.g. during /adv-archive Phase 5.5).",
    );
  }
}

/**
 * Tools whose args may contain file paths subject to conformance path policy.
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
 * Extract the path-like argument from a tool's args object.
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

/**
 * Check if `candidatePath` starts with or equals any of the `lockedPaths`.
 */
function isInsideLockedPath(
  candidatePath: string,
  lockedPaths: string[],
): boolean {
  for (const locked of lockedPaths) {
    // Exact match or prefix (with separator boundary)
    if (candidatePath === locked || candidatePath.startsWith(locked + "/")) {
      return true;
    }
  }
  return false;
}

/**
 * Enforce path-level conformance policy.
 *
 * Blocks read/glob/grep/lgrep tools when their args reference a path
 * inside a locked sibling-repo conformance directory.
 * Non-path tools (bash, edit, write) are not gated here.
 *
 * @throws Error with descriptive message when policy is violated.
 */
export function enforceConformancePathPolicy(
  toolName: string,
  args: Record<string, unknown>,
  context: ConformancePathContext,
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
      `Path "${blockedPath}" is inside a locked conformance directory. ` +
        `Read access to conformance test sources is blocked while the spec is locked. ` +
        `Unlock via adv_conformance action: "unlock" (requires audit entry) or wait for CI verdict.`,
    );
  }
}
