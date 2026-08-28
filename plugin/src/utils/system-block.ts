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
 *   - Five fixed sections (hardcoded; no registry abstraction per JC-2).
 *     Each section returns `string | null`. Null sections are skipped.
 *   - assembleSystemBlock() returns a single concatenated string ready to
 *     append to `output.system[0]`, or `null` if no content is produced
 *     for this turn.
 *   - Stable header (degraded → health → worktree → activeChange) is
 *     separated from the volatile suffix (wisdomPrompt) by a
 *     `--- ADV:VOLATILE ---` sentinel (per AC8). The sentinel is emitted
 *     only when both stable and volatile content exist, avoiding orphan
 *     dividers.
 *   - Internal-call detection (per JC-3): when the existing
 *     `output.system[0]` matches one of the OpenCode internal-call
 *     patterns (title generation, compaction, agent generation), the
 *     assembler returns null so ADV content does not pollute internal flows.
 *
 * Contract:
 *   - This module is a pure formatter. No IO, no side effects, no state
 *     mutation. Caller (in `index.ts`) owns clearing per-turn volatile
 *     state (e.g. `state.lastCompletedTask`) after a successful emission.
 *   - Provider hints are now injected by the separate opencode-provider-hints
 *     plugin (extracted in change extractProviderHintsStandalone).
 */

// ─── Types ─────────────────────────────────────────────────────────────────

import type { PluginBundleFreshness } from "../plugin-bundle-manifest";

/** Mirror of the SessionHealthIssue shape used by the plugin state.
 *  Re-declared here to keep this module free of plugin-init imports. */
export interface SessionHealthIssue {
  kind: "session.error" | "message-history";
  message: string;
  detectedAt: number;
  /**
   * True once the banner for this issue has been surfaced in a system block.
   * `message-history` banners are one-shot: after they surface once, they are
   * suppressed on subsequent turns (fixSessionHealthBannerNoise). A new
   * compaction event replaces the issue with a fresh (unsurfaced) one, which
   * re-emits once. `session.error` banners ignore this flag and stay sticky.
   * Absent/false means "not yet surfaced" (backward-compatible default).
   */
  surfaced?: boolean;
}

/** State shape this module reads from. Subset of plugin state. */
export interface AssembleSystemBlockState {
  activeChange: {
    id: string | null;
  };
  lastCompletedTask: {
    id: string;
    title: string;
  } | null;
  /**
   * Tasks carrying wisdom drafts in the `suggested` state, populated by the
   * plugin from live task state. Drives the rq-wisdomAutoSurfacing01 /
   * AC8 draft-aware nudge. When non-empty, the assembler emits a
   * `[ADV:WISDOM_DRAFTS]` prompt that replaces the retired
   * `[ADV:RECORD_WISDOM]` lastCompletedTask-based nudge.
   */
  pendingWisdomDraftTasks?: Array<{
    id: string;
    title: string;
    count: number;
  }>;
  isWorktree: boolean;
  lastSessionHealthIssue: SessionHealthIssue | null;
}

export interface AssembleSystemBlockInput {
  state: AssembleSystemBlockState;
  /** Initialization error if plugin is in degraded mode (or null). */
  initError: Error | null;
  /** True when the plugin store initialized successfully. */
  storeAvailable: boolean;
  /** Existing `output.system[0]` content (used for internal-call detection). */
  existingSystem: string | null;
  /** Plugin bundle freshness; independent from session-health state. */
  pluginBundleFreshness?: PluginBundleFreshness | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Sentinel divider between stable header and volatile suffix (AC8 / F3).
 *
 *  Future cache_control optimization (P2 deferred) can split a single
 *  system entry on this token to mark the cacheable prefix. */
export const VOLATILE_SENTINEL = "--- ADV:VOLATILE ---";

/** Patterns match the opening sentence of OpenCode's three internal prompts:
 *  `agent/prompt/title.txt`, `agent/prompt/compaction.txt`, and
 *  `agent/generate.txt`. The drift test verifies these anchors against the
 *  installed binary. Conservative bias: a positive match here causes the
 *  assembler to return null, skipping ADV content. False negatives default
 *  to including ADV content, which may pollute the internal prompt. */
const INTERNAL_CALL_PATTERNS: readonly RegExp[] = [
  /You are a title generator\. You output ONLY a thread title/i,
  /You are a context summarization agent\./i,
  /You are an elite AI agent architect/i,
];

// ─── Predicates ─────────────────────────────────────────────────────────────

/** True when the existing system content matches a known OpenCode
 *  internal-call pattern (title generation, compaction, agent generation). */
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

/** Format the [ADV:PLUGIN_BUNDLE_STALE] banner surfacing a deployed plugin
 *  bundle that is newer than the bundle loaded into the running OpenCode
 *  session. Never overwrites session-health state; this is an independent
 *  deployment advisory. */
export function formatPluginBundleStaleBanner(
  freshness: PluginBundleFreshness,
): string {
  return [
    "[ADV:PLUGIN_BUNDLE_STALE] Loaded plugin bundle is stale.",
    `Loaded generation: ${freshness.loadedGeneration ?? "unknown"}`,
    `Deployed generation: ${freshness.deployedGeneration ?? "unknown"}`,
    `${freshness.recovery}`,
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
  // fixSessionHealthBannerNoise: `message-history` banners are one-shot —
  // once surfaced they are suppressed so they don't repeat every turn.
  // `session.error` stays sticky (safety-critical; drives BLOCKED status).
  if (issue.kind === "message-history" && issue.surfaced) return null;
  return formatSessionHealthBanner(issue, input.state.activeChange.id);
}

/** Stable: plugin bundle staleness banner. Fires when the deployed plugin
 *  bundle generation is newer than the loaded generation. Independent from
 *  session-health state. */
function pluginBundleStaleSection(
  input: AssembleSystemBlockInput,
): string | null {
  if (input.pluginBundleFreshness?.state !== "stale") return null;
  return formatPluginBundleStaleBanner(input.pluginBundleFreshness);
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

/** Stable: active-change line. Fires whenever an active change is set. */
function activeChangeSection(input: AssembleSystemBlockInput): string | null {
  const { activeChange } = input.state;
  if (!activeChange.id) return null;
  return `[ADV] Active change: ${activeChange.id}`;
}

/**
 * Volatile: wisdom-draft review prompt (rq-wisdomAutoSurfacing01 / AC8).
 *
 * Retires the generic `[ADV:RECORD_WISDOM]` lastCompletedTask nudge and
 * replaces it with a draft-aware prompt that fires ONLY when one or more
 * tasks carry wisdom drafts in the `suggested` state. The prompt is
 * idempotent — it keeps firing as long as drafts are pending review and
 * disappears the moment they are promoted or auto-dismissed at checkpoint.
 *
 * The caller is NOT required to clear any per-turn state when this prompt
 * fires (unlike the retired lastCompletedTask path); the section naturally
 * goes null when the pending-drafts list empties.
 *
 * `consumedWisdomPrompt: true` on the assembly result still signals that
 * a wisdom prompt was emitted this turn so callers can perform any
 * per-turn bookkeeping. Callers that previously cleared
 * `state.lastCompletedTask` based on this flag should keep doing so —
 * lastCompletedTask is still tracked for other consumers (e.g. context
 * snapshots) even though it no longer drives this nudge.
 */
function wisdomPromptSection(input: AssembleSystemBlockInput): string | null {
  const pending = input.state.pendingWisdomDraftTasks ?? [];
  if (pending.length === 0) return null;
  const totalDrafts = pending.reduce((acc, t) => acc + t.count, 0);
  const taskLines = pending
    .map(
      (t) =>
        `  - Task "${t.title}" (${t.id}): ${t.count} draft(s) pending review`,
    )
    .join("\n");
  return (
    `[ADV:WISDOM_DRAFTS] ${totalDrafts} wisdom draft(s) pending review across ${pending.length} task(s).\n` +
    `${taskLines}\n` +
    `Promote via adv_wisdom_add from_draft_id, or dismiss explicitly. ` +
    `Unreviewed drafts will be auto-dismissed at checkpoint.`
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
  /** True when a `message-history` session-health banner was emitted this
   *  assembly; caller should set `lastSessionHealthIssue.surfaced = true`
   *  so the one-shot banner does not repeat on subsequent turns
   *  (fixSessionHealthBannerNoise). Never true for `session.error` (sticky). */
  surfacedMessageHistoryHealth: boolean;
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
    return {
      emitted: false,
      consumedWisdomPrompt: false,
      surfacedMessageHistoryHealth: false,
    };
  }
  output.system[0] = existingSystem ? `${existingSystem}\n\n${block}` : block;
  const healthIssue = input.state.lastSessionHealthIssue;
  return {
    emitted: true,
    consumedWisdomPrompt:
      input.state.lastCompletedTask !== null ||
      (input.state.pendingWisdomDraftTasks?.length ?? 0) > 0,
    // Mirrors healthSection's message-history one-shot gate: the banner
    // emitted this assembly iff the issue is message-history and not yet
    // surfaced. (block !== null here, so the section was included.)
    surfacedMessageHistoryHealth:
      healthIssue?.kind === "message-history" && !healthIssue.surfaced,
  };
}

/**
 * Assemble the single ADV system-context block.
 *
 * Returns null when:
 *   - The call is detected as an OpenCode internal call
 *     (title generation, compaction, agent generation)
 *   - No section produces content
 *
 * Order:
 *   stable:   [degraded, health, worktree, activeChange]
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
    pluginBundleStaleSection,
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
