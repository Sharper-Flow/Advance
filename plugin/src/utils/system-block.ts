// rq-singleSystemBlock01 — at most one ADV-controlled system entry per turn
/**
 * System Block Assembler
 *
 * Single ordered emitter for the ADV plugin's system-context contributions.
 * Replaces the previous pattern of multiple `output.system.push(...)` calls
 * inside `experimental.chat.system.transform` and `buildFactoryFailureHooks`,
 * which broke OpenAI-compat providers (multiple system entries trigger
 * assistant-prefilling rejection on those providers).
 *
 * Architecture (per /adv-design decisions JC-2 and JC-3):
 *
 *   - Seven fixed sections (hardcoded; no registry abstraction per JC-2).
 *     Each section returns `string | null`. Null sections are skipped.
 *   - assembleSystemBlock() returns a single concatenated string ready to
 *     append to `output.system[0]`, or `null` if no content is produced
 *     for this turn.
 *   - Stable header (degraded → health → providerHint → providerSwitch → worktree →
 *     activeChange) is separated from the volatile suffix (wisdomPrompt)
 *     by a `--- ADV:VOLATILE ---` sentinel (per AC8). The sentinel is
 *     emitted only when both stable and volatile content exist, avoiding
 *     orphan dividers.
 *   - Internal-call detection (per JC-3): when the existing
 *     `output.system[0]` matches one of the OpenCode internal-call
 *     patterns (title generation, summarizer), the assembler returns null
 *     so ADV content does not pollute internal flows.
 *
 * Contract:
 *   - This module is a pure formatter. No IO, no side effects, no state
 *     mutation. Caller (in `index.ts`) owns clearing per-turn volatile
 *     state (e.g. `state.lastCompletedTask`) after a successful emission.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

/** Mirror of the SessionHealthIssue shape used by the plugin state.
 *  Re-declared here to keep this module free of plugin-init imports. */
export interface SessionHealthIssue {
  kind: "session.error" | "message-history";
  message: string;
  detectedAt: number;
}

/** State shape this module reads from. Subset of plugin state. */
export interface AssembleSystemBlockState {
  activeChange: {
    id: string | null;
    objective: string | null;
  };
  lastCompletedTask: {
    id: string;
    title: string;
  } | null;
  isWorktree: boolean;
  lastSessionHealthIssue: SessionHealthIssue | null;
  /** Provider ID seen on the previous turn; used to detect provider switch. */
  lastProviderID: string | null;
}

export interface AssembleSystemBlockInput {
  state: AssembleSystemBlockState;
  /** Current provider ID (lowercased) for switch detection. May be null. */
  currentProviderID: string | null;
  /** Initialization error if plugin is in degraded mode (or null). */
  initError: Error | null;
  /** True when the plugin store initialized successfully. */
  storeAvailable: boolean;
  /** Existing `output.system[0]` content (used for internal-call detection). */
  existingSystem: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Sentinel divider between stable header and volatile suffix (AC8 / F3).
 *
 *  Future cache_control optimization (P2 deferred) can split a single
 *  system entry on this token to mark the cacheable prefix. */
export const VOLATILE_SENTINEL = "--- ADV:VOLATILE ---";

/** Patterns identifying OpenCode internal calls (title gen, summarizer).
 *
 *  Per JC-3, strict-regex match is used; unrecognized internal-call shapes
 *  are the caller's responsibility to log via `debugLog` so this list can
 *  be calibrated over time. Conservative bias: a positive match here
 *  causes the assembler to return null, skipping ADV content. False
 *  negatives default to including ADV content (which is safe but may
 *  pollute the internal call's prompt — strictly worse than the previous
 *  multi-block emission). */
export const INTERNAL_CALL_PATTERNS: readonly RegExp[] = [
  /Generate a short title/i,
  /You are a helpful assistant that summarizes/i,
];

/** Fallback chain: providerID → list of alternative provider names.
 *
 *  On provider switch between turns, the providerSwitchSection emits a
 *  one-line suggestion listing alternatives so the agent can route to a
 *  more capable provider when the current one is degraded. */
export const FALLBACK_CHAIN: Readonly<Record<string, string[]>> = {
  openai: ["anthropic", "google"],
  anthropic: ["openai", "google"],
  google: ["openai", "anthropic"],
  "zai-coding-plan": [],
};

export type ProviderHintKey = "claude" | "gpt" | "glm" | "kimi";

/** Provider hints formerly embedded in generated adv-{provider}.md agents.
 *
 * Keep this module pure: no runtime file IO inside system-prompt assembly. */
export const PROVIDER_HINTS: Readonly<Record<ProviderHintKey, string>> = {
  claude: [
    "<!-- PROVIDER_HINT:claude -->",
    "",
    "## Provider Hint",
    "",
    "- Default model family: Claude",
    "- When a user or workflow implies execution, act directly via tools — do not suggest or describe what you would do",
    "- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound",
  ].join("\n"),
  gpt: [
    "<!-- PROVIDER_HINT:gpt -->",
    "",
    "## Provider Hint",
    "",
    "- Default model family: GPT",
    "- When tool calls have sequential dependencies, execute them one at a time — never parallelize dependent calls",
    "- Never invent enum values or arg values not in the tool schema; if a parameter value is unclear, omit it rather than guess",
    "- Before declaring done/blocked, restate requested end-state and compare against evidence gathered this turn",
    "- For ship/finish/debug tasks: inspect first failure, classify it, attempt safe in-scope remediation, rerun verification",
    "- Do not call CI/test failures “flakes” without log evidence and at least one rerun or deterministic diagnosis",
    "- “Blocked” requires: missing permission/credential, human decision, unsafe action, unavailable external system, or 3 distinct failed strategies",
    "- If user asked to continue/ship, keep going after interim findings unless a stop condition above is met",
  ].join("\n"),
  glm: [
    "<!-- PROVIDER_HINT:glm -->",
    "",
    "## Provider Hint",
    "",
    "- Default model family: GLM",
    "- Do not generalize rules beyond their stated scope — if a rule applies to a specific gate or tool, do not silently extend it",
    "- Keep all instructions and tool args in English even when context contains Chinese; validate tool args against schema before calling",
    "- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound",
    "- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries",
    "- When a tool choice exists, pick the most specific one; prefer lgrep over grep, prefer read over cat, prefer ADV MCP tools over direct file access",
    "- Before calling any tool, verify that every required parameter is present and matches the schema — do not guess or invent parameter values",
  ].join("\n"),
  kimi: [
    "<!-- PROVIDER_HINT:kimi -->",
    "",
    "## Provider Hint",
    "",
    "- Default model family: Kimi",
    "- Critical instructions (gate rules, state access policy, NEVER/ONLY constraints) are non-negotiable even in long contexts — re-verify before every gate transition",
    "- If you notice repeated phrases or looping output, stop and summarize current state before continuing",
    "- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries",
    "- When multiple constraints apply, check each one individually before acting — do not collapse or merge distinct rules",
    "- Sequential tool dependencies must be executed one at a time in order — never parallelize dependent calls",
  ].join("\n"),
};

/** Structured provider IDs observed/configured for provider hints.
 *
 * Do not infer hints from free-text model names. If a future provider/model
 * cannot be identified structurally, no hint is emitted. */
export const PROVIDER_HINT_BY_PROVIDER_ID: Readonly<Record<string, ProviderHintKey>> = {
  anthropic: "claude",
  openai: "gpt",
  "zai-coding-plan": "glm",
  zai: "glm",
  "z-ai": "glm",
  moonshot: "kimi",
  moonshotai: "kimi",
  kimi: "kimi",
};

// ─── Predicates ─────────────────────────────────────────────────────────────

/** True when the existing system content matches a known OpenCode
 *  internal-call pattern (title generation, summarizer, …). */
export function isInternalCall(existingSystem: string | null): boolean {
  if (!existingSystem) return false;
  return INTERNAL_CALL_PATTERNS.some((re) => re.test(existingSystem));
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/** Format the [ADV:DEGRADED] banner that surfaces in every system prompt
 *  when the plugin is running in any degraded state.
 *
 *  Stage labels:
 *    - "factory" — the plugin factory itself threw before tryInitStore ran
 *    - "init"    — tryInitStore failed; degraded tool map is wired
 */
export function formatDegradedBanner(
  error: Error,
  stage: "factory" | "init",
): string {
  const stageMsg =
    stage === "factory"
      ? "Plugin factory threw before initialization completed"
      : "Plugin store initialization failed";
  return [
    `[ADV:DEGRADED] ADV plugin is running in degraded mode — ${stageMsg}.`,
    `Reason: ${error.message}`,
    "Every `adv_*` tool is stubbed and will return ADV_PLUGIN_INIT_FAILED.",
    "× Do NOT proceed with any ADV workflow (proposal, discover, design, prep, apply, review, harden, archive). They will silently break.",
    "✓ Allowed in this mode: read files, surface this diagnosis, recommend remediation, run /adv-idea or /adv-problem (no tool calls required).",
    "× Forbidden in this mode: drafting markdown as substitute for adv_change_create, fabricating change-ids or gate transitions, declaring tools 'unavailable' without surfacing this banner verbatim.",
    "Remediation: rebuild the plugin (`pnpm --filter @sharperflow/advance build`), confirm `~/.config/opencode/opencode.json` plugin path is current, then restart OpenCode.",
  ].join("\n");
}

/** Format the [ADV:SESSION_HEALTH] banner surfacing detected session
 *  hazards (compacted prompt history, session.error events). */
export function formatSessionHealthBanner(
  issue: SessionHealthIssue,
  changeId: string | null,
): string {
  const changeHint = changeId
    ? ` Known active change: ${changeId}. Open a fresh OpenCode session and resume by changeId.`
    : " Open a fresh OpenCode session and resume by changeId if this was ADV work.";
  return [
    `[ADV:SESSION_HEALTH] ${issue.kind}: ${issue.message}`,
    "Current session may be unsafe to continue from chat history.",
    `${changeHint} Do not rely on prior chat history as source of truth.`,
  ].join("\n");
}

// ─── Section assemblers (each returns string | null) ────────────────────────

/** Stable: degraded-mode banner. Fires when plugin init failed or the
 *  store is otherwise unavailable. */
function degradedSection(input: AssembleSystemBlockInput): string | null {
  if (input.initError || !input.storeAvailable) {
    return formatDegradedBanner(
      input.initError ?? new Error("Plugin store unavailable"),
      "init",
    );
  }
  return null;
}

/** Stable: session-health banner. Fires when a recent message-history
 *  sanitization or session.error event is recorded. */
function healthSection(input: AssembleSystemBlockInput): string | null {
  const issue = input.state.lastSessionHealthIssue;
  if (!issue) return null;
  return formatSessionHealthBanner(issue, input.state.activeChange.id);
}

/** Stable: provider-specific guidance. Uses only structured provider identity;
 * unknown/missing IDs intentionally emit no hint. */
function providerHintSection(input: AssembleSystemBlockInput): string | null {
  const providerID = input.currentProviderID;
  if (!providerID) return null;
  const hintKey = PROVIDER_HINT_BY_PROVIDER_ID[providerID];
  if (!hintKey) return null;
  return `[ADV:PROVIDER_HINT:${hintKey}]\n${PROVIDER_HINTS[hintKey]}`;
}

/** Stable: provider-switch hint. Fires when the current provider differs
 *  from the previous turn's provider AND the fallback chain has at least
 *  one alternative for the current provider. */
function providerSwitchSection(input: AssembleSystemBlockInput): string | null {
  const { currentProviderID } = input;
  const { lastProviderID } = input.state;
  if (!currentProviderID) return null;
  if (!lastProviderID) return null;
  if (lastProviderID === currentProviderID) return null;
  const alternatives = FALLBACK_CHAIN[currentProviderID] ?? [];
  if (alternatives.length === 0) return null;
  return (
    `[ADV:PROVIDER_SWITCH] Provider changed from ${lastProviderID} to ${currentProviderID}. ` +
    `Configured fallback alternatives: ${alternatives.join(", ")}.`
  );
}

/** Stable: worktree session marker. Fires when running inside a git
 *  worktree AND an active change is set. */
function worktreeSection(input: AssembleSystemBlockInput): string | null {
  const { isWorktree, activeChange } = input.state;
  if (!isWorktree || !activeChange.id) return null;
  return (
    `[ADV:WORKTREE_SESSION] You are working in a git worktree. ` +
    `Active change: ${activeChange.id}. ` +
    `All ADV state (changes, tasks, wisdom) is shared via external storage. ` +
    `Use adv_change_show and adv_task_ready to pick up where the parent session left off.`
  );
}

/** Stable: active-change line. Fires whenever an active change is set;
 *  appends a 60-char-truncated objective when present. */
function activeChangeSection(input: AssembleSystemBlockInput): string | null {
  const { activeChange } = input.state;
  if (!activeChange.id) return null;
  const objectiveSuffix = activeChange.objective
    ? ` | Objective: ${activeChange.objective.slice(0, 60)}`
    : "";
  return `[ADV] Active change: ${activeChange.id}${objectiveSuffix}`;
}

/** Volatile: wisdom-recording prompt. Fires when a task just finished
 *  (`state.lastCompletedTask` is set). The caller is responsible for
 *  clearing `state.lastCompletedTask` after a successful emission. */
function wisdomPromptSection(input: AssembleSystemBlockInput): string | null {
  const completed = input.state.lastCompletedTask;
  if (!completed) return null;
  return (
    `[ADV:RECORD_WISDOM] You just completed task "${completed.title}" (${completed.id}). ` +
    `If you learned anything (gotchas, patterns, successes), please record it using 'adv_wisdom_add'.`
  );
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Result of applying the assembled block to an `output.system` array.
 */
export interface ApplyAdvSystemBlockResult {
  /** True when a non-null block was assembled and appended. */
  emitted: boolean;
  /** True when the block included the wisdom prompt; caller should clear
   *  `state.lastCompletedTask` after a successful emission so the prompt
   *  doesn't repeat on subsequent turns. */
  consumedWisdomPrompt: boolean;
}

/**
 * Append the assembled ADV system block to `output.system[0]` (single
 * ordered append per AC1). Mutates the array in place; never grows past
 * one entry. Returns details so the caller can perform follow-on state
 * cleanup (e.g. clearing per-turn volatile state).
 *
 * Internal-call detection is delegated to `assembleSystemBlock`, which
 * uses the existing system content (read from `output.system[0]`).
 */
export function applyAdvSystemBlock(
  output: { system: string[] },
  input: Omit<AssembleSystemBlockInput, "existingSystem">,
): ApplyAdvSystemBlockResult {
  const existingSystem = output.system[0] ?? null;
  const block = assembleSystemBlock({ ...input, existingSystem });
  if (block === null) {
    return { emitted: false, consumedWisdomPrompt: false };
  }
  output.system[0] = existingSystem ? `${existingSystem}\n\n${block}` : block;
  return {
    emitted: true,
    consumedWisdomPrompt: input.state.lastCompletedTask !== null,
  };
}

/**
 * Assemble the single ADV system-context block.
 *
 * Returns null when:
 *   - The call is detected as an OpenCode internal call
 *     (title generation, summarizer)
 *   - No section produces content
 *
 * Order:
 *   stable:   [degraded, health, providerHint, providerSwitch, worktree, activeChange]
 *   sentinel: VOLATILE_SENTINEL (only when BOTH stable and volatile exist)
 *   volatile: [wisdomPrompt]
 *
 * Sections are joined with `\n\n`. Stable and volatile chunks are
 * separated by `\n\n${VOLATILE_SENTINEL}\n\n` when both are non-empty.
 */
export function assembleSystemBlock(
  input: AssembleSystemBlockInput,
): string | null {
  // Internal-call short-circuit (per JC-3 + research V-6)
  if (isInternalCall(input.existingSystem)) {
    return null;
  }

  const stable: string[] = [];
  const stableSections = [
    degradedSection,
    healthSection,
    providerHintSection,
    providerSwitchSection,
    worktreeSection,
    activeChangeSection,
  ];
  for (const section of stableSections) {
    const content = section(input);
    if (content !== null) stable.push(content);
  }

  const volatile: string[] = [];
  const volatileSections = [wisdomPromptSection];
  for (const section of volatileSections) {
    const content = section(input);
    if (content !== null) volatile.push(content);
  }

  if (stable.length === 0 && volatile.length === 0) return null;

  const stablePart = stable.join("\n\n");
  const volatilePart = volatile.join("\n\n");

  if (stable.length > 0 && volatile.length > 0) {
    return `${stablePart}\n\n${VOLATILE_SENTINEL}\n\n${volatilePart}`;
  }
  return stable.length > 0 ? stablePart : volatilePart;
}
