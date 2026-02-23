/**
 * Agents that are restricted to read-only bash operations.
 */
const RESTRICTED_AGENTS = ["explore", "librarian"];

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

/**
 * Enforces the read-only policy for restricted agents.
 * @param agent The agent name
 * @param command The command string
 * @throws Error if the command is blocked
 */
export function enforceBashPolicy(agent: string, command: string): void {
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
}
