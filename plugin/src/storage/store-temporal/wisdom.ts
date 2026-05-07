import type { Store } from "../store-types";
import type { WisdomType, WisdomEntry } from "../../types";
import { wisdomAddedSignal, changeStateQuery } from "../../temporal/messages";
import {
  runTemporal,
  runTemporalQuery,
  getGuardedChangeHandle,
  type StoreDeps,
} from "./shared";

export function createWisdomOps(deps: StoreDeps): Store["wisdom"] {
  const {
    input,
    legacy,
    invalidateChange,
    setCachedChange,
    emitChangeSummarySignal,
    persistStateToDisk,
  } = deps;

  return {
    ...legacy.wisdom,
    add: async (changeId, type: WisdomType, content, sourceTask) => {
      invalidateChange(changeId);
      const now = new Date().toISOString();
      await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).signal(
          wisdomAddedSignal,
          {
            entry: {
              id: `ws-${Date.now()}`,
              type,
              content,
              source_task: sourceTask,
              recorded_at: now,
            },
            addedAt: now,
          },
        ),
      );
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      const latest = state.wisdom[state.wisdom.length - 1] as
        | WisdomEntry
        | undefined;
      if (!latest) {
        throw new Error(
          `Temporal wisdom signal for change ${changeId} completed without returning an appended wisdom entry`,
        );
      }
      return latest;
    },
    list: async (changeId: string) => {
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      return state.wisdom;
    },
  };
}
