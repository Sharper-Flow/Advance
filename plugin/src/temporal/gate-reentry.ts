import type { Change, GateId, ReentryHistoryEntry } from "../types";
import { GATE_ORDER, createDefaultGates } from "../types";

interface ReopenChangeResult {
  entry: ReentryHistoryEntry;
  gatesReset: [GateId, ...GateId[]];
  timestamp: string;
}

interface ReopenChangeOptions {
  scopeDelta?: string;
  reopenedBy?: string;
  approvalEvidence?: string;
  /**
   * ISO timestamp for this reopen event. Keep this explicit so workflow
   * adapters and storage callers choose their own clock semantics instead of
   * inheriting a hidden wall-clock default from this mutation helper.
   */
  now: string;
}

export function reopenChangeFromGate(
  change: Change,
  fromGate: GateId,
  reason: string,
  options: ReopenChangeOptions,
): ReopenChangeResult {
  if (!options.now) {
    throw new Error(
      "reopenChangeFromGate requires an explicit `now` timestamp",
    );
  }

  if (!change.gates) {
    change.gates = createDefaultGates();
  }

  const gates = change.gates;

  if (
    gates[fromGate].status !== "done" &&
    gates[fromGate].status !== "legacy"
  ) {
    throw new Error(
      `Cannot reopen from ${fromGate}: gate is not completed (status: ${gates[fromGate].status})`,
    );
  }

  const fromIdx = GATE_ORDER.indexOf(fromGate);
  const gatesReset: GateId[] = [];
  for (let i = fromIdx; i < GATE_ORDER.length; i++) {
    const gateId = GATE_ORDER[i];
    gatesReset.push(gateId);
    gates[gateId] = { status: "pending" };
  }

  const timestamp = options.now;
  const entry: ReentryHistoryEntry = {
    from_gate: fromGate,
    reason,
    ...(options.scopeDelta ? { scope_delta: options.scopeDelta } : {}),
    reopened_by: options.reopenedBy ?? "agent",
    ...(options.approvalEvidence
      ? { approval_evidence: options.approvalEvidence }
      : {}),
    reopened_at: timestamp,
    gates_reset: gatesReset as [GateId, ...GateId[]],
  };

  if (!change.reentry_history) {
    change.reentry_history = [];
  }
  change.reentry_history.push(entry);

  return {
    entry,
    gatesReset: entry.gates_reset as [GateId, ...GateId[]],
    timestamp,
  };
}
