/**
 * Status Markers Domain Types
 *
 * Terminal UI status markers used in chat output.
 */

// =============================================================================
// Status Markers (for terminal UI)
// =============================================================================

export const STATUS_MARKERS = {
  WORK: "[ADV:WORK]", // 🟩 Agent actively working
  TOOLING: "[ADV:TOOLING]", // 🟨 Tool run or sub-agent in flight
  ATTN: "[ADV:ATTN]", // 🟥 User needed (permission pending, approval, or question)
  IDLE: "[ADV:IDLE]", // ⬜ Agent idle, no action needed (session start or finished work)
  BLOCKED: "[ADV:BLOCKED]", // 🟥💀 Doom-loop / stuck / crash
} as const;

export type StatusMarker = keyof typeof STATUS_MARKERS;
