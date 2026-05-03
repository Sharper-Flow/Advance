/**
 * Decision-tree applier for handling rebase conflicts during /adv-archive Phase 9.
 *
 * J3 SCOPE EXPANSION — driven by T28d's classification taxonomy.
 */

import { execGit } from "../../utils/git";
import { writeFile as fsWriteFile } from "fs/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolveAction =
  | { kind: "skip"; reason: string }
  | { kind: "auto_resolve"; resolvedContent: string; reason: string }
  | { kind: "user_resolve_in_place"; resolvedContent: string; userReason: string }
  | { kind: "abort_rebase"; userReason: string }
  | { kind: "skip_with_decision"; userReason: string };

export type ResolveActionResult =
  | { ok: true; action: ResolveAction["kind"]; auditEntry: string }
  | { ok: false; error: "GIT_FAILED" | "WRITE_FAILED" | "REBASE_ABORT_FAILED"; detail: string };

export interface ApplyResolveDeps {
  writeFile?: (path: string, content: string) => Promise<void>;
  gitAdd?: (filePath: string, repoRoot: string) => Promise<{ ok: boolean; error?: string }>;
  gitRebaseSkip?: (repoRoot: string) => Promise<{ ok: boolean; error?: string }>;
  gitRebaseContinue?: (repoRoot: string) => Promise<{ ok: boolean; error?: string }>;
  gitRebaseAbort?: (repoRoot: string) => Promise<{ ok: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function applyResolveAction(
  action: ResolveAction,
  filePath: string,
  repoRoot: string,
  opts?: ApplyResolveDeps,
): Promise<ResolveActionResult> {
  const deps = {
    writeFile: opts?.writeFile ?? defaultWriteFile,
    gitAdd: opts?.gitAdd ?? defaultGitAdd,
    gitRebaseSkip: opts?.gitRebaseSkip ?? defaultGitRebaseSkip,
    gitRebaseContinue: opts?.gitRebaseContinue ?? defaultGitRebaseContinue,
    gitRebaseAbort: opts?.gitRebaseAbort ?? defaultGitRebaseAbort,
  };

  switch (action.kind) {
    case "skip": {
      const result = await deps.gitRebaseSkip(repoRoot);
      if (!result.ok) {
        return { ok: false, error: "GIT_FAILED", detail: result.error ?? "git rebase --skip failed" };
      }
      return { ok: true, action: "skip", auditEntry: `skipped: ${action.reason}` };
    }

    case "auto_resolve": {
      const writeResult = await safeWriteFile(deps.writeFile, filePath, action.resolvedContent);
      if (!writeResult.ok) {
        return { ok: false, error: "WRITE_FAILED", detail: writeResult.error };
      }
      const addResult = await deps.gitAdd(filePath, repoRoot);
      if (!addResult.ok) {
        return { ok: false, error: "GIT_FAILED", detail: addResult.error ?? "git add failed" };
      }
      const contResult = await deps.gitRebaseContinue(repoRoot);
      if (!contResult.ok) {
        return { ok: false, error: "GIT_FAILED", detail: contResult.error ?? "git rebase --continue failed" };
      }
      return { ok: true, action: "auto_resolve", auditEntry: `auto-resolved: ${action.reason}` };
    }

    case "user_resolve_in_place": {
      const writeResult = await safeWriteFile(deps.writeFile, filePath, action.resolvedContent);
      if (!writeResult.ok) {
        return { ok: false, error: "WRITE_FAILED", detail: writeResult.error };
      }
      const addResult = await deps.gitAdd(filePath, repoRoot);
      if (!addResult.ok) {
        return { ok: false, error: "GIT_FAILED", detail: addResult.error ?? "git add failed" };
      }
      const contResult = await deps.gitRebaseContinue(repoRoot);
      if (!contResult.ok) {
        return { ok: false, error: "GIT_FAILED", detail: contResult.error ?? "git rebase --continue failed" };
      }
      return { ok: true, action: "user_resolve_in_place", auditEntry: `user-resolved-in-place: ${action.userReason}` };
    }

    case "abort_rebase": {
      const result = await deps.gitRebaseAbort(repoRoot);
      if (!result.ok) {
        return { ok: false, error: "REBASE_ABORT_FAILED", detail: result.error ?? "git rebase --abort failed" };
      }
      return { ok: true, action: "abort_rebase", auditEntry: `rebase-aborted: ${action.userReason}` };
    }

    case "skip_with_decision": {
      const result = await deps.gitRebaseSkip(repoRoot);
      if (!result.ok) {
        return { ok: false, error: "GIT_FAILED", detail: result.error ?? "git rebase --skip failed" };
      }
      return { ok: true, action: "skip_with_decision", auditEntry: `skipped-with-decision: ${action.userReason}` };
    }

    default: {
      // Exhaustiveness check — TypeScript narrows this away, but runtime safety
      return { ok: false, error: "GIT_FAILED", detail: `Unknown action kind: ${(action as ResolveAction).kind}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeWriteFile(
  writeFile: (path: string, content: string) => Promise<void>,
  path: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await writeFile(path, content);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Default dependency implementations
// ---------------------------------------------------------------------------

async function defaultWriteFile(path: string, content: string): Promise<void> {
  return fsWriteFile(path, content, "utf-8");
}

async function defaultGitAdd(filePath: string, repoRoot: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await execGit(["add", filePath], repoRoot);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function defaultGitRebaseSkip(repoRoot: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await execGit(["rebase", "--skip"], repoRoot);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function defaultGitRebaseContinue(repoRoot: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await execGit(["rebase", "--continue"], repoRoot);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function defaultGitRebaseAbort(repoRoot: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await execGit(["rebase", "--abort"], repoRoot);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
