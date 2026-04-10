/**
 * Session Handoff State
 *
 * Persists ADV change context to the external state directory so that
 * new worktree sessions can hydrate immediately on startup.
 *
 * Written by the parent session when worktree_create is called during
 * an active ADV change. Read by the child session on plugin init.
 */

import { readFile, unlink, rename, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { atomicWriteFile } from "../utils/fs";
import type { WisdomEntry } from "../types";

// =============================================================================
// Types
// =============================================================================

export interface HandoffState {
  /** Active change ID */
  changeId: string;
  /** Current task being worked on (may be null if between tasks) */
  currentTaskId: string | null;
  /** Gate completion status snapshot */
  gateStatus: Record<string, string>;
  /** Human-readable objective for the worktree session */
  objective: string;
  /** ISO8601 timestamp when handoff was created */
  createdAt: string;
  /** Branch the worktree was created from */
  sourceBranch: string;
  /** Branch name for the worktree */
  worktreeBranch: string;
  // --- Enriched context fields ---
  /** Brief summary of the proposal/objective for quick context in new session */
  proposalSummary?: string;
  /** Current gate identifier (e.g., "execution") */
  currentGate?: string;
  /** Number of success criteria defined in the proposal */
  successCriteriaCount?: number;
  /** Recent wisdom entries relevant to the change */
  wisdomEntries?: WisdomEntry[];
}

// =============================================================================
// Operations
// =============================================================================

/**
 * Write handoff state to the external state directory.
 *
 * Called by the parent session when creating a worktree during an active change.
 * Creates parent directories if needed.
 */
export async function writeHandoff(
  handoffPath: string,
  state: HandoffState,
): Promise<void> {
  await mkdir(dirname(handoffPath), { recursive: true });
  await atomicWriteFile(handoffPath, JSON.stringify(state, null, 2));
}

/**
 * Read handoff state from the external state directory.
 *
 * Called by the child session on plugin init to hydrate PluginState.
 * Returns null if file doesn't exist or is invalid.
 */
export async function readHandoff(
  handoffPath: string,
): Promise<HandoffState | null> {
  try {
    const content = await readFile(handoffPath, "utf-8");
    return validateHandoff(content);
  } catch {
    return null;
  }
}

/**
 * Atomically consume handoff state: rename → read → delete.
 *
 * Only one session can successfully rename the file, preventing
 * two sessions from hydrating the same handoff. This replaces
 * the separate read + clear pattern.
 */
export async function consumeHandoff(
  handoffPath: string,
): Promise<HandoffState | null> {
  const tmpPath = join(
    dirname(handoffPath),
    `.handoff.consuming.${process.pid}.json`,
  );

  try {
    // Atomic rename — only one process wins this race
    await rename(handoffPath, tmpPath);
  } catch {
    // File doesn't exist or another process already renamed it
    return null;
  }

  try {
    const content = await readFile(tmpPath, "utf-8");
    return validateHandoff(content);
  } catch {
    return null;
  } finally {
    try {
      await unlink(tmpPath);
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Clear handoff state after the child session has hydrated.
 *
 * Prevents stale handoff data from being read by future sessions.
 * Prefer consumeHandoff() for atomic read+clear.
 */
export async function clearHandoff(handoffPath: string): Promise<void> {
  try {
    await unlink(handoffPath);
  } catch {
    // Non-fatal — file may not exist or was already removed
  }
}

/**
 * Validate and parse handoff JSON content.
 * Returns null if content is invalid or missing required fields.
 */
function validateHandoff(content: string): HandoffState | null {
  try {
    const parsed = JSON.parse(content);

    // Validate required field
    if (!parsed.changeId || typeof parsed.changeId !== "string") {
      return null;
    }

    // Normalize optional fields with safe defaults
    const state: HandoffState = {
      changeId: parsed.changeId,
      currentTaskId:
        typeof parsed.currentTaskId === "string" ? parsed.currentTaskId : null,
      gateStatus:
        typeof parsed.gateStatus === "object" && parsed.gateStatus !== null
          ? parsed.gateStatus
          : {},
      objective: typeof parsed.objective === "string" ? parsed.objective : "",
      createdAt:
        typeof parsed.createdAt === "string"
          ? parsed.createdAt
          : new Date().toISOString(),
      sourceBranch:
        typeof parsed.sourceBranch === "string" ? parsed.sourceBranch : "",
      worktreeBranch:
        typeof parsed.worktreeBranch === "string" ? parsed.worktreeBranch : "",
      // Enriched context fields — optional, degrade gracefully when missing
      ...(typeof parsed.proposalSummary === "string"
        ? { proposalSummary: parsed.proposalSummary }
        : {}),
      ...(typeof parsed.currentGate === "string"
        ? { currentGate: parsed.currentGate }
        : {}),
      ...(typeof parsed.successCriteriaCount === "number"
        ? { successCriteriaCount: parsed.successCriteriaCount }
        : {}),
      ...(Array.isArray(parsed.wisdomEntries)
        ? { wisdomEntries: parsed.wisdomEntries }
        : {}),
    };

    return state;
  } catch {
    return null;
  }
}
