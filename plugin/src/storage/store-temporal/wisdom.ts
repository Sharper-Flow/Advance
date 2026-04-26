import type { Store } from "../store-types";
import type { WisdomType, WisdomEntry } from "../../types";
import {
  addChangeWisdomUpdate,
  changeStateQuery,
} from "../../temporal/messages";
import {
  StoreDeps,
  runTemporal,
  runTemporalQuery,
  getChangeHandle,
} from "./shared";

export function createWisdomOps(deps: StoreDeps): Store["wisdom"] {
  const {
    input,
    legacy,
    invalidateChange,
    resolveStateOrQuery,
    setCachedChange,
    emitChangeSummarySignal,
    persistStateToDisk,
  } = deps;

  return {
    ...legacy.wisdom,
    add: async (changeId, type: WisdomType, content, sourceTask) => {
      invalidateChange(changeId);
      const raw = await runTemporal(() =>
        getChangeHandle(input, changeId).executeUpdate(addChangeWisdomUpdate, {
          args: [type, content, sourceTask],
        }),
      );
      const state = await resolveStateOrQuery(
        () => getChangeHandle(input, changeId),
        raw,
      );
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      const latest = state.wisdom[state.wisdom.length - 1] as
        | WisdomEntry
        | undefined;
      if (!latest) {
        throw new Error(
          `Temporal wisdom update for change ${changeId} completed without returning an appended wisdom entry`,
        );
      }
      return latest;
    },
    list: async (changeId: string) => {
      const state = (await runTemporalQuery(() =>
        getChangeHandle(input, changeId).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      return state.wisdom;
    },
  };
}
