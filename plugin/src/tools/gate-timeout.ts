/**
 * Typed timeout classifier for adv_gate_complete.
 *
 * A gate completion has one durable disk mutation. When the safety-net tool
 * timeout fires, the write may or may not have landed; the caller has no way
 * to distinguish without an authoritative read.
 *
 * Unlike adv_change_archive (which has a disk-durable bundle to probe
 * and an idempotent re-run reconcile), gate_complete has no local probe that
 * would resolve "did the write land?" — only a fresh adv_gate_status read can
 * answer that. The classifier is therefore
 * PURELY ADVISORY: it returns a typed "may have landed — verify via
 * adv_gate_status before retrying" result so the agent is not left
 * staring at a bare ToolExecutionTimeout with no next step.
 *
 * Probe discipline: the classifier must NEVER issue reads or any IO. After a
 * timeout the underlying operation may be the thing that hung; a second hang
 * in the classifier would mask the original failure. The advisory path is constant-work and
 * throw-free by construction (safe-execute.ts also guards with
 * try/catch around classifier invocation).
 */

import { formatToolOutput } from "../utils/tool-output";

/** Loose arg shape — the classifier must tolerate malformed tool args. */
export interface GateCompleteTimeoutArgs {
  changeId?: unknown;
  gateId?: unknown;
}

export interface FormatGateCompleteTimeoutInput {
  args: GateCompleteTimeoutArgs;
  /** The expired safety-net budget, echoed back for diagnosis. */
  timeoutMs: number;
}

/**
 * Purely-advisory classifier for adv_gate_complete timeouts.
 *
 * Returns a typed advisory result when `changeId` is a non-empty string,
 * or `undefined` to fall back to the generic timeout response when the
 * call args are too malformed to even hint at a recovery path.
 */
export async function formatGateCompleteTimeoutResult(
  input: FormatGateCompleteTimeoutInput,
): Promise<string | undefined> {
  const { args, timeoutMs } = input;
  const changeId =
    typeof args?.changeId === "string" && args.changeId.length > 0
      ? args.changeId
      : undefined;
  if (!changeId) return undefined;

  const gateId =
    typeof args?.gateId === "string" && args.gateId.length > 0
      ? args.gateId
      : undefined;

  return formatToolOutput({
    success: false,
    error:
      `Gate signal for '${changeId}' may have landed despite the ` +
      `${timeoutMs}ms timeout. adv_gate_complete has no bundle-first ` +
      "durable write — the sole durable mutation is the gate-completed " +
      "signal, which may or may not have been delivered before the " +
      "safety-net budget expired.",
    errorClass: "ToolExecutionTimeout",
    tool: "adv_gate_complete",
    changeId,
    ...(gateId ? { gateId } : {}),
    timeoutMs,
    signalMayHaveLanded: true,
    remediation:
      "Call adv_gate_status for this changeId and inspect the gates map. " +
      "If the target gate already reads as done, the signal landed and " +
      "no retry is needed — do NOT call adv_gate_complete again or you " +
      "risk duplicating the approval-evidence trail. If the gate is " +
      "still not done, retry adv_gate_complete once; gate-completion " +
      "signals are idempotent at the workflow layer.",
    hint:
      "Verify via adv_gate_status before retrying. Do not blindly " +
      "re-fire adv_gate_complete.",
  });
}
