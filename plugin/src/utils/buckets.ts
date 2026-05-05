import type { GateCompletion, GateId } from "../types";
import { GATE_ORDER } from "../types";
import type { ChangeWorkflowState } from "../temporal/contracts";

export type Bucket =
  | "awaiting_approval"
  | "in_flight"
  | "stuck"
  | "drifting"
  | "ready_to_archive"
  | "never_started";

export interface BucketContext {
  pendingCheckpoint: boolean;
  currentGateId: GateId | "done";
  currentGateStatus: GateCompletion["status"] | "done";
  allNonReleaseGatesDone: boolean;
  releaseGateStatus: GateCompletion["status"];
  proposalDoneOnly: boolean;
  createdAt: string;
  lastSignalAt?: string;
  nowMs: number;
  idleThresholdMs: number;
}

function isIdlePastThreshold(ctx: BucketContext): boolean {
  const activityAt = ctx.lastSignalAt ?? ctx.createdAt;
  const activityMs = Date.parse(activityAt);
  return (
    Number.isFinite(activityMs) && ctx.nowMs - activityMs > ctx.idleThresholdMs
  );
}

export function deriveBucket(ctx: BucketContext): Bucket {
  if (ctx.pendingCheckpoint || ctx.currentGateStatus === "awaiting_approval") {
    return "awaiting_approval";
  }

  if (
    ctx.allNonReleaseGatesDone &&
    ctx.releaseGateStatus === "awaiting_approval"
  ) {
    return "ready_to_archive";
  }

  if (ctx.currentGateStatus === "stuck") return "stuck";

  if (ctx.currentGateStatus === "in_progress" && isIdlePastThreshold(ctx)) {
    return "drifting";
  }

  if (ctx.currentGateStatus === "in_progress") return "in_flight";

  if (ctx.proposalDoneOnly && isIdlePastThreshold(ctx)) return "never_started";

  return "in_flight";
}

export function bucketCtxFromState(
  state: ChangeWorkflowState,
  nowMs: number,
  idleThresholdMs = 24 * 60 * 60 * 1000,
): BucketContext {
  const firstOpenGate = GATE_ORDER.find(
    (gateId) => state.gates[gateId].status !== "done",
  );
  const currentGateId = firstOpenGate ?? "done";
  const currentGateStatus = firstOpenGate
    ? state.gates[firstOpenGate].status
    : "done";
  const nonReleaseGates = GATE_ORDER.filter((gateId) => gateId !== "release");
  const allNonReleaseGatesDone = nonReleaseGates.every(
    (gateId) => state.gates[gateId].status === "done",
  );
  const proposalDoneOnly =
    state.gates.proposal.status === "done" &&
    GATE_ORDER.filter((gateId) => gateId !== "proposal").every(
      (gateId) => state.gates[gateId].status === "pending",
    );

  return {
    pendingCheckpoint: state.pendingCheckpoint === true,
    currentGateId,
    currentGateStatus,
    allNonReleaseGatesDone,
    releaseGateStatus: state.gates.release.status,
    proposalDoneOnly,
    createdAt: state.createdAt,
    lastSignalAt: state.lastSignalAt,
    nowMs,
    idleThresholdMs,
  };
}
