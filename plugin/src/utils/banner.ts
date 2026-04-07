/**
 * Banner Utility
 *
 * Creates visual banners for ADV command output to help users
 * easily identify what command was executed and for what target.
 */

// =============================================================================
// Types
// =============================================================================

export interface BannerOptions {
  /** The command/tool name (e.g., "adv_status", "adv_change_validate") */
  command: string;
  /** Optional target/context (e.g., change ID, capability name) */
  target?: string;
  /** Optional emoji to display (defaults based on command) */
  emoji?: string;
}

// =============================================================================
// Command Emoji Mapping
// =============================================================================

const COMMAND_EMOJIS: Record<string, string> = {
  // Status & Overview
  adv_status: "📊",
  adv_project_context: "📁",

  // Spec Operations
  adv_spec: "📜",

  // Change Operations
  adv_change_list: "📋",
  adv_change_show: "📄",
  adv_change_create: "✨",
  adv_change_close: "🛑",
  adv_change_validate: "✅",
  adv_change_archive: "📦",
  adv_change_add_issue: "🔗",
  adv_change_remove_issue: "🔓",

  // Task Operations
  adv_task_list: "📝",
  adv_task_ready: "🚀",
  adv_task_update: "🔄",
  adv_task_add: "➕",
  adv_task_evidence: "🧪",
  adv_task_tdd_phase: "🔬",
  adv_task_tdd_status: "📈",
  adv_task_reclassify_tdd: "🔄",

  // Test Operations
  adv_run_test: "🧪",

  // Agenda Operations
  adv_agenda_list: "📅",
  adv_agenda_add: "➕",
  adv_agenda_start: "▶️",
  adv_agenda_complete: "✅",
  adv_agenda_cancel: "❌",
  adv_agenda_prioritize: "⬆️",
  adv_agenda_next: "⏭️",
  adv_agenda_stats: "📊",
  adv_agenda_evidence: "🧪",
  adv_agenda_compact: "🗜️",
};

const DEFAULT_EMOJI = "🔧";

// =============================================================================
// Banner Creation
// =============================================================================

/**
 * Creates a box-style banner for command output.
 *
 * Example output:
 * ```
 * ╔══════════════════════════════════╗
 * ║ 📊 adv_status                    ║
 * ╚══════════════════════════════════╝
 * ```
 *
 * With target:
 * ```
 * ╔══════════════════════════════════════════╗
 * ║ ✅ adv_change_validate                   ║
 * ║    Target: add-feature-abc123            ║
 * ╚══════════════════════════════════════════╝
 * ```
 */
export function createBanner(options: BannerOptions): string {
  const { command, target } = options;
  const emoji = options.emoji ?? COMMAND_EMOJIS[command] ?? DEFAULT_EMOJI;

  const commandLine = `${emoji} ${command}`;
  const targetLine = target ? `   Target: ${target}` : null;

  // Calculate the width needed
  const maxContentWidth = Math.max(commandLine.length, targetLine?.length ?? 0);

  // Add padding (minimum 30 chars, or content + 4 for padding)
  const innerWidth = Math.max(30, maxContentWidth + 4);

  // Build the banner
  const topBorder = `╔${"═".repeat(innerWidth)}╗`;
  const bottomBorder = `╚${"═".repeat(innerWidth)}╝`;

  const padLine = (content: string): string => {
    const padding = innerWidth - content.length;
    return `║ ${content}${" ".repeat(padding - 1)}║`;
  };

  const lines = [topBorder, padLine(commandLine)];

  if (targetLine) {
    lines.push(padLine(targetLine));
  }

  lines.push(bottomBorder);

  return lines.join("\n");
}

/**
 * Wraps tool output with a banner header.
 *
 * @param options - Banner options
 * @param output - The JSON or text output from the tool
 * @returns Combined banner + output string
 */
export function wrapWithBanner(options: BannerOptions, output: string): string {
  const banner = createBanner(options);
  return `${banner}\n\n${output}`;
}

/**
 * Helper to create banner options from common tool patterns.
 */
export function bannerFor(
  command: string,
  args?: Record<string, unknown>,
): BannerOptions {
  // Extract common target identifiers from args
  const target =
    (args?.changeId as string) ??
    (args?.taskId as string) ??
    (args?.itemId as string) ??
    (args?.capability as string) ??
    undefined;

  return { command, target };
}
