import { createHash } from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Prompt-compaction subsystem for the consumer transforms.
 *
 * Lives outside the plugin entry module on purpose: OpenCode 1.18.4+ invokes
 * EVERY function-valued export of an entry module as a plugin factory, so the
 * entry must export exactly one function (`default`). Helpers stay here and
 * the entry imports what its hooks need.
 */

const MAX_PROMPT_TOOL_OUTPUT_CHARS = 24_000;
const MAX_PROMPT_DIFF_CHARS = 24_000;
const PROMPT_EXCERPT_CHARS = 2_000;

/**
 * Number of most-recent non-blank messages protected from any content
 * truncation (AC5 recency skip). Mirrors the host prune turn-protection
 * discipline (~3 turns). See boundSubAgentReportContract KD2/DC1.
 */
const RECENCY_PROTECTED_MESSAGES = 6;

/**
 * Tool types whose outputs are sub-agent (task) or skill returns and must
 * never be head/tail-sliced by the consumer transform (AC6 tool-type
 * protection). Matches the host protected-tools discipline. See KD2/DC3.
 */
const PROTECTED_TOOL_TYPES = new Set(["task", "skill"]);

const isProtectedToolType = (toolName: string): boolean =>
  toolName.length > 0 && PROTECTED_TOOL_TYPES.has(toolName.toLowerCase());

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const compactLargeText = (
  marker: "TOOL_OUTPUT" | "DIFF",
  source: string,
  text: string,
): string => {
  const first = text.slice(0, PROMPT_EXCERPT_CHARS);
  const last = text.slice(-PROMPT_EXCERPT_CHARS);
  return [
    `[ADV:${marker}_TRUNCATED] ${source} produced ${text.length} chars. Full content omitted from model prompt to keep the session resumable.`,
    `--- first ${PROMPT_EXCERPT_CHARS} chars ---`,
    first,
    `--- last ${PROMPT_EXCERPT_CHARS} chars ---`,
    last,
  ].join("\n");
};

/**
 * Honest full-drop marker for oversized unprotected tool output (AC7).
 * Unlike `compactLargeText` (head/tail excerpt — retained for DIFF patches,
 * which have no durable sink), this names what was removed without
 * preserving a deceptive slice that reads as complete. Layer 2 (fallback
 * durable sink) extends oversized Task/skill returns with a persisted-content
 * path; this marker handles the genuinely-untyped, unpersisted case.
 * See boundSubAgentReportContract KD1/DC4.
 */
const dropToolOutput = (source: string, text: string): string =>
  `[ADV:OUTPUT_DROPPED] ${source} produced ${text.length} chars. ` +
  `Full content removed from model prompt to keep the session resumable.`;

/**
 * Directory for the fallback durable sink (AC3/AC4). `/tmp/opencode/` is
 * pre-approved for external directory access per AGENTS.md. Within-session
 * durability is sufficient; cross-session persistence is the separate
 * changelessReportPersistence change (D2, out of scope here). See KD1/DC2.
 * Overridable via ADV_FALLBACK_SINK_DIR for tests.
 */
const DEFAULT_FALLBACK_SINK_DIR = "/tmp/opencode";
const FALLBACK_EXCERPT_CHARS = 500;

const fallbackSinkDir = (): string =>
  process.env.ADV_FALLBACK_SINK_DIR ?? DEFAULT_FALLBACK_SINK_DIR;

/**
 * Persist oversized fallback content to the durable sink before the consumer
 * transform replaces it in the prompt (AC3). Idempotent by content hash —
 * repeated prompt builds for the same content do not re-write. Returns the
 * persisted file path, or null on write failure (caller falls back to an
 * honest full-drop marker with no path).
 */
export const persistFallbackContent = (
  content: string,
  dir: string = fallbackSinkDir(),
): string | null => {
  try {
    const hash = createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 16);
    const filePath = join(dir, `fallback-report-${hash}.md`);
    if (!existsSync(filePath)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, content, "utf8");
    }
    return filePath;
  } catch {
    return null;
  }
};

/**
 * Honest persisted-result marker (AC4). Names the source, the total chars,
 * the number elided, the durable path, and a small preview — never a
 * head-and-tail excerpt.
 */
export const fallbackPersistedMarker = (
  source: string,
  content: string,
  filePath: string,
): string => {
  const shown = Math.min(content.length, FALLBACK_EXCERPT_CHARS);
  const elided = content.length - shown;
  const excerpt = content.slice(0, FALLBACK_EXCERPT_CHARS);
  return `[ADV:FALLBACK_RESULT_PERSISTED] ${source} returned ${content.length} chars (${elided} elided). Full content at ${filePath}. First ${shown} chars: ${excerpt}`;
};

export const compactToolPart = (part: unknown): boolean => {
  if (!isRecord(part) || part.type !== "tool") return false;
  const toolName =
    typeof part.tool === "string"
      ? part.tool
      : typeof part.callID === "string"
        ? part.callID
        : "tool output";
  const protectedType = isProtectedToolType(toolName);

  // Decide the replacement for an oversized tool output.
  // - Conforming (<= threshold) returns are never touched (AC6).
  // - Oversized protected (task/skill) returns are persisted to the durable
  //   sink and honestly marked with the path (AC3/AC4). If the sink fails,
  //   they fall through to the honest full-drop marker (AC7).
  // - Oversized unprotected returns get the honest full-drop marker (AC7).
  const replaceOversized = (output: string): string => {
    if (protectedType) {
      const filePath = persistFallbackContent(output);
      if (filePath) return fallbackPersistedMarker(toolName, output, filePath);
    }
    return dropToolOutput(toolName, output);
  };

  let compacted = false;

  if (isRecord(part.state) && typeof part.state.output === "string") {
    const output = part.state.output;
    if (output.length > MAX_PROMPT_TOOL_OUTPUT_CHARS) {
      part.state.output = replaceOversized(output);
      compacted = true;
    }
  }

  if (typeof part.output === "string") {
    const output = part.output;
    if (output.length > MAX_PROMPT_TOOL_OUTPUT_CHARS) {
      part.output = replaceOversized(output);
      compacted = true;
    }
  }

  return compacted;
};

const compactSummaryDiffs = (info: unknown): number => {
  if (!isRecord(info) || !isRecord(info.summary)) return 0;
  const diffs = info.summary.diffs;
  if (!Array.isArray(diffs)) return 0;

  let compacted = 0;
  for (const diff of diffs) {
    if (!isRecord(diff) || typeof diff.patch !== "string") continue;
    if (diff.patch.length <= MAX_PROMPT_DIFF_CHARS) continue;
    const file = typeof diff.file === "string" ? diff.file : "summary diff";
    diff.patch = compactLargeText("DIFF", file, diff.patch);
    compacted++;
  }
  return compacted;
};

const isBlankUnfinishedAssistantMessage = (message: {
  info?: unknown;
  parts?: unknown[];
}): boolean => {
  if (!isRecord(message.info)) return false;
  if (message.info.role !== "assistant") return false;
  if (Array.isArray(message.parts) && message.parts.length > 0) return false;
  return message.info.finish == null;
};

export const compactPromptMessages = (
  messages: Array<{ info?: unknown; parts?: unknown[] }>,
): {
  droppedBlank: number;
  compactedToolOutputs: number;
  compactedDiffs: number;
} => {
  let droppedBlank = 0;
  let compactedToolOutputs = 0;
  let compactedDiffs = 0;
  let recentProtected = 0;

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message) continue;
    if (isBlankUnfinishedAssistantMessage(message)) {
      messages.splice(index, 1);
      droppedBlank++;
      continue;
    }

    // AC5: protect the most recent N non-blank messages from any content
    // truncation (matches host prune turn-protection). Counting non-blank
    // messages from the end is robust to blank-message splicing above.
    if (recentProtected < RECENCY_PROTECTED_MESSAGES) {
      recentProtected++;
      continue;
    }

    compactedDiffs += compactSummaryDiffs(message.info);
    if (Array.isArray(message.parts)) {
      for (const part of message.parts) {
        if (compactToolPart(part)) compactedToolOutputs++;
      }
    }
  }

  return { droppedBlank, compactedToolOutputs, compactedDiffs };
};
