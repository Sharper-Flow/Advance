/**
 * Conflict classification taxonomy for /adv-archive Phase 9 conflict recovery.
 *
 * J3 SCOPE EXPANSION — classifies a conflicted file into one of three buckets
 * so the archive flow can decide: skip, auto-resolve, or escalate.
 */

import { detectSkipDuplicate } from "./skip-duplicate";

export type ConflictClass =
  | "duplicate_content"
  | "auto_resolvable_trivial"
  | "divergent_content";

export interface ConflictHunk {
  /** Lines from the OURS side (post-base, pre-merge target). */
  ours: string;
  /** Lines from the THEIRS side (incoming changes). */
  theirs: string;
  /** Optional ancestor/base lines if available (3-way merge). */
  base?: string;
}

export interface ClassifyResult {
  class: ConflictClass;
  reason: string;
}

export interface ConflictClassifyDeps {
  /** Inject T28's detectSkipDuplicate for the duplicate_content branch. */
  isDuplicate?: (filePath: string, repoRoot: string) => Promise<boolean>;
}

/**
 * Classify a file-level merge conflict.
 *
 * @param filePath     Path relative to repo root
 * @param conflictHunks Parsed hunks from the conflict
 * @param repoRoot     Absolute path to repository root
 * @param opts         Optional dependency overrides for testing
 */
export async function classifyConflict(
  filePath: string,
  conflictHunks: ConflictHunk[],
  repoRoot: string,
  opts?: ConflictClassifyDeps,
): Promise<ClassifyResult> {
  // 1. duplicate_content check (FIRST)
  const isDuplicate = opts?.isDuplicate ?? defaultIsDuplicate;
  try {
    if (await isDuplicate(filePath, repoRoot)) {
      return {
        class: "duplicate_content",
        reason: "duplicate-content commit (T28: tree matches origin/<default>)",
      };
    }
  } catch {
    // If duplicate detection fails, continue to trivial / divergent checks
  }

  // 2. auto_resolvable_trivial check
  // Edge case — malformed hunk input (no ours OR no theirs)
  if (conflictHunks.length === 0) {
    return {
      class: "divergent_content",
      reason: "malformed conflict input — caller should handle as divergent",
    };
  }

  for (const hunk of conflictHunks) {
    if (!hunk.ours || !hunk.theirs) {
      return {
        class: "divergent_content",
        reason: "malformed conflict input — caller should handle as divergent",
      };
    }
  }

  const allTrivial = conflictHunks.every((hunk) => {
    const normOurs = normalizeConflictLines(hunk.ours);
    const normTheirs = normalizeConflictLines(hunk.theirs);
    return normOurs === normTheirs;
  });

  if (allTrivial) {
    return {
      class: "auto_resolvable_trivial",
      reason: "whitespace-only conflict; auto-resolve to incoming",
    };
  }

  // 3. divergent_content (default)
  return {
    class: "divergent_content",
    reason: `${conflictHunks.length} hunk(s) require user resolution`,
  };
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a block of conflict lines for trivial-comparison.
 *
 * - Trim trailing whitespace per line
 * - Collapse runs of whitespace to single space
 * - Normalize line endings (CRLF → LF)
 */
function normalizeConflictLines(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd().replace(/\s+/g, " ").trim())
    .join("\n");
}

// ---------------------------------------------------------------------------
// Default dependency implementations
// ---------------------------------------------------------------------------

async function defaultIsDuplicate(
  filePath: string,
  repoRoot: string,
): Promise<boolean> {
  const result = await detectSkipDuplicate(filePath, repoRoot);
  return result.isDuplicate;
}
