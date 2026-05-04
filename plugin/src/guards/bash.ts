/**
 * Agents that are restricted to read-only bash operations.
 */
const RESTRICTED_AGENTS = ["explore", "librarian"];

export interface BashPolicyContext {
  activeChangeId?: string | null;
  isMainCheckout?: boolean;
  trunkMutationApproved?: boolean;
}

/**
 * Patterns that indicate a mutation (write, delete, modify).
 */
const MUTATION_PATTERNS = [
  /\bsed\s+-[ei]\b/, // sed in-place or execute
  /\brm\b/, // remove
  /\bmv\b/, // move
  /\bcp\b/, // copy
  /\bmkdir\b/, // make directory
  /\btouch\b/, // create file
  /\brmdir\b/, // remove directory
  /\btee\b/, // write to file
  /\bchmod\b/, // change permissions
  /\bchown\b/, // change owner
  /\btruncate\b/, // truncate file
  /\bdd\b/, // data duplicator (dangerous)
  /\bwrit(e|ing)\b/, // write command (if any)
  />/, // redirection (write/append)
  /\bgit\s+(add|commit|push|pull|rebase|merge|reset|checkout|branch|tag|remote|init)\b/, // git mutations
  /\b(npm|yarn|pnpm|bun|pip|pip3|poetry|uv|cargo|go|apt|brew|yum|dnf)\s+(install|add|remove|uninstall|update|upgrade|publish|init|create|link|unlink)\b/, // package managers
  /\bcurl\s+.*-o\b/, // curl output to file
  /\bwget\s+.*-O\b/, // wget output to file
  /\bpython3?\s+-m\s+(pip|venv)\b/, // python env/package mutations
];

/**
 * Commands that are always safe and allowed even if they match a pattern (rare).
 */
const SAFE_WHITELIST = [
  /^ls(\s|$)/,
  /^git\s+status(\s|$)/,
  /^git\s+diff(\s|$)/,
  /^git\s+log(\s|$)/,
];

const GIT_BRANCH_SWITCH_PATTERN = /\bgit\s+(?:checkout|switch)\b/;

export interface TddBashContext {
  activeChangeId?: string | null;
  activeInlineTddTaskId?: string | null;
  lastAdvRunTest?: {
    taskId: string;
    phase: "red" | "green";
    atMs: number;
  } | null;
}

export interface TddBashResult {
  action: "allow" | "advisory" | "block";
  message?: string;
}

const TEST_FILE_WRITE_PATTERNS = [
  /<<'?EOF'?.*>\s*[^\s]+(?:\.test\.|\.spec\.|_test\.)/i,
  /python(?:3)?\s+-c\s+.*(?:\.test\.|\.spec\.|_test\.).*write_text|python(?:3)?\s+-c\s+.*write_text.*(?:\.test\.|\.spec\.|_test\.)/i,
  /echo\b.*>\s*[^\s]+(?:\.test\.|\.spec\.|_test\.)/i,
  /tee\s+[^\s]+(?:\.test\.|\.spec\.|_test\.)/i,
  /cat\s*>\s*[^\s]+(?:\.test\.|\.spec\.|_test\.)/i,
];

const TEST_RUNNER_PATTERN =
  /\b(vitest|pytest|jest|npm\s+test|pnpm\s+(?:exec\s+vitest|test)|bun\s+test|go\s+test|cargo\s+test)\b/i;

const RECENT_ADV_RUN_TEST_WINDOW_MS = 60_000;

function matchesAny(command: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(command));
}

export function enforceTddBashPolicy(
  command: string,
  context: TddBashContext,
): TddBashResult {
  if (!context.activeChangeId || !context.activeInlineTddTaskId) {
    return { action: "allow" };
  }

  if (matchesAny(command, TEST_FILE_WRITE_PATTERNS)) {
    return {
      action: "block",
      message:
        "Shell-authored test-file content is prohibited during inline TDD. " +
        "Use edit/write/morph_edit for file changes, then run the test via adv_run_test.",
    };
  }

  if (!TEST_RUNNER_PATTERN.test(command)) {
    return { action: "allow" };
  }

  const recentMatch =
    context.lastAdvRunTest &&
    context.lastAdvRunTest.taskId === context.activeInlineTddTaskId &&
    Date.now() - context.lastAdvRunTest.atMs <= RECENT_ADV_RUN_TEST_WINDOW_MS;

  if (recentMatch) {
    return { action: "allow" };
  }

  return {
    action: "advisory",
    message:
      "Direct test-runner bash detected during inline TDD. Prefer adv_run_test for red/green evidence recording.",
  };
}

/**
 * Validates if a command is potentially mutating.
 * @param command The bash command string
 * @returns true if mutating, false if likely read-only
 */
export function isMutating(command: string): boolean {
  // Check whitelist first
  for (const pattern of SAFE_WHITELIST) {
    if (pattern.test(command)) return false;
  }

  // Check mutation patterns
  for (const pattern of MUTATION_PATTERNS) {
    if (pattern.test(command)) return true;
  }

  return false;
}

function isWriteCapableAgent(agent: string): boolean {
  return !RESTRICTED_AGENTS.includes(agent);
}

/**
 * Enforces the read-only policy for restricted agents.
 * @param agent The agent name
 * @param command The command string
 * @throws Error if the command is blocked
 */
export function enforceBashPolicy(
  agent: string,
  command: string,
  context: BashPolicyContext = {},
): void {
  if (RESTRICTED_AGENTS.includes(agent)) {
    if (isMutating(command)) {
      throw new Error(
        `Error: Mutation blocked for agent '${agent}'.\n` +
          `The '${agent}' sub-agent is restricted to read-only operations.\n\n` +
          `Blocked command: ${command}\n\n` +
          `Please use read-only commands (ls, git status, git diff, rg, grep, cat, etc.) ` +
          `or switch to a primary agent (like 'general' or 'build') to perform modifications.`,
      );
    }
  }

  if (
    isWriteCapableAgent(agent) &&
    context.activeChangeId &&
    context.isMainCheckout &&
    !context.trunkMutationApproved
  ) {
    // Main-checkout branch-switch/mutation guard: rq-wl-mainCheckoutGuard01.
    if (GIT_BRANCH_SWITCH_PATTERN.test(command)) {
      throw new Error(
        `Error: main checkout branch switching blocked for active change '${context.activeChangeId}'.\n` +
          "Run ADV WIP from a change worktree, not the main checkout. " +
          "Archive merge/push/deploy operations require explicit trunkMutationApproved evidence and must not use checkout/switch.",
      );
    }

    if (isMutating(command)) {
      throw new Error(
        `Error: main checkout mutation blocked for active change '${context.activeChangeId}'.\n` +
          "Write-capable ADV work must run in a change worktree. " +
          "Read-only/status commands remain allowed on the main checkout.",
      );
    }
  }
}

// =============================================================================
// Conformance Bash Policy (sibling-repo isolation, layered enforcement)
//
// In sibling location mode, the conformance suite lives in an external repo
// the agent has no clone of. The bash guard adds a second-line defense by
// blocking any agent-issued `git clone`, `curl`, or `wget` command that
// references a tracked locked sibling-repo path or its directory name.
//
// In subfolder mode this guard is a no-op (lockedSiblingRoots is empty);
// path-pattern enforcement happens in tool.execute.before instead.
// =============================================================================

export interface ConformanceBashContext {
  /**
   * Absolute paths of sibling-repo conformance roots whose specs are
   * currently locked. Empty array means no sibling-mode conformance
   * is tracked, and this guard becomes a no-op.
   */
  lockedSiblingRoots: string[];
}

const CONFORMANCE_BASH_TARGETS_PATTERN = /\b(?:git\s+clone|curl|wget)\b/i;

/**
 * Extract the trailing directory basename of an absolute sibling-repo
 * path (e.g. `/home/u/dev/advance-conformance-abc123` →
 * `advance-conformance-abc123`).
 */
function siblingDirName(absolutePath: string): string {
  const trimmed = absolutePath.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns block / allow for a bash command relative to the conformance
 * boundary. Block when the command appears to be a network or filesystem
 * fetch (`git clone` / `curl` / `wget`) referencing a tracked locked
 * sibling-repo path or its directory name.
 *
 * Pure function — no side effects, no IO. Caller (`tool.execute.before`)
 * supplies `lockedSiblingRoots` from current conformance state.
 */
export function enforceConformanceBashPolicy(
  command: string,
  context: ConformanceBashContext,
): TddBashResult {
  if (!context.lockedSiblingRoots.length) {
    return { action: "allow" };
  }
  if (!CONFORMANCE_BASH_TARGETS_PATTERN.test(command)) {
    return { action: "allow" };
  }

  const tokens = new Set<string>();
  for (const root of context.lockedSiblingRoots) {
    tokens.add(root);
    const name = siblingDirName(root);
    if (name) tokens.add(name);
  }

  const tokenList = Array.from(tokens).filter(Boolean);
  if (!tokenList.length) {
    return { action: "allow" };
  }

  const tokenPattern = new RegExp(tokenList.map(escapeRegex).join("|"), "i");
  if (!tokenPattern.test(command)) {
    return { action: "allow" };
  }

  return {
    action: "block",
    message:
      "Conformance boundary: agent-level git clone/curl/wget against a " +
      "locked sibling conformance repo is blocked. Conformance test source " +
      "is hidden after first archive. If the user needs to inspect it " +
      "manually, run the command outside the agent context.",
  };
}
