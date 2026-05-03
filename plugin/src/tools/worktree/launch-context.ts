/**
 * Launch Context (T11 — KD-6 split, AC-3).
 *
 * Plain-mode-only port from upstream `kdcokenny/ocx/.../worktree/launch-context.ts`.
 * The upstream module supports two modes: `plain` (vanilla opencode) and
 * `ocx` (the kdco wrapper). ADV does not need OCX-mode since it owns the
 * launch flow end-to-end via `worktree_create` + plugin init, so we keep
 * the `plain` discriminant only.
 *
 * Used by `terminal.ts` to construct the argv for spawning a new opencode
 * process when worktree creation runs in non-inline mode (separate
 * tmux/terminal window). Inline mode (default) does not invoke this.
 *
 * **Dropped from upstream:**
 *   - `mode: "ocx"` discriminant + all OCX_CONTEXT / OCX_BIN / OCX_PROFILE env handling
 *   - `parsePersistedLaunchMetadata` / `serializePersistedLaunchMetadata` /
 *     `toPersistedLaunchMetadata` — not needed when only one mode exists
 *
 * Citations: rq-worktreeRegistry01.
 */

/**
 * Active launch context for a freshly-created worktree session.
 *
 * Discriminant kept as a tagged union (single member for now) so future
 * modes can extend without API churn at call sites. ADV ships only
 * `plain` mode in v1.
 */
export type ActiveLaunchContext = { mode: "plain" };

/**
 * Build the argv array for spawning a new opencode session.
 *
 * Returns exactly `["opencode", "--session", <sessionID>]` — three
 * elements, in that order. Keep this shape stable; `terminal.ts` and the
 * tmux launcher both rely on positional argv parsing.
 *
 * @param sessionID — opaque session identifier (see `utils/session-id.ts`)
 */
export function buildSessionLaunchArgv(sessionID: string): string[] {
  return ["opencode", "--session", sessionID];
}

/**
 * Parse the active launch context from process env.
 *
 * In v1, ADV always returns `{mode: "plain"}` — env-based OCX detection
 * is dropped. The `env` parameter is accepted for API parity with
 * upstream and is intentionally unused; future modes may inspect it.
 */
export function parseActiveLaunchContext(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  env: NodeJS.ProcessEnv = process.env,
): ActiveLaunchContext {
  return { mode: "plain" };
}
