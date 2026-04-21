import type { Change, GateId, ReentryHistoryEntry } from "../types";
import { GATE_ORDER, createDefaultGates } from "../types";

interface ReopenChangeResult {
  entry: ReentryHistoryEntry;
  gatesReset: [GateId, ...GateId[]];
  timestamp: string;
}

export function reopenChangeFromGate(
  change: Change,
  fromGate: GateId,
  reason: string,
  scopeDelta?: string,
  reopenedBy = "agent",
  approvalEvidence?: string,
  /**
   * ISO timestamp for this reopen event. Provide an explicit value when
   * calling from inside a Temporal workflow handler — `new Date()` is
   * non-deterministic under workflow replay. Storage callers (outside
   * workflows) can omit this and the helper will fall back to `new Date()`.
   */
  now?: string,
): ReopenChangeResult {
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

  const timestamp = now ?? new Date().toISOString();
  const entry: ReentryHistoryEntry = {
    from_gate: fromGate,
    reason,
    ...(scopeDelta ? { scope_delta: scopeDelta } : {}),
    reopened_by: reopenedBy,
    ...(approvalEvidence ? { approval_evidence: approvalEvidence } : {}),
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
