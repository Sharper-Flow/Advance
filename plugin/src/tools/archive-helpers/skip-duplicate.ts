/**
 * Skip-duplicate detection for /adv-archive Phase 9 conflict recovery.
 *
 * Determines whether a to-be-skipped commit is content-equivalent to what's
 * already on the default branch at a given file path.
 */

import { execGit, getDefaultBranch } from "../../utils/git";

export interface SkipDuplicateResult {
  /** True when the to-be-skipped commit's tree at filePath matches origin/<default-branch>'s tree at the same path. */
  isDuplicate: boolean;
  reason: string;
  defaultBranch: string;
}

export interface SkipDuplicateDeps {
  resolveDefaultBranch?: (cwd: string) => Promise<string | null>;
  treeAt?: (commitRef: string, filePath: string, cwd: string) => Promise<string | null>;
  /** SHA of the commit currently being rebased (the to-be-skipped candidate). Defaults to "REBASE_HEAD". */
  currentCommitRef?: string;
}

/**
 * Detect whether the commit currently being rebased is a duplicate of content
 * already present on the default branch at the given file path.
 *
 * @param filePath  The path to compare (relative to repo root)
 * @param repoRoot  Absolute path to the repository root
 * @param opts      Optional dependency overrides for testing
 */
export async function detectSkipDuplicate(
  filePath: string,
  repoRoot: string,
  opts?: SkipDuplicateDeps,
): Promise<SkipDuplicateResult> {
  const resolveDefaultBranch = opts?.resolveDefaultBranch ?? getDefaultBranch;
  const treeAt = opts?.treeAt ?? defaultTreeAt;
  const currentCommitRef = opts?.currentCommitRef ?? "REBASE_HEAD";

  // 1. Resolve default branch
  let defaultBranch: string;
  try {
    const resolved = await resolveDefaultBranch(repoRoot);
    if (!resolved) {
      return {
        isDuplicate: false,
        reason: "default_branch_unresolvable",
        defaultBranch: "",
      };
    }
    defaultBranch = resolved;
  } catch {
    return {
      isDuplicate: false,
      reason: "default_branch_unresolvable",
      defaultBranch: "",
    };
  }

  // 2. Read tree-OID of current commit at filePath
  let currentOid: string | null;
  try {
    currentOid = await treeAt(currentCommitRef, filePath, repoRoot);
  } catch {
    currentOid = null;
  }

  // 3. Read tree-OID of origin/defaultBranch at filePath
  const originRef = `origin/${defaultBranch}`;
  let originOid: string | null;
  try {
    originOid = await treeAt(originRef, filePath, repoRoot);
  } catch {
    originOid = null;
  }

  // 4. Compare
  if (currentOid !== null && originOid !== null && currentOid === originOid) {
    return {
      isDuplicate: true,
      reason: "duplicate-content commit (already on default branch)",
      defaultBranch,
    };
  }

  // 5. Divergent or missing
  const parts: string[] = [];
  if (currentOid === null) {
    parts.push("missing at current commit");
  }
  if (originOid === null) {
    parts.push("missing on default branch");
  }
  if (currentOid !== null && originOid !== null && currentOid !== originOid) {
    parts.push("divergent content");
  }

  const detail = parts.length > 0 ? parts.join(", ") : "unknown divergence";

  return {
    isDuplicate: false,
    reason: `not duplicate — ${detail}`,
    defaultBranch,
  };
}

// ---------------------------------------------------------------------------
// Default dependency implementations
// ---------------------------------------------------------------------------

async function defaultTreeAt(
  commitRef: string,
  filePath: string,
  cwd: string,
): Promise<string | null> {
  try {
    const output = await execGit(["ls-tree", commitRef, "--", filePath], cwd);
    // Format: <mode> <type> <oid>\t<path>
    // e.g.: 100644 blob abc123...\tpath/to/file.ts
    const line = output.trim().split("\n")[0];
    if (!line) return null;
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      return parts[2];
    }
    return null;
  } catch {
    return null;
  }
}
