/**
 * Git Mutation Guard
 *
 * Intercepts bash-tool git mutations via the `tool.execute.before` hook.
 * Prevents accidental commits/merges/pushes from dirty or unexpected shared
 * checkouts while preserving valid parallel work in separate worktrees.
 *
 * Pipeline:
 *   1. Split command on shell operators (&&, ||, ;, |)
 *   2. Extract git subcommand from each segment
 *   3. Resolve aliases via git config (cached)
 *   4. Classify: MUTATION | STAGING | READ_ONLY | WORKTREE_MGMT | UNKNOWN
 *   5. Run git fact checks only when MUTATION/STAGING detected
 *   6. Apply ALLOW/BLOCK/WARN decision matrix
 *
 * Residual risk: shell aliases/functions, script-internal git calls, and
 * shell-style git aliases beginning with `!` are outside the guard's structural
 * command parser and remain instruction-governed.
 */

// No external imports — all git operations injected via GuardDeps

// ─── Types ──────────────────────────────────────────────────────────────────

export type GitCommandCategory =
  | "MUTATION"
  | "STAGING"
  | "RECOVERY"
  | "READ_ONLY"
  | "WORKTREE_MGMT"
  | "UNKNOWN";

export type GuardDecision = "ALLOW" | "BLOCK" | "WARN";

export interface GuardContext {
  workdir: string;
  gitRoot: string;
  branch: string;
  isDefaultBranch: boolean;
  isDirty: boolean;
  isWorktree: boolean;
  dirtyFiles: string[];
}

export interface GuardResult {
  decision: GuardDecision;
  category: GitCommandCategory;
  subcommand: string;
  reason?: string;
  context?: GuardContext;
}

export interface GuardDeps {
  getDefaultBranch: (cwd: string) => Promise<string>;
  execGit: (args: string[], cwd: string) => Promise<string>;
  getWorktreePaths: () => Promise<string[]>;
  getProjectRoot: () => string;
  onWarning?: (message: string) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MUTATION_SUBCOMMANDS = new Set([
  "commit",
  "merge",
  "rebase",
  "push",
  "cherry-pick",
  "revert",
  "reset",
  "amend",
  "pull",
  "fetch", // fetch is read-only but can update refs — allow
]);

const STAGING_SUBCOMMANDS = new Set(["add", "rm", "mv"]);

/** Subcommands that are recovery operations — always allowed. */
const RECOVERY_SUBCOMMANDS = new Set(["stash", "checkout", "switch"]);

const READ_ONLY_SUBCOMMANDS = new Set([
  "log",
  "diff",
  "status",
  "rev-parse",
  "show",
  "branch",
  // "worktree" is in WORKTREE_MGMT_SUBCOMMANDS, not here
  "remote",
  "config",
  "ls-files",
  "ls-tree",
  "describe",
  "tag",
  "blame",
  "shortlog",
  "reflog",
  "grep",
  "count-objects",
  "fsck",
  "cat-file",
  "name-rev",
  "var",
  "version",
  "help",
  "whatchanged",
  "archive",
  "bundle",
  "for-each-ref",
  "merge-base",
  "rev-list",
  "cherry",
  "rerere",
  "check-ignore",
  "check-attr",
  "hash-object",
  "unpack-objects",
  "pack-objects",
  "notes",
  "replace",
  "interpret-trailers",
  "stripspace",
  "mailinfo",
  "mailsplit",
  "patch-id",
  "sh-i18n",
  "mergetool",
  "verify-pack",
  "gui",
]);

/** Subcommands that are always allowed (worktree management). */
const WORKTREE_MGMT_SUBCOMMANDS = new Set(["worktree"]);

/** Shell operators to split on. */
const SHELL_OPERATOR_RE = /(?:&&|\|\||;|\|)/;

/** Fetch is read-only — override the MUTATION classification. */
const FETCH_OVERRIDE = new Set(["fetch"]);

// ─── Alias Cache ────────────────────────────────────────────────────────────

interface AliasCache {
  aliases: Map<string, string>;
  fetchedAt: number;
  ttl: number;
}

const DEFAULT_ALIAS_TTL = 300_000; // 5 minutes

let aliasCache: AliasCache | null = null;

async function resolveAliases(
  execGitFn: (args: string[], cwd: string) => Promise<string>,
  cwd: string,
): Promise<Map<string, string>> {
  const now = Date.now();
  if (aliasCache && now - aliasCache.fetchedAt < aliasCache.ttl) {
    return aliasCache.aliases;
  }

  const aliases = new Map<string, string>();
  try {
    const output = await execGitFn(
      ["config", "--get-regexp", "^alias\\."],
      cwd,
    );
    for (const line of output.split("\n")) {
      const match = line.match(/^alias\.(\S+)\s+(.+)$/);
      if (match) {
        const aliasName = match[1];
        const expansion = match[2].trim().split(/\s+/)[0]; // first token is the subcommand
        aliases.set(aliasName, expansion);
      }
    }
  } catch {
    // No aliases configured or git unavailable — empty map
  }

  aliasCache = { aliases, fetchedAt: now, ttl: DEFAULT_ALIAS_TTL };
  return aliases;
}

/**
 * Reset alias cache (for testing).
 */
export function resetAliasCache(): void {
  aliasCache = null;
}

// ─── Command Analysis ───────────────────────────────────────────────────────

/**
 * Strip heredoc content from a command string.
 * Removes lines between heredoc delimiters (<<DELIM ... DELIM) while
 * preserving the delimiter markers. Prevents false mutation detection
 * on git commands inside heredoc bodies and script content.
 */
export function stripHeredocs(command: string): string {
  // Match heredoc blocks: <<[-]?['"]?(\w+)['"]? ... \n\1
  // Handles: <<EOF, <<'EOF', <<"EOF", <<-EOF, <<-'EOF'
  return command.replace(/<<-?\s*['"]?(\w+)['"]?\n[\s\S]*?\n\1/g, "<<$1\n$1");
}

/**
 * Split a shell command on shell operators to extract individual segments.
 */
export function splitCommand(command: string): string[] {
  return command
    .split(SHELL_OPERATOR_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Tokenize a command segment enough for git guard classification.
 * Handles simple single/double quoted values and preserves quoted spaces.
 */
export function tokenizeSegment(segment: string): string[] {
  const tokens: string[] = [];
  const tokenRe = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(segment)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

/**
 * Extract the git subcommand from a command segment.
 * Skips git global options that precede the subcommand, including -C and --git-dir.
 * Returns null if the segment doesn't invoke git.
 */
export function extractGitSubcommand(segment: string): string | null {
  const tokens = tokenizeSegment(segment);
  const gitIndex = tokens.indexOf("git");
  if (gitIndex === -1) return null;

  for (let index = gitIndex + 1; index < tokens.length; index++) {
    const token = tokens[index];

    if (token === "-C" || token === "--git-dir" || token === "--work-tree") {
      index += 1;
      continue;
    }
    if (token.startsWith("-C") && token.length > 2) continue;
    if (token.startsWith("--git-dir=") || token.startsWith("--work-tree=")) {
      continue;
    }
    if (token.startsWith("-")) continue;

    return token;
  }

  return null;
}

/**
 * Extract the -C flag value from a git command.
 * Returns the path or null if not present.
 */
export function extractGitCFlag(command: string): string | null {
  for (const segment of splitCommand(command)) {
    const tokens = tokenizeSegment(segment);
    const gitIndex = tokens.indexOf("git");
    if (gitIndex === -1) continue;

    for (let index = gitIndex + 1; index < tokens.length; index++) {
      const token = tokens[index];
      if (token === "-C") {
        const value = tokens[index + 1];
        return value && value.length > 0 ? value : null;
      }
      if (token.startsWith("-C") && token.length > 2) {
        return token.substring(2);
      }
    }
  }
  return null;
}

/**
 * Extract a --git-dir flag value and map common .git paths back to repo root.
 */
export function extractGitDirFlag(command: string): string | null {
  for (const segment of splitCommand(command)) {
    const tokens = tokenizeSegment(segment);
    const gitIndex = tokens.indexOf("git");
    if (gitIndex === -1) continue;

    for (let index = gitIndex + 1; index < tokens.length; index++) {
      const token = tokens[index];
      let value: string | undefined;
      if (token === "--git-dir") value = tokens[index + 1];
      if (token.startsWith("--git-dir="))
        value = token.substring("--git-dir=".length);
      if (!value) continue;
      return value.endsWith("/.git") ? value.slice(0, -"/.git".length) : value;
    }
  }
  return null;
}

/**
 * Extract the first actual git subcommand from the full command.
 */
export function extractPrimaryGitSubcommand(command: string): string {
  for (const segment of splitCommand(command)) {
    const subcmd = extractGitSubcommand(segment);
    if (subcmd) return subcmd;
  }
  return "(unknown)";
}

/**
 * Classify a git subcommand into a category.
 */
export function classifySubcommand(subcommand: string): GitCommandCategory {
  // Check WORKTREE_MGMT before READ_ONLY (worktree subcommands are special)
  if (WORKTREE_MGMT_SUBCOMMANDS.has(subcommand)) return "WORKTREE_MGMT";
  // Check exact matches
  if (MUTATION_SUBCOMMANDS.has(subcommand)) {
    // Override: fetch is read-only despite being in MUTATION set
    if (FETCH_OVERRIDE.has(subcommand)) return "READ_ONLY";
    return "MUTATION";
  }
  if (STAGING_SUBCOMMANDS.has(subcommand)) return "STAGING";
  if (RECOVERY_SUBCOMMANDS.has(subcommand)) return "RECOVERY";
  if (READ_ONLY_SUBCOMMANDS.has(subcommand)) return "READ_ONLY";
  return "UNKNOWN";
}

/**
 * Classify a full command string by analyzing all segments.
 * Returns the highest-severity category found.
 */
export async function classifyCommand(
  command: string,
  execGitFn: (args: string[], cwd: string) => Promise<string>,
  cwd: string,
): Promise<GitCommandCategory> {
  const segments = splitCommand(command);
  const severityOrder: GitCommandCategory[] = [
    "MUTATION",
    "STAGING",
    "UNKNOWN",
    "RECOVERY",
    "WORKTREE_MGMT",
    "READ_ONLY",
  ];

  let highestSeverity: GitCommandCategory = "READ_ONLY";
  const aliases = await resolveAliases(execGitFn, cwd);

  for (const segment of segments) {
    const subcmd = extractGitSubcommand(segment);
    if (!subcmd) continue;

    let resolved = subcmd;
    // Resolve alias if not a known subcommand
    if (
      !MUTATION_SUBCOMMANDS.has(resolved) &&
      !STAGING_SUBCOMMANDS.has(resolved) &&
      !READ_ONLY_SUBCOMMANDS.has(resolved) &&
      !WORKTREE_MGMT_SUBCOMMANDS.has(resolved) &&
      !RECOVERY_SUBCOMMANDS.has(resolved)
    ) {
      const aliased = aliases.get(resolved);
      if (aliased) {
        resolved = aliased;
      }
    }

    const category = classifySubcommand(resolved);
    if (
      severityOrder.indexOf(category) < severityOrder.indexOf(highestSeverity)
    ) {
      highestSeverity = category;
    }
  }

  return highestSeverity;
}

// ─── Context Resolution ─────────────────────────────────────────────────────

/**
 * Resolve the effective working directory for a git command.
 * Priority: -C flag in command > args.workdir > project root.
 */
export function resolveWorkdir(
  command: string,
  argsWorkdir: string | undefined,
  projectRoot: string,
): string {
  const cFlag = extractGitCFlag(command);
  const gitDirFlag = extractGitDirFlag(command);
  return cFlag || gitDirFlag || argsWorkdir || projectRoot;
}

/**
 * Resolve guard context by running git fact-check commands.
 */
export async function resolveGuardContext(
  workdir: string,
  deps: GuardDeps,
): Promise<GuardContext> {
  const defaultBranch = await deps.getDefaultBranch(workdir);

  let gitRoot = workdir;
  try {
    gitRoot = (
      await deps.execGit(["rev-parse", "--show-toplevel"], workdir)
    ).trim();
  } catch (error) {
    deps.onWarning?.(
      `git-guard: git root detection failed for ${workdir}; using workdir as fallback (${error instanceof Error ? error.message : String(error)})`,
    );
    // Not a git repo or git unavailable — use workdir as-is
  }

  let branch = "HEAD";
  let isDefaultBranch = false;
  try {
    branch = (
      await deps.execGit(["rev-parse", "--abbrev-ref", "HEAD"], workdir)
    ).trim();
    isDefaultBranch = branch === defaultBranch;
  } catch (error) {
    deps.onWarning?.(
      `git-guard: branch detection failed for ${workdir}; using HEAD fallback (${error instanceof Error ? error.message : String(error)})`,
    );
    // Detached HEAD or error
  }

  let isDirty = false;
  let dirtyFiles: string[] = [];
  try {
    const status = (
      await deps.execGit(["status", "--porcelain"], workdir)
    ).trim();
    if (status) {
      isDirty = true;
      dirtyFiles = status
        .split("\n")
        .map((line) => line.substring(3)) // strip XY status prefix
        .filter((f) => f.length > 0);
    }
  } catch (error) {
    deps.onWarning?.(
      `git-guard: status failed for ${workdir}; treating tree as dirty (${error instanceof Error ? error.message : String(error)})`,
    );
    // status failed — assume dirty for safety
    isDirty = true;
  }

  // Check if workdir is inside a known ADV worktree
  const worktreePaths = await deps.getWorktreePaths();
  const isWorktree = worktreePaths.some(
    (wtPath) =>
      isSameOrChildPath(workdir, wtPath) || isSameOrChildPath(gitRoot, wtPath),
  );

  return {
    workdir,
    gitRoot,
    branch,
    isDefaultBranch,
    isDirty,
    isWorktree,
    dirtyFiles,
  };
}

function isSameOrChildPath(candidate: string, root: string): boolean {
  const normalizedCandidate = candidate.replace(/\/+$/, "");
  const normalizedRoot = root.replace(/\/+$/, "");
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

// ─── Decision Matrix ────────────────────────────────────────────────────────

/**
 * Evaluate the guard decision based on context and command category.
 */
export function evaluateDecision(
  category: GitCommandCategory,
  context: GuardContext,
  subcommand: string,
): GuardResult {
  // Fast path: read-only and worktree management always allowed
  if (category === "READ_ONLY" || category === "WORKTREE_MGMT") {
    return { decision: "ALLOW", category, subcommand };
  }

  // Recovery commands (stash, checkout, switch) always allowed — they are
  // non-destructive operations needed to escape dirty-default-branch states
  if (category === "RECOVERY") {
    return { decision: "ALLOW", category, subcommand, context };
  }

  // ADV worktree — always allow (worktree isolation is the supported path)
  if (context.isWorktree) {
    return { decision: "ALLOW", category, subcommand, context };
  }

  // Special case: push from main requires commit-range verification
  if (subcommand === "push" && context.isDefaultBranch) {
    return {
      decision: "BLOCK",
      category,
      subcommand,
      reason: `Git push from default branch "${context.branch}" blocked: use adv_task_checkpoint or worktree branch for scoped pushes, or push from a feature branch.`,
      context,
    };
  }

  // Main checkout, clean, on default branch — allow (archive finalization path)
  if (context.isDefaultBranch && !context.isDirty) {
    return { decision: "ALLOW", category, subcommand, context };
  }

  // Main checkout, dirty — block mutations and staging
  if (context.isDefaultBranch && context.isDirty) {
    return {
      decision: "BLOCK",
      category,
      subcommand,
      reason: `Git ${subcommand} from dirty default branch "${context.branch}" blocked: ${context.dirtyFiles.length} uncommitted file(s). Use adv_task_checkpoint for scoped commits, or work from a worktree branch.`,
      context,
    };
  }

  // Non-default branch, not a worktree — block mutations/staging to enforce worktree isolation.
  if (!context.isDefaultBranch && !context.isWorktree) {
    return {
      decision: "BLOCK",
      category,
      subcommand,
      reason: `Git ${subcommand} on non-default branch "${context.branch}" blocked: not a recognized ADV worktree. Run mutations from an ADV worktree branch.`,
      context,
    };
  }

  // Fallback: warn for any unhandled case
  return {
    decision: "WARN",
    category,
    subcommand,
    reason: `Git ${subcommand} guard could not determine context. Verify this is intentional.`,
    context,
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Parse worktree paths from `git worktree list --porcelain` output.
 */
export function parseWorktreePaths(porcelain: string): string[] {
  const paths: string[] = [];
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      paths.push(line.substring("worktree ".length));
    }
  }
  return paths;
}

/**
 * Check a bash command for git mutations and return a guard decision.
 *
 * This is the main entry point called from the `tool.execute.before` hook.
 *
 * @param command - The bash command string to check
 * @param argsWorkdir - The workdir from tool args (may be undefined)
 * @param deps - Dependency injection for git operations
 * @returns GuardResult with decision, category, and optional reason
 */
export async function checkBashCommand(
  command: string,
  argsWorkdir: string | undefined,
  deps: GuardDeps,
): Promise<GuardResult> {
  // Quick check: does the command even mention git?
  if (!/\bgit\b/.test(command)) {
    return {
      decision: "ALLOW",
      category: "READ_ONLY",
      subcommand: "(non-git)",
    };
  }

  // Classify the command (includes alias resolution)
  const projectRoot = deps.getProjectRoot();
  const workdir = resolveWorkdir(command, argsWorkdir, projectRoot);
  const sanitizedCommand = stripHeredocs(command);
  const category = await classifyCommand(
    sanitizedCommand,
    deps.execGit,
    workdir,
  );

  // Fast path: no mutation detected
  if (category === "READ_ONLY" || category === "WORKTREE_MGMT") {
    return {
      decision: "ALLOW",
      category,
      subcommand: extractPrimaryGitSubcommand(command),
    };
  }

  // Mutation or staging detected — resolve context
  const context = await resolveGuardContext(workdir, deps);

  return evaluateDecision(
    category,
    context,
    extractPrimaryGitSubcommand(command),
  );
}
