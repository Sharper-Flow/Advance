/**
 * Shared path-policy helpers for guard modules.
 *
 * Both the conformance guard (`conformance.ts`) and the ADV-state guard
 * (`adv-state.ts`) use the same tool set, path-arg extraction, and locked-path
 * containment check. This module eliminates the duplication so that adding a
 * new read-capable tool or lgrep variant only requires one change.
 *
 * Excluded: bash. Bash gating lives in enforceBashPolicy. Defense is
 * instruction-based ('NEVER read ADV state directly') for adversarial
 * paths; these guards prevent accidental reads via tool names.
 */

/** Tool names whose args may contain file paths subject to path policy. */
export const PATH_GATED_TOOLS = new Set([
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
export function extractPathArgs(args: Record<string, unknown>): string[] {
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
 * Uses separator-boundary prefix matching to prevent partial-segment matches.
 */
export function isInsideLockedPath(
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
