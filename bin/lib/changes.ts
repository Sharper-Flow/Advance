/**
 * adv CLI — change state computation
 *
 * Single source of truth for:
 *   - GATE_ORDER (and derived GateId type)
 *   - Recency thresholds and active-status set
 *   - Pure computation helpers over ChangeRecord / ChangeSummary
 *
 * Zero dependencies; compatible with Bun runtime.
 */

import type { ChangeRecord, GateState, TaskRecord } from "./types";

// =============================================================================
// Gate Order — single source of truth
// =============================================================================

/**
 * Canonical gate order — mirrors plugin/src/types/gates.ts GATE_DEFS.
 *
 * This array is the CLI-side single source of truth.  The plugin-side
 * authoritative copy lives in plugin/src/types/gates.ts and is verified
 * to stay in sync by plugin/src/cli-gate-order-parity.test.ts.
 */
export const GATE_ORDER = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
] as const;

export type GateId = (typeof GATE_ORDER)[number];

// =============================================================================
// Thresholds & Sets
// =============================================================================

export const RECENCY_HOT_THRESHOLD_MIN = 60;
export const RECENCY_STALE_THRESHOLD_MIN = 180;
export const DASHBOARD_ACTIVE_STATUSES = new Set(["draft", "pending", "active"]);

// =============================================================================
// State Loading
// =============================================================================

import { readdir, readFile } from "fs/promises";
import { join } from "path";

export async function* listChanges(
  changesDir: string,
): AsyncGenerator<ChangeRecord> {
  let entries: string[];
  try {
    entries = await readdir(changesDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const changePath = join(changesDir, entry, "change.json");
    const record = await loadChangeJson(changePath);
    if (record) yield record;
  }
}

export async function loadChangeJson(
  filePath: string,
): Promise<ChangeRecord | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (!data.id || !data.created_at) return null;
    return data as ChangeRecord;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`warn: skipping ${filePath}: ${msg}\n`);
    return null;
  }
}

// =============================================================================
// Pure Computation
// =============================================================================

/**
 * Compute the most recent activity timestamp for a change.
 *
 * Source of truth: plugin/src/storage/store-types.ts:229-254
 * Algorithm: lexicographic-max over all recorded timestamps.
 */
export function computeLastActivity(change: ChangeRecord): string {
  let latest = change.created_at;
  const consider = (ts: string | null | undefined) => {
    if (ts && ts > latest) latest = ts;
  };

  for (const task of change.tasks) {
    consider(task.created_at);
    consider(task.started_at);
    consider(task.completed_at);
    if (task.cancellation?.approved_at) consider(task.cancellation.approved_at);
  }

  if (change.gates) {
    for (const gateId of GATE_ORDER) {
      consider(change.gates[gateId]?.completed_at);
    }
  }

  consider(change.validation?.validated_at);
  consider(change.lastSignalAt);
  if (change.wisdom) {
    for (const entry of change.wisdom) consider(entry.recorded_at);
  }

  return latest;
}

export function classifyRecency(minutes: number): "hot" | "warm" | "stale" {
  if (minutes <= RECENCY_HOT_THRESHOLD_MIN) return "hot";
  if (minutes >= RECENCY_STALE_THRESHOLD_MIN) return "stale";
  return "warm";
}

export function buildGateProgress(gates?: Record<string, GateState>): string {
  if (!gates) return "○ ○ ○ ○ ○ ○ ○";
  return GATE_ORDER.map((g) =>
    gates[g]?.status === "done" ? "✓" : "○",
  ).join(" ");
}

export function firstIncompleteGate(
  gates?: Record<string, GateState>,
): string | null {
  if (!gates) return GATE_ORDER[0];
  for (const gateId of GATE_ORDER) {
    const g = gates[gateId];
    if (!g || g.status !== "done") return gateId;
  }
  return null;
}

export function countTasks(tasks: TaskRecord[]): { done: number; total: number } {
  let done = 0;
  for (const t of tasks) {
    if (t.status === "done" || t.status === "cancelled") done++;
  }
  return { done, total: tasks.length };
}

export function isDashboardActiveStatus(status: string): boolean {
  return DASHBOARD_ACTIVE_STATUSES.has(status);
}
