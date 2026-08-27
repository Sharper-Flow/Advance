/**
 * Shared porcelain parser for `git worktree list --porcelain`.
 *
 * Extracted from triage.ts so archive-helpers can reuse the same parser
 * without importing triage-specific state logic.
 */

export interface DiskWorktree {
  path: string;
  headSha?: string;
  branch?: string;
  detached?: boolean;
  bare?: boolean;
  locked?: boolean;
  prunable?: boolean;
}

export interface GitStatusPorcelainEntry {
  index: string;
  worktree: string;
  path: string;
  originalPath?: string;
}

export interface GitNameStatusEntry {
  status: string;
  path: string;
  originalPath?: string;
}

/** Parse `git diff --name-status -z` as NUL-separated status and path fields. */
export function parseGitNameStatusZ(stdout: string): GitNameStatusEntry[] {
  const fields = stdout.split("\0");
  const entries: GitNameStatusEntry[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const statusField = fields[index];
    if (statusField === "") continue;
    if (!/^[A-Z?](?:\d{1,3})?$/.test(statusField))
      throw new Error("malformed git name-status record");
    const firstPath = fields[index + 1];
    if (!firstPath) throw new Error("git name-status record has no path");
    const status = statusField[0]!;
    if (status === "R" || status === "C") {
      const path = fields[index + 2];
      if (!path) throw new Error("git name-status rename has no destination");
      entries.push({ status, path, originalPath: firstPath });
      index += 2;
      continue;
    }
    entries.push({ status, path: firstPath });
    index += 1;
  }
  return entries;
}

/** Parse `git status --porcelain=v1 -z` without treating path bytes as lines. */
export function parseGitStatusPorcelainV1Z(
  stdout: string,
): GitStatusPorcelainEntry[] {
  const fields = stdout.split("\0");
  const entries: GitStatusPorcelainEntry[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === "") continue;
    if (field.length < 4 || field[2] !== " ")
      throw new Error("malformed git status porcelain record");
    const status = field.slice(0, 2);
    const path = field.slice(3);
    if (path.length === 0) throw new Error("git status record has no path");
    const entry: GitStatusPorcelainEntry = {
      index: status[0]!,
      worktree: status[1]!,
      path,
    };
    if (status.includes("R") || status.includes("C")) {
      const originalPath = fields[index + 1];
      if (!originalPath) throw new Error("rename status record has no source");
      entry.originalPath = originalPath;
      index += 1;
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * Parse canonical `git worktree list --porcelain -z` output.
 *
 * NUL-delimited records are required for correctness when a path contains a
 * newline. A newline parser is retained as a compatibility adapter for older
 * callers and fixtures; all production callers use the `-z` command form.
 */
export function parseWorktreeListPorcelain(stdout: string): DiskWorktree[] {
  if (stdout.includes("\0")) return parseNulPorcelain(stdout);
  return parseLegacyPorcelain(stdout);
}

function emptyRecord(): DiskWorktree {
  return {
    path: "",
    detached: false,
    bare: false,
    locked: false,
    prunable: false,
  };
}

function applyPorcelainField(record: DiskWorktree, field: string): void {
  if (field.startsWith("worktree ")) {
    record.path = field.slice("worktree ".length);
  } else if (field.startsWith("HEAD ")) {
    record.headSha = field.slice("HEAD ".length);
  } else if (field.startsWith("branch refs/heads/")) {
    record.branch = field.slice("branch refs/heads/".length);
  } else if (field === "detached") {
    record.detached = true;
  } else if (field === "bare") {
    record.bare = true;
  } else if (field === "locked" || field.startsWith("locked ")) {
    record.locked = true;
  } else if (field === "prunable" || field.startsWith("prunable ")) {
    record.prunable = true;
  }
}

function isCompleteRecord(record: DiskWorktree): boolean {
  return record.path.length > 0;
}

function isCanonicalRecord(record: DiskWorktree): boolean {
  return (
    isCompleteRecord(record) &&
    record.headSha !== undefined &&
    /^[0-9a-f]+$/i.test(record.headSha)
  );
}

function parseNulPorcelain(stdout: string): DiskWorktree[] {
  const worktrees: DiskWorktree[] = [];
  let current: DiskWorktree | undefined;

  const flush = () => {
    if (current && isCanonicalRecord(current)) worktrees.push(current);
    current = undefined;
  };

  for (const field of stdout.split("\0")) {
    if (field === "") {
      flush();
      continue;
    }
    if (field.startsWith("worktree ")) {
      flush();
      current = emptyRecord();
    }
    if (current) applyPorcelainField(current, field);
  }
  flush();
  return worktrees;
}

function parseLegacyPorcelain(stdout: string): DiskWorktree[] {
  const worktrees: DiskWorktree[] = [];
  let current: DiskWorktree | undefined;
  const flush = () => {
    if (current && isCompleteRecord(current)) {
      // Preserve the old newline parser's narrow result shape. This adapter
      // is only for old callers; canonical -z callers receive all facts.
      worktrees.push({
        path: current.path,
        branch: current.branch,
        ...(current.prunable ? { prunable: true } : {}),
      });
    }
    current = undefined;
  };

  for (const line of stdout.split(/\r?\n/)) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flush();
      current = emptyRecord();
    }
    if (current) applyPorcelainField(current, line);
  }
  flush();
  return worktrees;
}
