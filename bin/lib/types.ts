/**
 * adv CLI — shared type definitions
 *
 * Types shared across bin/lib modules and bin/adv.
 * Zero dependencies; compatible with Bun runtime.
 */

export {
  GATE_ORDER,
  type GateId,
  type GateState,
  type TaskRecord,
  type WisdomEntry,
  type ChangeRecord,
  type ChangeSummary,
  type LiveStatusPayload,
} from "../../plugin/src/shared/cli-projection";
