/**
 * Multi-conflict navigation UX for /adv-archive Phase 9 rebase.
 *
 * J3 SCOPE EXPANSION — T28c. Drives the resolution loop across N>1 conflicts.
 */

import type { ConflictHunk, ClassifyResult } from "./conflict-classify";
import type { ResolveAction, ResolveActionResult } from "./conflict-resolve";

export interface ConflictRecord {
  filePath: string;
  hunks: ConflictHunk[];
  classification: ClassifyResult;
}

export interface NavigationResult {
  ok: boolean;
  mode: "auto" | "step" | "abort";
  applied: Array<{
    filePath: string;
    action: ResolveAction["kind"];
    auditEntry: string;
  }>;
  aborted?: { reason: string };
  unresolved?: ConflictRecord[];
}

export interface NavigateConflictsDeps {
  /** Read user reply (Tier A inline parser). Production: question tool / inline reply parser. Tests: stub. */
  prompt?: (message: string) => Promise<string>;
  /** Apply a resolve action (T28b). */
  apply?: (
    action: ResolveAction,
    filePath: string,
    repoRoot: string,
  ) => Promise<ResolveActionResult>;
  /** Resolve a divergent conflict by asking the user. Returns ResolveAction. */
  resolveDivergent?: (conflict: ConflictRecord) => Promise<ResolveAction>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBatchSummary(conflicts: ConflictRecord[]): string {
  let autoSkip = 0;
  let autoResolve = 0;
  let divergent = 0;

  for (const c of conflicts) {
    if (c.classification.class === "duplicate_content") autoSkip++;
    else if (c.classification.class === "auto_resolvable_trivial")
      autoResolve++;
    else divergent++;
  }

  return [
    `Phase 9 conflict resolution: ${conflicts.length} conflicts detected`,
    `  auto-skippable: ${autoSkip} (duplicate-content)`,
    `  auto-resolvable: ${autoResolve} (whitespace/formatting)`,
    `  divergent (user input needed): ${divergent}`,
    "",
    "Reply EXACTLY one of:",
    "  `auto` — apply auto-skip + auto-resolve, prompt only on divergent",
    "  `step` — sequential: classify → present → resolve one at a time",
    "  `abort` — abort entire rebase",
  ].join("\n");
}

function parseMode(reply: string): "auto" | "step" | "abort" | null {
  const trimmed = reply.trim();
  if (/^auto$/.test(trimmed)) return "auto";
  if (/^step$/.test(trimmed)) return "step";
  if (/^abort$/.test(trimmed)) return "abort";
  return null;
}

function synthesizeAutoResolveContent(hunks: ConflictHunk[]): string {
  return hunks.map((h) => h.theirs).join("\n");
}

function buildAutoAction(conflict: ConflictRecord): ResolveAction {
  if (conflict.classification.class === "duplicate_content") {
    return { kind: "skip", reason: conflict.classification.reason };
  }
  if (conflict.classification.class === "auto_resolvable_trivial") {
    return {
      kind: "auto_resolve",
      resolvedContent: synthesizeAutoResolveContent(conflict.hunks),
      reason: conflict.classification.reason,
    };
  }
  // Should not reach here when called for auto_skip/auto_resolve only
  return {
    kind: "abort_rebase",
    userReason: "Unexpected divergent conflict in auto action builder",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function navigateConflicts(opts: {
  conflicts: ConflictRecord[];
  repoRoot: string;
  deps?: NavigateConflictsDeps;
}): Promise<NavigationResult> {
  const { conflicts, repoRoot, deps } = opts;

  const prompt = deps?.prompt ?? defaultPrompt;
  const apply = deps?.apply ?? defaultApply;
  const resolveDivergent = deps?.resolveDivergent ?? defaultResolveDivergent;

  if (conflicts.length === 0) {
    return { ok: true, mode: "auto", applied: [] };
  }

  // --- Step 1: present batch summary and parse mode ---
  const summary = buildBatchSummary(conflicts);
  let mode: "auto" | "step" | "abort" | null = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (mode === null && attempts < maxAttempts) {
    const reply = await prompt(summary);
    mode = parseMode(reply);
    attempts++;
  }

  if (mode === null) {
    return {
      ok: false,
      mode: "abort",
      applied: [],
      aborted: { reason: "ambiguous_reply" },
    };
  }

  const applied: NavigationResult["applied"] = [];

  // --- Step 2: execute by mode ---

  if (mode === "abort") {
    const action: ResolveAction = {
      kind: "abort_rebase",
      userReason: "user-requested abort",
    };
    const result = await apply(action, "", repoRoot);
    if (result.ok) {
      applied.push({
        filePath: "",
        action: "abort_rebase",
        auditEntry: result.auditEntry,
      });
    } else {
      return {
        ok: false,
        mode: "abort",
        applied,
        aborted: { reason: "apply_failed" },
      };
    }
    return { ok: true, mode: "abort", applied };
  }

  if (mode === "auto") {
    for (const conflict of conflicts) {
      let action: ResolveAction;

      if (conflict.classification.class === "divergent_content") {
        action = await resolveDivergent(conflict);
        if (action.kind === "abort_rebase") {
          const result = await apply(action, conflict.filePath, repoRoot);
          if (result.ok) {
            applied.push({
              filePath: conflict.filePath,
              action: "abort_rebase",
              auditEntry: result.auditEntry,
            });
          }
          return {
            ok: false,
            mode: "auto",
            applied,
            aborted: { reason: "abort_rebase" },
          };
        }
      } else {
        action = buildAutoAction(conflict);
      }

      const result = await apply(action, conflict.filePath, repoRoot);
      if (!result.ok) {
        return {
          ok: false,
          mode: "auto",
          applied,
          aborted: { reason: "apply_failed" },
        };
      }
      applied.push({
        filePath: conflict.filePath,
        action: result.action,
        auditEntry: result.auditEntry,
      });
    }
    return { ok: true, mode: "auto", applied };
  }

  // mode === "step"
  for (let index = 0; index < conflicts.length; index++) {
    const conflict = conflicts[index]!;
    const action = await resolveDivergent(conflict);
    if (action.kind === "abort_rebase") {
      const result = await apply(action, conflict.filePath, repoRoot);
      if (result.ok) {
        applied.push({
          filePath: conflict.filePath,
          action: "abort_rebase",
          auditEntry: result.auditEntry,
        });
      }
      return {
        ok: false,
        mode: "step",
        applied,
        aborted: { reason: "abort_rebase" },
        unresolved: conflicts.slice(index + 1),
      };
    }

    const result = await apply(action, conflict.filePath, repoRoot);
    if (!result.ok) {
      return {
        ok: false,
        mode: "step",
        applied,
        aborted: { reason: "apply_failed" },
        unresolved: conflicts.slice(index + 1),
      };
    }
    applied.push({
      filePath: conflict.filePath,
      action: result.action,
      auditEntry: result.auditEntry,
    });
  }

  return { ok: true, mode: "step", applied };
}

// ---------------------------------------------------------------------------
// Default dependency implementations (production — should be overridden)
// ---------------------------------------------------------------------------

async function defaultPrompt(message: string): Promise<string> {
  // In production this would use the question tool or inline reply parser.
  // Default implementation throws to force explicit injection.
  throw new Error(
    `navigateConflicts requires an injected \`prompt\` dependency. Received message:\n${message}`,
  );
}

async function defaultApply(
  _action: ResolveAction,
  _filePath: string,
  _repoRoot: string,
): Promise<ResolveActionResult> {
  throw new Error("navigateConflicts requires an injected `apply` dependency.");
}

async function defaultResolveDivergent(
  _conflict: ConflictRecord,
): Promise<ResolveAction> {
  throw new Error(
    "navigateConflicts requires an injected `resolveDivergent` dependency.",
  );
}
